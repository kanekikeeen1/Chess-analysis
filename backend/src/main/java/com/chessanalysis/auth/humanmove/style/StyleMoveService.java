package com.chessanalysis.auth.humanmove.style;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;
import com.chessanalysis.auth.chess.ChessRules;
import com.chessanalysis.auth.humanmove.HumanMoveModel;
import com.chessanalysis.auth.humanmove.HumanMoveModel.HumanMove;
import com.chessanalysis.auth.humanmove.HumanMoveModel.PlayedMove;
import com.chessanalysis.auth.humanmove.HumanMoveService;
import com.chessanalysis.auth.humanmove.dto.HumanMoveResponse.ScoredMove;
import com.chessanalysis.auth.humanmove.style.StyleModelRegistry.Style;
import com.chessanalysis.auth.humanmove.style.dto.StyleCompareResponse;
import com.chessanalysis.auth.humanmove.style.dto.StyleMatchResponse;
import com.chessanalysis.auth.humanmove.style.dto.StyleMoveResponse;
import com.chessanalysis.auth.humanmove.style.dto.StylesResponse;
import com.chessanalysis.auth.service.ApiException;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.Side;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * "Kỳ thủ X sẽ đi nước nào": tra sổ khai cuộc của X trước, hết sổ thì hỏi mô hình phong cách của X.
 *
 * <p>Mô hình (giống M2) không được học 10 nửa nước đầu, nên ở khai cuộc nó chỉ đoán chung chung; sổ khai cuộc lưu
 * đúng những nước X đã chọn ở những thế cờ đó trong ván thật, nên bot vào đúng repertoire của X.
 */
@Service
public class StyleMoveService {
    private final StyleModelRegistry registry;
    private final HumanMoveService engines;

    /** @param engines chỉ dùng để chấm điểm Stockfish trong {@link #compare}; có thể null trong test */
    public StyleMoveService(StyleModelRegistry registry, HumanMoveService engines) {
        this.registry = registry;
        this.engines = engines;
    }

    public StylesResponse list() {
        List<StylesResponse.StyleSummary> styles = registry.all().stream().map(style -> {
            StyleModelRegistry.Entry entry = style.entry();
            return new StylesResponse.StyleSummary(entry.id(), entry.displayName(), entry.elo(), entry.games(),
                    entry.firstYear(), entry.lastYear(), entry.bySpeed(), entry.bySource(), entry.testTop1(),
                    entry.baseTop1(), style.book().size());
        }).toList();
        return new StylesResponse(!styles.isEmpty(), registry.unavailableReason(), styles);
    }

