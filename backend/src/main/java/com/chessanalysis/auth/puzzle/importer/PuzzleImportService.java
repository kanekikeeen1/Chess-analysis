package com.chessanalysis.auth.puzzle.importer;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.github.luben.zstd.ZstdInputStream;

/**
 * Nhập Lichess Puzzle Database vào bảng {@code puzzles} / {@code puzzle_themes}.
 *
 * <p>Đọc một lượt file {@code .csv.zst} (hoặc {@code .csv}), loại puzzle không đạt
 * chất lượng, kiểm tra từng puzzle còn lại bằng luật cờ phía server, lấy mẫu cân bằng
 * theo rating rồi ghi theo lô. Chạy lại nhiều lần vẫn an toàn: puzzle đã có được cập
 * nhật rating/lượt chơi thay vì nhân đôi.
 */
@Service
public class PuzzleImportService {
    private static final Logger LOGGER = LoggerFactory.getLogger(PuzzleImportService.class);
    private static final int BATCH_SIZE = 1000;
    private static final int PROGRESS_EVERY = 500_000;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final ObjectMapper objectMapper;

    public PuzzleImportService(JdbcTemplate jdbc, TransactionTemplate transactions, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.transactions = transactions;
        this.objectMapper = objectMapper;
    }

    public ImportReport importFile(Path source, PuzzleImportOptions options) throws IOException {
        if (!Files.isRegularFile(source)) {
            throw new IllegalArgumentException("Không tìm thấy file puzzle: " + source.toAbsolutePath());
        }
        long started = System.nanoTime();
        ReadResult read = read(source, options);
        PuzzleSelection selection = read.selection();
        long rows = read.rows();

        List<PreparedPuzzle> selected = selection.selected();
        LOGGER.info("Đọc xong {} dòng, chọn {} puzzle; bắt đầu ghi vào database…", rows, selected.size());
        for (int from = 0; from < selected.size(); from += BATCH_SIZE) {
            List<PreparedPuzzle> batch = selected.subList(from, Math.min(selected.size(), from + BATCH_SIZE));
            transactions.executeWithoutResult(status -> write(batch));
        }

        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM puzzles", Long.class);
        ImportReport report = new ImportReport(
                source.toAbsolutePath().toString(), Instant.now().toString(), rows, selected.size(),
                total == null ? 0 : total, (System.nanoTime() - started) / 1_000_000_000.0,
                options, selection.rejected(), selection.eligiblePerBand(), selection.keptPerBand(),
                topThemes(selected, 25));
        Path reportFile = source.resolveSibling(source.getFileName() + ".import-report.json");
        objectMapper.copy().enable(SerializationFeature.INDENT_OUTPUT).writeValue(reportFile.toFile(), report);
        LOGGER.info("Báo cáo import (đưa vào chương dữ liệu của đồ án): {}", reportFile.toAbsolutePath());
        return report;
    }

    /** Đọc, lọc, kiểm tra và lấy mẫu; không chạm tới database. */
    static ReadResult read(Path source, PuzzleImportOptions options) throws IOException {
        PuzzleSelection selection = new PuzzleSelection(options);
        long rows = 0;

        try (BufferedReader reader = open(source)) {
            String header = reader.readLine();
            if (header == null) throw new IllegalArgumentException("File puzzle rỗng: " + source);
            LichessPuzzle.Columns columns = LichessPuzzle.Columns.fromHeader(header);
            for (String line = reader.readLine(); line != null; line = reader.readLine()) {
                rows++;
                if (rows % PROGRESS_EVERY == 0) LOGGER.info("Đã đọc {} dòng…", rows);

                LichessPuzzle puzzle = LichessPuzzle.parse(line, columns).orElse(null);
                if (puzzle == null) {
                    selection.reject("dòng hỏng");
                    continue;
                }
                String reason = selection.rejection(puzzle);
                if (reason != null) {
                    selection.reject(reason);
                    continue;
                }
                // Kiểm tra luật cờ trước khi lấy mẫu để puzzle hỏng không chiếm chỗ trong mẫu.
                PreparedPuzzle prepared = PreparedPuzzle.prepare(puzzle).orElse(null);
                if (prepared == null) {
                    selection.reject("sai luật cờ");
                    continue;
                }
                selection.offer(prepared);
            }
        }
        return new ReadResult(rows, selection);
    }

