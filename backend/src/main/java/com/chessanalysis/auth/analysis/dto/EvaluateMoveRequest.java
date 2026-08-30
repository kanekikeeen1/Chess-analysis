package com.chessanalysis.auth.analysis.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EvaluateMoveRequest(
        @NotBlank @Size(max = 180) String beforeFen,
        @NotBlank @Size(max = 180) String afterFen,
        @NotBlank @Size(min = 4, max = 5) String playedUci,
        boolean checkmate,
        @Min(16) @Max(20) Integer depth) {}
