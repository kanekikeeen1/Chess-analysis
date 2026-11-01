"""D2: chia tập train/val/test cho từng kỳ thủ, theo thời gian và chống rò rỉ.

- Chia **theo ván**, rồi theo **thời gian**: với mỗi kỳ thủ, ``test`` là các ván mới nhất và ``val`` là các
  ván ngay trước đó. Mô hình được chấm trên những ván chơi *sau* mọi ván nó đã học, đúng tình huống dùng
  thật, và không học được các "mốt" khai cuộc của giai đoạn test.
- **Chống rò rỉ giữa các kỳ thủ**: ván Carlsen–Nakamura có trong dữ liệu của cả hai. Mốc thời gian của
  mỗi người khác nhau, nên một ván có thể nằm trong train của người này nhưng thuộc test của người kia. Ma
  trận 3×3 ở D4 cho mô hình X chấm ván của Y, nên mọi ván thuộc val/test của *bất kỳ* ai đều bị bỏ khỏi
  train của *tất cả*.
- Chỉ lấy nước của chính kỳ thủ. Lọc vị trí giống M2 (bỏ 10 nửa nước đầu, bỏ nước bắt buộc, bỏ nước cuối
  của ván thua vì hết giờ) để so sánh công bằng với M2 nền.

Schema Parquet là schema của M2 cộng các cột riêng, nên ``m2.dataset`` đọc được (nó chỉ lấy fen, move_uci,
elo, result) và D3 dùng lại vòng huấn luyện của M2.
"""

from __future__ import annotations

import collections
import dataclasses
import hashlib
import logging
from pathlib import Path

import chess
import chess.pgn
import pyarrow as pa
import pyarrow.parquet as pq

from m2.data import SCHEMA as M2_SCHEMA
from m2.data import reshuffle_split

LOGGER = logging.getLogger(__name__)

SCHEMA = pa.schema([
    *M2_SCHEMA,
    ("player", pa.string()),
    ("speed", pa.string()),
    ("date", pa.string()),
    ("source", pa.string()),
    ("color", pa.string()),
])
SPLITS = ("train", "val", "test")
# Ván OTB trong broadcast đôi khi thiếu WhiteElo/BlackElo; cả ba người đều ở quanh mức này.
DEFAULT_ELO = 2700


@dataclasses.dataclass(slots=True)
class SplitConfig:
    val_ratio: float = 0.05
    test_ratio: float = 0.10
    speeds: tuple[str, ...] = ("blitz", "rapid", "classical")
    skip_opening_plies: int = 10
    min_game_plies: int = 20
    max_plies_per_game: int = 300
    drop_forced_moves: bool = True
    drop_time_forfeit_last_move: bool = True
    rows_per_shard: int = 100_000


@dataclasses.dataclass(slots=True)
class GameRecord:
    player: str
    date: str
    speed: str
    color: chess.Color
    key: str
    # Chỉ giữ tiêu đề và nước UCI: 70k object chess.pgn.Game (mỗi nước một node) tốn vài GB RAM.
    headers: dict[str, str]
    moves: list[str]


def moves_key(moves: list[str]) -> str:
    """Cùng khóa với bước khử trùng lặp ở D1: chỉ dựa vào chuỗi nước đi."""
    return hashlib.sha1(" ".join(moves).encode()).hexdigest()


def read_player_games(path: Path, player: str) -> list[GameRecord]:
    records = []
    with path.open(encoding="utf-8") as stream:
        while (game := chess.pgn.read_game(stream)) is not None:
            headers = dict(game.headers)
            moves = [move.uci() for move in game.mainline_moves()]
            records.append(GameRecord(
                player=player,
                date=headers.get("Date", "????.??.??"),
                speed=headers.get("StyleSpeed", "unknown"),
                color=chess.WHITE if headers.get("StyleColor") == "white" else chess.BLACK,
                key=moves_key(moves),
                headers=headers,
                moves=moves,
            ))
    return records


def assign_splits(records: list[GameRecord], cfg: SplitConfig) -> dict[str, list[GameRecord]]:
    """Ván mới nhất làm test, ngay trước đó làm val. Ván không rõ ngày luôn vào train."""
    dated = sorted((r for r in records if r.date[:4].isdigit()), key=lambda r: (r.date, r.key))
    undated = [r for r in records if not r.date[:4].isdigit()]
    test_count = round(len(records) * cfg.test_ratio)
    val_count = round(len(records) * cfg.val_ratio)
    cut_test = len(dated) - test_count
    cut_val = cut_test - val_count
    return {
        "train": undated + dated[:cut_val],
        "val": dated[cut_val:cut_test],
        "test": dated[cut_test:],
    }


