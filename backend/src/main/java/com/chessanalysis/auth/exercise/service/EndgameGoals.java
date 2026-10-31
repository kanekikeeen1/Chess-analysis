package com.chessanalysis.auth.exercise.service;

import com.chessanalysis.auth.chess.ChessRules;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.Piece;
import com.github.bhlangonijr.chesslib.PieceType;
import com.github.bhlangonijr.chesslib.Side;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * Xác định một bài tàn cuộc đã đạt mục tiêu, thất bại hay còn tiếp tục.
 *
 * <p>Được kiểm tra hai lần mỗi lượt: ngay sau nước của người học (đã được Stockfish
 * chấp nhận) và sau nước đáp của engine. Việc kiểm tra sau nước đáp là chỗ sửa lỗi
 * cũ: bài "thắng xe" từng được tính hoàn thành ngay khi người học đổi hậu lấy xe
 * (Qxg8+ Kxg8), tức là đã ném thắng lợi thành hòa.
 */
final class EndgameGoals {
    /** Bài cầm hòa hoàn thành khi trụ được chừng này nước mà không đi sai. */
    static final int DRAW_HOLD_MOVES = 10;

    enum Outcome { CONTINUE, COMPLETED, FAILED }

    record Verdict(Outcome outcome, String message) {
        static final Verdict CONTINUE = new Verdict(Outcome.CONTINUE, null);
        static Verdict completed(String message) { return new Verdict(Outcome.COMPLETED, message); }
        static Verdict failed(String message) { return new Verdict(Outcome.FAILED, message); }
    }

    private EndgameGoals() {}

    /** {@code board} là vị trí ngay sau nước của người học. */
    static Verdict afterPlayerMove(String goal, Board board, Move move) {
        if (board.isMated()) return Verdict.completed("Chiếu hết! Hoàn thành bài tàn cuộc.");
        if ("PROMOTE".equals(goal) && move.getPromotion() != null && move.getPromotion() != Piece.NONE) {
            return Verdict.completed("Phong cấp thành công! Hoàn thành bài tàn cuộc.");
        }
        if (board.isDraw()) {
            return "DRAW".equals(goal)
                    ? Verdict.completed("Ván cờ hòa — bạn đã cầm hòa thành công.")
                    : Verdict.failed(drawReason(board) + " trước khi đạt mục tiêu.");
        }
        return Verdict.CONTINUE;
    }

    /** {@code board} là vị trí sau nước đáp của engine; {@code acceptedMoves} đã gồm nước vừa đi. */
    static Verdict afterOpponentMove(String goal, Board board, Side player, int acceptedMoves) {
        if (board.isMated()) return Verdict.failed("Bạn bị chiếu hết.");
        if (board.isDraw()) {
            return "DRAW".equals(goal)
                    ? Verdict.completed("Ván cờ hòa — bạn đã cầm hòa thành công.")
                    : Verdict.failed(drawReason(board) + " trước khi đạt mục tiêu.");
        }
        if ("WIN_ROOK".equals(goal)
                && !ChessRules.hasPiece(board, player.flip(), PieceType.ROOK)
                && ChessRules.hasPiece(board, player, PieceType.QUEEN)) {
            return Verdict.completed("Đã thắng xe mà vẫn giữ được hậu! Hoàn thành bài tàn cuộc.");
        }
        if ("DRAW".equals(goal) && acceptedMoves >= DRAW_HOLD_MOVES) {
            return Verdict.completed("Bạn đã trụ " + DRAW_HOLD_MOVES + " nước không sai — thế hòa được giữ vững.");
        }
        return Verdict.CONTINUE;
    }

    private static String drawReason(Board board) {
        if (board.isStaleMate()) return "Hết nước đi (stalemate)";
        if (board.isInsufficientMaterial()) return "Không đủ quân để chiếu hết";
        if (board.isRepetition()) return "Lặp lại thế cờ ba lần";
        return "Ván cờ hòa";
    }
}
