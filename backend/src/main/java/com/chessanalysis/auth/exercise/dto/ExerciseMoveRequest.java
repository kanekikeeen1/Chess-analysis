package com.chessanalysis.auth.exercise.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import com.chessanalysis.auth.analysis.dto.UciMove;

public record ExerciseMoveRequest(
        @NotBlank @Pattern(regexp = UciMove.PATTERN, message = UciMove.MESSAGE) String uci) {}
