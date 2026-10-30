package com.chessanalysis.auth.analysis.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.chessanalysis.auth.analysis.validation.ValidFen;

public record AnalysisMoveRequest(
        @NotBlank @Size(max = 32) String san,
        @NotBlank @Pattern(regexp = UciMove.PATTERN, message = UciMove.MESSAGE) String uci,
        @NotBlank @Size(max = 180) @ValidFen String beforeFen,
        @NotBlank @Size(max = 180) @ValidFen String afterFen,
        boolean theory,
        @Size(max = 250) String theoryName,
        boolean capture,
        boolean check,
        boolean checkmate,
        boolean promotion,
        boolean sacrificeCandidate,
        boolean abandonedPieceCandidate,
        @DecimalMin("0.0") @DecimalMax("20.0") double sacrificeValue,
        @NotBlank @Pattern(regexp = "NONE|MOVED|ABANDONED") String sacrificeKind,
        @Min(0) @Max(256) int legalMoveCount) {}
