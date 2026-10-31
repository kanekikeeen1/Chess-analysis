package com.chessanalysis.auth.analysis.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;

class StockfishEngineParseTest {
    private static final String WHITE_TO_MOVE = "7k/8/8/8/8/4K3/8/6R1 w - - 0 1";
    private static final String BLACK_TO_MOVE = "7k/8/8/8/8/4K3/8/6R1 b - - 0 1";

    @Test
    void convertsCentipawnsToWhitePerspective() {
        EngineVariationResponse white = parse("info depth 18 multipv 1 score cp 35 pv e2e4 e7e5", WHITE_TO_MOVE);
        EngineVariationResponse black = parse("info depth 18 multipv 1 score cp 35 pv e7e5", BLACK_TO_MOVE);
        assertEquals(0.35, white.pawns(), 1e-9);
        assertEquals(-0.35, black.pawns(), 1e-9);
        assertNull(white.mate());
        assertEquals(List.of("e2e4", "e7e5"), white.moves());
    }

    @Test
    void mateScoresKeepWinnerSign() {
        assertEquals(100.0, parse("info depth 20 score mate 3 pv g1g7", WHITE_TO_MOVE).pawns());
        assertEquals(-100.0, parse("info depth 20 score mate -2 pv g1g7", WHITE_TO_MOVE).pawns());
        assertEquals(-100.0, parse("info depth 20 score mate 3 pv h8g8", BLACK_TO_MOVE).pawns());
    }

    @Test
    void mateZeroMeansSideToMoveIsCheckmated() {
        // Trước đây cả hai trường hợp đều ra +100, tức Trắng bị chiếu hết vẫn hiện là Trắng thắng.
        assertEquals(-100.0, parse("info depth 0 score mate 0", WHITE_TO_MOVE).pawns());
        assertEquals(100.0, parse("info depth 0 score mate 0", BLACK_TO_MOVE).pawns());
    }

    private EngineVariationResponse parse(String line, String fen) {
        return StockfishEngine.parseInfo(line, fen).variation();
    }
}
