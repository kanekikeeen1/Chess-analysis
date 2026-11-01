#!/usr/bin/env python3
"""D2: chia train/val/test theo thời gian cho từng kỳ thủ, từ ``data/players/<id>/games.pgn`` của D1.

    python scripts/prepare_style_data.py --report-dir ../docs/thesis/style/d2-split

Mặc định bỏ bullet (giống M2 bỏ ván dưới 3 phút: nước đi bị đồng hồ chi phối) và cờ thư; ``--speeds``
để đổi. Kết quả: ``data/style/<id>/{train,val,test}/part-*.parquet`` và ``split_card.json``, cùng
``data/style/pool/{train,val}`` cho mô hình GM chung (``--pool-only`` để chỉ dựng lại phần này)
và ``data/style/equal/<id>`` cho thí nghiệm cùng lượng dữ liệu (``--equal-only``).
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from style.collect import load_players  # noqa: E402
from style.split import SPLITS, SplitConfig, build_equal_budget, build_pool, prepare  # noqa: E402


def write_report(card: dict, report_dir: Path) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "split_card.json").write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    with (report_dir / "split_by_player.csv").open("w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        writer.writerow(["player", "split", "games", "positions", "first_date", "last_date", "blitz", "rapid",
                         "classical", "bullet"])
        for player, entry in card["players"].items():
            for split in SPLITS:
                row = entry[split]
                writer.writerow([player, split, row["games"], row["positions"], row["first_date"], row["last_date"],
                                 *[row["by_speed"].get(speed, 0) for speed in ("blitz", "rapid", "classical", "bullet")]])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--players", type=Path, default=Path("config/players.yaml"))
    parser.add_argument("--games", type=Path, default=Path("data/players"), help="Thư mục đầu ra của D1 build")
    parser.add_argument("--out", type=Path, default=Path("data/style"))
    parser.add_argument("--player", action="append", help="Chỉ xử lý kỳ thủ này (lặp lại được)")
    parser.add_argument("--speeds", default="blitz,rapid,classical",
                        help="Nhịp độ giữ lại, cách nhau bởi dấu phẩy (bullet,blitz,rapid,classical,correspondence)")
    parser.add_argument("--val-ratio", type=float, default=0.05)
    parser.add_argument("--test-ratio", type=float, default=0.10)
    parser.add_argument("--skip-opening-plies", type=int, default=10)
    parser.add_argument("--report-dir", type=Path)
    parser.add_argument("--pool-max-train", type=int, default=300_000,
                        help="Số vị trí train tối đa mỗi người góp vào dữ liệu GM chung")
    parser.add_argument("--pool-only", action="store_true", help="Chỉ dựng data/style/pool từ kết quả chia đã có")
    parser.add_argument("--equal-only", action="store_true",
                        help="Chỉ dựng data/style/equal: mọi người cùng số vị trí train (thí nghiệm đối chứng D4)")
    parser.add_argument("--equal-budget", type=int, help="Số vị trí train mỗi người (mặc định: bằng người ít nhất)")
    args = parser.parse_args()

    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("chess.pgn").setLevel(logging.CRITICAL)

    player_ids = args.player or list(load_players(args.players))
    missing = [p for p in player_ids if not (args.games / p / "games.pgn").exists()]
    if missing:
        parser.error(f"Chưa có games.pgn cho {', '.join(missing)}: chạy collect_player_games.py build trước")

    if args.equal_only:
        equal = build_equal_budget(args.out, player_ids, budget=args.equal_budget)
        print(f"equal ({equal['budget']} vị trí/người): {equal['players']}")
        return

    if args.pool_only:
        pool = build_pool(args.out, player_ids, max_train_per_player=args.pool_max_train)
        print(f"pool: {pool['players']}")
        return

    cfg = SplitConfig(
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        speeds=tuple(speed.strip() for speed in args.speeds.split(",") if speed.strip()),
        skip_opening_plies=args.skip_opening_plies,
    )
    card = prepare(args.games, args.out, player_ids, cfg)
    card["pool"] = build_pool(args.out, player_ids, max_train_per_player=args.pool_max_train)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "split_card.json").write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.report_dir:
        write_report(card, args.report_dir)

    for player, entry in card["players"].items():
        parts = " · ".join(f"{split} {entry[split]['games']} ván / {entry[split]['positions']} vị trí"
                           for split in SPLITS)
        print(f"{player:>8}: {parts}")
        print(f"{'':>8}  test từ {entry['test']['first_date']} · bỏ khỏi train {entry['removed_from_train_shared_with_heldout']}"
              f" ván trùng val/test của người khác")


if __name__ == "__main__":
    main()
