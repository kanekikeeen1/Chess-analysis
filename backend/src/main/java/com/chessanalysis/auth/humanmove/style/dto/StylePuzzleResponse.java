package com.chessanalysis.auth.humanmove.style.dto;

/**
 * Một puzzle "Tìm nước kiện tướng đã đi", chưa kèm lời giải.
 *
 * @param color     kỳ thủ cầm quân gì trong ván gốc (cũng là bên đi ở {@code fen})
 * @param poolSize  số puzzle hiện có của lựa chọn này
 */
public record StylePuzzleResponse(
        String id,
        String style,
        String displayName,
        String fen,
        int ply,
        String date,
        String speed,
        String color,
        Integer elo,
        Integer opponentElo,
        int poolSize) {}
