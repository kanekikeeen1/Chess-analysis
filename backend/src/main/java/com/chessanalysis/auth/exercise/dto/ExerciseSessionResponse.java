package com.chessanalysis.auth.exercise.dto;

public record ExerciseSessionResponse(
        String sessionId,
        String lessonSlug,
        Long positionId,
        String goalType,
        String playerSide,
        String startingFen,
        String currentFen,
        String status,
        int mistakes,
        int acceptedMoves,
        Integer score) {}