    public StyleMoveResponse moves(String id, String fen, int topK) {
        Style style = registry.find(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                "Không có mô hình kỳ thủ '" + id + "'."));
        Board board = ChessRules.load(fen);
        return moves(style, board, ChessRules.chessJsFen(board), topK);
    }

    /** Trang phân tích: top nước của mọi kỳ thủ ở một thế cờ, chấm Stockfish một lần cho hợp các nước. */
    public StyleCompareResponse compare(String fen, int topK, Integer engineDepth) {
        requireStyles();
        Board board = ChessRules.load(fen);
        String normalized = ChessRules.chessJsFen(board);
        List<StyleMoveResponse> styles = registry.all().stream()
                .map(style -> moves(style, board, normalized, topK))
                .toList();

        Set<String> distinct = new LinkedHashSet<>();
        styles.forEach(style -> style.moves().forEach(move -> distinct.add(move.uci())));
        HumanMoveService.EngineScores scores = engines == null
                ? new HumanMoveService.EngineScores(Map.of(), null)
                : engines.scoreMoves(normalized, engineDepth, distinct);
        List<StyleMoveResponse> scored = styles.stream()
                .map(style -> new StyleMoveResponse(style.fen(), style.style(), style.source(), style.bookGames(),
                        style.moves().stream().map(move -> withScore(move, scores.byMove().get(move.uci()))).toList()))
                .toList();
        return new StyleCompareResponse(normalized, scored, scores.note());
    }

    /**
     * Báo cáo ván: với từng kỳ thủ, bao nhiêu nước của mỗi bên trùng lựa chọn của kỳ thủ đó. Thế cờ có trong sổ
     * khai cuộc thì xếp hạng theo tần suất trong sổ, còn lại theo mô hình phong cách (chạy theo lô).
     */
    public StyleMatchResponse match(List<PlayedMove> played) {
        requireStyles();
        List<StyleMatchResponse.StyleMatch> white = new ArrayList<>();
        List<StyleMatchResponse.StyleMatch> black = new ArrayList<>();
        for (Style style : registry.all()) {
            int[] modelRanks = style.model().playedRanks(played, style.entry().elo());
            // [bên][số nước, trùng top-1, trùng top-3, có trong sổ]
            int[][] counts = new int[2][4];
            for (int i = 0; i < played.size(); i++) {
                PlayedMove move = played.get(i);
                int[] side = counts[move.board().getSideToMove() == Side.WHITE ? 0 : 1];
                Map<String, Integer> book = style.book().get(bookKey(ChessRules.chessJsFen(move.board())));
                int rank = modelRanks[i];
                if (book != null && !book.isEmpty()) {
                    rank = bookRank(book, move.move().toString().toLowerCase());
                    side[3]++;
                }
                side[0]++;
                if (rank == 0) side[1]++;
                if (rank < 3) side[2]++;
            }
            StyleModelRegistry.Entry entry = style.entry();
            if (counts[0][0] > 0) white.add(summary(entry, counts[0]));
            if (counts[1][0] > 0) black.add(summary(entry, counts[1]));
        }
        return new StyleMatchResponse(white, black);
    }

    /** Thứ hạng của nước trong sổ (0 = kỳ thủ chọn nhiều nhất); nước kỳ thủ chưa từng đi xếp sau mọi nước trong sổ. */
    static int bookRank(Map<String, Integer> book, String uci) {
        Integer count = book.get(uci);
        if (count == null) return book.size();
        int rank = 0;
        for (int other : book.values()) if (other > count) rank++;
        return rank;
    }

    /** Khóa sổ khai cuộc: bố trí quân, lượt, nhập thành, bắt tốt qua đường (giống {@code position_key} bên Python). */
    static String bookKey(String chessJsFen) {
        String[] fields = chessJsFen.split(" ");
        return String.join(" ", fields[0], fields[1], fields[2], fields[3]);
    }

    private void requireStyles() {
        if (registry.all().isEmpty()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, registry.unavailableReason());
        }
    }

    private StyleMoveResponse moves(Style style, Board board, String normalized, int topK) {
        Optional<StyleMoveResponse> fromBook = fromBook(style, board, normalized, topK);
        if (fromBook.isPresent()) return fromBook.get();

        List<HumanMove> predicted = style.model().predict(board, List.of(style.entry().elo()), topK).get(0);
        List<ScoredMove> moves = predicted.stream()
                .map(move -> new ScoredMove(move.uci(), move.san(), move.probability(), null, null))
                .toList();
        return new StyleMoveResponse(normalized, style.entry().id(), "model", null, moves);
    }

    private Optional<StyleMoveResponse> fromBook(Style style, Board board, String fen, int topK) {
        Map<String, Integer> counts = style.book().get(bookKey(fen));
        if (counts == null || counts.isEmpty()) return Optional.empty();
        int total = counts.values().stream().mapToInt(Integer::intValue).sum();
        List<ScoredMove> moves = new ArrayList<>();
        counts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue(Comparator.reverseOrder()))
                .limit(topK)
                .forEach(entry -> {
                    // Sổ được dựng từ ván thật nên nước luôn hợp lệ; vẫn kiểm tra để một sổ hỏng không làm bot đi sai luật.
                    Optional<Move> move = ChessRules.findLegal(board, entry.getKey());
                    move.ifPresent(legal -> moves.add(new ScoredMove(entry.getKey(), HumanMoveModel.san(board, legal),
                            entry.getValue() / (double) total, null, null)));
                });
        return moves.isEmpty() ? Optional.empty() : Optional.of(new StyleMoveResponse(fen, style.entry().id(), "book", total, moves));
    }

    private static ScoredMove withScore(ScoredMove move, EngineVariationResponse score) {
        return score == null ? move
                : new ScoredMove(move.uci(), move.san(), move.probability(), score.pawns(), score.mate());
    }

    private static StyleMatchResponse.StyleMatch summary(StyleModelRegistry.Entry entry, int[] counts) {
        return new StyleMatchResponse.StyleMatch(entry.id(), entry.displayName(), counts[0], counts[1], counts[2],
                counts[3]);
    }
}
