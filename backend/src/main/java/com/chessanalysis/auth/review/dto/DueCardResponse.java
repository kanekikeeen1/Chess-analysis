package com.chessanalysis.auth.review.dto;

import java.time.Instant;

/**
 * Một thẻ đến hạn. {@code itemId} là id puzzle (kind = PUZZLE) hoặc id nước sai trong
 * {@code analyzed_moves} (kind = MISTAKE); giao diện mở đúng trang tương ứng để ôn.
 */
public record DueCardResponse(
        Long cardId,
        String kind,
        Long itemId,
        String title,
        String detail,
        Instant dueAt,
        int intervalDays,
        int repetitions,
        int lapses) {}
