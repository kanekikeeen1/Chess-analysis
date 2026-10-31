package com.chessanalysis.auth.chess;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.chessanalysis.auth.analysis.dto.AnalysisMoveRequest;
import com.chessanalysis.auth.analysis.dto.CreateAnalysisJobRequest;
import com.chessanalysis.auth.service.ApiException;

class GameReplayServiceTest {
    /** 1. e4 d5 2. exd5 c5 3. dxc6 (bắt tốt qua đường) — FEN đúng như chess.js sinh ra. */
    private static final List<String> POSITIONS = List.of(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
            "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
            "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2",
            "rnbqkbnr/pp2pppp/8/2pP4/8/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 3",
            "rnbqkbnr/pp2pppp/2P5/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3");
    private static final List<String> UCI = List.of("e2e4", "d7d5", "e4d5", "c7c5", "d5c6");
    private static final List<String> SAN = List.of("e4", "d5", "exd5", "c5", "dxc6");

    private final GameReplayService replay = new GameReplayService();

    @Test
    void recomputesMoveFactsInsteadOfTrustingClient() {
        // Client nói dối mọi cờ: nước nào cũng "chiếu hết", "thí quân 20 điểm"...
        CreateAnalysisJobRequest verified = replay.verify(request(UCI, POSITIONS, true));

        List<AnalysisMoveRequest> moves = verified.moves();
        assertEquals(5, moves.size());
        assertFalse(moves.get(0).capture());
        assertTrue(moves.get(2).capture(), "exd5 là nước bắt quân");
        assertTrue(moves.get(4).capture(), "dxc6 bắt tốt qua đường cũng là bắt quân");
        for (AnalysisMoveRequest move : moves) {
            assertFalse(move.checkmate());
            assertFalse(move.check());
            assertEquals("NONE", move.sacrificeKind());
            assertEquals(0, move.sacrificeValue());
        }
        assertEquals(20, moves.get(0).legalMoveCount());
        // Theory vẫn là gợi ý từ client; engine sẽ xác nhận ở bước gán nhãn.
        assertTrue(moves.get(0).theory());
        // Giữ nguyên chuỗi FEN của client để frontend tra cứu kết quả theo đúng khóa.
        assertEquals(POSITIONS.get(1), moves.get(0).afterFen());
    }

    @Test
    void rejectsIllegalMove() {
        List<String> uci = new ArrayList<>(UCI);
        uci.set(2, "e4e6");
        ApiException error = assertThrows(ApiException.class, () -> replay.verify(request(uci, POSITIONS, false)));
        assertTrue(error.getMessage().contains("Nước 3"));
    }

    @Test
    void rejectsPositionThatDoesNotFollowFromMoves() {
        List<String> positions = new ArrayList<>(POSITIONS);
        // Vị trí sau 2...d5 bị thay bằng một vị trí khác hẳn (Đen "mất" hậu).
        positions.set(2, "rnb1kbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
        assertThrows(ApiException.class, () -> replay.verify(request(UCI, positions, false)));
    }

    @Test
    void treatsEnPassantNotationDifferencesAsSamePosition() {
        // chesslib luôn ghi ô bắt tốt qua đường, chess.js chỉ ghi khi bắt được.
        assertTrue(ChessRules.samePosition(
                "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
                "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"));
        // Nhưng khi bắt tốt qua đường thực sự khả thi thì khác ô là khác vị trí.
        assertFalse(ChessRules.samePosition(
                "rnbqkbnr/pp2pppp/8/2pP4/8/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 3",
                "rnbqkbnr/pp2pppp/8/2pP4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3"));
    }

    private CreateAnalysisJobRequest request(List<String> uci, List<String> positions, boolean lie) {
        List<AnalysisMoveRequest> moves = new ArrayList<>();
        for (int index = 0; index < uci.size(); index++) {
            moves.add(new AnalysisMoveRequest(SAN.get(index), uci.get(index),
                    positions.get(index), positions.get(index + 1),
                    index < 2, index < 2 ? "Scandinavian" : null,
                    lie, lie, lie, lie, lie, lie, lie ? 20.0 : 0.0, lie ? "MOVED" : "NONE", lie ? 1 : 20));
        }
        return new CreateAnalysisJobRequest("PGN", "1. e4 d5", positions, moves, null, null, 16, 20);
    }
}