def _elo(headers: dict[str, str], color: chess.Color) -> int:
    try:
        value = int(headers.get("WhiteElo" if color == chess.WHITE else "BlackElo", ""))
    except ValueError:
        return DEFAULT_ELO
    return min(3200, max(600, value))


def player_rows(record: GameRecord, cfg: SplitConfig) -> list[dict]:
    """Các vị trí đến lượt kỳ thủ, lọc như ``m2.data.extract_samples``."""
    headers = record.headers
    moves = [chess.Move.from_uci(uci) for uci in record.moves]
    if len(moves) < cfg.min_game_plies:
        return []
    if cfg.drop_time_forfeit_last_move and "time" in headers.get("Termination", "").lower():
        moves = moves[:-1]
    winner = {"1-0": chess.WHITE, "0-1": chess.BLACK}.get(headers.get("Result", ""))
    own_elo, opponent_elo = _elo(headers, record.color), _elo(headers, not record.color)
    board = chess.Board()
    rows = []
    for ply, move in enumerate(moves[: cfg.max_plies_per_game]):
        if board.turn == record.color and ply >= cfg.skip_opening_plies:
            legal_count = board.legal_moves.count()
            if not (cfg.drop_forced_moves and legal_count < 2):
                rows.append({
                    "fen": board.fen(),
                    "move_uci": move.uci(),
                    "elo": own_elo,
                    "opponent_elo": opponent_elo,
                    "ply": ply,
                    "legal_count": legal_count,
                    "result": 0 if winner is None else (1 if winner == record.color else -1),
                    "time_control": headers.get("TimeControl", ""),
                    "game_key": record.key[:16],
                    "player": record.player,
                    "speed": record.speed,
                    "date": record.date,
                    "source": headers.get("StyleSource", ""),
                    "color": "white" if record.color == chess.WHITE else "black",
                })
        board.push(move)
    return rows


def _summary(records: list[GameRecord], positions: int) -> dict:
    dates = [r.date for r in records if r.date[:4].isdigit()]
    return {
        "games": len(records),
        "positions": positions,
        "first_date": min(dates) if dates else None,
        "last_date": max(dates) if dates else None,
        "by_speed": dict(collections.Counter(r.speed for r in records).most_common()),
    }


def prepare(players_dir: Path, out_dir: Path, player_ids: list[str], cfg: SplitConfig) -> dict:
    by_player: dict[str, dict[str, list[GameRecord]]] = {}
    excluded_speed: dict[str, int] = {}
    for player in player_ids:
        records = read_player_games(players_dir / player / "games.pgn", player)
        kept = [r for r in records if r.speed in cfg.speeds]
        excluded_speed[player] = len(records) - len(kept)
        by_player[player] = assign_splits(kept, cfg)
        LOGGER.info("%s: %d ván (bỏ %d ván ngoài %s)", player, len(kept), excluded_speed[player], cfg.speeds)

    held_out = {r.key for splits in by_player.values() for split in ("val", "test") for r in splits[split]}
    leaked: dict[str, int] = {}
    for player, splits in by_player.items():
        before = len(splits["train"])
        splits["train"] = [r for r in splits["train"] if r.key not in held_out]
        leaked[player] = before - len(splits["train"])

    card = {"config": dataclasses.asdict(cfg), "players": {}}
    for player, splits in by_player.items():
        directory = out_dir / player
        entry = {"excluded_by_speed": excluded_speed[player], "removed_from_train_shared_with_heldout": leaked[player]}
        for split in SPLITS:
            target = directory / split
            target.mkdir(parents=True, exist_ok=True)
            for old in target.glob("part-*.parquet"):
                old.unlink()
            rows: list[dict] = []
            total, index = 0, 0
            for record in splits[split]:
                rows.extend(player_rows(record, cfg))
                if len(rows) >= cfg.rows_per_shard:
                    pq.write_table(pa.Table.from_pylist(rows, schema=SCHEMA), target / f"part-{index:05d}.parquet",
                                   compression="zstd")
                    total, index, rows = total + len(rows), index + 1, []
            if rows or index == 0:
                pq.write_table(pa.Table.from_pylist(rows, schema=SCHEMA), target / f"part-{index:05d}.parquet",
                               compression="zstd")
                total += len(rows)
            entry[split] = _summary(splits[split], total)
            LOGGER.info("%s/%s: %d ván, %d vị trí", player, split, len(splits[split]), total)
        # Shard train ghi theo thời gian; trộn lại để mỗi lô không toàn ván của một giai đoạn.
        reshuffle_split(directory, "train", rows_per_shard=cfg.rows_per_shard)
        card["players"][player] = entry
    return card


