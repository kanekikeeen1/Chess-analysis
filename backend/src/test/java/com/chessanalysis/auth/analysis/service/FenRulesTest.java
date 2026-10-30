package com.chessanalysis.auth.analysis.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class FenRulesTest {
    @ParameterizedTest
    @ValueSource(strings = {
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3",
            "7k/8/8/8/8/4K3/8/6R1 w - - 0 1",
            "8/8/8/8/8/8/8/K6k b - -",
            // Vị trí ngay sau nước chiếu hết: bên đến lượt bị chiếu là hợp lệ.
            "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
    })
    void acceptsLegalPositions(String fen) {
        assertNull(FenRules.violation(fen), fen);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "8/8/8/8/8/8/8/K6k w - - 0 1\nsetoption name Debug Log File value /app/app.jar",
            "8/8/8/8/8/8/8/K6k w - - 0 1\rgo infinite",
            "8/8/8/8/8/8/8/K6k w - - 0 1 extra",
            "8/8/8/8/8/8/8/K6k  w - - 0 1",
            "8/8/8/8/8/8/8/K6k x - - 0 1",
            "8/8/8/8/8/8/8/8 w - - 0 1",
            "8/8/8/8/8/8/8/KK5k w - - 0 1",
            "8/8/8/8/8/8/8/K6kp w - - 0 1",
            "8/8/8/8/8/8/8/K5k w - - 0 1",
            "8/8/8/8/8/8/8/K15k w - - 0 1",
            "8/8/8/8/8/8/8 w - - 0 1",
            "P7/8/8/8/8/8/8/K6k w - - 0 1",
            "8/8/8/8/8/8/8/K6k w KX - 0 1",
            "8/8/8/8/8/8/8/K6k w - e4 0 1",
            "8/8/8/8/8/8/8/K6k w - e3 0 1",
            "8/8/8/8/8/8/8/K6k w - - -1 1",
            "8/8/8/8/8/8/8/K6k w - - 0 0",
            "8/8/8/8/8/8/8/K6x w - - 0 1",
            // Bên không đến lượt đi đang bị chiếu (lấy từ dữ liệu bài tàn cuộc V7).
            "8/5kr1/8/8/8/3K4/8/5Q2 w - - 0 1",
            "2K5/2P2k2/8/8/8/8/1r6/5R2 w - - 0 1",
            // Chiếu bằng vua, tốt, mã và tượng.
            "8/8/8/8/8/8/1k6/K7 b - - 0 1",
            "8/8/8/8/8/8/2p5/1K5k b - - 0 1",
            "8/8/8/8/8/1n6/8/K6k b - - 0 1",
            "7k/8/8/8/8/8/8/B6K w - - 0 1",
    })
    void rejectsMalformedOrIllegalPositions(String fen) {
        assertFalse(FenRules.isValid(fen), fen);
    }

    @Test
    void rejectsNullEmptyAndOverlongInput() {
        assertFalse(FenRules.isValid(null));
        assertFalse(FenRules.isValid(""));
        assertFalse(FenRules.isValid("8/8/8/8/8/8/8/K6k w - - 0 1" + " ".repeat(100)));
    }

    @Test
    void blockedPieceDoesNotGiveCheck() {
        // Xe a1 bị tốt a2 chặn nên không chiếu vua a8.
        assertTrue(FenRules.isValid("k7/8/8/8/8/8/P7/R6K w - - 0 1"));
    }

    @Test
    void requireValidThrowsWithReason() {
        assertThrows(IllegalArgumentException.class,
                () -> FenRules.requireValid("8/8/8/8/8/8/8/8 w - - 0 1"));
    }
}
