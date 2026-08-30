package com.chessanalysis.auth.exercise.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record ExerciseAttemptRequest(
        @NotNull @Min(0) @Max(100) Integer score,
        boolean completed) {}
