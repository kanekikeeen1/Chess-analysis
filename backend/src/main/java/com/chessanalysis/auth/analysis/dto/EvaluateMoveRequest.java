package com.chessanalysis.auth.analysis.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.chessanalysis.auth.analysis.validation.ValidFen;

public record EvaluateMoveRequest(
        @NotBlank @Size(max = 180) @ValidFen String beforeFen,
        @NotBlank @Size(max = 180) @ValidFen String afterFen,
        @NotBlank @Pattern(regexp = UciMove.PATTERN, message = UciMove.MESSAGE) String playedUci,
        boolean checkmate,
        @Min(16) @Max(20) Integer depth) {}
