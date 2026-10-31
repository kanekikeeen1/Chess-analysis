package com.chessanalysis.auth.review.dto;

import java.time.Instant;

/** Lịch ôn sau một lần làm bài: {@code newCard} khi lần sai này vừa tạo ra thẻ mới. */
public record ReviewOutcome(boolean newCard, int intervalDays, Instant dueAt, int repetitions) {}
