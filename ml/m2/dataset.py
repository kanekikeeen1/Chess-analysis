"""Dataset PyTorch đọc các shard Parquet do :mod:`m2.data` sinh ra.

Mã hóa được thực hiện tại chỗ trong worker của DataLoader thay vì lưu sẵn ra
đĩa — xem phần đầu của :mod:`m2.data` để biết lý do.

Có hai lớp dataset vì hai giai đoạn cần hai thứ khác nhau:

* :class:`ShardDataset` nạp trọn một hoặc vài shard vào RAM, hỗ trợ truy cập
  ngẫu nhiên. Dùng cho tập val/test và cho việc chạy thử ở quy mô nhỏ.
* :class:`StreamingShardDataset` đọc lần lượt từng shard theo luồng, phù hợp
  khi tập huấn luyện lớn hơn RAM. Mỗi worker nhận một tập con shard rời nhau
  nên không có mẫu nào bị lặp trong một epoch.
"""

from __future__ import annotations

import logging
import random
from pathlib import Path

import chess
import numpy as np
import pyarrow.parquet as pq
import torch
from torch.utils.data import Dataset, IterableDataset, get_worker_info

from .encoding import (
    elo_to_bucket,
    encode_board,
    legal_move_mask,
    move_to_index,
    normalize_elo,
)

LOGGER = logging.getLogger(__name__)

COLUMNS = ["fen", "move_uci", "elo", "result"]

# Nhãn value head: kết quả -1/0/1 → chỉ số lớp 0/1/2.
RESULT_TO_CLASS = {-1: 0, 0: 1, 1: 2}


def list_shards(root: Path, split: str) -> list[Path]:
    directory = Path(root) / split
    if not directory.is_dir():
        raise FileNotFoundError(
            f"Không tìm thấy thư mục shard '{directory}'. "
            f"Chạy scripts/prepare_m2_data.py trước."
        )
    shards = sorted(directory.glob("*.parquet"))
    if not shards:
        raise FileNotFoundError(f"Thư mục '{directory}' không có shard nào.")
    return shards


def encode_row(
    fen: str,
    move_uci: str,
    elo: int,
    result: int,
    with_mask: bool = False,
) -> dict[str, torch.Tensor]:
    """Chuyển một dòng Parquet thành các tensor mà mô hình nhận.

    ``with_mask`` chỉ bật khi đánh giá: mặt nạ hợp lệ tốn thêm ~40 µs mỗi mẫu và
    lúc huấn luyện không dùng tới.
    """
    board = chess.Board(fen)
    move = chess.Move.from_uci(move_uci)

    sample = {
        "planes": torch.from_numpy(encode_board(board)),
        "elo_bucket": torch.tensor(elo_to_bucket(elo), dtype=torch.long),
        "elo_norm": torch.tensor(normalize_elo(elo), dtype=torch.float32),
        "target": torch.tensor(move_to_index(move, board.turn), dtype=torch.long),
        "value_target": torch.tensor(RESULT_TO_CLASS[int(result)], dtype=torch.long),
    }
    if with_mask:
        sample["legal_mask"] = torch.from_numpy(legal_move_mask(board))
    return sample


class ShardDataset(Dataset):
    """Nạp toàn bộ các shard đã chọn vào RAM, truy cập ngẫu nhiên."""

    def __init__(
        self,
        root: Path,
        split: str,
        max_rows: int | None = None,
        with_mask: bool = False,
        shard_limit: int | None = None,
    ):
        shards = list_shards(root, split)
        if shard_limit:
            shards = shards[:shard_limit]

        tables = []
        rows = 0
        for shard in shards:
            table = pq.read_table(shard, columns=COLUMNS)
            tables.append(table)
            rows += table.num_rows
            if max_rows and rows >= max_rows:
                break

        import pyarrow as pa

        table = pa.concat_tables(tables)
        if max_rows and table.num_rows > max_rows:
            table = table.slice(0, max_rows)

        self.fens = table.column("fen").to_pylist()
        self.moves = table.column("move_uci").to_pylist()
        self.elos = table.column("elo").to_pylist()
        self.results = table.column("result").to_pylist()
        self.with_mask = with_mask
        LOGGER.info("%s: nạp %d mẫu từ %d shard", split, len(self.fens), len(tables))

    def __len__(self) -> int:
        return len(self.fens)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        return encode_row(
            self.fens[index],
            self.moves[index],
            self.elos[index],
            self.results[index],
            with_mask=self.with_mask,
        )


