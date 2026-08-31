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
"""

from __future__ import annotations

import dataclasses
import hashlib
import io
import logging
import re
from collections.abc import Iterator
from pathlib import Path

import chess
import chess.pgn
import pyarrow as pa
import pyarrow.parquet as pq
import zstandard

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
    cuộc ECO riêng xử lý phần lý thuyết.
    """

    min_elo: int = 800
    max_elo: int = 2600
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


def iter_games(path: Path) -> Iterator[chess.pgn.Game]:
    """Đọc tuần tự file .pgn hoặc .pgn.zst mà không nạp hết vào RAM."""
    if path.suffix == ".zst":
        with path.open("rb") as raw:
            reader = zstandard.ZstdDecompressor().stream_reader(raw)
            stream = io.TextIOWrapper(reader, encoding="utf-8", errors="replace")
            while (game := chess.pgn.read_game(stream)) is not None:
                yield game
    else:
        with path.open("r", encoding="utf-8", errors="replace") as stream:
            while (game := chess.pgn.read_game(stream)) is not None:
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


def build_dataset(
    sources: list[Path],
    out_dir: Path,
    cfg: FilterConfig,
    max_games: int | None = None,
    max_positions: int | None = None,
    val_ratio: float = 0.02,
    test_ratio: float = 0.02,
    rows_per_shard: int = 500_000,
    progress_every: int = 20_000,
) -> dict[str, int]:
    """Chạy toàn bộ pipeline và trả về số dòng mỗi split."""
    writer = ShardWriter(out_dir, rows_per_shard)
    seen_games = kept_games = positions = 0

    for source in sources:
        LOGGER.info("Đang đọc %s", source)
        for game in iter_games(source):
            seen_games += 1
            if progress_every and seen_games % progress_every == 0:
                LOGGER.info(
                    "%d ván đã đọc · %d ván giữ lại · %d vị trí",
                    seen_games, kept_games, positions,
                )

            if not accept_game(game.headers, cfg):
                continue
            rows = extract_samples(game, cfg)
            if not rows:
                continue

            kept_games += 1
            split = split_for(rows[0]["game_key"], val_ratio, test_ratio)
            for row in rows:
                writer.add(split, row)
            positions += len(rows)

            if max_positions and positions >= max_positions:
                LOGGER.info("Đã đạt giới hạn %d vị trí, dừng.", max_positions)
                return _finish(writer, seen_games, kept_games, positions)
            if max_games and kept_games >= max_games:
                LOGGER.info("Đã đạt giới hạn %d ván, dừng.", max_games)
                return _finish(writer, seen_games, kept_games, positions)

    return _finish(writer, seen_games, kept_games, positions)


def _finish(writer: ShardWriter, seen: int, kept: int, positions: int) -> dict[str, int]:
    counts = writer.close()
    LOGGER.info(
        "Hoàn tất: %d ván đọc, %d ván giữ (%.1f%%), %d vị trí — %s",
        seen, kept, 100.0 * kept / max(seen, 1), positions, counts,
    )
    return counts
