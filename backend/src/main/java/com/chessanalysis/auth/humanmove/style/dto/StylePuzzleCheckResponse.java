package com.chessanalysis.auth.humanmove.style.dto;

import java.util.List;

/**
 * Kết quả một lần đoán. Mọi điểm {@code cp} nhìn từ bên đi.
 *
 * @param verdict            {@code match} trùng nước kỳ thủ · {@code good} khác nhưng Stockfish đánh giá ngang nước
 *                           tốt nhất (kém ≤ 50 cp) · {@code weak} kém hơn · {@code unknown} không chấm được
 * @param answerProbability  mô hình phong cách gán bao nhiêu xác suất cho nước kỳ thủ đã đi; null khi chưa nạp mô hình
 * @param userProbability    như trên, cho nước của người dùng
 * @param result             kết quả ván gốc nhìn từ kỳ thủ: 1 thắng, 0 hòa, -1 thua
 * @param engine             các nước tốt nhất theo Stockfish khi dựng puzzle
 */
public record StylePuzzleCheckResponse(
        boolean correct,
        String verdict,
        String answerUci,
        String answerSan,
        String userSan,
        Integer userCp,
        int answerCp,
        int bestCp,
        Double answerProbability,
        Double userProbability,
        Integer result,
        List<EngineLine> engine) {

    public record EngineLine(String uci, String san, int cp) {}
}
