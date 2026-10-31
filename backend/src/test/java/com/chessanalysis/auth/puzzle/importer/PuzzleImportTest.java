package com.chessanalysis.auth.puzzle.importer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.github.luben.zstd.ZstdOutputStream;

class PuzzleImportTest {
    /** Header của file Lichess từ năm 2026 (thêm cột DailyDate). */
    private static final String HEADER = String.join(",", LichessPuzzle.REQUIRED_COLUMNS) + ",DailyDate";
    private static final LichessPuzzle.Columns COLUMNS = LichessPuzzle.Columns.fromHeader(HEADER);
    /** Dòng ví dụ trong tài liệu của Lichess Puzzle Database, theo định dạng 11 cột. */
    private static final String SAMPLE =
            "00sHx,q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17,e8d7 a2e6 d7d8 f7f8,"
                    + "1760,80,83,500,mate mateIn2 middlegame short,https://lichess.org/yyznGmXsDbcyWA#34,,";
    /** Dòng đầu tiên thật của file lichess_db_puzzle.csv.zst tải về tháng 10/2026. */
    private static final String REAL_ROW =
            "00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3 e6e7 b2b1 b3c1 b1c1 h6c1,"
                    + "1811,76,95,10282,crushing hangingPiece long middlegame,https://lichess.org/787zsVup/black#48,,";
    private static final PuzzleImportOptions OPTIONS =
            new PuzzleImportOptions(2, 200, 600, 2999, 300, 90, 80, 16, 42);

    @Test
    void preparesStartPositionAfterOpponentsSetupMove() {
        PreparedPuzzle puzzle = prepare(SAMPLE);
        assertEquals("e8d7", puzzle.setupMove());
        assertEquals("w", puzzle.startFen().split(" ")[1], "người giải là Trắng");
        assertEquals("a2e6 d7d8 f7f8", puzzle.solution());
        assertEquals(2, puzzle.solutionLength());
        assertEquals(List.of("mate", "mateIn2", "middlegame", "short"), puzzle.themes());

        PreparedPuzzle real = prepare(REAL_ROW);
        assertEquals("w", real.startFen().split(" ")[1], "Đen đi nước dàn dựng f2g3, người giải cầm Trắng");
        assertEquals(3, real.solutionLength());
        assertEquals("e6e7 b2b1 b3c1 b1c1 h6c1", real.solution());
    }

    @Test
    void readsColumnsByNameSoOldAndNewFormatsBothWork() {
        LichessPuzzle.Columns oldFormat = LichessPuzzle.Columns.fromHeader(String.join(",", LichessPuzzle.REQUIRED_COLUMNS));
        String oldRow = SAMPLE.substring(0, SAMPLE.length() - 1);
        assertEquals("00sHx", LichessPuzzle.parse(oldRow, oldFormat).orElseThrow().id());
        assertEquals("00sHx", LichessPuzzle.parse(SAMPLE, COLUMNS).orElseThrow().id());
        assertThrows(IllegalArgumentException.class, () -> LichessPuzzle.Columns.fromHeader("PuzzleId,FEN,Moves"));
    }

    @Test
    void rejectsIllegalSolutionAndMalformedRows() {
        String illegal = SAMPLE.replace("a2e6", "a2a8");
        assertTrue(PreparedPuzzle.prepare(LichessPuzzle.parse(illegal, COLUMNS).orElseThrow()).isEmpty());
        assertTrue(LichessPuzzle.parse("00sHx,not,enough,columns", COLUMNS).isEmpty());
        assertTrue(LichessPuzzle.parse(SAMPLE.replace(",1760,", ",abc,"), COLUMNS).isEmpty());
    }

    @Test
    void qualityFiltersExplainWhyAPuzzleIsRejected() {
        PuzzleSelection selection = new PuzzleSelection(OPTIONS);
        assertNull(selection.rejection(row("p1", 1500, 80, 90, 500)));
        assertEquals("ít lượt chơi", selection.rejection(row("p2", 1500, 80, 90, 10)));
        assertEquals("rating chưa ổn định", selection.rejection(row("p3", 1500, 200, 90, 500)));
        assertEquals("bị đánh giá thấp", selection.rejection(row("p4", 1500, 80, 20, 500)));
        assertEquals("ngoài dải rating", selection.rejection(row("p5", 3100, 80, 90, 500)));
    }

    @Test
    void readsZstdFileAndCapsEachRatingBand(@TempDir Path directory) throws IOException {
        StringBuilder csv = new StringBuilder(HEADER).append('\n');
        for (int index = 0; index < 5; index++) {
            csv.append(SAMPLE.replace("00sHx", "a" + index)).append('\n');           // dải 1600-1799
        }
        csv.append(SAMPLE.replace("00sHx", "b0").replace(",1760,", ",2210,")).append('\n'); // dải 2200-2399
        csv.append(SAMPLE.replace("00sHx", "c0").replace(",500,", ",5,")).append('\n');      // ít lượt chơi
        csv.append(SAMPLE.replace("00sHx", "d0").replace("a2e6", "a2a8")).append('\n');      // sai luật
        Path file = directory.resolve("puzzles.csv.zst");
        try (OutputStream out = new ZstdOutputStream(Files.newOutputStream(file))) {
            out.write(csv.toString().getBytes(StandardCharsets.UTF_8));
        }

        PuzzleImportService.ReadResult result = PuzzleImportService.read(file, OPTIONS);

        assertEquals(8, result.rows());
        assertEquals(3, result.selection().selected().size(), "tối đa 2 puzzle mỗi dải + 1 ở dải 2200");
        assertEquals(2, result.selection().keptPerBand().get("1600-1799"));
        assertEquals(5, result.selection().eligiblePerBand().get("1600-1799"));
        assertEquals(1, result.selection().rejected().get("ít lượt chơi"));
        assertEquals(1, result.selection().rejected().get("sai luật cờ"));
    }

    private PreparedPuzzle prepare(String row) {
        return PreparedPuzzle.prepare(LichessPuzzle.parse(row, COLUMNS).orElseThrow()).orElseThrow();
    }

    private LichessPuzzle row(String id, int rating, int deviation, int popularity, int plays) {
        return LichessPuzzle.parse(SAMPLE.replace("00sHx", id)
                .replace(",1760,80,83,500,", "," + rating + "," + deviation + "," + popularity + "," + plays + ","),
                COLUMNS).orElseThrow();
    }
}
