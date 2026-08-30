package com.chessanalysis.auth.analysis.dto;

public record EvaluateMoveResponse(
        String assessmentKey,
        String detail,
        double loss,
        String bestMove,
        String opponentReply,
        PositionEvaluationResponse before,
        PositionEvaluationResponse after) {}
