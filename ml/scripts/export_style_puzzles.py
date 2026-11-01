#!/usr/bin/env python3
"""D6: xuất puzzle "Tìm nước kiện tướng đã đi" từ ván test của từng kỳ thủ, vào cạnh các mô hình phong cách.

    python scripts/export_style_puzzles.py --count 150

Cần Stockfish (``--stockfish`` hoặc biến môi trường ``STOCKFISH_PATH``). Kết quả: ``models/styles/puzzles.json``,
backend nạp khi khởi động. Tiêu chí chọn thế cờ: xem ``style/puzzles.py``.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import chess.engine  # noqa: E402

from style.collect import load_players  # noqa: E402
from style.puzzles import PuzzleConfig, build_puzzles  # noqa: E402

LOGGER = logging.getLogger("export_style_puzzles")


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--players", type=Path, default=Path("config/players.yaml"))
    parser.add_argument("--data", type=Path, default=Path("data/style"))
    parser.add_argument("--out", type=Path, default=Path("models/styles/puzzles.json"))
    parser.add_argument("--count", type=int, default=150, help="Số puzzle mỗi kỳ thủ")
    parser.add_argument("--max-tries", type=int, default=1500, help="Số thế cờ tối đa đưa cho Stockfish mỗi người")
    parser.add_argument("--depth", type=int, default=14)
    parser.add_argument("--stockfish", default=os.environ.get("STOCKFISH_PATH"))
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    if not args.stockfish:
        parser.error("Cần Stockfish: đặt STOCKFISH_PATH hoặc truyền --stockfish")

    cfg = PuzzleConfig(depth=args.depth)
    puzzles: list[dict] = []
    report = {}
    with chess.engine.SimpleEngine.popen_uci(args.stockfish) as engine:
        engine.configure({"Threads": max(1, (os.cpu_count() or 2) // 2), "Hash": 128})
        for player in load_players(args.players):
            found, stats = build_puzzles(engine, player, args.data / player / "test", args.count, cfg, args.max_tries)
            puzzles += found
            report[player] = {**stats, "notEngineBest": sum(not p["matchesEngine"] for p in found)}
            LOGGER.info("%s: %d puzzle (thử %d thế cờ, loại %d; %d puzzle kỳ thủ không đi nước số 1 của Stockfish)",
                        player, stats["kept"], stats["tried"], stats["rejected"], report[player]["notEngineBest"])

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"config": asdict(cfg), "report": report, "puzzles": puzzles},
                                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Đã ghi {len(puzzles)} puzzle vào {args.out}")


if __name__ == "__main__":
    main()
