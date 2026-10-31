"""Pipeline dữ liệu M2: Lichess PGN nén → các shard Parquet đã lọc.

Nguồn: https://database.lichess.org/ — giấy phép CC0, nêu rõ trong báo cáo.

Không lưu tensor đã mã hóa ra đĩa. Một mẫu ở dạng tensor chiếm ~5 KB, nhân với
mười triệu vị trí là hơn 50 GB; ở dạng FEN chỉ khoảng 80 byte. Việc mã hóa đẩy
sang các worker của DataLoader, nơi nó chạy song song với GPU và không bao giờ
là nút thắt (đo được ~25 µs mỗi mẫu). Đổi lại, shard vẫn đọc được bằng mắt và
mọi đặc trưng đều tính lại được mà không phải sinh lại dữ liệu.

Tách train/val/test **theo ván**, không theo nước đi: hai vị trí trong cùng một
ván có tương quan rất mạnh, chia lẫn chúng sẽ khiến kết quả kiểm định bị thổi
phồng một cách vô hình.

Nguồn có thể là file trên đĩa hoặc URL ``https://…pgn.zst``: một tháng dữ liệu
Lichess nặng khoảng 30 GB khi nén, nên đọc thẳng qua mạng và dừng khi đủ dữ liệu
thay vì phải tải và lưu cả file.
"""

from __future__ import annotations

import contextlib
import dataclasses
import functools
import hashlib
import io
import logging
import re
from collections.abc import Callable, Iterator
from pathlib import Path
from urllib.request import Request, urlopen

import chess
import chess.pgn
import pyarrow as pa
import pyarrow.parquet as pq
import zstandard

from .encoding import NUM_ELO_BUCKETS, elo_to_bucket

LOGGER = logging.getLogger(__name__)

TIME_CONTROL = re.compile(r"^(\d+)\+(\d+)$")

SCHEMA = pa.schema([
    ("fen", pa.string()),
    ("move_uci", pa.string()),
    ("elo", pa.int16()),
    ("opponent_elo", pa.int16()),
    ("ply", pa.int16()),
    ("legal_count", pa.int16()),
    ("result", pa.int8()),
    ("time_control", pa.string()),
    ("game_key", pa.string()),
])


@dataclasses.dataclass(slots=True)
class FilterConfig:
    """Tiêu chí lọc ván và vị trí.

    Mặc định bám theo thiết lập của Maia để kết quả so sánh được, trừ
    ``skip_opening_plies`` được đặt cao hơn một chút vì hệ thống đã có sổ khai
    cuộc ECO riêng xử lý phần lý thuyết. Dải Elo mở tới 3200 để có dữ liệu cho dải
    kiện tướng 2600+.
    """

    min_elo: int = 600
    max_elo: int = 3200
    max_elo_gap: int = 300          # loại ván lệch trình độ quá xa
    min_base_seconds: int = 180     # loại bullet: quyết định bị chi phối bởi đồng hồ
    max_base_seconds: int = 10_800  # loại cờ thư tín
    skip_opening_plies: int = 10    # bỏ phần thuộc lòng đầu ván
    min_game_plies: int = 20        # loại ván bỏ cuộc sớm
    max_plies_per_game: int = 300
    require_both_elos: bool = True
    drop_forced_moves: bool = True  # chỉ có một nước hợp lệ thì không có gì để học
    drop_time_forfeit_last_move: bool = True


def _parse_time_control(value: str | None) -> tuple[int, int] | None:
    if not value:
        return None
    match = TIME_CONTROL.match(value.strip())
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def _game_key(headers: chess.pgn.Headers) -> str:
    """Khóa ổn định cho một ván, dùng để chia tập nhất quán giữa các lần chạy."""
    site = headers.get("Site", "")
    if site:
        return hashlib.sha1(site.encode("utf-8")).hexdigest()[:16]
    raw = "|".join(headers.get(k, "") for k in ("White", "Black", "UTCDate", "UTCTime"))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def split_for(game_key: str, val_ratio: float, test_ratio: float) -> str:
    """Gán ván vào train/val/test bằng băm — không cần giữ trạng thái, lặp lại được."""
    bucket = int(game_key[:8], 16) % 10_000 / 10_000.0
    if bucket < test_ratio:
        return "test"
    if bucket < test_ratio + val_ratio:
        return "val"
    return "train"


