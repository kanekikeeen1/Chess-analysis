package com.chessanalysis.auth.analysis.service;

import java.time.Instant;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.analysis.dto.AnalysisJobResponse;
import com.chessanalysis.auth.analysis.dto.AnalysisResultResponse;
import com.chessanalysis.auth.analysis.dto.CreateAnalysisJobRequest;
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
    private final AnalysisWorker worker;
    private final AuthService authService;
    private final ObjectMapper objectMapper;

    public AnalysisJobService(
            AnalysisJobRepository jobs,
            AnalysisWorker worker,
            AuthService authService,
            ObjectMapper objectMapper) {
        this.jobs = jobs;
        this.worker = worker;
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
        worker.process(job.getId(), request);
        return toResponse(job);
    }

    @Transactional(readOnly = true)
    public AnalysisJobResponse get(String publicId) {
        return toResponse(jobs.findByPublicId(publicId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy tác vụ phân tích.")));
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

    private AnalysisJobResponse toResponse(AnalysisJob job) {
        AnalysisResultResponse result = null;
        if (job.getResultJson() != null && !job.getResultJson().isBlank()) {
            try {
                result = objectMapper.readValue(job.getResultJson(), AnalysisResultResponse.class);
            } catch (JsonProcessingException exception) {
                throw new IllegalStateException("Kết quả phân tích đã lưu không hợp lệ.", exception);
            }
        }
        return new AnalysisJobResponse(
                job.getPublicId(), job.getSourceType(), job.getStatus(), job.getProgressPercent(),
                job.getCompletedPositions(), job.getTotalPositions(), job.getMinDepth(), job.getMaxDepth(),
                job.getCurrentPosition(), job.getErrorMessage(), result, job.getCreatedAt(),
                job.getUpdatedAt(), job.getCompletedAt());
    }
}
