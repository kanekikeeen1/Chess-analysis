package com.chessanalysis.auth.humanmove.style.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.chessanalysis.auth.analysis.validation.ValidFen;

/**
 * @param topK        số nước mỗi kỳ thủ; mặc định 3
 * @param engineDepth khi có, Stockfish chấm điểm từng nước ở độ sâu này; bỏ trống thì không chấm
 */
public record StyleCompareRequest(
        @NotBlank @Size(max = 180) @ValidFen String fen,
        @Min(1) @Max(10) Integer topK,
        @Min(1) @Max(18) Integer engineDepth) {

    public int topKOrDefault() {
        return topK == null ? 3 : topK;
    }
}