def is_url(source: str | Path) -> bool:
    return str(source).startswith(("http://", "https://"))


@contextlib.contextmanager
def open_pgn(source: str | Path) -> Iterator[io.TextIOBase]:
    """Mở file hoặc URL ``.pgn`` / ``.pgn.zst`` thành luồng văn bản, giải nén khi đọc."""
    text = str(source)
    if is_url(text):
        raw = urlopen(Request(text, headers={"User-Agent": "chess-analysis-thesis/1.0"}), timeout=120)
    else:
        raw = Path(text).open("rb")
    try:
        binary = zstandard.ZstdDecompressor().stream_reader(raw) if text.endswith(".zst") else raw
        yield io.TextIOWrapper(binary, encoding="utf-8", errors="replace")
    finally:
        raw.close()


class _HeaderFilterBuilder(chess.pgn.GameBuilder):
    """Dựng ván như bình thường, nhưng bỏ qua phần nước đi nếu tiêu đề không đạt.

    Phần lớn ván Lichess bị loại chỉ nhờ tiêu đề (nhịp độ, Elo), nên bỏ qua việc
    phân tích hàng chục nước đi của chúng giúp đọc nhanh hơn nhiều lần.
    """

    def __init__(self, wanted: Callable[[chess.pgn.Headers], bool]):
        super().__init__()
        self._wanted = wanted

    def end_headers(self):
        if not self._wanted(self.game.headers):
            return chess.pgn.SKIP
        return None


def iter_games(
    source: str | Path,
    wanted: Callable[[chess.pgn.Headers], bool] | None = None,
) -> Iterator[chess.pgn.Game]:
    """Đọc tuần tự từng ván mà không nạp hết vào RAM.

    Với ``wanted``, ván bị loại vẫn được trả về nhưng không có nước đi nào, để bên
    gọi vẫn đếm được số ván đã đọc.
    """
    visitor = chess.pgn.GameBuilder if wanted is None else functools.partial(_HeaderFilterBuilder, wanted)
    with open_pgn(source) as stream:
        while (game := chess.pgn.read_game(stream, Visitor=visitor)) is not None:
            yield game


def accept_game(headers: chess.pgn.Headers, cfg: FilterConfig) -> bool:
    tc = _parse_time_control(headers.get("TimeControl"))
    if tc is None:
        return False
    base, _increment = tc
    if not cfg.min_base_seconds <= base <= cfg.max_base_seconds:
        return False

    try:
        white_elo = int(headers.get("WhiteElo", ""))
        black_elo = int(headers.get("BlackElo", ""))
    except ValueError:
        return not cfg.require_both_elos

    for elo in (white_elo, black_elo):
        if not cfg.min_elo <= elo <= cfg.max_elo:
            return False
    return abs(white_elo - black_elo) <= cfg.max_elo_gap


