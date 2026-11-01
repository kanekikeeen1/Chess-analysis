package com.chessanalysis.auth.humanmove.style.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.chessanalysis.auth.analysis.validation.ValidFen;

/**
 * @param fen         thế cờ ngay trước nước {@code uci}
 * @param engineDepth khi có, Stockfish chấm nước đã đi và các nước kiện tướng chọn; bỏ trống thì không chấm
 */
public record StyleOpinionRequest(
        @NotBlank @Size(max = 180) @ValidFen String fen,
        @NotBlank @Pattern(regexp = "[a-h][1-8][a-h][1-8][qrbn]?") String uci,
        @Min(1) @Max(18) Integer engineDepth) {}
