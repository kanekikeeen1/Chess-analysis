package com.chessanalysis.auth.exercise.dto;

import java.util.Map;

public record ExerciseProgressResponse(
        long totalAttempts,
        long completedLessons,
        Map<String, Integer> bestScores) {}
