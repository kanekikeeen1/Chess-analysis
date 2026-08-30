package com.chessanalysis.auth.exercise.dto;

public record ExerciseResponse(
        Long id,
        String slug,
        String category,
        String groupName,
        String title,
        String description,
        String startingFen,
        String solutionLine,
        String difficulty,
        Integer sortOrder) {}
