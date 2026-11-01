package com.chessanalysis.auth.humanmove.style.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.chessanalysis.auth.analysis.validation.ValidFen;

/** @param topK số nước trả về; mặc định 10, đủ để bot rút ngẫu nhiên theo xác suất */
public record StyleMoveRequest(
        @NotBlank @Size(max = 180) @ValidFen String fen,
        @Min(1) @Max(20) Integer topK) {

    public int topKOrDefault() {
        return topK == null ? 10 : topK;
    }
}