def build_pool(out_dir: Path, player_ids: list[str], max_train_per_player: int = 300_000,
               max_val_per_player: int = 10_000, rows_per_shard: int = 100_000, seed: int = 1337) -> dict:
    """Dữ liệu cho mô hình GM chung (tầng giữa của fine-tune hai tầng): gộp train/val của mọi kỳ thủ.

    Mỗi người góp tối đa ``max_train_per_player`` vị trí, để Nakamura (1,6M) không lấn át Liêm (157k): tầng này
    phải học "blitz kiện tướng nói chung" chứ không phải phong cách của người nhiều ván nhất. Không có test:
    mọi đánh giá vẫn làm trên test riêng của từng người, và val/test của ai cũng không lọt vào train ở đây vì
    train của từng người đã được lọc ở ``prepare``.
    """
    import numpy as np

    rng = np.random.default_rng(seed)
    target = out_dir / "pool"
    card = {"max_train_per_player": max_train_per_player, "max_val_per_player": max_val_per_player, "players": {}}
    for split, cap in (("train", max_train_per_player), ("val", max_val_per_player)):
        tables = []
        for player in player_ids:
            table = pa.concat_tables([pq.read_table(shard) for shard in sorted((out_dir / player / split).glob("*.parquet"))])
            if table.num_rows > cap:
                table = table.take(pa.array(np.sort(rng.choice(table.num_rows, cap, replace=False))))
            tables.append(table)
            card["players"].setdefault(player, {})[split] = table.num_rows
        directory = target / split
        directory.mkdir(parents=True, exist_ok=True)
        for old in directory.glob("part-*.parquet"):
            old.unlink()
        pq.write_table(pa.concat_tables(tables), directory / "part-00000.parquet", compression="zstd")
        reshuffle_split(target, split, rows_per_shard=rows_per_shard, seed=seed)
        LOGGER.info("pool/%s: %s", split, {p: card["players"][p][split] for p in player_ids})
    return card


def build_equal_budget(out_dir: Path, player_ids: list[str], budget: int | None = None,
                       rows_per_shard: int = 100_000, seed: int = 1337) -> dict:
    """Thí nghiệm đối chứng D4: mọi kỳ thủ cùng số vị trí train (mặc định bằng người ít nhất).

    Ở fine-tune thường, mô hình Nakamura (1,6M vị trí) thắng cả trên ván của người khác vì học thêm nhiều
    "blitz kiện tướng nói chung", nên không tách được phong cách khỏi lượng dữ liệu. Ở đây mỗi người chỉ còn
    ``budget`` vị trí lấy ngẫu nhiên từ train của chính họ; val giữ nguyên, test vẫn đọc từ ``data/style/<id>``.
    Kết quả: ``data/style/equal/<id>/{train,val}``.
    """
    import shutil

    import numpy as np

    rng = np.random.default_rng(seed)
    tables = {player: pa.concat_tables([pq.read_table(shard)
                                        for shard in sorted((out_dir / player / "train").glob("*.parquet"))])
              for player in player_ids}
    budget = budget or min(table.num_rows for table in tables.values())
    card = {"budget": budget, "players": {}}
    for player, table in tables.items():
        if table.num_rows > budget:
            table = table.take(pa.array(np.sort(rng.choice(table.num_rows, budget, replace=False))))
        target = out_dir / "equal" / player
        if target.exists():
            shutil.rmtree(target)
        (target / "train").mkdir(parents=True)
        pq.write_table(table, target / "train" / "part-00000.parquet", compression="zstd")
        reshuffle_split(target, "train", rows_per_shard=rows_per_shard, seed=seed)
        shutil.copytree(out_dir / player / "val", target / "val")
        card["players"][player] = {"train": table.num_rows, "of": tables[player].num_rows}
        LOGGER.info("equal/%s: train %d / %d vị trí", player, table.num_rows, tables[player].num_rows)
    return card
