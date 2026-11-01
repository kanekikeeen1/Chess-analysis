package com.chessanalysis.auth.humanmove.style;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.chessanalysis.auth.humanmove.style.dto.StylePuzzleCheckResponse;
import com.chessanalysis.auth.service.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;

class StylePuzzleServiceTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void missingFileLeavesPuzzlesUnavailable(@TempDir Path directory) {
        StylePuzzleService service = new StylePuzzleService(directory.toString(), MAPPER,
                new StyleModelRegistry(directory.toString(), MAPPER), null);
        assertFalse(service.available());
        assertThrows(ApiException.class, () -> service.next(null, Set.of()));
    }

    @Test
    void nextHidesTheAnswerAndCheckGradesMatchGoodAndWeak(@TempDir Path directory) throws Exception {
        // Sau 1.e4 e5 2.Nf3 Nc6, kỳ thủ đã đi Bc4; Stockfish thích Bb5 hơn 10 cp.
        Files.writeString(directory.resolve("puzzles.json"), """
                {"puzzles":[{"id":"p1","style":"carlsen",
                "fen":"r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
                "uci":"f1c4","san":"Bc4","ply":4,"date":"2026.01.20","speed":"blitz","color":"white",
                "elo":3200,"opponentElo":3000,"result":1,"playedCp":30,"matchesEngine":false,
                "engine":[{"uci":"f1b5","san":"Bb5","cp":40},{"uci":"f1c4","san":"Bc4","cp":30},
                {"uci":"h2h3","san":"h3","cp":-30}]}]}
                """);
        StylePuzzleService service = new StylePuzzleService(directory.toString(), MAPPER,
                new StyleModelRegistry(directory.resolve("no-models").toString(), MAPPER), null);

        var puzzle = service.next("carlsen", Set.of());
        assertEquals("p1", puzzle.id());
        assertEquals(1, puzzle.poolSize());
        // Làm hết thì quay vòng lại, không báo lỗi.
        assertEquals("p1", service.next(null, Set.of("p1")).id());
        assertThrows(ApiException.class, () -> service.next("liem", Set.of()));

        StylePuzzleCheckResponse match = service.check("p1", "f1c4");
        assertTrue(match.correct());
        assertEquals("match", match.verdict());
        assertEquals("Bc4", match.userSan());
        // Chưa nạp mô hình phong cách thì không có xác suất.
        assertNull(match.answerProbability());

        StylePuzzleCheckResponse good = service.check("p1", "f1b5");
        assertFalse(good.correct());
        assertEquals("good", good.verdict());
        assertEquals(40, good.userCp());

        assertEquals("weak", service.check("p1", "h2h3").verdict());
        assertThrows(ApiException.class, () -> service.check("p1", "e1e3"));
    }
}
