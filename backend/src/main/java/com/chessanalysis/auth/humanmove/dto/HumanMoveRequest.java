package com.chessanalysis.auth.humanmove.dto;

import java.util.List;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.chessanalysis.auth.analysis.validation.ValidFen;

/**
 * Hỏi mô hình M2 ở một hoặc nhiều mức Elo cùng lúc, để giao diện đặt các mức cạnh nhau.
 *
 * @param topK        số nước trả về cho mỗi mức; mặc định 3
 * @param engineDepth khi có, Stockfish chấm điểm từng nước gợi ý ở độ sâu này; bỏ trống thì không chấm
 * @param compare     true thì mọi mức trả về cùng một tập nước (hợp các top-K), để so sánh theo hàng
 */
public record HumanMoveRequest(
        @NotBlank @Size(max = 180) @ValidFen String fen,
        @NotEmpty @Size(max = 10) List<@NotNull @Min(400) @Max(3200) Integer> elos,
        @Min(1) @Max(10) Integer topK,
        @Min(1) @Max(18) Integer engineDepth,
        Boolean compare) {

    public int topKOrDefault() {
        return topK == null ? 3 : topK;
    }

    public boolean compareOrDefault() {
        return Boolean.TRUE.equals(compare);
    }
}
