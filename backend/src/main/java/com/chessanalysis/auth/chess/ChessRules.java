package com.chessanalysis.auth.chess;

import java.util.Optional;

import com.chessanalysis.auth.analysis.service.FenRules;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.Piece;
import com.github.bhlangonijr.chesslib.PieceType;
import com.github.bhlangonijr.chesslib.Side;
import com.github.bhlangonijr.chesslib.Square;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * Luật cờ phía server, bọc quanh chesslib.
 *
 * <p>Trước đây backend không có luật cờ nên phải tin mọi thứ trình duyệt gửi lên:
 * vị trí sau mỗi nước, nước đó có bắt quân/chiếu hết không, có thí quân không.
 * Lớp này cho phép server tự đi lại từng nước và tự tính các đặc trưng đó.
 */
public final class ChessRules {
    private ChessRules() {}

    /** Nạp một FEN đã được {@link FenRules} xác thực. */
    public static Board load(String fen) {
        FenRules.requireValid(fen);
        Board board = new Board();
        board.loadFromFen(fen);
        return board;
    }

    /** Nước hợp lệ ứng với chuỗi UCI ({@code e2e4}, {@code e7e8q}), nếu có. */
    public static Optional<Move> findLegal(Board board, String uci) {
        if (uci == null) return Optional.empty();
        String normalized = uci.trim().toLowerCase();
        return board.legalMoves().stream().filter(move -> move.toString().equals(normalized)).findFirst();
    }

    /**
     * Hai FEN có mô tả cùng một vị trí không. So bố trí quân, lượt đi, quyền nhập
     * thành và ô bắt tốt qua đường <em>có hiệu lực</em>; bỏ qua hai bộ đếm nước.
     *
     * <p>Không so nguyên chuỗi được vì chess.js chỉ ghi ô bắt tốt qua đường khi
     * thực sự có nước bắt, còn chesslib ghi sau mọi nước tốt đi hai ô. Hai cách ghi
     * đó khác chữ nhưng là cùng một vị trí.
     */
    public static boolean samePosition(String leftFen, String rightFen) {
        String[] left = leftFen.trim().split(" ");
        String[] right = rightFen.trim().split(" ");
        if (left.length < 4 || right.length < 4) return false;
        for (int field = 0; field < 3; field++) {
            if (!left[field].equals(right[field])) return false;
        }
        return effectiveEnPassant(load(leftFen)).equals(effectiveEnPassant(load(rightFen)));
    }

    /** Ô bắt tốt qua đường nếu có ít nhất một nước bắt hợp lệ tới ô đó, ngược lại {@code "-"}. */
    public static String effectiveEnPassant(Board board) {
        Square target = board.getEnPassant();
        if (target == null || target == Square.NONE) return "-";
        boolean capturable = board.legalMoves().stream().anyMatch(move -> move.getTo() == target
                && board.getPiece(move.getFrom()).getPieceType() == PieceType.PAWN);
        return capturable ? target.value().toLowerCase() : "-";
    }

    /**
     * FEN theo quy ước của chess.js: chỉ ghi ô bắt tốt qua đường khi thực sự bắt được.
     * Dùng cho mọi FEN server gửi cho frontend, vì frontend nạp FEN bằng chess.js.
     */
    public static String chessJsFen(Board board) {
        String[] fields = board.getFen().split(" ");
        fields[3] = effectiveEnPassant(board);
        return String.join(" ", fields);
    }

    /** Một bản sao độc lập của bàn cờ (không mang theo lịch sử lặp nước). */
    public static Board copy(Board board) {
        Board copy = new Board();
        copy.loadFromFen(board.getFen());
        return copy;
    }

    /** Ô {@code square} có bị bên {@code side} tấn công không. */
    public static boolean attacked(Board board, Square square, Side side) {
        return board.squareAttackedBy(square, side) != 0L;
    }

    public static boolean hasPiece(Board board, Side side, PieceType type) {
        for (Square square : Square.values()) {
            if (square == Square.NONE) continue;
            Piece piece = board.getPiece(square);
            if (piece != Piece.NONE && piece.getPieceSide() == side && piece.getPieceType() == type) return true;
        }
        return false;
    }

    public static int pieceCount(Board board) {
        int count = 0;
        for (Square square : Square.values()) {
            if (square != Square.NONE && board.getPiece(square) != Piece.NONE) count++;
        }
        return count;
    }
}
