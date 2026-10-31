package com.chessanalysis.auth.humanmove;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.chessanalysis.auth.service.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.bhlangonijr.chesslib.Board;

/**
 * Chạy mô hình thật bằng ONNX Runtime Java và so với kết quả ONNX Runtime Python ghi trong
 * {@code m2.reference.json} lúc xuất. Bỏ qua khi máy chưa có mô hình (nó không nằm trong git).
 */
class HumanMoveModelReferenceTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Path MODEL = Path.of(System.getenv().getOrDefault("M2_MODEL_PATH", "../ml/models/m2.onnx"));

    @Test
    void javaInferenceMatchesPythonReference() throws Exception {
        Path reference = MODEL.resolveSibling(MODEL.getFileName().toString().replace(".onnx", ".reference.json"));
        assumeTrue(Files.isRegularFile(MODEL) && Files.isRegularFile(reference), "chưa xuất mô hình M2");

        HumanMoveModel model = new HumanMoveModel(MODEL.toString(), MAPPER);
        try {
            for (JsonNode testCase : MAPPER.readTree(reference.toFile()).get("cases")) {
                Board board = new Board();
                board.loadFromFen(testCase.get("fen").asText());
                int elo = testCase.get("elo").asInt();
                List<HumanMoveModel.HumanMove> actual = model.predict(board, List.of(elo), 5).get(0);

                JsonNode expected = testCase.get("top");
                String label = testCase.get("fen").asText() + " @ " + elo;
                assertEquals(expected.size(), actual.size(), label);
                for (int i = 0; i < expected.size(); i++) {
                    double probability = expected.get(i).get("probability").asDouble();
                    assertEquals(probability, actual.get(i).probability(), 1e-4, label);
                    // Hai nước gần bằng xác suất có thể đổi chỗ vì sai số float; chỉ so tên nước khi chênh rõ.
                    boolean clearlyAhead = i + 1 >= expected.size()
                            || probability - expected.get(i + 1).get("probability").asDouble() > 1e-4;
                    if (clearlyAhead) {
                        assertEquals(expected.get(i).get("uci").asText(), actual.get(i).uci(), label);
                    }
                }
            }
        } finally {
            model.destroy();
        }
    }

    @Test
    void logLikelihoodAgreesWithPredictedProbabilities() throws Exception {
        assumeTrue(Files.isRegularFile(MODEL), "chưa xuất mô hình M2");
        HumanMoveModel model = new HumanMoveModel(MODEL.toString(), MAPPER);
        try {
            Board board = new Board();
            board.loadFromFen("r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3");
            double[] grid = {900, 1700, 2500};
            List<Integer> elos = List.of(900, 1700, 2500);
            List<List<HumanMoveModel.HumanMove>> predicted = model.predict(board, elos, 1);
            // Lấy chính nước top-1 ở mức 1700 làm "nước đã đi", rồi đối chiếu ở cả ba mức.
            String uci = predicted.get(1).get(0).uci();
            HumanMoveModel.PlayedMove played = new HumanMoveModel.PlayedMove(board,
                    board.legalMoves().stream().filter(m -> m.toString().equals(uci)).findFirst().orElseThrow());
            // Hai thế cờ giống nhau trong cùng lô: tổng phải đúng bằng hai lần log-xác suất.
            double[] total = model.logLikelihood(List.of(played, played), grid);

            List<List<HumanMoveModel.HumanMove>> all = model.predict(board, elos, 300);
            for (int g = 0; g < grid.length; g++) {
                double probability = all.get(g).stream().filter(m -> m.uci().equals(uci)).findFirst()
                        .orElseThrow().probability();
                assertEquals(2 * Math.log(probability), total[g], 1e-4, "Elo " + grid[g]);
            }
        } finally {
            model.destroy();
        }
    }

    @Test
    void sharedModeGivesEveryLevelTheSameMovesWithUnchangedProbabilities() throws Exception {
        assumeTrue(Files.isRegularFile(MODEL), "chưa xuất mô hình M2");
        HumanMoveModel model = new HumanMoveModel(MODEL.toString(), MAPPER);
        try {
            Board board = new Board();
            board.loadFromFen("r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3");
            List<Integer> elos = List.of(900, 2500);
            List<List<HumanMoveModel.HumanMove>> own = model.predict(board, elos, 3);
            List<List<HumanMoveModel.HumanMove>> shared = model.predict(board, elos, 3, true);

            List<String> first = shared.get(0).stream().map(HumanMoveModel.HumanMove::uci).toList();
            assertEquals(first, shared.get(1).stream().map(HumanMoveModel.HumanMove::uci).toList());
            for (int level = 0; level < elos.size(); level++) {
                for (HumanMoveModel.HumanMove move : own.get(level)) {
                    assertTrue(first.contains(move.uci()), "thiếu top-3 " + move.uci());
                    double sharedProbability = shared.get(level).stream()
                            .filter(m -> m.uci().equals(move.uci())).findFirst().orElseThrow().probability();
                    assertEquals(move.probability(), sharedProbability, 1e-12);
                }
            }
        } finally {
            model.destroy();
        }
    }

    @Test
    void missingModelLeavesServiceUnavailableInsteadOfFailingStartup() {
        HumanMoveModel model = new HumanMoveModel("does-not-exist/m2.onnx", MAPPER);
        assertFalse(model.available());
        ApiException error = assertThrows(ApiException.class, () -> model.predict(new Board(), List.of(1500), 3));
        assertEquals(503, error.getStatus().value());
    }
}
