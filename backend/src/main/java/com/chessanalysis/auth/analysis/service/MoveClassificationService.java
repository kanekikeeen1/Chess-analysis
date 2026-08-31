package com.chessanalysis.auth.analysis.service;

import java.util.ArrayList;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.chessanalysis.auth.analysis.dto.ClassifyMovesRequest;
import com.chessanalysis.auth.analysis.dto.ClassifyMovesResponse;
import com.chessanalysis.auth.analysis.dto.MoveReviewResponse;
import com.chessanalysis.auth.analysis.dto.PositionEvaluationRequest;
import com.chessanalysis.auth.analysis.dto.PositionEvaluationResponse;
import com.chessanalysis.auth.service.ApiException;

/**
 * Gán nhãn cho các nước đã có đánh giá engine, không đụng tới Stockfish.
 *
 * <p>Đây là điểm nối để M1 thay bộ luật ngưỡng bằng mô hình: chỉ cần đổi phần
 * thân của {@link #classify}, mọi nơi trong hệ thống đổi theo.
 */
@Service
public class MoveClassificationService {
    private final AnalysisClassifier classifier;

    public MoveClassificationService(AnalysisClassifier classifier) {
        this.classifier = classifier;
    }

    public ClassifyMovesResponse classify(ClassifyMovesRequest request) {
        if (request.evaluations().size() != request.moves().size() + 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Cần đúng N+1 đánh giá cho N nước đi.");
        }
        List<PositionEvaluationResponse> evaluations = new ArrayList<>(request.evaluations().size());
        for (int index = 0; index < request.evaluations().size(); index++) {
            PositionEvaluationRequest evaluation = request.evaluations().get(index);
            evaluations.add(evaluation.toResponse(index));
        }
        List<MoveReviewResponse> reviewed = classifier.classify(request.moves(), evaluations);
        return new ClassifyMovesResponse(
                reviewed,
                averageAccuracy(reviewed, true),
                averageAccuracy(reviewed, false),
                "rules");
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
}
