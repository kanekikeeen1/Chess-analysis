package com.chessanalysis.auth.puzzle.dto;

/**
 * Trạng thái một lượt giải. {@code sourceFen} + {@code setupMove} là nước đối thủ vừa đi
 * (để giao diện diễn lại như Lichess), {@code currentFen} là vị trí hiện tại.
 */
public record PuzzleSessionResponse(
        String sessionId,
        PuzzleResponse puzzle,
        String sourceFen,
        String setupMove,
        String currentFen,
        String status,
        int progress,
        boolean rated) {}
