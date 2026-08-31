package com.chessanalysis.auth.analysis.dto;

import java.util.List;

public record ClassifyMovesResponse(
        List<MoveReviewResponse> moves,
        Double whiteAccuracy,
        Double blackAccuracy,
        /** Nguồn nhãn: "rules" ở M0/M1-baseline, "model" khi mô hình M1 vào chỗ. */
        String labelSource) {}
