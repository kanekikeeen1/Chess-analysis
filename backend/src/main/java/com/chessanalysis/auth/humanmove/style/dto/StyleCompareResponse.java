package com.chessanalysis.auth.humanmove.style.dto;

import java.util.List;

/**
 * Mọi kỳ thủ trên cùng một thế cờ, mỗi nước kèm điểm Stockfish nếu chấm được.
 *
 * @param engineNote lý do không có điểm Stockfish (bận, lỗi cấu hình); null khi chấm được hoặc không yêu cầu
 */
public record StyleCompareResponse(String fen, List<StyleMoveResponse> styles, String engineNote) {}
