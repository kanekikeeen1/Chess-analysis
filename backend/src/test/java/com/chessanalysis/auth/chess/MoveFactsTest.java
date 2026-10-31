package com.chessanalysis.auth.chess;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.github.bhlangonijr.chesslib.Board;

/** Các thế cờ dùng chung với {@code frontend/tests/move-classification.test.mjs} để hai bản port khớp nhau. */
class MoveFactsTest {
    @Test
    void confirmsRealExchangeSacrifice() {
        MoveFacts facts = facts("rn4k1/8/8/8/8/8/8/1R4K1 w - - 0 1", "b1b8");
        assertEquals("MOVED", facts.sacrificeKind());
        assertEquals(2.0, facts.sacrificeValue(), 1e-9);
        assertTrue(facts.capture());
        assertTrue(facts.sacrificeCandidate());
    }

    @Test
    void defendedPieceThatIsMerelyAttackedIsNotSacrifice() {
        MoveFacts facts = facts("r5k1/8/8/8/8/8/1R6/1R4K1 w - - 0 1", "b2b8");
        assertEquals("NONE", facts.sacrificeKind());
        assertEquals(0, facts.sacrificeValue());
        assertTrue(facts.check());
    }

    @Test
    void detectsCheckmateAndPromotion() {
        MoveFacts mate = facts("7k/8/6K1/8/8/8/8/5Q2 w - - 0 1", "f1f8");
        assertTrue(mate.check());
        assertTrue(mate.checkmate());

        MoveFacts promotion = facts("8/1P6/8/8/8/8/8/K6k w - - 0 1", "b7b8q");
        assertTrue(promotion.promotion());
        assertFalse(promotion.capture());
        assertEquals(7, promotion.legalMoveCount());
    }

    private MoveFacts facts(String fen, String uci) {
        Board board = ChessRules.load(fen);
        MoveFacts facts = MoveFacts.of(board, ChessRules.findLegal(board, uci).orElseThrow());
        assertEquals(fen.split(" ")[0], board.getFen().split(" ")[0], "MoveFacts không được thay đổi bàn cờ gốc");
        return facts;
    }
}
