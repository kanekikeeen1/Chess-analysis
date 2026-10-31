package com.chessanalysis.auth.exercise;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

import com.chessanalysis.auth.analysis.service.FenRules;
import com.chessanalysis.auth.chess.ChessRules;
import com.github.bhlangonijr.chesslib.Board;

/**
 * Dựng lại dữ liệu bài tàn cuộc sau khi áp V5 → V7 → V12 (đọc thẳng file migration)
 * và kiểm tra mọi thế cờ. Lỗi dữ liệu kiểu "bên không đến lượt đang bị chiếu" từng
 * lọt vào V7 vì không có bước kiểm tra nào như thế này.
 */
class EndgameSeedDataTest {
    private static final String FEN = "([1-8pnbrqkPNBRQK/]+ [wb] [-KQkq]+ [-a-h1-8]+ \\d+ \\d+)";
    private static final Pattern POSITION_INSERT = Pattern.compile(
            "SELECT id, '" + FEN + "', '(\\w+)', \\d+, TRUE FROM exercise_lessons WHERE slug = '([\\w-]+)'");
    private static final Pattern LESSON_ROW = Pattern.compile(
            "\\('([\\w-]+)', 'ENDGAME',[^\\n]*?'" + FEN + "'");
    private static final Pattern POSITION_UPDATE = Pattern.compile(
            "UPDATE exercise_positions SET starting_fen = '" + FEN + "'(?:, goal_type = '(\\w+)')?\\s+"
                    + "WHERE starting_fen = '" + FEN + "'");
    private static final Pattern LESSON_UPDATE = Pattern.compile(
            "UPDATE exercise_lessons\\s+SET starting_fen = '" + FEN + "'[^;]*?WHERE slug = '([\\w-]+)'");

    @Test
    void everyEndgamePositionIsLegalAfterAllMigrations() throws IOException {
        List<Seed> positions = new ArrayList<>();
        Matcher inserts = POSITION_INSERT.matcher(read("V7__create_exercise_positions.sql"));
        while (inserts.find()) positions.add(new Seed(inserts.group(3), inserts.group(1), inserts.group(2)));
        assertEquals(30, positions.size(), "V7 phải có 30 thế cờ (10 bài × 3)");

        Map<String, String> lessonFens = new LinkedHashMap<>();
        Matcher lessons = LESSON_ROW.matcher(read("V5__create_exercises.sql"));
        while (lessons.find()) lessonFens.put(lessons.group(1), lessons.group(2));
        assertEquals(10, lessonFens.size(), "V5 phải có 10 bài tàn cuộc");

        String v12 = read("V12__fix_endgame_positions.sql");
        Matcher updates = POSITION_UPDATE.matcher(v12);
        int applied = 0;
        while (updates.find()) {
            for (int index = 0; index < positions.size(); index++) {
                Seed seed = positions.get(index);
                if (!seed.fen().equals(updates.group(3))) continue;
                positions.set(index, new Seed(seed.slug(), updates.group(1),
                        updates.group(2) == null ? seed.goal() : updates.group(2)));
                applied++;
            }
        }
        assertEquals(10, applied, "Mỗi câu UPDATE của V12 phải khớp đúng một thế cờ cũ");
        Matcher lessonUpdates = LESSON_UPDATE.matcher(v12);
        while (lessonUpdates.find()) lessonFens.put(lessonUpdates.group(2), lessonUpdates.group(1));

        for (Seed seed : positions) assertPlayable(seed.slug() + " / " + seed.goal(), seed.fen());
        // FEN cấp bài học chỉ là hình minh họa (bài "Đối vua" chỉ có hai vua), nên chỉ cần hợp lệ.
        lessonFens.forEach((slug, fen) -> assertNull(FenRules.violation(fen), "bài " + slug + ": " + fen));
    }

    private void assertPlayable(String label, String fen) {
        assertNull(FenRules.violation(fen), label + ": " + fen);
        Board board = ChessRules.load(fen);
        assertFalse(board.legalMoves().isEmpty(), label + ": bên đến lượt không có nước nào: " + fen);
        assertFalse(board.isDraw(), label + ": thế cờ đã hòa sẵn: " + fen);
        // Bài cầm hòa không được mở đầu bằng thế mà bên đến lượt chiếu hết ngay một nước.
        boolean mateInOne = board.legalMoves().stream().anyMatch(move -> {
            board.doMove(move);
            boolean mated = board.isMated();
            board.undoMove();
            return mated;
        });
        if (label.endsWith("DRAW")) assertFalse(mateInOne, label + ": có chiếu hết một nước: " + fen);
        assertTrue(fen.length() <= FenRules.MAX_LENGTH);
    }

    private String read(String migration) throws IOException {
        try (InputStream stream = getClass().getResourceAsStream("/db/migration/" + migration)) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private record Seed(String slug, String fen, String goal) {}
}
