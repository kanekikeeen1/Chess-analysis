package com.chessanalysis.auth.humanmove.style;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.chessanalysis.auth.humanmove.HumanMoveService;
import com.chessanalysis.auth.humanmove.style.dto.StyleMoveResponse;
import com.chessanalysis.auth.service.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;

class StyleMoveServiceTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Path MODEL = Path.of(System.getenv().getOrDefault("M2_MODEL_PATH", "../ml/models/m2.onnx"));
    private static final String START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    // Sau 1.e4 e5 2.Nf3 Nc6 3.Bb5: không có trong sổ.
    private static final String RUY_LOPEZ = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";

    @Test
    void missingDirectoryLeavesStylesUnavailableInsteadOfFailingStartup(@TempDir Path directory) throws Exception {
        StyleModelRegistry registry = new StyleModelRegistry(directory.resolve("none").toString(), MAPPER);
        assertFalse(new StyleMoveService(registry, null).list().available());
        assertThrows(ApiException.class, () -> new StyleMoveService(registry, null).moves("carlsen", START, 5));
    }

    @Test
    void bookIsUsedFirstThenTheStyleModel(@TempDir Path directory) throws Exception {
        assumeTrue(Files.isRegularFile(MODEL), "chưa xuất mô hình M2");
        // Dùng chính mô hình M2 làm "mô hình phong cách": test chỉ kiểm tra phần ghép sổ khai cuộc và mô hình.
        Files.copy(MODEL, directory.resolve("tester.onnx"));
        Files.copy(MODEL.resolveSibling("m2.meta.json"), directory.resolve("tester.meta.json"));
        Files.writeString(directory.resolve("tester.book.json"),
                "{\"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -\":{\"e2e4\":6,\"d2d4\":3,\"g1f3\":1}}");
        Files.writeString(directory.resolve("styles.json"), """
                {"styles":[{"id":"tester","displayName":"Kỳ thủ thử","model":"tester.onnx","book":"tester.book.json",
                "elo":2800,"games":10,"firstYear":2020,"lastYear":2026,"bySpeed":{"blitz":10},"testTop1":0.4}]}
                """);
        StyleModelRegistry registry = new StyleModelRegistry(directory.toString(), MAPPER);
        try {
            StyleMoveService service = new StyleMoveService(registry, null);
            assertTrue(service.list().available());
            assertEquals(1, service.list().styles().get(0).bookPositions());

            StyleMoveResponse book = service.moves("tester", START, 2);
            assertEquals("book", book.source());
            assertEquals(10, book.bookGames());
            assertEquals(2, book.moves().size());
            assertEquals("e4", book.moves().get(0).san());
            assertEquals(0.6, book.moves().get(0).probability(), 1e-9);

            StyleMoveResponse model = service.moves("tester", RUY_LOPEZ, 5);
            assertEquals("model", model.source());
            assertNull(model.bookGames());
            assertEquals(5, model.moves().size());

            // So sánh mọi kỳ thủ: không có HumanMoveService nên không chấm Stockfish, nhưng vẫn đủ nước.
            var compare = service.compare(START, 3, null);
            assertEquals(1, compare.styles().size());
            assertEquals("book", compare.styles().get(0).source());
            assertNull(compare.engineNote());

            // Báo cáo ván: 1.e4 (nước nhiều nhất trong sổ) trùng top-1; 1...e5 do mô hình xếp hạng.
            var match = service.match(List.of(
                    HumanMoveService.played(START, "e2e4"),
                    HumanMoveService.played("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e7e5")));
            assertEquals(1, match.white().get(0).moves());
            assertEquals(1, match.white().get(0).top1());
            assertEquals(1, match.white().get(0).inBook());
            assertEquals(1, match.black().get(0).moves());
            assertEquals(0, match.black().get(0).inBook());

            ApiException missing = assertThrows(ApiException.class, () -> service.moves("nobody", START, 5));
            assertEquals(404, missing.getStatus().value());
        } finally {
            registry.destroy();
        }
    }

    @Test
    void bookRankCountsOnlyMovesPlayedMoreOften() {
        Map<String, Integer> book = Map.of("e2e4", 6, "d2d4", 3, "g1f3", 3, "c2c4", 1);
        assertEquals(0, StyleMoveService.bookRank(book, "e2e4"));
        assertEquals(1, StyleMoveService.bookRank(book, "g1f3"));
        assertEquals(3, StyleMoveService.bookRank(book, "c2c4"));
        assertEquals(4, StyleMoveService.bookRank(book, "b2b3"));
    }
}
