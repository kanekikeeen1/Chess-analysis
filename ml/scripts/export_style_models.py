#!/usr/bin/env python3
"""D5: xuất các mô hình phong cách sang ONNX cho backend, kèm sổ khai cuộc và manifest.

    python scripts/export_style_models.py --prefix style2 --eval ../docs/thesis/style/d4-eval-v2/evaluation.json

Ghi vào ``models/styles/``:

- ``<id>.onnx`` + ``<id>.meta.json``: cùng định dạng với ``models/m2.onnx``, backend nạp bằng cùng một lớp.
- ``<id>.book.json``: sổ khai cuộc từ chính các ván của kỳ thủ. Mô hình (như M2) không học 10 nửa nước đầu,
  nên phần khai cuộc của bot lấy từ đây: với mỗi thế cờ trong ``--book-plies`` nửa nước đầu mà kỳ thủ đã gặp ít
  nhất ``--book-min-games`` lần, lưu số lần họ chọn từng nước.
- ``styles.json``: danh sách kỳ thủ, Elo dùng để hỏi mô hình (trung vị Elo của họ trong dữ liệu train), số ván,
  khoảng thời gian và độ khớp trên tập test, để trang web ghi nhãn trung thực (D7).
"""

from __future__ import annotations

import argparse
import collections
import json
import logging
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import chess  # noqa: E402
import chess.pgn  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402

from m2.export_onnx import export  # noqa: E402
from style.collect import load_players  # noqa: E402

LOGGER = logging.getLogger("style.export")


def position_key(board: chess.Board) -> str:
    """FEN bỏ hai số đếm nước: cùng thế cờ đạt được qua thứ tự nước khác nhau vẫn trùng khóa."""
    return " ".join(board.fen().split(" ")[:4])


def opening_book(games_pgn: Path, plies: int, min_games: int) -> dict[str, dict[str, int]]:
    counts: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    with games_pgn.open(encoding="utf-8") as stream:
        while (game := chess.pgn.read_game(stream)) is not None:
            if game.headers.get("StyleSpeed") not in ("blitz", "rapid", "classical"):
                continue
            color = chess.WHITE if game.headers.get("StyleColor") == "white" else chess.BLACK
            board = game.board()
            for ply, move in enumerate(game.mainline_moves()):
                if ply >= plies:
                    break
                if board.turn == color:
                    counts[position_key(board)][move.uci()] += 1
                board.push(move)
    return {key: dict(counter.most_common()) for key, counter in counts.items() if sum(counter.values()) >= min_games}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--players", type=Path, default=Path("config/players.yaml"))
    parser.add_argument("--prefix", default="style2", help="Thư mục runs/<prefix>-<id>/best.pt")
    parser.add_argument("--runs", type=Path, default=Path("runs"))
    parser.add_argument("--data", type=Path, default=Path("data/style"))
    parser.add_argument("--games", type=Path, default=Path("data/players"))
    parser.add_argument("--eval", type=Path, help="evaluation.json của D4, để ghi độ khớp trên test vào manifest")
    parser.add_argument("--out", type=Path, default=Path("models/styles"))
    parser.add_argument("--book-plies", type=int, default=12)
    parser.add_argument("--book-min-games", type=int, default=3)
    args = parser.parse_args()

    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("chess.pgn").setLevel(logging.CRITICAL)

    players = load_players(args.players)
    card = json.loads((args.games / "dataset_card.json").read_text(encoding="utf-8"))
    evaluation = json.loads(args.eval.read_text(encoding="utf-8")) if args.eval else None
    args.out.mkdir(parents=True, exist_ok=True)

    manifest = []
    for player_id, player in players.items():
        checkpoint = args.runs / f"{args.prefix}-{player_id}" / "best.pt"
        if not checkpoint.exists():
            parser.error(f"Thiếu {checkpoint}")
        export(checkpoint, args.out / f"{player_id}.onnx")

        elos = []
        for shard in sorted((args.data / player_id / "train").glob("*.parquet")):
            elos += pq.read_table(shard, columns=["elo"]).column("elo").to_pylist()
        serving_elo = int(statistics.median(elos))

        book = opening_book(args.games / player_id / "games.pgn", args.book_plies, args.book_min_games)
        (args.out / f"{player_id}.book.json").write_text(json.dumps(book, separators=(",", ":")), encoding="utf-8")
        LOGGER.info("%s: sổ khai cuộc %d thế cờ · Elo phục vụ %d", player_id, len(book), serving_elo)

        stats = card["players"][player_id]
        entry = {
            "id": player_id,
            "displayName": player.display_name,
            "model": f"{player_id}.onnx",
            "book": f"{player_id}.book.json",
            "elo": serving_elo,
            "games": stats["games"],
            "firstYear": int(stats["first_date"][:4]) if stats.get("first_date") else None,
            "lastYear": int(stats["last_date"][:4]) if stats.get("last_date") else None,
            "bySpeed": stats["by_speed"],
            "bySource": stats["by_source"],
            "bookPositions": len(book),
            "checkpoint": str(checkpoint),
        }
        if evaluation:
            accuracy = evaluation["accuracy"][player_id]
            entry["testTop1"] = accuracy[player_id]["top1"]
            entry["baseTop1"] = accuracy["base"]["top1"]
        manifest.append(entry)

    (args.out / "styles.json").write_text(json.dumps({"styles": manifest}, ensure_ascii=False, indent=2),
                                          encoding="utf-8")
    print(f"Đã ghi {len(manifest)} mô hình phong cách vào {args.out}")


if __name__ == "__main__":
    main()
