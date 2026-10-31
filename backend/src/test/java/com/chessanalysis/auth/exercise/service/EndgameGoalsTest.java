package com.chessanalysis.auth.exercise.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import com.chessanalysis.auth.chess.ChessRules;
import com.chessanalysis.auth.exercise.service.EndgameGoals.Outcome;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.Side;
import com.github.bhlangonijr.chesslib.move.Move;

class EndgameGoalsTest {
    @Test
    void tradingQueenForRookDoesNotWinTheRook() {
        // Lỗi cũ: Qxg8+ được tính "thắng xe" ngay, dù Kxg8 sau đó chỉ còn vua đấu vua.
        Board board = ChessRules.load("6rk/8/8/8/8/4K3/8/6Q1 w - - 0 1");
        assertEquals(Outcome.CONTINUE, playerMove(board, "WIN_ROOK", "g1g8"));
        assertEquals(Outcome.FAILED, opponentMove(board, "WIN_ROOK", "h8g8", 1));
    }

    @Test
    void winningRookWhileKeepingQueenCompletes() {
        Board board = ChessRules.load("7k/8/8/8/8/4K3/2r5/2Q5 w - - 0 1");
        assertEquals(Outcome.CONTINUE, playerMove(board, "WIN_ROOK", "c1c2"));
        assertEquals(Outcome.COMPLETED, opponentMove(board, "WIN_ROOK", "h8g8", 1));
    }

    @Test
    void checkmateAndPromotionCompleteImmediately() {
        assertEquals(Outcome.COMPLETED, playerMove(ChessRules.load("7k/8/6K1/8/8/8/8/5Q2 w - - 0 1"), "CHECKMATE", "f1f8"));
        assertEquals(Outcome.COMPLETED, playerMove(ChessRules.load("8/1P6/8/8/8/8/8/K6k w - - 0 1"), "PROMOTE", "b7b8q"));
    }

    @Test
    void stalemateFailsAMatingTaskButCompletesADrawTask() {
        // Qf7?? là hết nước đi cho Đen.
        assertEquals(Outcome.FAILED, playerMove(ChessRules.load("7k/8/6K1/8/8/8/8/5Q2 w - - 0 1"), "CHECKMATE", "f1f7"));
        assertEquals(Outcome.COMPLETED, playerMove(ChessRules.load("7k/8/6K1/8/8/8/8/5Q2 w - - 0 1"), "DRAW", "f1f7"));
    }

    @Test
    void drawTaskCompletesAfterHoldingEnoughMoves() {
        Board board = ChessRules.load("4k3/8/r7/4P3/4K3/8/8/7R b - - 0 1");
        board.doMove(ChessRules.findLegal(board, "a6b6").orElseThrow());
        board.doMove(ChessRules.findLegal(board, "h1h7").orElseThrow());
        assertEquals(Outcome.CONTINUE, EndgameGoals.afterOpponentMove("DRAW", board, Side.BLACK,
                EndgameGoals.DRAW_HOLD_MOVES - 1).outcome());
        assertEquals(Outcome.COMPLETED, EndgameGoals.afterOpponentMove("DRAW", board, Side.BLACK,
                EndgameGoals.DRAW_HOLD_MOVES).outcome());
    }

    @Test
    void scoreDependsOnlyOnMistakes() {
        assertEquals(100, ExerciseSessionService.score(0));
        assertEquals(70, ExerciseSessionService.score(2));
        assertEquals(40, ExerciseSessionService.score(10));
    }

    private Outcome playerMove(Board board, String goal, String uci) {
        Move move = ChessRules.findLegal(board, uci).orElseThrow();
        board.doMove(move);
        return EndgameGoals.afterPlayerMove(goal, board, move).outcome();
    }

    private Outcome opponentMove(Board board, String goal, String uci, int acceptedMoves) {
        Side player = board.getSideToMove().flip();
        board.doMove(ChessRules.findLegal(board, uci).orElseThrow());
        return EndgameGoals.afterOpponentMove(goal, board, player, acceptedMoves).outcome();
    }
}
