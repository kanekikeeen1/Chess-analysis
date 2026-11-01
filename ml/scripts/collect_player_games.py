#!/usr/bin/env python3
"""D1: thu thập ván của từng kỳ thủ trong config/players.yaml.

Các bước (chạy lại được, phần đã tải thì bỏ qua):

    python scripts/collect_player_games.py chesscom             # mọi tài khoản Chess.com
    python scripts/collect_player_games.py lichess              # mọi tài khoản Lichess (LICHESS_TOKEN nếu có)
    python scripts/collect_player_games.py broadcast --from 2020-01
    python scripts/collect_player_games.py scan D:\\pgn\\twic    # file .pgn/.pgn.zst/.zip tải tay
    python scripts/collect_player_games.py build --report-dir ../docs/thesis/style/d1-data

``build`` đọc toàn bộ ``raw/``, lọc và khử trùng lặp, ghi ``<out>/<kỳ thủ>/games.pgn`` (sắp theo ngày)
và ``dataset_card.json``. Thêm ``--player carlsen`` để chỉ tải cho một người.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from style.collect import (  # noqa: E402
    SPEEDS,
    build,
    download_broadcasts,
    download_chesscom,
    download_lichess,
    load_players,
    scan_files,
)


def write_report(card: dict, report_dir: Path) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "dataset_card.json").write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    with (report_dir / "games_by_player.csv").open("w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        writer.writerow(["player", "games", "positions", "meets_target", "first_date", "last_date",
                         *[f"games_{speed}" for speed in SPEEDS], "chesscom", "lichess", "broadcast", "otb",
                         "duplicates_removed"])
        for player_id, entry in card["players"].items():
            writer.writerow([
                player_id, entry["games"], entry["positions"], entry["meets_target"],
                entry["first_date"], entry["last_date"],
                *[entry["by_speed"].get(speed, 0) for speed in SPEEDS],
                *[entry["by_source"].get(source, 0) for source in ("chesscom", "lichess", "broadcast", "otb")],
                entry["duplicates_removed"],
            ])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--players", type=Path, default=Path("config/players.yaml"))
    parser.add_argument("--raw", type=Path, default=Path("data/players/raw"))
    parser.add_argument("--player", action="append", help="Chỉ xử lý kỳ thủ này (lặp lại được)")
    commands = parser.add_subparsers(dest="command", required=True)

    for name in ("chesscom", "lichess"):
        command = commands.add_parser(name)
        command.add_argument("--refresh", action="store_true", help="Tải lại cả phần đã có")
    broadcast = commands.add_parser("broadcast")
    broadcast.add_argument("--from", dest="first", help="Tháng đầu, dạng YYYY-MM")
    broadcast.add_argument("--to", dest="last", help="Tháng cuối, dạng YYYY-MM")
    broadcast.add_argument("--refresh", action="store_true")
    scan = commands.add_parser("scan")
    scan.add_argument("sources", nargs="+", type=Path, help="File hoặc thư mục .pgn / .pgn.zst / .zip")
    build_command = commands.add_parser("build")
    build_command.add_argument("--out", type=Path, default=Path("data/players"))
    build_command.add_argument("--min-plies", type=int, default=20)
    build_command.add_argument("--target-games", type=int, default=3000)
    build_command.add_argument("--report-dir", type=Path, help="Chép dataset_card.json + CSV vào đây (docs/thesis)")
    args = parser.parse_args()

    # Console Windows có thể đang ở cp1252: in tiếng Việt khi đó sẽ ném lỗi thay vì chỉ hiện sai dấu.
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    # python-chess in ERROR cho mỗi nước lỗi trong PGN broadcast; build đã đếm chúng vào dataset_card.
    logging.getLogger("chess.pgn").setLevel(logging.CRITICAL)

    players = load_players(args.players)
    if args.player:
        unknown = set(args.player) - set(players)
        if unknown:
            parser.error(f"Không có trong {args.players}: {', '.join(sorted(unknown))}")
        players = {player_id: players[player_id] for player_id in args.player}

    if args.command == "chesscom":
        for player in players.values():
            for account in player.chesscom:
                download_chesscom(account, args.raw, refresh=args.refresh)
    elif args.command == "lichess":
        token = os.environ.get("LICHESS_TOKEN") or None
        for player in players.values():
            for account in player.lichess:
                download_lichess(account, args.raw, token=token, refresh=args.refresh)
    elif args.command == "broadcast":
        download_broadcasts(players, args.raw, first=args.first, last=args.last, refresh=args.refresh)
    elif args.command == "scan":
        missing = [source for source in args.sources if not source.exists()]
        if missing:
            parser.error(f"Không tìm thấy: {', '.join(map(str, missing))}")
        scan_files(args.sources, players, args.raw)
    elif args.command == "build":
        card = build(args.raw, args.out, players, min_plies=args.min_plies, target_games=args.target_games)
        (args.out / "dataset_card.json").write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.report_dir:
            write_report(card, args.report_dir)
        for player_id, entry in card["players"].items():
            status = "đạt" if entry["meets_target"] else f"THIẾU (cần ≥ {card['target_games']})"
            print(f"{player_id:>8}: {entry['games']:>6} ván, {entry['positions']:>8} nước · {status} · "
                  f"{entry['by_speed']}")


if __name__ == "__main__":
    main()
