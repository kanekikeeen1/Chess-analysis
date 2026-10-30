package com.chessanalysis.auth.game.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.chessanalysis.auth.analysis.validation.ValidFen;

public record SaveGameRequest(
        @NotBlank @Size(max = 160) String title,
        @NotBlank @Size(max = 100) String whitePlayer,
        @NotBlank @Size(max = 100) String blackPlayer,
        @NotBlank @Size(max = 12) String result,
        @NotBlank @Pattern(regexp = "PGN|FEN", message = "Nguồn phải là PGN hoặc FEN.") String sourceType,
        @Size(max = 1000000) String pgn,
        @NotBlank @Size(max = 180) @ValidFen String initialFen,
        @NotBlank @Size(max = 180) @ValidFen String finalFen,
        @Size(max = 12) String openingEco,
        @Size(max = 255) String openingName,
        @DecimalMin("0.0") @DecimalMax("100.0") Double whiteAccuracy,
        @DecimalMin("0.0") @DecimalMax("100.0") Double blackAccuracy,
        @Min(value = 1, message = "Depth phải lớn hơn hoặc bằng 1.")
        @Max(value = 1000, message = "Depth không được lớn hơn 1000.")
        Integer depth,
        @Min(0) @Max(1000) Integer moveCount,
        @NotBlank @Size(max = 4000000) String analysisJson,
        /**
         * Mã tác vụ review đã sinh ra báo cáo này. Không bắt buộc: khi có, backend
         * đọc lại đặc trưng từng nước từ tác vụ đó để ghi bảng analyzed_moves.
         */
        @Size(max = 36) String analysisJobId) {}
