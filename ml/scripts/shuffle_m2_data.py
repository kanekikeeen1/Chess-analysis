#!/usr/bin/env python3
"""Trộn ngẫu nhiên các shard M2 đã sinh, không phải tải lại dữ liệu từ Lichess.

    python scripts/shuffle_m2_data.py --data data/m2

``prepare_m2_data.py`` bản mới tự trộn khi sinh xong; script này dành cho dữ liệu đã
sinh từ trước khi có bước trộn (shard ghi theo thứ tự đọc, lệch dải Elo theo shard).
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from m2.data import reshuffle_split  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=Path("data/m2"))
    parser.add_argument("--rows-per-shard", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=1337)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")

    if not (args.data / "train").is_dir():
        parser.error(f"Không thấy {args.data / 'train'}; hãy chạy prepare_m2_data.py trước.")
    for split in ("train", "val", "test"):
        rows = reshuffle_split(args.data, split, args.rows_per_shard, args.seed)
        print(f"  {split:<6} {rows:>12,} vị trí đã trộn")


if __name__ == "__main__":
    main()
