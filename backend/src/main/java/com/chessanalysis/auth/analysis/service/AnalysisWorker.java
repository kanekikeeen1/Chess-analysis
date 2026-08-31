package com.chessanalysis.auth.analysis.service;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.chessanalysis.auth.analysis.dto.AnalysisMoveRequest;
import com.chessanalysis.auth.analysis.dto.AnalysisResultResponse;
import com.chessanalysis.auth.analysis.dto.CreateAnalysisJobRequest;
import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;
import com.chessanalysis.auth.analysis.dto.MoveReviewResponse;
import com.chessanalysis.auth.analysis.dto.PositionEvaluationResponse;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class AnalysisWorker {
    private static final Logger LOGGER = LoggerFactory.getLogger(AnalysisWorker.class);

    private final EngineAnalysisService engineAnalysis;
    private final AnalysisClassifier classifier;
    private final AnalysisJobStateService state;
    private final ObjectMapper objectMapper;

    public AnalysisWorker(
            EngineAnalysisService engineAnalysis,
            AnalysisClassifier classifier,
            AnalysisJobStateService state,
            ObjectMapper objectMapper) {
        this.engineAnalysis = engineAnalysis;
        this.classifier = classifier;
        this.state = state;
        this.objectMapper = objectMapper;
    }

    /**
     * Chạy đồng bộ trên luồng của {@link AnalysisJobQueue}. Trước đây phương
     * thức này mang {@code @Async}, nghĩa là không có cách nào biết còn bao
     * nhiêu tác vụ đang chờ hay từ chối lịch sự khi quá tải.
     */
    public void process(Long jobId, CreateAnalysisJobRequest request) {
        state.markRunning(jobId);
        List<PositionEvaluationResponse> evaluations = new ArrayList<>();

        try (EngineAnalysisService.Session session = engineAnalysis.openSession()) {
            for (int index = 0; index < request.positions().size(); index++) {
                String fen = request.positions().get(index);
                int depth = targetDepth(request, index, fen);
                AnalysisMoveRequest previousMove = index > 0
                        ? request.moves().get(index - 1)
                        : null;
                PositionEvaluationResponse evaluation;
                if (previousMove != null && previousMove.checkmate()) {
                    // Một số bản Stockfish chỉ trả `bestmove (none)` cho vị trí
                    // đã chiếu hết và không gửi dòng PV. Tự tạo điểm kết thúc để
                    // một ván PGN hợp lệ không làm hỏng toàn bộ tác vụ review.
                    boolean whiteWon = previousMove.beforeFen().split("\\s+")[1].equals("w");
                    double winningScore = whiteWon ? 100.0 : -100.0;
                    int mate = whiteWon ? 1 : -1;
                    List<EngineVariationResponse> terminalVariations = List.of(
                            new EngineVariationResponse(depth, mate, List.of(), winningScore));
                    evaluation = new PositionEvaluationResponse(
                            index, fen, depth, mate, List.of(), winningScore, terminalVariations);
                } else {
                    evaluation = session.analyze(fen, depth, index);
                }
                evaluations.add(evaluation);
                AnalysisResultResponse partial = new AnalysisResultResponse(
                        List.copyOf(evaluations), List.of(), null, null, averageDepth(evaluations));
                state.progress(jobId, index + 1, index, json(partial));
            }

            List<MoveReviewResponse> reviewedMoves = request.moves().isEmpty()
                    ? List.of()
                    : classifier.classify(request.moves(), evaluations);
            Double whiteAccuracy = averageAccuracy(reviewedMoves, true);
            Double blackAccuracy = averageAccuracy(reviewedMoves, false);
            AnalysisResultResponse result = new AnalysisResultResponse(
                    List.copyOf(evaluations), reviewedMoves, whiteAccuracy, blackAccuracy,
                    averageDepth(evaluations));
            state.complete(jobId, json(result));
            LOGGER.info("Tác vụ {} xong: {} vị trí, {} lấy từ cache, {} lần chạy engine",
                    jobId, request.positions().size(), session.cacheHits(), session.engineRuns());
        } catch (Exception exception) {
            LOGGER.error("Analysis job {} failed", jobId, exception);
            state.fail(jobId, rootMessage(exception));
        }
    }

    private int targetDepth(CreateAnalysisJobRequest request, int positionIndex, String fen) {
        int minDepth = request.minDepth();
        int maxDepth = request.maxDepth();
        if (request.sourceType().equals("FEN")) return maxDepth;
        AnalysisMoveRequest previous = positionIndex > 0 && positionIndex - 1 < request.moves().size()
                ? request.moves().get(positionIndex - 1) : null;
        AnalysisMoveRequest next = positionIndex < request.moves().size()
                ? request.moves().get(positionIndex) : null;
        boolean theory = previous != null && previous.theory() || next != null && next.theory();
        if (positionIndex <= 12 || theory) return minDepth;

        long pieces = fen.substring(0, fen.indexOf(' ')).chars()
                .filter(character -> "prnbqkPRNBQK".indexOf(character) >= 0)
                .count();
        if (pieces <= 14) return maxDepth;
        if (previous != null && (previous.capture() || previous.check() || previous.promotion())) {
            return Math.max(minDepth, maxDepth - 1);
        }
        if (positionIndex >= 30) return Math.max(minDepth, maxDepth - 1);
        return Math.min(maxDepth, minDepth + Math.max(1, (maxDepth - minDepth) / 2));
    }

    private Double averageAccuracy(List<MoveReviewResponse> moves, boolean white) {
        return moves.stream()
                .filter(move -> ((move.index() - 1) % 2 == 0) == white)
                .map(MoveReviewResponse::accuracy)
                .filter(value -> value != null)
                .mapToDouble(Double::doubleValue)
                .average()
                .stream().boxed().findFirst().orElse(null);
    }

    private Double averageDepth(List<PositionEvaluationResponse> evaluations) {
        return evaluations.stream().mapToInt(PositionEvaluationResponse::depth).average()
                .stream().boxed().findFirst().orElse(null);
    }

    private String json(AnalysisResultResponse result) {
        try {
            return objectMapper.writeValueAsString(result);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Không thể đóng gói kết quả phân tích.", exception);
        }
    }

    private String rootMessage(Exception exception) {
        Throwable current = exception;
        while (current.getCause() != null) current = current.getCause();
        String message = current.getMessage();
        return message == null || message.isBlank() ? "Stockfish không thể hoàn thành phân tích." : message;
    }
}
