package com.chessanalysis.auth.analysis.dto;

import java.time.Instant;

public record AnalysisJobResponse(
        String publicId,
        String sourceType,
        String status,
        int progressPercent,
        int completedPositions,
        int totalPositions,
        int minDepth,
        int maxDepth,
        Integer currentPosition,
        String errorMessage,
        AnalysisResultResponse result,
        /** Chỉ số vị trí đầu tiên trong {@code result.evaluations}; các vị trí trước đó client đã có. */
        int evaluationsFrom,
        Instant createdAt,
        Instant updatedAt,
        Instant completedAt) {}