class StreamingShardDataset(IterableDataset):
    """Duyệt các shard theo luồng, chia đều shard cho các worker.

    Trộn ở hai mức: thứ tự shard mỗi epoch, và một bộ đệm trộn trong luồng. Đây
    là cách trộn xấp xỉ — đủ tốt khi mỗi shard đã chứa hàng trăm nghìn vị trí từ
    nhiều ván khác nhau, mà không phải nạp cả tập vào RAM.
    """

    def __init__(
        self,
        root: Path,
        split: str,
        shuffle: bool = True,
        shuffle_buffer: int = 50_000,
        seed: int = 0,
        with_mask: bool = False,
    ):
        self.shards = list_shards(root, split)
        self.shuffle = shuffle
        self.shuffle_buffer = shuffle_buffer
        self.seed = seed
        self.with_mask = with_mask
        self.epoch = 0

    def set_epoch(self, epoch: int) -> None:
        """Đổi hạt giống trộn giữa các epoch. Trainer gọi hàm này mỗi epoch."""
        self.epoch = epoch

    def _my_shards(self) -> list[Path]:
        shards = list(self.shards)
        if self.shuffle:
            random.Random(self.seed + self.epoch).shuffle(shards)

        info = get_worker_info()
        if info is None:
            return shards
        return shards[info.id :: info.num_workers]

    def __iter__(self):
        info = get_worker_info()
        worker_seed = self.seed + self.epoch * 1000 + (info.id if info else 0)
        rng = random.Random(worker_seed)
        buffer: list[tuple] = []

        for shard in self._my_shards():
            table = pq.read_table(shard, columns=COLUMNS)
            batch = zip(
                table.column("fen").to_pylist(),
                table.column("move_uci").to_pylist(),
                table.column("elo").to_pylist(),
                table.column("result").to_pylist(),
            )
            for row in batch:
                if not self.shuffle:
                    yield encode_row(*row, with_mask=self.with_mask)
                    continue

                buffer.append(row)
                if len(buffer) >= self.shuffle_buffer:
                    pick = rng.randrange(len(buffer))
                    buffer[pick], buffer[-1] = buffer[-1], buffer[pick]
                    yield encode_row(*buffer.pop(), with_mask=self.with_mask)

        rng.shuffle(buffer)
        for row in buffer:
            yield encode_row(*row, with_mask=self.with_mask)


def collate(batch: list[dict[str, torch.Tensor]]) -> dict[str, torch.Tensor]:
    return {key: torch.stack([item[key] for item in batch]) for key in batch[0]}


def count_rows(root: Path, split: str) -> int:
    """Đếm số dòng qua metadata Parquet, không đọc dữ liệu."""
    return sum(pq.ParquetFile(shard).metadata.num_rows for shard in list_shards(root, split))


def elo_histogram(root: Path, split: str) -> dict[int, int]:
    """Phân bố mẫu theo dải Elo — cần cho phần thống kê mô tả của báo cáo."""
    counts: dict[int, int] = {}
    for shard in list_shards(root, split):
        table = pq.read_table(shard, columns=["elo"])
        buckets = np.array([elo_to_bucket(e) for e in table.column("elo").to_pylist()])
        for bucket, count in zip(*np.unique(buckets, return_counts=True)):
            counts[int(bucket)] = counts.get(int(bucket), 0) + int(count)
    return dict(sorted(counts.items()))
