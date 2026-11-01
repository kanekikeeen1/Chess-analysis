package com.chessanalysis.auth.humanmove.style.dto;

import java.util.List;

import com.chessanalysis.auth.humanmove.dto.HumanMoveResponse.ScoredMove;

/**
 * Góc nhìn của từng kiện tướng về một nước đã đi: họ có hay chọn nước đó không, và họ sẽ đi gì.
 *
 * @param played     nước đã đi, kèm điểm Stockfish nếu chấm được (xác suất luôn 0, không dùng)
 * @param engineNote lý do không có điểm Stockfish; null khi chấm được hoặc không yêu cầu
 */
public record StyleOpinionResponse(String fen, ScoredMove played, List<StyleOpinion> styles, String engineNote) {

    /**
     * @param source            {@code book}: theo ván thật của kỳ thủ ở đúng thế cờ này · {@code model}: theo mô hình
     * @param bookGames         số lần kỳ thủ gặp thế cờ này (chỉ khi {@code source = book})
     * @param playedCount       số lần kỳ thủ đi đúng nước đã đi (chỉ khi {@code source = book})
     * @param playedProbability tần suất trong sổ, hoặc xác suất mô hình gán cho nước đã đi
     * @param playedRank        thứ hạng của nước đã đi trong lựa chọn của kỳ thủ (0 = lựa chọn số 1)
     * @param top               3 nước kỳ thủ có khả năng chọn nhất, kèm điểm Stockfish nếu chấm được
     */
    public record StyleOpinion(String style, String displayName, String source, Integer bookGames, Integer playedCount,
            double playedProbability, int playedRank, List<ScoredMove> top) {}
}
