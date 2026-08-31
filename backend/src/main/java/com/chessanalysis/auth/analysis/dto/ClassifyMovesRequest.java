package com.chessanalysis.auth.analysis.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Yêu cầu gán nhãn cho các nước đã có sẵn đánh giá engine.
 *
 * <p>Frontend chạy Stockfish WASM ngay trên trình duyệt cho chế độ phân tích
 * thủ công, nhưng không được tự quyết định nhãn: nó gửi kết quả engine lên đây
 * và nhận lại nhãn. Nhờ vậy chỉ còn đúng một bộ luật gán nhãn trong cả hệ
 * thống, và khi M1 thay bộ luật bằng mô hình học máy thì cả hai chế độ phân
 * tích cùng đổi theo mà không phải sửa frontend.
 */
public record ClassifyMovesRequest(
        @NotNull @NotEmpty @Size(max = 1000) List<@Valid AnalysisMoveRequest> moves,
        @NotNull @NotEmpty @Size(max = 1001) List<@Valid PositionEvaluationRequest> evaluations) {}
