"""Kiểm thử tầng mã hóa M2.

Đây là phần đáng kiểm thử nhất của cả module: nếu mã hóa sai, mô hình vẫn huấn
luyện được và loss vẫn giảm, chỉ có điều nó học nhầm thứ — và lỗi đó chỉ lộ ra
sau nhiều giờ GPU. Chạy:

    cd ml && python -m pytest tests/ -v
"""

from __future__ import annotations

import random

import chess
import numpy as np
import pytest

from m2.encoding import (
    ELO_BUCKET_EDGES,
    NUM_ELO_BUCKETS,
    NUM_MOVES,
    NUM_PLANES,
    bucket_center,
    bucket_label,
    elo_to_bucket,
    encode_board,
    index_to_move,
    legal_move_mask,
    move_to_index,
    normalize_elo,
)


def test_move_space_matches_leela():
    """1858 là kích thước không gian nước đi của Leela Chess Zero.

    Con số này được cố định để có thể đối chiếu trực tiếp với Maia, vốn dùng
    cùng cách mã hóa. Lệch đi nghĩa là bảng nước đi đã hỏng.
    """
    assert NUM_MOVES == 1858


def test_plane_count_stable():
    assert NUM_PLANES == 20


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_move_index_round_trip(seed):
    """Mọi nước hợp lệ phải đi qua chỉ số rồi quay về đúng chính nó."""
    rng = random.Random(seed)
    board = chess.Board()
    checked = 0

    for _ in range(60):
        moves = list(board.legal_moves)
        if not moves:
            break
        for move in moves:
            index = move_to_index(move, board.turn)
            assert 0 <= index < NUM_MOVES
            assert index_to_move(index, board) == move
            checked += 1
        board.push(rng.choice(moves))

    assert checked > 500


def test_legal_mask_matches_board():
    board = chess.Board(
        "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4"
    )
    mask = legal_move_mask(board)
    assert mask.shape == (NUM_MOVES,)
    assert mask.sum() == board.legal_moves.count()
    for move in board.legal_moves:
        assert mask[move_to_index(move, board.turn)]


def test_board_is_flipped_for_black():
    """Thế cờ đối xứng gương phải cho cùng biểu diễn quân.

    Đây là tính chất khiến mạng không phải học lại chiến thuật cho cả hai màu.
    Nếu test này hỏng, mạng sẽ cần gấp đôi dữ liệu để đạt cùng chất lượng.
    """
    white_to_move = chess.Board(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    )
    black_to_move = chess.Board(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
    )
    assert np.array_equal(
        encode_board(white_to_move)[:12], encode_board(black_to_move)[:12]
    )


def test_black_move_encoded_in_flipped_space():
    """Nước của Đen phải nằm trong hệ tọa độ đã lật, không phải tọa độ gốc."""
    board = chess.Board()
    board.push_san("e4")
    move = chess.Move.from_uci("e7e5")

    # Sau khi lật, e7e5 của Đen trông giống hệt e2e4 của Trắng.
    assert move_to_index(move, chess.BLACK) == move_to_index(
        chess.Move.from_uci("e2e4"), chess.WHITE
    )


@pytest.mark.parametrize(
    "promotion", [chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT]
)
def test_promotions_round_trip(promotion):
    board = chess.Board("8/P7/8/8/8/8/8/K6k w - - 0 1")
    move = chess.Move(chess.A7, chess.A8, promotion=promotion)
    assert index_to_move(move_to_index(move, chess.WHITE), board) == move


def test_queen_promotion_shares_index_with_plain_move():
    """Phong Hậu dùng chung chỉ số với nước không phong, để bảng không phình."""
    queening = chess.Move(chess.A7, chess.A8, promotion=chess.QUEEN)
    plain = chess.Move(chess.A7, chess.A8)
    assert move_to_index(queening, chess.WHITE) == move_to_index(plain, chess.WHITE)


def test_castling_encoded_as_king_move():
    board = chess.Board("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")
    castle = chess.Move.from_uci("e1g1")
    assert castle in board.legal_moves
    assert index_to_move(move_to_index(castle, chess.WHITE), board) == castle


def test_en_passant_plane_set():
    board = chess.Board()
    for san in ("e4", "a6", "e5", "d5"):
        board.push_san(san)
    assert board.ep_square is not None
    planes = encode_board(board)
    assert planes[16].sum() == 1.0


def test_encode_board_shape_and_range():
    board = chess.Board()
    planes = encode_board(board)
    assert planes.shape == (NUM_PLANES, 8, 8)
    assert planes.dtype == np.float32
    assert planes.min() >= 0.0 and planes.max() <= 1.0
    # 32 quân ở thế ban đầu, chia đều trên 12 mặt phẳng quân.
    assert planes[:12].sum() == 32.0


def test_elo_buckets_are_ordered_and_cover_range():
    assert elo_to_bucket(600) == 0
    assert elo_to_bucket(3000) == NUM_ELO_BUCKETS - 1
    for edge in ELO_BUCKET_EDGES:
        assert elo_to_bucket(edge) == elo_to_bucket(edge - 1) + 1

    buckets = [elo_to_bucket(e) for e in range(700, 2500, 25)]
    assert buckets == sorted(buckets)


def test_bucket_labels_and_centers():
    for bucket in range(NUM_ELO_BUCKETS):
        assert bucket_label(bucket)
        assert 700 <= bucket_center(bucket) <= 2100
        assert elo_to_bucket(bucket_center(bucket)) == bucket


def test_normalize_elo_is_centred():
    assert normalize_elo(1500) == pytest.approx(0.0)
    assert normalize_elo(1900) == pytest.approx(1.0)
    assert normalize_elo(1100) == pytest.approx(-1.0)


def test_index_to_move_rejects_illegal():
    """Chỉ số ứng với nước không hợp lệ tại thế cờ này phải trả về None."""
    board = chess.Board()
    illegal = move_to_index(chess.Move.from_uci("a1a8"), chess.WHITE)
    assert index_to_move(illegal, board) is None
