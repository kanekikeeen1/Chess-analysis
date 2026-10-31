package com.chessanalysis.auth.humanmove;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * So bản port Java với chính bản Python, trên dữ liệu do {@code ml/scripts/export_m2_fixtures.py} sinh ra:
 * thế cờ chọn tay (Đen đi, bắt tốt qua đường, phong cấp, quyền nhập thành lẻ, đồng hồ 50 nước) và thế
 * cờ thật lấy từ tập test.
 */
class M2EncodingTest {
    private static final JsonNode FIXTURES = load();
    private static final M2Encoding ENCODING = new M2Encoding(
            moveUcis(), ints(FIXTURES.get("eloBucketEdges")), 1500.0, 400.0);

    @Test
    void planesMatchPythonForEveryFixturePosition() {
        for (JsonNode position : FIXTURES.get("positions")) {
            float[] expected = new float[M2Encoding.NUM_PLANES * M2Encoding.CELLS];
            for (JsonNode cell : position.get("planes")) {
                expected[cell.get(0).asInt()] = (float) cell.get(1).asDouble();
            }
            float[] actual = ENCODING.encode(board(position));
            for (int i = 0; i < expected.length; i++) {
                int cell = i;
                assertEquals(expected[i], actual[i], 1e-6f,
                        () -> position.get("fen").asText() + " lệch ở mặt phẳng " + cell / 64 + ", ô " + cell % 64);
            }
        }
    }

    @Test
    void legalMoveIndicesMatchPython() {
        for (JsonNode position : FIXTURES.get("positions")) {
            Board board = board(position);
            Map<String, Integer> actual = new TreeMap<>();
            TreeSet<Integer> mask = new TreeSet<>();
            for (Move move : board.legalMoves()) {
                int index = ENCODING.moveIndex(move, board.getSideToMove());
                actual.put(move.toString(), index);
                mask.add(index);
            }
            Map<String, Integer> expected = new TreeMap<>();
            position.get("moves").fields()
                    .forEachRemaining(entry -> expected.put(entry.getKey(), entry.getValue().asInt()));
            assertEquals(expected, actual, position.get("fen").asText());

            TreeSet<Integer> expectedMask = new TreeSet<>();
            position.get("legal").forEach(index -> expectedMask.add(index.asInt()));
            assertEquals(expectedMask, mask, position.get("fen").asText());
        }
    }

    @Test
    void eloBucketsAndNormalizationMatchPython() {
        for (JsonNode elo : FIXTURES.get("elos")) {
            double value = elo.get("elo").asDouble();
            assertEquals(elo.get("bucket").asInt(), ENCODING.eloBucket(value), "Elo " + value);
            assertEquals(elo.get("norm").asDouble(), ENCODING.normalizeElo(value), 1e-6, "Elo " + value);
        }
    }

    @Test
    void bucketLabelsFollowPythonFormat() {
        assertEquals("<1000", ENCODING.bucketLabel(0));
        assertEquals("1200-1399", ENCODING.bucketLabel(2));
        assertEquals("2600+", ENCODING.bucketLabel(ENCODING.numEloBuckets() - 1));
        assertEquals(1300, ENCODING.bucketCenter(2));
    }

    @Test
    void fixturesCoverBlackToMoveAndRealGames() {
        List<String> fens = new ArrayList<>();
        FIXTURES.get("positions").forEach(position -> fens.add(position.get("fen").asText()));
        assertTrue(fens.stream().anyMatch(fen -> fen.split(" ")[1].equals("b")));
        assertTrue(fens.size() > 50, "thiếu thế cờ thật từ tập test");
    }

    private static Board board(JsonNode position) {
        Board board = new Board();
        board.loadFromFen(position.get("fen").asText());
        return board;
    }

    private static List<String> moveUcis() {
        List<String> ucis = new ArrayList<>();
        FIXTURES.get("moveUcis").forEach(uci -> ucis.add(uci.asText()));
        return ucis;
    }

    private static int[] ints(JsonNode array) {
        int[] values = new int[array.size()];
        for (int i = 0; i < values.length; i++) values[i] = array.get(i).asInt();
        return values;
    }

    private static JsonNode load() {
        try (InputStream stream = M2EncodingTest.class.getResourceAsStream("/m2/encoding-fixtures.json")) {
            return new ObjectMapper().readTree(stream);
        } catch (IOException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
