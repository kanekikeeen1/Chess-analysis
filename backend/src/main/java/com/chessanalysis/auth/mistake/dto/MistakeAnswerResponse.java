package com.chessanalysis.auth.mistake.dto;

import com.chessanalysis.auth.review.dto.ReviewOutcome;

/**
 * Kết quả trả lời. {@code assessmentKey} là nhãn Stockfish cho nước người học vừa đi
 * ({@code null} khi chấm không cần engine), {@code bestMove} là nước tốt nhất của ván gốc,
 * {@code review} là lịch ôn tập nếu sai lầm này có (hoặc vừa có) thẻ ôn.
 */
public record MistakeAnswerResponse(
        boolean correct,
        String answeredUci,
        String assessmentKey,
        String detail,
        String bestMove,
        String originalUci,
        String originalLabel,
        ReviewOutcome review) {}
