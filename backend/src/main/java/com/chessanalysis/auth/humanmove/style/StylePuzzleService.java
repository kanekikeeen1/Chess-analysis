package com.chessanalysis.auth.humanmove.style;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;
import com.chessanalysis.auth.chess.ChessRules;
import com.chessanalysis.auth.humanmove.HumanMoveModel;
import com.chessanalysis.auth.humanmove.HumanMoveModel.HumanMove;
import com.chessanalysis.auth.humanmove.HumanMoveService;
import com.chessanalysis.auth.humanmove.style.dto.StylePuzzleCheckResponse;
import com.chessanalysis.auth.humanmove.style.dto.StylePuzzleResponse;
import com.chessanalysis.auth.service.ApiException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.Side;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * Puzzle "Tìm nước kiện tướng đã đi" (D6): thế cờ lấy từ ván test của kỳ thủ, lời giải là nước họ đã đi thật và
 * Stockfish đã xác nhận không phải sai lầm. Do {@code ml/scripts/export_style_puzzles.py} xuất ra
 * {@code puzzles.json} cạnh các mô hình phong cách; thiếu file thì chỉ tính năng này báo chưa có.
 *
 * <p>Không lưu tiến độ hay rating: đây là bài đoán phong cách, không có đáp án "đúng" theo nghĩa cờ, nên chấm theo ba
 * mức: trùng nước kiện tướng, khác nhưng vẫn tốt theo Stockfish, hoặc kém hẳn.
 */
@Service
public class StylePuzzleService {
    private static final Logger LOGGER = LoggerFactory.getLogger(StylePuzzleService.class);
    /** Nước của người dùng kém nước tốt nhất không quá ngần này thì vẫn tính là "nước tốt". */
    static final int GOOD_LOSS_CP = 50;
    private static final int ENGINE_DEPTH = 14;

    private final Map<String, Puzzle> puzzles = new LinkedHashMap<>();
    private final StyleModelRegistry registry;
    private final HumanMoveService engines;
    private final String unavailableReason;

    public StylePuzzleService(@Value("${app.styles.dir:../ml/models/styles}") String directory,
            ObjectMapper objectMapper, StyleModelRegistry registry, HumanMoveService engines) {
        this.registry = registry;
        this.engines = engines;
        Path path = Path.of(directory).toAbsolutePath().normalize().resolve("puzzles.json");
        if (!Files.isRegularFile(path)) {
            unavailableReason = "Chưa có puzzle kiện tướng tại " + path + ". Hãy chạy python scripts/export_style_puzzles.py.";
            LOGGER.warn(unavailableReason);
            return;
        }
        try {
            for (Puzzle puzzle : objectMapper.readValue(path.toFile(), PuzzleFile.class).puzzles()) {
                puzzles.put(puzzle.id(), puzzle);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Không đọc được " + path, exception);
        }
        unavailableReason = puzzles.isEmpty() ? "puzzles.json không có puzzle nào." : null;
        LOGGER.info("Đã nạp {} puzzle kiện tướng", puzzles.size());
    }

    /** Một puzzle ngẫu nhiên (của {@code style} nếu có), tránh các id người dùng vừa làm. */
    public StylePuzzleResponse next(String style, Set<String> exclude) {
        if (puzzles.isEmpty()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, unavailableReason);
        List<Puzzle> pool = puzzles.values().stream()
                .filter(puzzle -> style == null || style.isBlank() || puzzle.style().equals(style))
                .toList();
        if (pool.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Không có puzzle của kỳ thủ '" + style + "'.");
        List<Puzzle> fresh = pool.stream().filter(puzzle -> !exclude.contains(puzzle.id())).toList();
        // Làm hết thì quay vòng lại từ đầu thay vì báo lỗi.
        List<Puzzle> choices = fresh.isEmpty() ? pool : fresh;
        Puzzle puzzle = choices.get(ThreadLocalRandom.current().nextInt(choices.size()));
        return new StylePuzzleResponse(puzzle.id(), puzzle.style(), displayName(puzzle.style()), puzzle.fen(),
                puzzle.ply(), puzzle.date(), puzzle.speed(), puzzle.color(), puzzle.elo(), puzzle.opponentElo(),
                pool.size());
    }

    public StylePuzzleCheckResponse check(String id, String uci) {
        Puzzle puzzle = Optional.ofNullable(puzzles.get(id))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không có puzzle '" + id + "'."));
        Board board = ChessRules.load(puzzle.fen());
        Move move = ChessRules.findLegal(board, uci).orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST,
                "Nước " + uci + " không hợp lệ ở thế cờ này."));
        String userUci = move.toString();
        boolean correct = userUci.equals(puzzle.uci());

        int bestCp = puzzle.engine().get(0).cp();
        Integer userCp = correct ? Integer.valueOf(puzzle.playedCp()) : engineCp(puzzle, board, userUci);
        String verdict = correct ? "match"
                : userCp == null ? "unknown"
                : bestCp - userCp <= GOOD_LOSS_CP ? "good" : "weak";

        Map<String, Double> probabilities = styleProbabilities(puzzle.style(), board, List.of(userUci, puzzle.uci()));
        return new StylePuzzleCheckResponse(correct, verdict, puzzle.uci(), puzzle.san(),
                HumanMoveModel.san(board, move), userCp, puzzle.playedCp(), bestCp,
                probabilities.get(puzzle.uci()), probabilities.get(userUci), puzzle.result(),
                puzzle.engine().stream().map(line -> new StylePuzzleCheckResponse.EngineLine(line.uci(), line.san(), line.cp()))
                        .toList());
    }

