package com.chessanalysis.auth.humanmove.style.dto;

import java.util.List;

import com.chessanalysis.auth.humanmove.dto.HumanMoveResponse.ScoredMove;

/**
 * @param source    {@code book} khi lấy từ sổ khai cuộc của kỳ thủ, {@code model} khi lấy từ mô hình phong cách
 * @param bookGames số lần kỳ thủ đã gặp thế cờ này trong dữ liệu (chỉ khi {@code source = book})
 * @param moves     xác suất: tần suất trong sổ, hoặc xác suất của mô hình; không có điểm Stockfish
 */
public record StyleMoveResponse(String fen, String style, String source, Integer bookGames, List<ScoredMove> moves) {}
