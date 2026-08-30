package com.chessanalysis.auth.exercise.dto;

import java.time.Instant;

public record ExerciseAttemptResponse(
        Long id,
        String lessonSlug,
        Integer score,
        boolean completed,
        Instant createdAt) {}