    record ReadResult(long rows, PuzzleSelection selection) {}

    private static BufferedReader open(Path source) throws IOException {
        InputStream input = new BufferedInputStream(Files.newInputStream(source), 1 << 16);
        if (source.getFileName().toString().endsWith(".zst")) input = new ZstdInputStream(input);
        return new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8), 1 << 16);
    }

    private void write(List<PreparedPuzzle> batch) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.batchUpdate("""
                INSERT INTO puzzles (lichess_id, source_fen, setup_move, start_fen, solution, solution_length,
                    rating, rating_deviation, popularity, nb_plays, themes, opening_tags, game_url, imported_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    rating = VALUES(rating), rating_deviation = VALUES(rating_deviation),
                    popularity = VALUES(popularity), nb_plays = VALUES(nb_plays),
                    themes = VALUES(themes), imported_at = VALUES(imported_at)
                """, batch, batch.size(), (statement, puzzle) -> {
            LichessPuzzle source = puzzle.source();
            statement.setString(1, source.id());
            statement.setString(2, source.fen());
            statement.setString(3, puzzle.setupMove());
            statement.setString(4, puzzle.startFen());
            statement.setString(5, puzzle.solution());
            statement.setInt(6, puzzle.solutionLength());
            statement.setInt(7, source.rating());
            statement.setInt(8, source.ratingDeviation());
            statement.setInt(9, source.popularity());
            statement.setInt(10, source.plays());
            statement.setString(11, truncate(String.join(" ", source.themes()), 300));
            statement.setString(12, truncate(source.openingTags(), 255));
            statement.setString(13, truncate(source.gameUrl(), 120));
            statement.setTimestamp(14, now);
        });

        Map<String, Long> ids = new HashMap<>();
        String placeholders = String.join(",", Collections.nCopies(batch.size(), "?"));
        jdbc.query("SELECT id, lichess_id FROM puzzles WHERE lichess_id IN (" + placeholders + ")",
                row -> { ids.put(row.getString("lichess_id"), row.getLong("id")); },
                batch.stream().map(puzzle -> puzzle.source().id()).toArray());

        if (ids.size() != batch.size()) {
            // Mỗi mã puzzle phải ứng với đúng một dòng. Lệch nghĩa là cột lichess_id đang so
            // sánh không phân biệt hoa thường (lỗi đã sửa ở V15) — dừng hẳn thay vì gộp theme.
            throw new IllegalStateException("Lô " + batch.size() + " puzzle nhưng chỉ tìm thấy " + ids.size()
                    + " dòng; kiểm tra collation của puzzles.lichess_id.");
        }

        // Ghi lại theme từ đầu để lần import sau phản ánh đúng theme mới nhất của Lichess.
        jdbc.update("DELETE FROM puzzle_themes WHERE puzzle_id IN (" + placeholders + ")", ids.values().toArray());
        List<Object[]> themes = new ArrayList<>();
        for (PreparedPuzzle puzzle : batch) {
            Long id = ids.get(puzzle.source().id());
            puzzle.themes().stream().distinct().forEach(theme -> themes.add(new Object[] {id, theme}));
        }
        jdbc.batchUpdate("INSERT INTO puzzle_themes (puzzle_id, theme) VALUES (?, ?)", themes);
    }

    private static Map<String, Long> topThemes(List<PreparedPuzzle> puzzles, int limit) {
        Map<String, Long> counts = new HashMap<>();
        for (PreparedPuzzle puzzle : puzzles) {
            for (String theme : puzzle.themes()) counts.merge(theme, 1L, Long::sum);
        }
        Map<String, Long> top = new LinkedHashMap<>();
        counts.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(limit)
                .forEach(entry -> top.put(entry.getKey(), entry.getValue()));
        return top;
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }

    public record ImportReport(
            String source,
            String finishedAt,
            long rowsRead,
            int selected,
            long puzzlesInDatabase,
            double seconds,
            PuzzleImportOptions filters,
            Map<String, Integer> rejected,
            Map<String, Integer> eligiblePerBand,
            Map<String, Integer> keptPerBand,
            Map<String, Long> topThemes) {}
}
