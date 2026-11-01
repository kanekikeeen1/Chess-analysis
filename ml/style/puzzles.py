"""D6 puzzle "Tìm nước kiện tướng đã đi": chọn thế cờ từ ván test của từng kỳ thủ.

Lời giải là nước kỳ thủ đã đi thật. Một thế cờ chỉ thành puzzle khi:

- Stockfish xác nhận nước đó không phải sai lầm: mất tối đa ``max_loss_cp`` so với nước tốt nhất.
- Thế cờ thật sự có lựa chọn: nước tốt thứ hai kém nước tốt nhất không quá ``max_spread_cp``. Nếu chỉ có một nước
  (ăn lại quân, thoát chiếu) thì không còn gì để đoán về phong cách.
- Ván chưa ngã ngũ (``|điểm| ≤ max_abs_cp``, không có chiếu hết trong tầm nhìn) và đã qua khai cuộc.

Dùng ván test (các ván mới nhất, mô hình chưa thấy) để người dùng không "đoán" được bằng chính dữ liệu train.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass
from pathlib import Path

import chess
import chess.engine
import pyarrow as pa
import pyarrow.parquet as pq


@dataclass(frozen=True)
class PuzzleConfig:
    min_ply: int = 20
    min_legal: int = 10
    max_abs_cp: int = 300
    max_loss_cp: int = 50
    max_spread_cp: int = 80
    multipv: int = 4
    depth: int = 14


def mover_cp(score: chess.engine.PovScore, color: chess.Color) -> int | None:
    """Điểm centipawn nhìn từ bên đi; None khi là chiếu hết."""
    return score.pov(color).score()


def judge(board: chess.Board, played: chess.Move, infos: list[dict], played_cp: int | None,
          cfg: PuzzleConfig) -> dict | None:
    """Quyết định từ kết quả Stockfish; trả về phần thông tin engine của puzzle, hoặc None nếu loại.

    ``infos`` là kết quả multipv (đã xếp tốt → kém); ``played_cp`` là điểm của nước đã đi, nhìn từ bên đi.
    """
    color = board.turn
    lines = []
    for info in infos:
        if not info.get("pv"):
            continue
        cp = mover_cp(info["score"], color)
        if cp is None:
            return None  # Có chiếu hết trong tầm: lời giải là tính toán, không phải phong cách.
        lines.append((info["pv"][0], cp))
    if len(lines) < 2 or played_cp is None:
        return None
    best_cp = lines[0][1]
    if abs(best_cp) > cfg.max_abs_cp:
        return None
    if best_cp - lines[1][1] > cfg.max_spread_cp:
        return None
    if best_cp - played_cp > cfg.max_loss_cp:
        return None
    return {
        "playedCp": played_cp,
        "matchesEngine": lines[0][0] == played,
        "engine": [{"uci": move.uci(), "san": board.san(move), "cp": cp} for move, cp in lines],
    }


def candidates(test_dir: Path, cfg: PuzzleConfig, seed: int) -> list[dict]:
    """Các dòng test đủ điều kiện sơ bộ, mỗi ván tối đa một dòng, xáo trộn ngẫu nhiên."""
    table = pa.concat_tables([pq.read_table(shard) for shard in sorted(test_dir.glob("*.parquet"))])
    rows = [row for row in table.to_pylist() if row["ply"] >= cfg.min_ply and row["legal_count"] >= cfg.min_legal]
    random.Random(seed).shuffle(rows)
    seen: set[str] = set()
    picked = []
    for row in rows:
        if row["game_key"] in seen:
            continue
        seen.add(row["game_key"])
        picked.append(row)
    return picked


def build_puzzles(engine: chess.engine.SimpleEngine, player: str, test_dir: Path, count: int,
                  cfg: PuzzleConfig, max_tries: int, seed: int = 1337) -> tuple[list[dict], dict]:
    puzzles: list[dict] = []
    stats = {"tried": 0, "rejected": 0}
    for row in candidates(test_dir, cfg, seed):
        if len(puzzles) >= count or stats["tried"] >= max_tries:
            break
        stats["tried"] += 1
        board = chess.Board(row["fen"])
        played = chess.Move.from_uci(row["move_uci"])
        if played not in board.legal_moves:
            stats["rejected"] += 1
            continue
        limit = chess.engine.Limit(depth=cfg.depth)
        infos = engine.analyse(board, limit, multipv=cfg.multipv)
        line = next((info for info in infos if info.get("pv") and info["pv"][0] == played), None)
        if line is None:
            # Nước đã đi nằm ngoài multipv: chấm riêng nó.
            line = engine.analyse(board, limit, root_moves=[played])
        played_cp = mover_cp(line["score"], board.turn)
        verdict = judge(board, played, infos, played_cp, cfg)
        if verdict is None:
            stats["rejected"] += 1
            continue
        puzzles.append({
            "id": hashlib.sha1(f"{player}|{row['fen']}|{row['move_uci']}".encode()).hexdigest()[:12],
            "style": player,
            "fen": row["fen"],
            "uci": row["move_uci"],
            "san": board.san(played),
            "ply": row["ply"],
            "date": row["date"],
            "speed": row["speed"],
            "color": row["color"],
            "elo": row["elo"],
            "opponentElo": row["opponent_elo"],
            "result": row["result"],
            **verdict,
        })
    stats["kept"] = len(puzzles)
    return puzzles, stats
