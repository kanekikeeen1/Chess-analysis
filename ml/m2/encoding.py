"""Mã hóa thế cờ và nước đi cho mạng chính sách M2.

Toàn bộ phần còn lại của M2 phụ thuộc vào module này, nên nó được giữ thuần
Python + numpy và có thể kiểm thử độc lập. Hai quy ước quan trọng:

1. **Luôn xoay bàn cờ về phía bên đi.** Mạng chỉ học một chiều: "quân của tôi"
   và "quân của đối thủ". Thế cờ của Đen được lật dọc và đổi màu quân trước khi
   đưa vào mạng, nên mạng không phải học lại toàn bộ chiến thuật cho cả hai bên.
   Nước đi trả ra cũng nằm trong hệ tọa độ đã xoay và phải được lật ngược lại.

2. **Không gian nước đi cố định 1858 phần tử**, dựng theo cách của Leela Chess
   Zero: mọi cặp (ô đi, ô đến) hợp lệ về mặt hình học cho quân trượt/mã, cộng
   các nước phong cấp dưới. Bảng được sinh một lần lúc import và ổn định giữa
   các lần chạy, nên chỉ số nước đi ghi trong checkpoint luôn đọc lại được.
"""

from __future__ import annotations

import functools
from typing import Iterable

import chess
import numpy as np

# --- Mặt phẳng đầu vào ---------------------------------------------------
#
#  0-5   : quân của bên đi   (P N B R Q K)
#  6-11  : quân của đối thủ  (P N B R Q K)
#  12    : quyền nhập thành gần vua của bên đi
#  13    : quyền nhập thành xa vua của bên đi
#  14    : quyền nhập thành gần vua của đối thủ
#  15    : quyền nhập thành xa vua của đối thủ
#  16    : ô bắt tốt qua đường (nếu có)
#  17    : đồng hồ 50 nước, chuẩn hóa về [0, 1]
#  18    : thế cờ đã lặp lại ít nhất một lần
#  19    : hằng số 1 (giúp mạng nhận biết mép bàn cờ sau khi pad)
NUM_PLANES = 20
BOARD_SIZE = 8

PIECE_ORDER = [
    chess.PAWN,
    chess.KNIGHT,
    chess.BISHOP,
    chess.ROOK,
    chess.QUEEN,
    chess.KING,
]

# Phong cấp dưới; phong Hậu dùng chung chỉ số với nước đi thường để bảng không
# phình lên vô ích (phong Hậu chiếm ~97% số lần phong cấp).
UNDERPROMOTIONS = [chess.KNIGHT, chess.BISHOP, chess.ROOK]


def _knight_targets(square: int) -> Iterable[int]:
    file_, rank = chess.square_file(square), chess.square_rank(square)
    for df, dr in (
        (1, 2), (2, 1), (2, -1), (1, -2),
        (-1, -2), (-2, -1), (-2, 1), (-1, 2),
    ):
        f, r = file_ + df, rank + dr
        if 0 <= f < 8 and 0 <= r < 8:
            yield chess.square(f, r)


def _slider_targets(square: int) -> Iterable[int]:
    file_, rank = chess.square_file(square), chess.square_rank(square)
    for df, dr in (
        (0, 1), (1, 1), (1, 0), (1, -1),
        (0, -1), (-1, -1), (-1, 0), (-1, 1),
    ):
        for distance in range(1, 8):
            f, r = file_ + df * distance, rank + dr * distance
            if not (0 <= f < 8 and 0 <= r < 8):
                break
            yield chess.square(f, r)


@functools.lru_cache(maxsize=1)
def _move_table() -> tuple[tuple[str, ...], dict[str, int]]:
    """Sinh bảng nước đi cố định. Thứ tự phải ổn định giữa các lần chạy."""
    uci_list: list[str] = []
    seen: set[str] = set()

    def add(from_sq: int, to_sq: int, promotion: int | None = None) -> None:
        move = chess.Move(from_sq, to_sq, promotion=promotion)
        uci = move.uci()
        if uci not in seen:
            seen.add(uci)
            uci_list.append(uci)

    for from_sq in chess.SQUARES:
        for to_sq in _slider_targets(from_sq):
            add(from_sq, to_sq)
        for to_sq in _knight_targets(from_sq):
            add(from_sq, to_sq)

    # Phong cấp dưới: chỉ từ hàng 7 lên hàng 8 (sau khi đã xoay về phía bên đi
    # thì mọi nước phong cấp đều đi lên).
    for from_file in range(8):
        from_sq = chess.square(from_file, 6)
        for to_file in (from_file - 1, from_file, from_file + 1):
            if not 0 <= to_file < 8:
                continue
            to_sq = chess.square(to_file, 7)
            for promotion in UNDERPROMOTIONS:
                add(from_sq, to_sq, promotion)

    index = {uci: i for i, uci in enumerate(uci_list)}
    return tuple(uci_list), index


MOVE_UCIS, MOVE_INDEX = _move_table()
NUM_MOVES = len(MOVE_UCIS)


