package com.chessanalysis.auth.puzzle.importer;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Một dòng của Lichess Puzzle Database.
 *
 * <p>{@code fen} là vị trí <em>trước</em> nước của đối thủ; {@code moves[0]} là nước đó,
 * các nước còn lại là lời giải xen kẽ bắt đầu bằng nước của người giải.
 */
record LichessPuzzle(
        String id,
        String fen,
        List<String> moves,
        int rating,
        int ratingDeviation,
        int popularity,
        int plays,
        List<String> themes,
        String gameUrl,
        String openingTags) {

    /** Các cột cần dùng. File có thể có thêm cột khác (năm 2026 Lichess đã thêm {@code DailyDate}). */
    static final List<String> REQUIRED_COLUMNS = List.of(
            "PuzzleId", "FEN", "Moves", "Rating", "RatingDeviation", "Popularity",
            "NbPlays", "Themes", "GameUrl", "OpeningTags");

    /** Vị trí các cột theo tên, đọc từ dòng header thay vì giả định thứ tự cố định. */
    record Columns(Map<String, Integer> index, int count) {
        static Columns fromHeader(String header) {
            String[] names = header.trim().split(",", -1);
            Map<String, Integer> index = new HashMap<>();
            for (int position = 0; position < names.length; position++) index.put(names[position].trim(), position);
            List<String> missing = REQUIRED_COLUMNS.stream().filter(name -> !index.containsKey(name)).toList();
            if (!missing.isEmpty()) {
                throw new IllegalArgumentException("File puzzle thiếu cột " + missing + "; header là: " + header);
            }
            return new Columns(index, names.length);
        }

        String get(String[] fields, String column) {
            return fields[index.get(column)].trim();
        }
    }

    /** Không có trường nào của file Lichess chứa dấu phẩy, nên tách thẳng là đủ. */
    static Optional<LichessPuzzle> parse(String line, Columns columns) {
        String[] fields = line.split(",", -1);
        if (fields.length != columns.count()) return Optional.empty();
        try {
            return Optional.of(new LichessPuzzle(
                    columns.get(fields, "PuzzleId"),
                    columns.get(fields, "FEN"),
                    words(columns.get(fields, "Moves")),
                    Integer.parseInt(columns.get(fields, "Rating")),
                    Integer.parseInt(columns.get(fields, "RatingDeviation")),
                    Integer.parseInt(columns.get(fields, "Popularity")),
                    Integer.parseInt(columns.get(fields, "NbPlays")),
                    words(columns.get(fields, "Themes")),
                    blankToNull(columns.get(fields, "GameUrl")),
                    blankToNull(columns.get(fields, "OpeningTags"))));
        } catch (NumberFormatException exception) {
            return Optional.empty();
        }
    }

    private static List<String> words(String value) {
        return value.isEmpty() ? List.of() : Arrays.asList(value.split("\\s+"));
    }

    private static String blankToNull(String value) {
        return value.isEmpty() ? null : value;
    }
}
