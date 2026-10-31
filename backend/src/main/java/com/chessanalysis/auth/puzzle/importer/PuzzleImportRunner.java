package com.chessanalysis.auth.puzzle.importer;

import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

/**
 * Chạy một lần để nhập puzzle rồi tắt ứng dụng. Chỉ được kích hoạt khi có tham số
 * {@code --app.puzzles.import-file=<đường dẫn>}; khởi động bình thường không bị ảnh hưởng.
 */
@Component
@ConditionalOnProperty(name = "app.puzzles.import-file")
class PuzzleImportRunner implements ApplicationRunner {
    private static final Logger LOGGER = LoggerFactory.getLogger(PuzzleImportRunner.class);

    private final PuzzleImportService importer;
    private final ConfigurableApplicationContext context;
    private final Path source;
    private final PuzzleImportOptions options;

    PuzzleImportRunner(
            PuzzleImportService importer,
            ConfigurableApplicationContext context,
            @Value("${app.puzzles.import-file}") String source,
            @Value("${app.puzzles.per-band}") int perBand,
            @Value("${app.puzzles.band-width}") int bandWidth,
            @Value("${app.puzzles.min-rating}") int minRating,
            @Value("${app.puzzles.max-rating}") int maxRating,
            @Value("${app.puzzles.min-plays}") int minPlays,
            @Value("${app.puzzles.max-deviation}") int maxDeviation,
            @Value("${app.puzzles.min-popularity}") int minPopularity,
            @Value("${app.puzzles.max-moves}") int maxMoves,
            @Value("${app.puzzles.seed}") long seed) {
        this.importer = importer;
        this.context = context;
        this.source = Path.of(source);
        this.options = new PuzzleImportOptions(perBand, bandWidth, minRating, maxRating, minPlays,
                maxDeviation, minPopularity, maxMoves, seed);
    }

    @Override
    public void run(ApplicationArguments args) {
        int exitCode = 0;
        try {
            PuzzleImportService.ImportReport report = importer.importFile(source, options);
            LOGGER.info("IMPORT XONG: đọc {} dòng, chọn {} puzzle, database hiện có {} puzzle ({} giây).",
                    report.rowsRead(), report.selected(), report.puzzlesInDatabase(), Math.round(report.seconds()));
            report.keptPerBand().forEach((band, count) -> LOGGER.info("  rating {}: {} puzzle", band, count));
        } catch (Exception exception) {
            LOGGER.error("IMPORT THẤT BẠI", exception);
            exitCode = 1;
        }
        int code = exitCode;
        System.exit(SpringApplication.exit(context, () -> code));
    }
}
