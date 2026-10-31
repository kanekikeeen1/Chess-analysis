package com.chessanalysis.auth.analysis.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.chessanalysis.auth.analysis.validation.ValidFen;

/**
 * Đánh giá một vị trí do client gửi lên. Giống {@link PositionEvaluationResponse}
 * nhưng có ràng buộc kiểm tra đầu vào, vì đây là dữ liệu đến từ trình duyệt.
 */
public record PositionEvaluationRequest(
        @NotBlank @Size(max = 180) @ValidFen String fen,
        @Min(0) @Max(99) int depth,
        Integer mate,
        @NotNull @Size(max = 64) List<@Size(max = 6) String> moves,
        @Min(-200) @Max(200) double pawns,
        @NotNull @Size(max = 8) List<@Valid EngineVariationRequest> variations) {

    public PositionEvaluationResponse toResponse(int positionIndex) {
        return new PositionEvaluationResponse(
                positionIndex, fen, depth, mate, moves, pawns,
                variations.stream().map(EngineVariationRequest::toResponse).toList());
    }

    public record EngineVariationRequest(
            @Min(0) @Max(99) int depth,
            Integer mate,
            @NotNull @Size(max = 64) List<@Size(max = 6) String> moves,
            @Min(-200) @Max(200) double pawns) {

        public EngineVariationResponse toResponse() {
            return new EngineVariationResponse(depth, mate, moves, pawns);
        }
    }
}
