package com.chessanalysis.auth.chess;

import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.Piece;
import com.github.bhlangonijr.chesslib.PieceType;
import com.github.bhlangonijr.chesslib.Side;
import com.github.bhlangonijr.chesslib.Square;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * Đặc trưng của một nước đi do server tự tính, thay cho các cờ trước đây trình
 * duyệt gửi lên (capture, check, checkmate, thí quân…).
 *
 * <p>Phần ước lượng thí quân là bản port của {@code estimateMaterialSacrifice} ở
 * frontend ({@code lib/move-classification.ts}) và được kiểm tra trên cùng các
 * thế cờ trong test của hai bên.
 */
public record MoveFacts(
        boolean capture,
        boolean check,
        boolean checkmate,
        boolean promotion,
        int legalMoveCount,
        boolean sacrificeCandidate,
        boolean abandonedPieceCandidate,
        double sacrificeValue,
        String sacrificeKind) {

    /** Ngưỡng vật chất ròng để coi là thí quân thật, cùng giá trị với frontend. */
    static final double MIN_SACRIFICE = 0.75;

    /** Tính đặc trưng của {@code move} trên {@code before} mà không thay đổi {@code before}. */
    public static MoveFacts of(Board before, Move move) {
        Side mover = before.getSideToMove();
        Side opponent = mover.flip();
        Piece moved = before.getPiece(move.getFrom());
        int legalMoveCount = before.legalMoves().size();

        Board after = ChessRules.copy(before);
        after.doMove(move);

        boolean capture = ChessRules.pieceCount(after) < ChessRules.pieceCount(before);
        boolean sacrificeCandidate = isMinorOrMajor(moved) && ChessRules.attacked(after, move.getTo(), opponent);

        boolean abandoned = false;
        for (Square square : Square.values()) {
            if (square == Square.NONE || square == move.getFrom()) continue;
            Piece pieceBefore = before.getPiece(square);
            if (pieceBefore.getPieceSide() != mover || !isMinorOrMajor(pieceBefore)) continue;
            if (after.getPiece(square) == pieceBefore
                    && ChessRules.attacked(before, square, opponent)
                    && ChessRules.attacked(after, square, opponent)) {
                abandoned = true;
                break;
            }
        }

        Sacrifice sacrifice = estimateSacrifice(before, after, move, mover, opponent);
        return new MoveFacts(
                capture,
                after.isKingAttacked(),
                after.isMated(),
                move.getPromotion() != null && move.getPromotion() != Piece.NONE,
                legalMoveCount,
                sacrificeCandidate,
                abandoned,
                sacrifice.amount(),
                sacrifice.kind());
    }

    /**
     * Một quân không phải tốt bị đối phương bắt được, và sau khi bên vừa đi đáp lại
     * một nước tốt nhất về vật chất thì vẫn lỗ ròng ít nhất {@link #MIN_SACRIFICE}.
     * Quân có bảo vệ chỉ đang bị tấn công vì vậy không bị tính là thí quân.
     */
    private static Sacrifice estimateSacrifice(Board before, Board after, Move played, Side mover, Side opponent) {
        double balanceBefore = balance(before, mover);
        Sacrifice best = Sacrifice.NONE;

        for (Move capture : after.legalMoves()) {
            Piece offered = after.getPiece(capture.getTo());
            if (offered == Piece.NONE || offered.getPieceSide() != mover || !isMinorOrMajor(offered)) continue;

            String kind;
            if (capture.getTo() == played.getTo()) {
                kind = "MOVED";
            } else {
                Piece original = before.getPiece(capture.getTo());
                boolean wasAttacked = ChessRules.attacked(before, capture.getTo(), opponent);
                if (capture.getTo() == played.getFrom() || !wasAttacked || original != offered) continue;
                kind = "ABANDONED";
            }

            Board accepted = ChessRules.copy(after);
            accepted.doMove(capture);
            double bestReply = balance(accepted, mover);
            for (Move reply : accepted.legalMoves()) {
                accepted.doMove(reply);
                bestReply = Math.max(bestReply, balance(accepted, mover));
                accepted.undoMove();
            }

            double amount = Math.max(0, balanceBefore - bestReply);
            if (amount > best.amount()) best = new Sacrifice(amount, kind);
        }
        return best.amount() >= MIN_SACRIFICE ? best : Sacrifice.NONE;
    }

    private static boolean isMinorOrMajor(Piece piece) {
        if (piece == null || piece == Piece.NONE) return false;
        PieceType type = piece.getPieceType();
        return type != PieceType.PAWN && type != PieceType.KING;
    }

    private static double balance(Board board, Side side) {
        double total = 0;
        for (Square square : Square.values()) {
            if (square == Square.NONE) continue;
            Piece piece = board.getPiece(square);
            if (piece == Piece.NONE) continue;
            double value = switch (piece.getPieceType()) {
                case PAWN -> 1;
                case KNIGHT -> 3;
                case BISHOP -> 3.25;
                case ROOK -> 5;
                case QUEEN -> 9;
                default -> 0;
            };
            total += piece.getPieceSide() == side ? value : -value;
        }
        return total;
    }

    private record Sacrifice(double amount, String kind) {
        static final Sacrifice NONE = new Sacrifice(0, "NONE");
    }
}
