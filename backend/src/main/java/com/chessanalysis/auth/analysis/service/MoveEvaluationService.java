package com.chessanalysis.auth.analysis.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;
import com.chessanalysis.auth.analysis.dto.EvaluateMoveRequest;
import com.chessanalysis.auth.analysis.dto.EvaluateMoveResponse;
import com.chessanalysis.auth.analysis.dto.PositionEvaluationResponse;

@Service
public class MoveEvaluationService {
    private final EngineAnalysisService engineAnalysis;
    private final AnalysisClassifier classifier;

    public MoveEvaluationService(EngineAnalysisService engineAnalysis, AnalysisClassifier classifier) {
        this.engineAnalysis = engineAnalysis;
        this.classifier = classifier;
    }

    public EvaluateMoveResponse evaluate(EvaluateMoveRequest request) {
        int depth = request.depth() == null ? 18 : Math.max(16, Math.min(20, request.depth()));
        try (EngineAnalysisService.Session session = engineAnalysis.openSession()) {
            PositionEvaluationResponse before = session.analyze(request.beforeFen(), depth, 0);
            boolean whiteMoved = request.beforeFen().split("\\s+")[1].equals("w");
            PositionEvaluationResponse after;
            if (request.checkmate()) {
                double winningScore = whiteMoved ? 100.0 : -100.0;
                int mate = whiteMoved ? 1 : -1;
                EngineVariationResponse terminal = new EngineVariationResponse(
                        depth, mate, List.of(), winningScore);
                after = new PositionEvaluationResponse(
                        1, request.afterFen(), depth, mate, List.of(), winningScore, List.of(terminal));
            } else {
                after = session.analyze(request.afterFen(), depth, 1);
            }
            String bestMove = before.moves().isEmpty() ? null : before.moves().get(0);
            String opponentReply = after.moves().isEmpty() ? null : after.moves().get(0);
            boolean isBest = bestMove != null && normalize(bestMove).equals(normalize(request.playedUci()));
            double loss = classifier.loss(before.pawns(), after.pawns(), whiteMoved);
            String key = request.checkmate()
                    ? "best"
                    : classifier.simpleAssessment(before.pawns(), after.pawns(), whiteMoved, isBest);
            String detail = switch (key) {
                case "best" -> request.checkmate()
                        ? "Nước chiếu hết và hoàn thành bài tàn cuộc"
                        : "Nước đi tốt nhất theo Stockfish";
                case "excellent" -> "Rất sát với nước tốt nhất";
                case "okay" -> "Nước đi chấp nhận được";
                case "inaccuracy" -> "Chưa chính xác; hãy thử gợi ý của Stockfish";
                case "mistake" -> "Sai lầm làm giảm đáng kể cơ hội hoàn thành bài";
                default -> "Blunder; hãy quay lại và triển khai nước tốt nhất";
            };
            return new EvaluateMoveResponse(key, detail, loss, bestMove, opponentReply, before, after);
        }
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }
}
