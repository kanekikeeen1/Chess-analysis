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
    private static final int OPENING_MIN_POSITIONS = 12;
    private static final int ENDGAME_MAX_PIECES = 14;

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
        int openingEnd = openingEnd(request);

        try (EngineAnalysisService.Session session = engineAnalysis.openSession()) {
            for (int index = 0; index < request.positions().size(); index++) {
                String fen = request.positions().get(index);
                int depth = targetDepth(request, index, fen, openingEnd);
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
            EvaluationMath.GameAccuracy accuracy = EvaluationMath.gameAccuracy(
                    evaluations.stream().map(PositionEvaluationResponse::pawns).toList(),
                    FenNormalizer.whiteToMove(request.positions().get(0)));
            AnalysisResultResponse result = new AnalysisResultResponse(
                    List.copyOf(evaluations), reviewedMoves, accuracy.white(), accuracy.black(),
                    averageDepth(evaluations));
            state.complete(jobId, json(result));
            LOGGER.info("Tác vụ {} xong: {} vị trí, {} lấy từ cache, {} lần chạy engine",
                    jobId, request.positions().size(), session.cacheHits(), session.engineRuns());
        } catch (Exception exception) {
            LOGGER.error("Analysis job {} failed", jobId, exception);
            state.fail(jobId, rootMessage(exception));
        }
    }

    /**
     * Depth theo giai đoạn ván: khai cuộc → mức thấp, trung cuộc → mức giữa, tàn
     * cuộc → mức cao. Mỗi nước được chấm bằng hiệu đánh giá giữa hai vị trí liền
     * nhau, nên hai vị trí đó cần cùng depth; nếu không, chênh lệch do depth khác
     * nhau bị tính nhầm thành lỗi của người chơi. Bản trước tăng depth ngay sau
     * mỗi nước bắt quân/chiếu, khiến depth nhảy lên xuống liên tục giữa trung cuộc.
     * Ở đây cả ba điều kiện đều đơn điệu theo thời gian (vị trí tăng dần, số quân
     * chỉ giảm), nên depth chỉ đổi tối đa hai lần trong một ván.
     */
    private int targetDepth(CreateAnalysisJobRequest request, int positionIndex, String fen, int openingEnd) {
        int minDepth = request.minDepth();
        int maxDepth = request.maxDepth();
        if (request.sourceType().equals("FEN")) return maxDepth;
        if (FenNormalizer.pieceCount(fen) <= ENDGAME_MAX_PIECES) return maxDepth;
        if (positionIndex <= openingEnd) return minDepth;
        return minDepth + (maxDepth - minDepth) / 2;
    }

    /**
     * Vị trí cuối cùng còn thuộc khai cuộc: ít nhất 12 nửa nước đầu, kéo dài thêm
     * nếu chuỗi nước lý thuyết liên tục từ đầu ván dài hơn. Chỉ tính phần lý
     * thuyết liền mạch để một lần chuyển hóa về thế trong sách ở giữa ván không
     * kéo depth ngược trở xuống.
     */
    private int openingEnd(CreateAnalysisJobRequest request) {
        int leadingTheory = 0;
        while (leadingTheory < request.moves().size() && request.moves().get(leadingTheory).theory()) {
            leadingTheory++;
        }
        return Math.max(OPENING_MIN_POSITIONS, leadingTheory);
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
