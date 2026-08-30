package com.chessanalysis.auth.analysis.dto;

import java.util.List;

public record PositionEvaluationResponse(
        int positionIndex,
        String fen,
        int depth,
        Integer mate,
        List<String> moves,
        double pawns,
        List<EngineVariationResponse> variations) {}
