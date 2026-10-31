package com.chessanalysis.auth.puzzle.importer;

/** Tiêu chí lọc puzzle; giá trị mặc định nằm trong {@code application.yml} ({@code app.puzzles.*}). */
record PuzzleImportOptions(
        int perBand,
        int bandWidth,
        int minRating,
        int maxRating,
        int minPlays,
        int maxDeviation,
        int minPopularity,
        int maxMoves,
        long seed) {}
