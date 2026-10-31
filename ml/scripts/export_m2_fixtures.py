#!/usr/bin/env python3
"""Sinh dữ liệu đối chiếu cho bản port Java của ``m2/encoding.py``.

    python scripts/export_m2_fixtures.py

Backend mã hóa bàn cờ bằng Java trước khi đưa vào mô hình ONNX. Chỉ cần lệch một
mặt phẳng (ví dụ quên lật bàn cờ khi Đen đi) là mô hình vẫn chạy, vẫn trả về xác
suất, nhưng toàn bộ kết quả sai mà không có lỗi nào báo ra. File này ghi lại đầu
ra của bản Python cho các thế cờ đủ loại, để test Java so khớp từng giá trị.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import chess

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from m2.encoding import (  # noqa: E402
    ELO_BUCKET_EDGES,
    MOVE_UCIS,
    NUM_PLANES,
    elo_to_bucket,
    encode_board,
    legal_move_mask,
    move_to_index,
    normalize_elo,
)

# Thế cờ chọn tay để phủ mọi nhánh của bộ mã hóa.
HANDPICKED = [
    chess.STARTING_FEN,
    # Đen đi, còn đủ quyền nhập thành: kiểm tra lật bàn cờ và đổi quyền "của tôi/đối thủ".
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    # Bắt tốt qua đường hợp lệ cho Trắng (ô f6) và cho Đen (ô d3).
    "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",
    "rnbqkbnr/pp1ppppp/8/8/2pPP3/8/PPP2PPP/RNBQKBNR b KQkq d3 0 3",
    # Phong cấp cho Trắng và cho Đen, kèm nước ăn chéo khi phong cấp.
    "1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1",
    "4k3/8/8/8/8/8/p7/1N2K3 b - - 0 1",
    # Chỉ còn một bên quyền nhập thành, đồng hồ 50 nước khác 0 và vượt 100.
    "r3k2r/8/8/8/8/8/8/R3K2R w Kq - 37 40",
    "r3k2r/8/8/8/8/8/8/R3K2R b Qk - 150 90",
    # Tàn cuộc bị chiếu.
    "8/8/8/4k3/8/8/3q4/4K3 w - - 0 60",
]

ELOS = [600, 999, 1000, 1500, 1999, 2000, 2599, 2600, 3100]


def sample_dataset_fens(data_dir: Path, limit: int) -> list[str]:
    import pyarrow.parquet as pq

    shards = sorted((data_dir / "test").glob("*.parquet"))
    if not shards:
        return []
    return pq.read_table(shards[0], columns=["fen"]).column("fen").to_pylist()[:limit]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=Path("data/m2-v2"),
                        help="Lấy thêm thế cờ thật từ tập test của bộ dữ liệu này")
    parser.add_argument("--samples", type=int, default=60)
    parser.add_argument("--out", type=Path,
                        default=Path("../backend/src/test/resources/m2/encoding-fixtures.json"))
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    fens = HANDPICKED + sample_dataset_fens(args.data, args.samples)
    positions = []
    for fen in fens:
        board = chess.Board(fen)
        planes = encode_board(board).reshape(-1)
        mask = legal_move_mask(board)
        positions.append({
            "fen": fen,
            # Chỉ ghi các ô khác 0 (chỉ số phẳng = mặt phẳng * 64 + hàng * 8 + cột).
            "planes": [[int(i), round(float(planes[i]), 6)] for i in planes.nonzero()[0]],
            "legal": sorted(int(i) for i in mask.nonzero()[0]),
            "moves": {move.uci(): move_to_index(move, board.turn) for move in board.legal_moves},
        })

    fixture = {
        "numPlanes": NUM_PLANES,
        "eloBucketEdges": list(ELO_BUCKET_EDGES),
        "moveUcis": list(MOVE_UCIS),
        "elos": [{"elo": elo, "bucket": elo_to_bucket(elo), "norm": normalize_elo(elo)} for elo in ELOS],
        "positions": positions,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(fixture, ensure_ascii=False), encoding="utf-8")
    print(f"Đã ghi {len(positions)} thế cờ vào {args.out.resolve()}")


if __name__ == "__main__":
    main()
