package com.chessanalysis.auth.analysis.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;
import com.chessanalysis.auth.analysis.dto.EvaluateMoveResponse;
import com.chessanalysis.auth.analysis.dto.PositionEvaluationResponse;

/**
 * Chấm một nước đi đơn lẻ bằng Stockfish (dùng cho bài tàn cuộc).
 *
 * <p>Mọi tham số đều do server tạo ra: FEN trước/sau và cờ chiếu hết được tính bằng
 * luật cờ phía server trong {@code ExerciseSessionService}, không lấy từ trình duyệt.
 */
@Service
public class MoveEvaluationService {
    private final EngineAnalysisService engineAnalysis;
    private final AnalysisClassifier classifier;

    public MoveEvaluationService(EngineAnalysisService engineAnalysis, AnalysisClassifier classifier) {
        this.engineAnalysis = engineAnalysis;
        this.classifier = classifier;
    }

    public EvaluateMoveResponse evaluate(String beforeFen, String afterFen, String playedUci, boolean checkmate, int depth) {
        try (EngineAnalysisService.Session session = engineAnalysis.openSession()) {
            PositionEvaluationResponse before = session.analyze(beforeFen, depth, 0);
            boolean whiteMoved = FenNormalizer.whiteToMove(beforeFen);
            PositionEvaluationResponse after;
            if (checkmate) {
                double winningScore = whiteMoved ? 100.0 : -100.0;
                int mate = whiteMoved ? 1 : -1;
                EngineVariationResponse terminal = new EngineVariationResponse(depth, mate, List.of(), winningScore);
                after = new PositionEvaluationResponse(1, afterFen, depth, mate, List.of(), winningScore, List.of(terminal));
            } else {
                after = session.analyze(afterFen, depth, 1);
            }
            String bestMove = before.moves().isEmpty() ? null : before.moves().get(0);
            String opponentReply = after.moves().isEmpty() ? null : after.moves().get(0);
            boolean isBest = bestMove != null && bestMove.equals(playedUci);
            double loss = classifier.loss(before.pawns(), after.pawns(), whiteMoved);
            String key = checkmate ? "best" : classifier.simpleAssessment(before.pawns(), after.pawns(), whiteMoved, isBest);
            String detail = switch (key) {
                case "best" -> checkmate ? "Nước chiếu hết và hoàn thành bài tàn cuộc" : "Nước đi tốt nhất theo Stockfish";
                case "excellent" -> "Rất sát với nước tốt nhất";
                case "okay" -> "Nước đi chấp nhận được";
                case "inaccuracy" -> "Chưa chính xác; hãy thử gợi ý của Stockfish";
                case "mistake" -> "Sai lầm làm giảm đáng kể cơ hội hoàn thành bài";
                default -> "Blunder; hãy quay lại và triển khai nước tốt nhất";
            };
            return new EvaluateMoveResponse(key, detail, loss, bestMove, opponentReply, before, after);
        }
    }
}
