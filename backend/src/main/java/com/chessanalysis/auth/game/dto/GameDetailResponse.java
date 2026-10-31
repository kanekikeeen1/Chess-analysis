package com.chessanalysis.auth.game.dto;

import java.time.Instant;

public record GameDetailResponse(
        Long id,
        String title,
        String whitePlayer,
        String blackPlayer,
        String result,
        String sourceType,
        String pgn,
        String initialFen,
        String finalFen,
        String openingEco,
        String openingName,
        Double whiteAccuracy,
        Double blackAccuracy,
        Integer depth,
        Integer moveCount,
        String analysisJson,
        Instant createdAt,
        Instant updatedAt,
        String userSide,
        Integer estimatedElo,
        Integer eloStdError) {}
