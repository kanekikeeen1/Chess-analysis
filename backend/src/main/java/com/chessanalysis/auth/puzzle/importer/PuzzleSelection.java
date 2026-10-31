package com.chessanalysis.auth.puzzle.importer;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;

/**
 * Chọn một tập puzzle nhỏ, chất lượng cao, cân bằng theo rating từ ~5 triệu dòng của Lichess.
 *
 * <p>Giữ puzzle đã được chơi nhiều, rating ổn định (RatingDeviation thấp) và được đánh
 * giá tốt (Popularity cao), rồi lấy mẫu ngẫu nhiên đều trong từng dải rating để người
 * học ở mọi trình độ đều có đủ bài. Lấy mẫu dùng reservoir sampling (thuật toán R):
 * chỉ cần đọc file một lượt, bộ nhớ không phụ thuộc kích thước file, và mỗi puzzle hợp
 * lệ trong một dải có cùng xác suất được giữ.
 */
final class PuzzleSelection {
    private final PuzzleImportOptions options;
    private final Random random;
    private final Map<Integer, List<PreparedPuzzle>> reservoirs = new TreeMap<>();
    private final Map<Integer, Integer> eligiblePerBand = new TreeMap<>();
    private final Map<String, Integer> rejected = new LinkedHashMap<>();

    PuzzleSelection(PuzzleImportOptions options) {
        this.options = options;
        this.random = new Random(options.seed());
    }

    /** Lý do loại một puzzle theo các tiêu chí chất lượng, hoặc {@code null} nếu đạt. */
    String rejection(LichessPuzzle puzzle) {
        if (puzzle.rating() < options.minRating() || puzzle.rating() > options.maxRating()) return "ngoài dải rating";
        if (puzzle.plays() < options.minPlays()) return "ít lượt chơi";
        if (puzzle.ratingDeviation() > options.maxDeviation()) return "rating chưa ổn định";
        if (puzzle.popularity() < options.minPopularity()) return "bị đánh giá thấp";
        if (puzzle.moves().size() > options.maxMoves()) return "lời giải quá dài";
        return null;
    }

    void reject(String reason) {
        rejected.merge(reason, 1, Integer::sum);
    }

    void offer(PreparedPuzzle puzzle) {
        int band = Math.floorDiv(puzzle.source().rating(), options.bandWidth()) * options.bandWidth();
        int seen = eligiblePerBand.merge(band, 1, Integer::sum);
        List<PreparedPuzzle> reservoir = reservoirs.computeIfAbsent(band, ignored -> new ArrayList<>());
        if (reservoir.size() < options.perBand()) {
            reservoir.add(puzzle);
        } else {
            int slot = random.nextInt(seen);
            if (slot < options.perBand()) reservoir.set(slot, puzzle);
        }
    }

    List<PreparedPuzzle> selected() {
        return reservoirs.values().stream().flatMap(List::stream).toList();
    }

    Map<String, Integer> keptPerBand() {
        Map<String, Integer> result = new LinkedHashMap<>();
        reservoirs.forEach((band, list) -> result.put(bandLabel(band), list.size()));
        return result;
    }

    Map<String, Integer> eligiblePerBand() {
        Map<String, Integer> result = new LinkedHashMap<>();
        eligiblePerBand.forEach((band, count) -> result.put(bandLabel(band), count));
        return result;
    }

    Map<String, Integer> rejected() {
        return rejected;
    }

    private String bandLabel(int band) {
        return band + "-" + (band + options.bandWidth() - 1);
    }
}
