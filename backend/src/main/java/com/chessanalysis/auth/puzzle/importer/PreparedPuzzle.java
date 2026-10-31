package com.chessanalysis.auth.puzzle.importer;

import java.util.List;
import java.util.Optional;

import com.chessanalysis.auth.analysis.service.FenRules;
import com.chessanalysis.auth.chess.ChessRules;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * Puzzle đã được server kiểm tra bằng luật cờ: FEN hợp lệ, mọi nước trong lời giải
 * đều hợp lệ theo thứ tự, và vị trí bắt đầu cho người giải đã được tính sẵn.
 */
record PreparedPuzzle(
        LichessPuzzle source,
        String setupMove,
        String startFen,
        String solution,
        int solutionLength) {

    static final int MAX_SOLUTION_CHARS = 255;
    static final int MAX_THEME_CHARS = 48;

    static Optional<PreparedPuzzle> prepare(LichessPuzzle puzzle) {
        if (puzzle.id().isEmpty() || puzzle.id().length() > 8) return Optional.empty();
        if (puzzle.moves().size() < 2 || FenRules.violation(puzzle.fen()) != null) return Optional.empty();
        if (puzzle.themes().stream().anyMatch(theme -> theme.length() > MAX_THEME_CHARS)) return Optional.empty();

        Board board = ChessRules.load(puzzle.fen());
        String startFen = null;
        for (int index = 0; index < puzzle.moves().size(); index++) {
            Optional<Move> move = ChessRules.findLegal(board, puzzle.moves().get(index));
            if (move.isEmpty()) return Optional.empty();
            board.doMove(move.get());
            if (index == 0) startFen = normalizedFen(board);
        }

        String solution = String.join(" ", puzzle.moves().subList(1, puzzle.moves().size()));
        if (solution.length() > MAX_SOLUTION_CHARS || FenRules.violation(startFen) != null) return Optional.empty();
        // Nước của người giải nằm ở vị trí 1, 3, 5… trong cột Moves.
        int solutionLength = puzzle.moves().size() / 2;
        return Optional.of(new PreparedPuzzle(puzzle, puzzle.moves().get(0), startFen, solution, solutionLength));
    }

    /**
     * FEN theo quy ước của chess.js: chỉ ghi ô bắt tốt qua đường khi thực sự bắt được.
     * chesslib luôn ghi ô đó, và frontend sẽ nạp chuỗi này bằng chess.js.
     */
    private static String normalizedFen(Board board) {
        String[] fields = board.getFen().split(" ");
        fields[3] = ChessRules.effectiveEnPassant(board);
        return String.join(" ", fields);
    }

    List<String> themes() {
        return source.themes();
    }
}
