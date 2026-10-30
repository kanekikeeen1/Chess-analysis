package com.chessanalysis.auth.analysis.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

class EvaluationMathTest {
    @Test
    void perfectGameScoresNearHundredForBothSides() {
        EvaluationMath.GameAccuracy accuracy = EvaluationMath.gameAccuracy(List.of(0.2, 0.2, 0.2, 0.2, 0.2), true);
        assertEquals(100, accuracy.white(), 0.01);
        assertEquals(100, accuracy.black(), 0.01);
    }

    @Test
    void singleBlunderWeighsMoreThanInArithmeticMean() {
        // 40 nước chính xác của Trắng, rồi một blunder từ +0,3 xuống −4.
        List<Double> evaluations = new ArrayList<>();
        for (int index = 0; index < 81; index++) evaluations.add(0.3);
        evaluations.add(-4.0);
        evaluations.add(-4.0);

        EvaluationMath.GameAccuracy accuracy = EvaluationMath.gameAccuracy(evaluations, true);

        double arithmetic = 0;
        int whiteMoves = 0;
        for (int move = 0; move < evaluations.size() - 1; move += 2) {
            arithmetic += EvaluationMath.accuracy(evaluations.get(move), evaluations.get(move + 1), true);
            whiteMoves++;
        }
        arithmetic /= whiteMoves;
        assertTrue(accuracy.white() < arithmetic - 1,
                "game accuracy " + accuracy.white() + " phải thấp hơn rõ so với trung bình cộng " + arithmetic);
        assertEquals(100, accuracy.black(), 0.01);
    }

    @Test
    void respectsWhichSideMovesFirst() {
        // Ván bắt đầu từ FEN Đen đi: nước duy nhất là của Đen, Đen làm mất lợi thế.
        EvaluationMath.GameAccuracy accuracy = EvaluationMath.gameAccuracy(List.of(-1.0, 3.0), false);
        assertNull(accuracy.white());
        assertTrue(accuracy.black() < 50);
    }

    @Test
    void emptyGameHasNoAccuracy() {
        EvaluationMath.GameAccuracy accuracy = EvaluationMath.gameAccuracy(List.of(0.0), true);
        assertNull(accuracy.white());
        assertNull(accuracy.black());
    }

    @Test
    void labelThresholdsUseWinPercentOnly() {
        assertEquals("excellent", AnalysisClassifier.lossKey(1.9));
        assertEquals("okay", AnalysisClassifier.lossKey(4.9));
        assertEquals("inaccuracy", AnalysisClassifier.lossKey(5));
        assertEquals("mistake", AnalysisClassifier.lossKey(10));
        assertEquals("blunder", AnalysisClassifier.lossKey(15));
        // Thế cân bằng mất 1,4 tốt ≈ 12,7% win: trước đây là "inaccuracy" nhờ ngưỡng centipawn.
        assertEquals("mistake", AnalysisClassifier.lossKey(EvaluationMath.chanceLoss(0, -1.4, true)));
    }
}
