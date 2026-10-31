package com.chessanalysis.auth.puzzle.dto;

/** Rating luyện puzzle; {@code provisional} khi hệ thống chưa đủ chắc chắn (RD còn lớn). */
public record PuzzleRatingResponse(
        int rating,
        int deviation,
        double volatility,
        boolean provisional,
        int attempts,
        int solved) {}
