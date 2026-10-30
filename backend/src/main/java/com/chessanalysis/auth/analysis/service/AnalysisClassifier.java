package com.chessanalysis.auth.analysis.service;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

import com.chessanalysis.auth.analysis.dto.AnalysisMoveRequest;
import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;
import com.chessanalysis.auth.analysis.dto.MoveReviewResponse;
import com.chessanalysis.auth.analysis.dto.PositionEvaluationResponse;

@Component
public class AnalysisClassifier {
    /*
     * Ngưỡng nhãn theo phần trăm cơ hội thắng mà bên vừa đi đánh mất (thang 0–100).
     * Ba mốc inaccuracy/mistake/blunder trùng với Lichess (0,1/0,2/0,3 trên thang
     * winning chances [-1, 1], tức 5/10/15 điểm win%). Trước đây mỗi mốc còn được
     * OR thêm một ngưỡng centipawn, nên trong thế cân bằng mất 1,4 tốt (≈13% win)
     * chỉ bị gọi là "inaccuracy"; giờ chỉ còn một thước đo.
     */
    static final double EXCELLENT_MAX_LOSS = 2;
    static final double OKAY_MAX_LOSS = 5;
    static final double INACCURACY_MAX_LOSS = 10;
    static final double MISTAKE_MAX_LOSS = 15;
    /**
     * Một nước trong sách ECO chỉ được gọi là "Theory" khi engine cũng không xem
     * nó là sai sót. Sách ECO chứa cả những dòng yếu (Grob, Barnes…), và trước
     * đây mọi nước trong sách đều nhận accuracy 100 bất kể đánh giá.
     */
    static final double THEORY_MAX_LOSS = OKAY_MAX_LOSS;

    public List<MoveReviewResponse> classify(
            List<AnalysisMoveRequest> moves,
            List<PositionEvaluationResponse> evaluations) {
        List<MoveReviewResponse> result = new ArrayList<>();
        for (int index = 0; index < moves.size(); index++) {
            AnalysisMoveRequest move = moves.get(index);
            PositionEvaluationResponse before = evaluations.get(index);
            PositionEvaluationResponse after = evaluations.get(index + 1);
            boolean whiteMoved = move.beforeFen().split("\\s+")[1].equals("w");
            double rawLoss = Math.max(0, whiteMoved
                    ? before.pawns() - after.pawns()
                    : after.pawns() - before.pawns());
            double accuracy = accuracy(before.pawns(), after.pawns(), whiteMoved);
            double chanceLoss = chanceLoss(before.pawns(), after.pawns(), whiteMoved);
            boolean confirmedTheory = move.theory() && chanceLoss < THEORY_MAX_LOSS;
            String bestMove = before.variations().isEmpty() || before.variations().get(0).moves().isEmpty()
                    ? null : normalize(before.variations().get(0).moves().get(0));
            boolean isBest = bestMove != null && bestMove.equals(normalize(move.uci()));

            Assessment assessment;
            if (move.checkmate()) {
                assessment = new Assessment("best", "Nước chiếu hết ván đấu");
            } else if (move.legalMoveCount() == 1) {
                assessment = new Assessment("forced", "Nước hợp lệ duy nhất trong vị trí này");
            } else if (confirmedTheory) {
                assessment = new Assessment("theory", move.theoryName() == null
                        ? "Nước lý thuyết khai cuộc"
                        : "Khai cuộc: " + move.theoryName());
            } else {
                assessment = engineAssessment(move, before, after, whiteMoved, rawLoss, chanceLoss, isBest);
            }

            result.add(new MoveReviewResponse(
                    index + 1, move.san(), move.uci(), assessment.key(), assessment.detail(),
                    rawLoss, accuracy, after.pawns(), after.depth(), bestMove));
        }
        return result;
    }

    public String simpleAssessment(double before, double after, boolean whiteMoved, boolean isBest) {
        if (isBest) return "best";
        return lossKey(chanceLoss(before, after, whiteMoved));
    }

    /** Nhãn chỉ theo mức mất win%, dùng chung cho Game Review và bài tập. */
    static String lossKey(double chanceLoss) {
        if (chanceLoss < EXCELLENT_MAX_LOSS) return "excellent";
        if (chanceLoss < OKAY_MAX_LOSS) return "okay";
        if (chanceLoss < INACCURACY_MAX_LOSS) return "inaccuracy";
        if (chanceLoss < MISTAKE_MAX_LOSS) return "mistake";
        return "blunder";
    }

