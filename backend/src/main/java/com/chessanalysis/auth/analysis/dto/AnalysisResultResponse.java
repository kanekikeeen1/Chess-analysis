package com.chessanalysis.auth.analysis.dto;

import java.util.List;

public record AnalysisResultResponse(
        List<PositionEvaluationResponse> evaluations,
        List<MoveReviewResponse> moves,
        Double whiteAccuracy,
        Double blackAccuracy,
        Double averageDepth) {}
