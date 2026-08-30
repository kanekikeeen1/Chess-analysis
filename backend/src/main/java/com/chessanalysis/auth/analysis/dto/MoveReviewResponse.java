package com.chessanalysis.auth.analysis.dto;

public record MoveReviewResponse(
        int index,
        String san,
        String uci,
        String assessmentKey,
        String detail,
        double loss,
        Double accuracy,
        Double evaluation,
        Integer depth,
        String bestMove) {}
