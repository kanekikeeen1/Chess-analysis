package com.chessanalysis.auth.analysis.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateAnalysisJobRequest(
        @NotBlank @Pattern(regexp = "PGN|FEN") String sourceType,
        @NotBlank @Size(max = 1_000_000) String sourceText,
        @NotEmpty @Size(max = 1001) List<@NotBlank @Size(max = 180) String> positions,
        @NotNull @Size(max = 1000) List<@Valid AnalysisMoveRequest> moves,
        @Size(max = 16) String openingEco,
        @Size(max = 250) String openingName,
        @NotNull @Min(10) @Max(16) Integer minDepth,
        @NotNull @Min(14) @Max(20) Integer maxDepth) {}