def extract_samples(game: chess.pgn.Game, cfg: FilterConfig) -> list[dict]:
    """Trích các vị trí đáng học từ một ván.

    Mỗi nước đi của cả hai bên đều thành một mẫu, gắn Elo của **người vừa đi** —
    đó chính là đại lượng mà mạng học điều kiện hóa.
    """
    headers = game.headers
    try:
        elos = {
            chess.WHITE: int(headers.get("WhiteElo", "")),
            chess.BLACK: int(headers.get("BlackElo", "")),
        }
    except ValueError:
        return []

    moves = list(game.mainline_moves())
    if len(moves) < cfg.min_game_plies:
        return []

    # Nước cuối của ván thua giờ thường là nước ngẫu nhiên lúc hết thời gian.
    if cfg.drop_time_forfeit_last_move and "Time forfeit" in headers.get("Termination", ""):
        moves = moves[:-1]

    # Kết quả theo phía người vừa đi, dùng cho value head phụ trợ.
    outcome = {"1-0": chess.WHITE, "0-1": chess.BLACK}.get(headers.get("Result", ""))
    is_draw = headers.get("Result", "") == "1/2-1/2"

    key = _game_key(headers)
    time_control = headers.get("TimeControl", "")
    board = game.board()
    rows: list[dict] = []

    for ply, move in enumerate(moves[: cfg.max_plies_per_game]):
        if ply < cfg.skip_opening_plies:
            board.push(move)
            continue

        legal_count = board.legal_moves.count()
        if cfg.drop_forced_moves and legal_count < 2:
            board.push(move)
            continue

        rows.append({
            "fen": board.fen(),
            "move_uci": move.uci(),
            "elo": elos[board.turn],
            "opponent_elo": elos[not board.turn],
            "ply": ply,
            "legal_count": legal_count,
            "result": 0 if is_draw or outcome is None else (1 if outcome == board.turn else -1),
            "time_control": time_control,
            "game_key": key,
        })
        board.push(move)

    return rows


class ShardWriter:
    """Ghi Parquet theo từng phần, mỗi split một chuỗi shard."""

    def __init__(self, out_dir: Path, rows_per_shard: int = 500_000):
        self.out_dir = out_dir
        self.rows_per_shard = rows_per_shard
        self._buffers: dict[str, list[dict]] = {}
        self._counts: dict[str, int] = {}
        self._shard_index: dict[str, int] = {}

    def add(self, split: str, row: dict) -> None:
        buffer = self._buffers.setdefault(split, [])
        buffer.append(row)
        self._counts[split] = self._counts.get(split, 0) + 1
        if len(buffer) >= self.rows_per_shard:
            self._flush(split)

    def _flush(self, split: str) -> None:
        buffer = self._buffers.get(split)
        if not buffer:
            return
        index = self._shard_index.get(split, 0)
        directory = self.out_dir / split
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"part-{index:05d}.parquet"
        table = pa.Table.from_pylist(buffer, schema=SCHEMA)
        pq.write_table(table, path, compression="zstd")
        LOGGER.info("Đã ghi %s (%d dòng)", path, len(buffer))
        self._shard_index[split] = index + 1
        buffer.clear()

    def close(self) -> dict[str, int]:
        for split in list(self._buffers):
            self._flush(split)
        return dict(self._counts)