    public double loss(double before, double after, boolean whiteMoved) {
        return Math.max(0, whiteMoved ? before - after : after - before);
    }

    private Assessment engineAssessment(
            AnalysisMoveRequest move,
            PositionEvaluationResponse before,
            PositionEvaluationResponse after,
            boolean whiteMoved,
            double rawLoss,
            double chanceLoss,
            boolean isBest) {
        double moverAfter = whiteMoved ? after.pawns() : -after.pawns();
        double moverBefore = whiteMoved ? before.pawns() : -before.pawns();
        EngineVariationResponse first = before.variations().isEmpty() ? null : before.variations().get(0);
        EngineVariationResponse second = before.variations().size() < 2 ? null : before.variations().get(1);
        double gap = first == null || second == null ? 0 : Math.max(0,
                whiteMoved ? first.pawns() - second.pawns() : second.pawns() - first.pawns());
        boolean mateForMover = after.mate() != null && (whiteMoved ? after.mate() > 0 : after.mate() < 0);
        // Chess.com's exact implementation is proprietary. These named rules
        // deliberately mirror the three public conditions: a real material
        // sacrifice, a sound result, and a position that was still competitive.
        boolean realPieceSacrifice = (move.sacrificeCandidate() || move.abandonedPieceCandidate())
                && move.sacrificeValue() >= 0.75;
        boolean soundAfterSacrifice = rawLoss <= 0.35 && chanceLoss <= 2.5
                && moverAfter >= -0.5 && moverAfter >= moverBefore - 0.35;
        boolean competitivePosition = moverBefore >= -3.0 && moverBefore <= 5.0;
        boolean clearTacticalBenefit = mateForMover || moverAfter >= 0.75 || gap >= 0.8;
        boolean brilliant = isBest && realPieceSacrifice && soundAfterSacrifice
                && competitivePosition && clearTacticalBenefit;
        if (brilliant) {
            String detail = "ABANDONED".equals(move.sacrificeKind())
                    ? mateForMover
                        ? "Bỏ mặc quân đang bị tấn công để mở đòn chiếu hết"
                        : "Bỏ quân đang bị tấn công để tiếp tục phản công mà không mất thế trận"
                    : mateForMover
                        ? "Nước thí quân tốt dẫn tới chiếu hết"
                        : gap >= 0.8
                            ? "Nước thí quân tốt và là lựa chọn vượt trội để giữ thế trận"
                            : "Nước thí quân tốt tạo lợi ích chiến thuật rõ ràng";
            return new Assessment("brilliant", detail);
        }

        boolean critical = isBest && !mateForMover && move.legalMoveCount() >= 4 && gap >= 0.65
                && (gap >= 1.0 || moverAfter >= 0.35);
        if (critical) {
            return new Assessment("critical", "Nước gần như duy nhất giữ lợi thế và không dễ nhận ra");
        }
        if (isBest) return new Assessment("best", "Nước đi tốt nhất trong vị trí");
        String key = lossKey(chanceLoss);
        String detail = switch (key) {
            case "excellent" -> "Rất sát với nước tốt nhất";
            case "okay" -> "Nước đi chấp nhận được";
            case "inaccuracy" -> move.theory()
                    ? "Nằm trong sách khai cuộc nhưng engine thấy có lựa chọn tốt hơn"
                    : "Bỏ lỡ một lựa chọn chính xác hơn";
            case "mistake" -> "Làm tình hình xấu đi rõ rệt";
            default -> "Làm thay đổi lớn cục diện ván đấu";
        };
        return new Assessment(key, detail);
    }

    public double accuracy(double before, double after, boolean whiteMoved) {
        return EvaluationMath.accuracy(before, after, whiteMoved);
    }

    private double chanceLoss(double before, double after, boolean whiteMoved) {
        return EvaluationMath.chanceLoss(before, after, whiteMoved);
    }

    private String normalize(String uci) {
        return uci == null ? "" : uci.trim().toLowerCase().substring(0, Math.min(5, uci.trim().length()));
    }

    private record Assessment(String key, String detail) {}
}
