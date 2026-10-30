package com.chessanalysis.auth.exercise.dto;

/**
 * Kết quả một nước của người học. Khi {@code accepted = false}, vị trí không đổi và
 * {@code bestMove} là gợi ý; khi được chấp nhận, {@code opponentReply} là nước đáp của
 * Stockfish (nếu ván chưa kết thúc) và {@code session.currentFen} là vị trí sau nước đáp.
 */
public record ExerciseMoveResponse(
        ExerciseSessionResponse session,
        boolean accepted,
        String playedUci,
        String assessmentKey,
        String detail,
        String bestMove,
        String opponentReply,
        String message) {}
