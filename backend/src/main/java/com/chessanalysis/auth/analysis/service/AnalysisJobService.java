package com.chessanalysis.auth.analysis.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.analysis.dto.AnalysisJobResponse;
import com.chessanalysis.auth.analysis.dto.AnalysisResultResponse;
import com.chessanalysis.auth.analysis.dto.CreateAnalysisJobRequest;
import com.chessanalysis.auth.analysis.dto.PositionEvaluationResponse;
import com.chessanalysis.auth.analysis.entity.AnalysisJob;
import com.chessanalysis.auth.analysis.repository.AnalysisJobRepository;
import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.service.ApiException;
import com.chessanalysis.auth.service.AuthService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class AnalysisJobService {
    private final AnalysisJobRepository jobs;
    private final AnalysisJobQueue queue;
    private final AnalysisJobStateService state;
    private final AuthService authService;
    private final ObjectMapper objectMapper;

    public AnalysisJobService(
            AnalysisJobRepository jobs,
            AnalysisJobQueue queue,
            AnalysisJobStateService state,
            AuthService authService,
            ObjectMapper objectMapper) {
        this.jobs = jobs;
        this.queue = queue;
        this.state = state;
        this.authService = authService;
        this.objectMapper = objectMapper;
    }

    public AnalysisJobResponse create(String token, CreateAnalysisJobRequest request) {
        validateTimeline(request);
        UserAccount user = authService.currentAccountOrNull(token);
        Instant now = Instant.now();
        AnalysisJob job = jobs.saveAndFlush(new AnalysisJob(
                UUID.randomUUID().toString(), user, request.sourceType(), request.positions().size(),
                request.minDepth(), request.maxDepth(), serializeRequest(request), now));
        try {
            queue.submit(job.getId(), request);
        } catch (RuntimeException exception) {
            // Bản ghi job đã commit trước khi xếp hàng, nên khi hàng đợi từ chối
            // phải đánh dấu thất bại ngay; nếu không job nằm mãi ở QUEUED và
            // frontend poll vô tận.
            state.fail(job.getId(), exception.getMessage());
            throw exception;
        }
        return toResponse(job, 0);
    }

    /**
     * @param fromEvaluation chỉ trả các đánh giá từ vị trí này trở đi. Frontend poll
     *     liên tục trong lúc job chạy; gửi lại toàn bộ danh sách mỗi lần khiến tổng
     *     dữ liệu truyền đi tăng theo bình phương số nước của ván.
     */
    @Transactional(readOnly = true)
    public AnalysisJobResponse get(String publicId, int fromEvaluation) {
        return toResponse(jobs.findByPublicId(publicId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy tác vụ phân tích.")),
                fromEvaluation);
    }

    private void validateTimeline(CreateAnalysisJobRequest request) {
        boolean supportedDepthRange = request.minDepth() != null && request.maxDepth() != null
                && ((request.minDepth() == 10 && request.maxDepth() == 14)
                    || (request.minDepth() == 16 && request.maxDepth() == 20));
        if (!supportedDepthRange) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Chỉ hỗ trợ chế độ Nhanh depth 10–14 hoặc Sâu depth 16–20.");
        }
        if (request.sourceType().equals("FEN")) {
            if (request.positions().size() != 1 || !request.moves().isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "FEN phải chứa đúng một vị trí và không có lịch sử nước đi.");
            }
        } else if (request.positions().size() != request.moves().size() + 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Chuỗi PGN và danh sách vị trí không khớp nhau.");
        }
    }

    private String serializeRequest(CreateAnalysisJobRequest request) {
        try {
            return objectMapper.writeValueAsString(request);
        } catch (JsonProcessingException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Không thể đọc dữ liệu ván cờ.");
        }
    }

    private AnalysisJobResponse toResponse(AnalysisJob job, int fromEvaluation) {
        AnalysisResultResponse result = null;
        int evaluationsFrom = 0;
        if (job.getResultJson() != null && !job.getResultJson().isBlank()) {
            try {
                result = objectMapper.readValue(job.getResultJson(), AnalysisResultResponse.class);
            } catch (JsonProcessingException exception) {
                throw new IllegalStateException("Kết quả phân tích đã lưu không hợp lệ.", exception);
            }
            List<PositionEvaluationResponse> all = result.evaluations();
            evaluationsFrom = Math.max(0, Math.min(fromEvaluation, all.size()));
            result = new AnalysisResultResponse(
                    all.subList(evaluationsFrom, all.size()), result.moves(),
                    result.whiteAccuracy(), result.blackAccuracy(), result.averageDepth());
        }
        return new AnalysisJobResponse(
                job.getPublicId(), job.getSourceType(), job.getStatus(), job.getProgressPercent(),
                job.getCompletedPositions(), job.getTotalPositions(), job.getMinDepth(), job.getMaxDepth(),
                job.getCurrentPosition(), job.getErrorMessage(), result, evaluationsFrom, job.getCreatedAt(),
                job.getUpdatedAt(), job.getCompletedAt());
    }
}
