package com.chessanalysis.auth.review.dto;

import java.time.Instant;
import java.util.List;

/** {@code learned}: thẻ có khoảng cách ôn từ 21 ngày trở lên. */
public record ReviewSummaryResponse(
        long due,
        long total,
        long learned,
        Instant nextDueAt,
        List<DueCardResponse> cards) {}
