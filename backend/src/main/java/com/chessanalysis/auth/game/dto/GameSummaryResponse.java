package com.chessanalysis.auth.game.dto;

import java.time.Instant;

public record GameSummaryResponse(
        Long id,
        String title,
        String whitePlayer,
        String blackPlayer,
        String result,
        String sourceType,
        String openingEco,
        String openingName,
        Double whiteAccuracy,
        Double blackAccuracy,
        Integer depth,
        Integer moveCount,
        Instant createdAt) {}
