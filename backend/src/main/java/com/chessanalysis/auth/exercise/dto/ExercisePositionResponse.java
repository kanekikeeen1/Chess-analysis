package com.chessanalysis.auth.exercise.dto;

public record ExercisePositionResponse(
        Long id,
        String lessonSlug,
        String startingFen,
        String goalType) {}