    public boolean available() {
        return !puzzles.isEmpty();
    }

    /** Điểm (bên đi) của nước người dùng: có sẵn trong multipv thì lấy luôn, không thì hỏi Stockfish. */
    private Integer engineCp(Puzzle puzzle, Board board, String uci) {
        for (EngineLine line : puzzle.engine()) {
            if (line.uci().equals(uci)) return line.cp();
        }
        HumanMoveService.EngineScores scores = engines.scoreMoves(puzzle.fen(), ENGINE_DEPTH, List.of(uci));
        EngineVariationResponse score = scores.byMove().get(uci);
        if (score == null) return null;
        // pawns theo phía Trắng; khi có chiếu hết nó mang dấu của bên thắng.
        int whiteCp = score.mate() != null ? (score.pawns() > 0 ? 10_000 : -10_000) : (int) Math.round(score.pawns() * 100);
        return board.getSideToMove() == Side.WHITE ? whiteCp : -whiteCp;
    }

    /** Mô hình phong cách gán bao nhiêu xác suất cho từng nước (để nói "Carlsen chọn nước của bạn x% số lần"). */
    private Map<String, Double> styleProbabilities(String style, Board board, List<String> moves) {
        Map<String, Double> result = new LinkedHashMap<>();
        registry.find(style).ifPresent(found -> {
            Set<String> wanted = new HashSet<>(moves);
            List<HumanMove> all = found.model().predict(board, List.of(found.entry().elo()), board.legalMoves().size()).get(0);
            for (HumanMove move : all) if (wanted.contains(move.uci())) result.put(move.uci(), move.probability());
        });
        return result;
    }

    private String displayName(String style) {
        return registry.find(style).map(found -> found.entry().displayName()).orElse(style);
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record PuzzleFile(List<Puzzle> puzzles) {}

    /** Điểm {@code cp} nhìn từ bên đi; {@code engine} là multipv của Stockfish, tốt nhất trước. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Puzzle(String id, String style, String fen, String uci, String san, int ply, String date, String speed,
            String color, Integer elo, Integer opponentElo, Integer result, int playedCp, boolean matchesEngine,
            List<EngineLine> engine) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record EngineLine(String uci, String san, int cp) {}
}
