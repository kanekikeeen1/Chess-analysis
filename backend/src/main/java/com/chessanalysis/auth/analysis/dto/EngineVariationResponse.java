package com.chessanalysis.auth.analysis.dto;

import java.util.List;

public record EngineVariationResponse(
        int depth,
        Integer mate,
        List<String> moves,
        double pawns) {}