def reshuffle_split(out_dir: Path, split: str, rows_per_shard: int = 100_000, seed: int = 1337) -> int:
    """Trộn ngẫu nhiên toàn bộ một split rồi ghi lại thành các shard nhỏ, đều nhau.

    Dữ liệu được ghi theo thứ tự đọc, mà khi cân bằng theo dải Elo thì các dải đông
    người đầy ngay từ đầu: shard đầu gần như toàn dải giữa, shard cuối gần như toàn
    dải 2600+. Bộ đệm trộn của DataLoader (vài chục nghìn dòng) không đủ để xóa
    tương quan đó, và ít shard lớn còn khiến một phần worker không có việc làm. Với
    quy mô vài triệu vị trí, trộn cả split trong RAM chỉ mất vài giây.
    """
    import numpy as np

    directory = out_dir / split
    shards = sorted(directory.glob("part-*.parquet"))
    if not shards:
        return 0
    table = pa.concat_tables([pq.read_table(shard) for shard in shards])
    order = np.random.default_rng(seed).permutation(table.num_rows)
    table = table.take(pa.array(order))

    # Ghi ra thư mục tạm rồi mới thay, để một lần chạy bị ngắt không làm mất dữ liệu.
    staging = out_dir / f".{split}-shuffled"
    staging.mkdir(parents=True, exist_ok=True)
    for index, start in enumerate(range(0, table.num_rows, rows_per_shard)):
        pq.write_table(table.slice(start, rows_per_shard), staging / f"part-{index:05d}.parquet", compression="zstd")
    for shard in shards:
        shard.unlink()
    for shard in sorted(staging.glob("part-*.parquet")):
        shard.replace(directory / shard.name)
    staging.rmdir()
    LOGGER.info("Đã trộn %s: %d dòng → %d shard", split, table.num_rows, -(-table.num_rows // rows_per_shard))
    return table.num_rows


@dataclasses.dataclass(slots=True)
class BuildResult:
    """Kết quả một lần sinh dữ liệu; ``per_bucket[i]`` là số vị trí của dải Elo i."""

    splits: dict[str, int]
    per_bucket: list[int]
    games_seen: int
    games_kept: int
    stop_reason: str


def build_dataset(
    sources: list[str | Path],
    out_dir: Path,
    cfg: FilterConfig,
    max_games: int | None = None,
    max_positions: int | None = None,
    max_per_bucket: int | None = None,
    max_games_seen: int | None = None,
    val_ratio: float = 0.02,
    test_ratio: float = 0.02,
    rows_per_shard: int = 500_000,
    progress_every: int = 200_000,
) -> BuildResult:
    """Chạy toàn bộ pipeline.

    ``max_per_bucket`` giữ dữ liệu cân bằng giữa các dải Elo: Lichess có rất nhiều
    ván ở 1400–1800 nhưng rất ít ở 2400+, nên không giới hạn thì mô hình học gần như
    chỉ từ dải giữa. Dải nào đủ thì không nhận thêm; khi mọi dải đều đủ thì dừng.
    """
    writer = ShardWriter(out_dir, rows_per_shard)
    per_bucket = [0] * NUM_ELO_BUCKETS
    seen_games = kept_games = positions = 0

    def bucket_open(elo: int) -> bool:
        return max_per_bucket is None or per_bucket[elo_to_bucket(elo)] < max_per_bucket

    def wanted(headers: chess.pgn.Headers) -> bool:
        if not accept_game(headers, cfg):
            return False
        if max_per_bucket is None:
            return True
        try:
            return bucket_open(int(headers["WhiteElo"])) or bucket_open(int(headers["BlackElo"]))
        except (KeyError, ValueError):
            return False

    def finish(reason: str) -> BuildResult:
        splits = writer.close()
        LOGGER.info(
            "Hoàn tất (%s): %d ván đọc, %d ván giữ (%.2f%%), %d vị trí — %s",
            reason, seen_games, kept_games, 100.0 * kept_games / max(seen_games, 1), positions, splits,
        )
        return BuildResult(splits, list(per_bucket), seen_games, kept_games, reason)

    for source in sources:
        LOGGER.info("Đang đọc %s", source)
        for game in iter_games(source, wanted):
            seen_games += 1
            if progress_every and seen_games % progress_every == 0:
                LOGGER.info("%d ván đã đọc · %d ván giữ lại · %d vị trí · theo dải: %s",
                            seen_games, kept_games, positions, per_bucket)

            rows = extract_samples(game, cfg)
            if rows:
                split = split_for(rows[0]["game_key"], val_ratio, test_ratio)
                added = 0
                for row in rows:
                    bucket = elo_to_bucket(row["elo"])
                    if max_per_bucket is not None and per_bucket[bucket] >= max_per_bucket:
                        continue
                    writer.add(split, row)
                    per_bucket[bucket] += 1
                    added += 1
                if added:
                    kept_games += 1
                    positions += added

            if max_per_bucket is not None and all(count >= max_per_bucket for count in per_bucket):
                return finish("mọi dải Elo đã đủ")
            if max_positions and positions >= max_positions:
                return finish(f"đạt giới hạn {max_positions} vị trí")
            if max_games and kept_games >= max_games:
                return finish(f"đạt giới hạn {max_games} ván")
            if max_games_seen and seen_games >= max_games_seen:
                return finish(f"đã đọc {max_games_seen} ván")

    return finish("hết dữ liệu nguồn")
