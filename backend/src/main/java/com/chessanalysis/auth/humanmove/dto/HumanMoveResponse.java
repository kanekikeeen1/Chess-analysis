package com.chessanalysis.auth.humanmove.dto;

import java.util.List;

/**
 * @param predictions mỗi phần tử ứng với một mức Elo trong request, cùng thứ tự
 * @param trainStep   bước huấn luyện của checkpoint đã xuất, để biết đang phục vụ mô hình nào
 * @param engineNote  lý do không có điểm Stockfish dù request có xin; {@code null} khi mọi thứ ổn
 */
public record HumanMoveResponse(String fen, List<LevelPrediction> predictions, Integer trainStep, String engineNote) {

    /** @param level nhãn dải Elo mà mô hình xếp mức này vào, ví dụ {@code 1200-1399} */
    public record LevelPrediction(int elo, String level, List<ScoredMove> moves) {}

    /**
     * @param pawns điểm Stockfish sau nước này, tính theo phía Trắng như mọi chỗ khác trong ứng dụng;
     *              {@code null} khi không chấm điểm
     * @param mate  số nước tới chiếu hết (dương: Trắng thắng), nếu có
     */
    public record ScoredMove(String uci, String san, double probability, Double pawns, Integer mate) {}
}