def encode_board(board: chess.Board) -> np.ndarray:
    """Trả về tensor (NUM_PLANES, 8, 8) đã xoay về phía bên đi."""
    planes = np.zeros((NUM_PLANES, BOARD_SIZE, BOARD_SIZE), dtype=np.float32)
    mover = board.turn

    for square, piece in board.piece_map().items():
        # Xoay: khi Đen đi, lật bàn cờ để bên đi luôn tiến từ hàng 0 lên hàng 7.
        view_square = square if mover == chess.WHITE else chess.square_mirror(square)
        rank = chess.square_rank(view_square)
        file_ = chess.square_file(view_square)
        plane = PIECE_ORDER.index(piece.piece_type)
        if piece.color != mover:
            plane += 6
        planes[plane, rank, file_] = 1.0

    planes[12, :, :] = float(board.has_kingside_castling_rights(mover))
    planes[13, :, :] = float(board.has_queenside_castling_rights(mover))
    planes[14, :, :] = float(board.has_kingside_castling_rights(not mover))
    planes[15, :, :] = float(board.has_queenside_castling_rights(not mover))

    if board.ep_square is not None:
        ep = board.ep_square if mover == chess.WHITE else chess.square_mirror(board.ep_square)
        planes[16, chess.square_rank(ep), chess.square_file(ep)] = 1.0

    planes[17, :, :] = min(board.halfmove_clock, 100) / 100.0
    planes[18, :, :] = float(board.is_repetition(2))
    planes[19, :, :] = 1.0
    return planes


def move_to_index(move: chess.Move, mover: chess.Color) -> int:
    """Chuyển nước đi sang chỉ số trong không gian đã xoay.

    Ném ``KeyError`` nếu nước đi không nằm trong bảng — điều này chỉ xảy ra khi
    dữ liệu hỏng, nên để nó nổ lên thay vì âm thầm bỏ qua.
    """
    from_sq, to_sq = move.from_square, move.to_square
    if mover == chess.BLACK:
        from_sq = chess.square_mirror(from_sq)
        to_sq = chess.square_mirror(to_sq)
    promotion = move.promotion if move.promotion in UNDERPROMOTIONS else None
    return MOVE_INDEX[chess.Move(from_sq, to_sq, promotion=promotion).uci()]


def index_to_move(index: int, board: chess.Board) -> chess.Move | None:
    """Chuyển chỉ số ngược lại thành nước đi hợp lệ trên ``board``.

    Trả về ``None`` nếu chỉ số không ứng với nước hợp lệ nào. Việc đối chiếu với
    danh sách nước hợp lệ cũng xử lý luôn phong Hậu: chỉ số của nước không phong
    sẽ khớp với nước phong Hậu khi tốt đi tới hàng cuối.
    """
    base = chess.Move.from_uci(MOVE_UCIS[index])
    from_sq, to_sq = base.from_square, base.to_square
    if board.turn == chess.BLACK:
        from_sq = chess.square_mirror(from_sq)
        to_sq = chess.square_mirror(to_sq)

    candidate = chess.Move(from_sq, to_sq, promotion=base.promotion)
    if candidate in board.legal_moves:
        return candidate
    if base.promotion is None:
        queening = chess.Move(from_sq, to_sq, promotion=chess.QUEEN)
        if queening in board.legal_moves:
            return queening
    return None


def legal_move_mask(board: chess.Board) -> np.ndarray:
    """Mặt nạ boolean độ dài NUM_MOVES, True tại các nước hợp lệ."""
    mask = np.zeros(NUM_MOVES, dtype=bool)
    for move in board.legal_moves:
        mask[move_to_index(move, board.turn)] = True
    return mask


# --- Điều kiện hóa Elo ---------------------------------------------------
#
# Maia huấn luyện chín mạng rời rạc, mỗi mạng một dải Elo. M2 dùng một mạng duy
# nhất nhận Elo làm đầu vào, nên nội suy được giữa các mức trình độ. Elo được
# đưa vào dưới hai dạng bổ trợ nhau: một chỉ số dải (cho embedding học được) và
# một giá trị liên tục đã chuẩn hóa (cho phép nội suy mượt).

# Mười dải: <1000, 1000–1199, …, 2400–2599, 2600+ (rating Lichess). Bước 200 khớp với
# các mức người dùng chọn trên giao diện; dải cuối là trình độ kiện tướng. Bản trước
# dừng ở 1900+, nên mọi người chơi mạnh hơn bị gộp chung một dải.
ELO_BUCKET_EDGES = (1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600)
NUM_ELO_BUCKETS = len(ELO_BUCKET_EDGES) + 1
ELO_CENTER = 1500.0
ELO_SCALE = 400.0


def elo_to_bucket(elo: float) -> int:
    """Chỉ số dải Elo, 0 cho mức thấp nhất và NUM_ELO_BUCKETS-1 cho cao nhất."""
    bucket = 0
    for edge in ELO_BUCKET_EDGES:
        if elo >= edge:
            bucket += 1
    return bucket


def bucket_label(bucket: int) -> str:
    """Nhãn dễ đọc cho một dải, dùng trong báo cáo và giao diện."""
    if bucket == 0:
        return f"<{ELO_BUCKET_EDGES[0]}"
    if bucket == NUM_ELO_BUCKETS - 1:
        return f"{ELO_BUCKET_EDGES[-1]}+"
    return f"{ELO_BUCKET_EDGES[bucket - 1]}-{ELO_BUCKET_EDGES[bucket] - 1}"


def bucket_center(bucket: int) -> float:
    """Elo đại diện của một dải, dùng khi ước lượng trình độ ở M2③."""
    if bucket == 0:
        return ELO_BUCKET_EDGES[0] - 100.0
    if bucket == NUM_ELO_BUCKETS - 1:
        return ELO_BUCKET_EDGES[-1] + 100.0
    return (ELO_BUCKET_EDGES[bucket - 1] + ELO_BUCKET_EDGES[bucket]) / 2.0


def normalize_elo(elo: float) -> float:
    """Đưa Elo về quanh 0 với độ lệch ~1 để mạng dễ học."""
    return (float(elo) - ELO_CENTER) / ELO_SCALE
