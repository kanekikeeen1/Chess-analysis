package com.chessanalysis.auth.humanmove.style.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** @param uci nước người dùng đoán, dạng UCI */
public record StylePuzzleCheckRequest(@NotBlank @Pattern(regexp = "[a-h][1-8][a-h][1-8][qrbn]?") String uci) {}
