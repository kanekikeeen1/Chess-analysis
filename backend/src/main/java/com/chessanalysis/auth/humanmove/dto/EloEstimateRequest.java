package com.chessanalysis.auth.humanmove.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.chessanalysis.auth.analysis.validation.ValidFen;

/**
 * Các nước của một ván, để ước lượng Elo của từng bên. Bên đi suy ra từ FEN nên gửi cả hai bên cùng lúc.
 * Giới hạn 240 nước (120 nước mỗi bên): mỗi nước chạy mô hình ở 10 mức Elo.
 */
public record EloEstimateRequest(@NotEmpty @Size(max = 240) List<@Valid Move> moves) {

    /** @param fen thế cờ ngay trước nước {@code uci} */
    public record Move(
            @NotBlank @Size(max = 180) @ValidFen String fen,
            @NotBlank @Pattern(regexp = "[a-h][1-8][a-h][1-8][qrbn]?") String uci) {}
}
