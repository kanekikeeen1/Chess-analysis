package com.chessanalysis.auth.analysis.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.chessanalysis.auth.analysis.dto.AnalysisMoveRequest;
import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;
import com.chessanalysis.auth.analysis.dto.MoveReviewResponse;
import com.chessanalysis.auth.analysis.dto.PositionEvaluationResponse;

class AnalysisClassifierTest {
    private static final String BEFORE_FEN = "rn4k1/8/8/8/8/8/8/1R4K1 w - - 0 1";
    private static final String AFTER_FEN = "rR4k1/8/8/8/8/8/8/6K1 b - - 0 1";
    private final AnalysisClassifier classifier = new AnalysisClassifier();

    @Test
    void marksSoundMaterialSacrificeAsBrilliantInCompetitivePosition() {
        MoveReviewResponse reviewed = classify(0.5, 1.0, 1.0, 0.0);
        assertEquals("brilliant", reviewed.assessmentKey());
    }

    @Test
    void downgradesSacrificeToBestWhenPositionWasAlreadyOverwhelming() {
        MoveReviewResponse reviewed = classify(8.0, 8.0, 8.0, 7.0);
        assertEquals("best", reviewed.assessmentKey());
    }

    private MoveReviewResponse classify(
            double beforeScore,
            double afterScore,
            double bestScore,
            double secondScore) {
        AnalysisMoveRequest move = new AnalysisMoveRequest(
                "Rxb8+", "b1b8", BEFORE_FEN, AFTER_FEN,
                false, null, true, true, false, false,
                true, false, 2.0, "MOVED", 20);
        PositionEvaluationResponse before = evaluation(
                0, BEFORE_FEN, beforeScore,
                List.of(variation(bestScore, "b1b8"), variation(secondScore, "g1f2")));
        PositionEvaluationResponse after = evaluation(
                1, AFTER_FEN, afterScore,
                List.of(variation(afterScore, "a8b8")));
        return classifier.classify(List.of(move), List.of(before, after)).get(0);
    }

    private PositionEvaluationResponse evaluation(
            int index,
            String fen,
            double score,
            List<EngineVariationResponse> variations) {
        return new PositionEvaluationResponse(
                index, fen, 16, null, variations.get(0).moves(), score, variations);
    }

    private EngineVariationResponse variation(double score, String move) {
        return new EngineVariationResponse(16, null, List.of(move), score);
    }
}
