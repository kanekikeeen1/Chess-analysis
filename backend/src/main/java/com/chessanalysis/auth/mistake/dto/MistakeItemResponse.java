package com.chessanalysis.auth.mistake.dto;

/**
 * Một sai lầm để luyện lại. Không kèm nước tốt nhất: server chỉ tiết lộ khi người học
 * đã trả lời hoặc bỏ qua.
 */
public record MistakeItemResponse(
        Long id,
        String fen,
        String playerSide,
        Long gameId,
        String gameTitle,
        int moveNumber,
        String playedSan,
        String playedUci,
        String label,
        String phase,
        Double winPercentLoss) {}
