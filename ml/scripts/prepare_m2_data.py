#!/usr/bin/env python3
"""Sinh tập dữ liệu M2 từ Lichess PGN.

Nguồn là file trên đĩa hoặc URL của Lichess open database (giấy phép CC0). Đọc
thẳng qua mạng là cách khuyên dùng: một tháng dữ liệu nặng khoảng 30 GB khi nén,
nhưng script dừng ngay khi mọi dải Elo đã đủ nên chỉ tải một phần nhỏ.

    python scripts/prepare_m2_data.py \\
        --source https://database.lichess.org/standard/lichess_db_standard_rated_2025-09.pgn.zst \\
        --out data/m2 \\
        --per-bucket 200000

``--per-bucket`` giữ dữ liệu cân bằng giữa 10 dải Elo (<1000 … 2600+). Dải 2600+ rất
hiếm trên Lichess nên là dải đầy chậm nhất; ``--max-games-seen`` chặn trên số ván đọc
để script luôn kết thúc, kể cả khi dải đó không đủ.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from m2.data import FilterConfig, build_dataset, is_url, reshuffle_split  # noqa: E402
from m2.encoding import NUM_ELO_BUCKETS, bucket_label  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", nargs="+", required=True,
                        help="Một hoặc nhiều file/URL .pgn hoặc .pgn.zst")
    parser.add_argument("--out", type=Path, default=Path("data/m2"))
    parser.add_argument("--per-bucket", type=int, default=200_000,
                        help="Số vị trí tối đa mỗi dải Elo (0 = không giới hạn)")
    parser.add_argument("--max-positions", type=int, default=None)
    parser.add_argument("--max-games", type=int, default=None)
    parser.add_argument("--max-games-seen", type=int, default=30_000_000,
                        help="Dừng sau khi đọc chừng này ván dù dải nào chưa đủ")
    parser.add_argument("--rows-per-shard", type=int, default=100_000,
                        help="Kích thước shard sau khi trộn; nhiều shard nhỏ chia đều cho các worker")
    parser.add_argument("--val-ratio", type=float, default=0.02)
    parser.add_argument("--test-ratio", type=float, default=0.02)

    parser.add_argument("--min-elo", type=int, default=600)
    parser.add_argument("--max-elo", type=int, default=3200)
    parser.add_argument("--max-elo-gap", type=int, default=300)
    parser.add_argument("--min-base-seconds", type=int, default=180)
    parser.add_argument("--skip-opening-plies", type=int, default=10)
    parser.add_argument("--positions-per-side", type=int, default=8,
                        help="Số vị trí tối đa lấy từ mỗi bên của một ván train (0 = lấy hết)")
    parser.add_argument("--max-per-player", type=int, default=3000,
                        help="Số vị trí tối đa của một tài khoản (0 = không giới hạn)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    for source in args.source:
        if not is_url(source) and not Path(source).exists():
            parser.error(f"Không tìm thấy file nguồn: {source}")

    cfg = FilterConfig(
        min_elo=args.min_elo,
        max_elo=args.max_elo,
        max_elo_gap=args.max_elo_gap,
        min_base_seconds=args.min_base_seconds,
        skip_opening_plies=args.skip_opening_plies,
        positions_per_side=args.positions_per_side or None,
        max_positions_per_player=args.max_per_player or None,
    )

    result = build_dataset(
        sources=list(args.source),
        out_dir=args.out,
        cfg=cfg,
        max_games=args.max_games,
        max_positions=args.max_positions,
        max_per_bucket=args.per_bucket or None,
        max_games_seen=args.max_games_seen,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        rows_per_shard=args.rows_per_shard,
    )

    # Shard được ghi theo thứ tự đọc nên lệch dải Elo theo từng shard; trộn lại toàn bộ.
    for split in result.splits:
        reshuffle_split(args.out, split, args.rows_per_shard)

    per_bucket = {bucket_label(b): result.per_bucket[b] for b in range(NUM_ELO_BUCKETS)}
    # Dataset card: nguồn, tiêu chí lọc, kích thước. Chương dữ liệu của báo cáo lấy
    # thẳng từ file này, và nó cũng là thứ khiến kết quả tái lập được.
    card = {
        "source_files": [str(s) for s in args.source],
        "source_license": "CC0 (Lichess open database)",
        "filters": dataclasses.asdict(cfg),
        "per_bucket_limit": args.per_bucket or None,
        "games_seen": result.games_seen,
        "games_kept": result.games_kept,
        "players": result.players,
        "players_per_elo_bucket": {bucket_label(b): result.players_per_bucket[b] for b in range(NUM_ELO_BUCKETS)},
        "stop_reason": result.stop_reason,
        "splits": result.splits,
        "positions_per_elo_bucket": per_bucket,
        "split_strategy": "hash theo game_key — không có ván nào nằm ở hai split",
    }
    args.out.mkdir(parents=True, exist_ok=True)
    card_path = args.out / "dataset_card.json"
    card_path.write_text(json.dumps(card, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nDataset card: {card_path}")
    print(f"Lý do dừng: {result.stop_reason} · {result.games_seen:,} ván đã đọc")

    for split, count in result.splits.items():
        print(f"  {split:<6} {count:>12,} vị trí")
    print("\nPhân bố theo dải Elo:")
    for label, count in per_bucket.items():
        players = result.players_per_bucket[list(per_bucket).index(label)]
        print(f"  {label:>12}  {count:>12,} vị trí  {players:>8,} người chơi")


if __name__ == "__main__":
    main()
