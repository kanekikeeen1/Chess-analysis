#!/usr/bin/env python3
"""Sinh tập dữ liệu M2 từ Lichess PGN.

Tải dữ liệu nguồn trước (giấy phép CC0):

    wget https://database.lichess.org/standard/lichess_db_standard_rated_2024-01.pgn.zst

Rồi chạy:

    python scripts/prepare_m2_data.py \\
        --source lichess_db_standard_rated_2024-01.pgn.zst \\
        --out data/m2 \\
        --max-positions 5000000

Một tháng dữ liệu Lichess khoảng 100 triệu ván; không cần và không nên xử lý
hết. Năm triệu vị trí là quá đủ cho quy mô đồ án và chạy xong trong vài giờ.
Script dừng ngay khi đạt hạn mức nên có thể ước lượng thời gian khá chắc.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from m2.data import FilterConfig, build_dataset  # noqa: E402
from m2.dataset import elo_histogram  # noqa: E402
from m2.encoding import bucket_label  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, nargs="+", required=True,
                        help="Một hoặc nhiều file .pgn hoặc .pgn.zst")
    parser.add_argument("--out", type=Path, default=Path("data/m2"))
    parser.add_argument("--max-positions", type=int, default=5_000_000)
    parser.add_argument("--max-games", type=int, default=None)
    parser.add_argument("--rows-per-shard", type=int, default=500_000)
    parser.add_argument("--val-ratio", type=float, default=0.02)
    parser.add_argument("--test-ratio", type=float, default=0.02)

    parser.add_argument("--min-elo", type=int, default=800)
    parser.add_argument("--max-elo", type=int, default=2600)
    parser.add_argument("--max-elo-gap", type=int, default=300)
    parser.add_argument("--min-base-seconds", type=int, default=180)
    parser.add_argument("--skip-opening-plies", type=int, default=10)
    parser.add_argument("--stats", action="store_true",
                        help="In phân bố Elo sau khi sinh xong (đọc lại toàn bộ shard)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    for source in args.source:
        if not source.exists():
            parser.error(f"Không tìm thấy file nguồn: {source}")

    cfg = FilterConfig(
        min_elo=args.min_elo,
        max_elo=args.max_elo,
        max_elo_gap=args.max_elo_gap,
        min_base_seconds=args.min_base_seconds,
        skip_opening_plies=args.skip_opening_plies,
    )

    counts = build_dataset(
        sources=list(args.source),
        out_dir=args.out,
        cfg=cfg,
        max_games=args.max_games,
        max_positions=args.max_positions,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        rows_per_shard=args.rows_per_shard,
    )

    # Dataset card: nguồn, tiêu chí lọc, kích thước. Chương 3 của báo cáo lấy
    # thẳng từ file này, và nó cũng là thứ khiến kết quả tái lập được.
    card = {
        "source_files": [str(s) for s in args.source],
        "source_license": "CC0 (Lichess open database)",
        "filters": dataclasses.asdict(cfg),
        "splits": counts,
        "split_strategy": "hash theo game_key — không có ván nào nằm ở hai split",
    }
    args.out.mkdir(parents=True, exist_ok=True)
    card_path = args.out / "dataset_card.json"
    card_path.write_text(json.dumps(card, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nDataset card: {card_path}")

    for split, count in counts.items():
        print(f"  {split:<6} {count:>12,} vị trí")

    if args.stats:
        print("\nPhân bố theo dải Elo (train):")
        for bucket, count in elo_histogram(args.out, "train").items():
            print(f"  {bucket_label(bucket):>12}  {count:>12,}")


if __name__ == "__main__":
    main()
