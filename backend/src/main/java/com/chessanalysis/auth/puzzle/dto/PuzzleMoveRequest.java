package com.chessanalysis.auth.puzzle.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import com.chessanalysis.auth.analysis.dto.UciMove;

public record PuzzleMoveRequest(
        @NotBlank @Pattern(regexp = UciMove.PATTERN, message = UciMove.MESSAGE) String uci) {}
