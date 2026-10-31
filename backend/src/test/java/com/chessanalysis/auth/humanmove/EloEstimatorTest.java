package com.chessanalysis.auth.humanmove;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

class EloEstimatorTest {
    private static final int N = EloEstimator.GRID.length;

    @Test
    void gridCoversTheTenModelBucketCenters() {
        assertEquals(10, N);
        assertEquals(900.0, EloEstimator.GRID[0]);
        assertEquals(2700.0, EloEstimator.GRID[N - 1]);
    }

    @Test
    void flatLikelihoodFallsBackToThePrior() {
        EloEstimator.Estimate estimate = EloEstimator.posterior(new double[N], 0);
        // Tiên nghiệm N(1500, 400) cắt trên lưới 900..2700: kỳ vọng hơi lệch lên vì lưới không đối xứng quanh 1500.
        assertEquals(1500, estimate.elo(), 60);
        assertEquals(400, estimate.stdError(), 60);
    }

    @Test
    void sharpLikelihoodPinsTheEstimateToItsPeak() {
        double[] curve = new double[N];
        for (int g = 0; g < N; g++) curve[g] = -0.002 * Math.pow(EloEstimator.GRID[g] - 2100, 2);
        EloEstimator.Estimate estimate = EloEstimator.posterior(curve, 80);
        assertEquals(2100, estimate.elo(), 25);
        assertTrue(estimate.stdError() < 60, "độ lệch chuẩn " + estimate.stdError());
        assertEquals(80, estimate.moves());
    }

    @Test
    void moreGamesNarrowTheEstimate() {
        double[] oneGame = new double[N];
        for (int g = 0; g < N; g++) oneGame[g] = -0.00002 * Math.pow(EloEstimator.GRID[g] - 1700, 2);
        double single = EloEstimator.posterior(oneGame, 40).stdError();
        double five = EloEstimator.posterior(EloEstimator.sum(List.of(oneGame, oneGame, oneGame, oneGame, oneGame)), 200)
                .stdError();
        assertTrue(five < single, single + " → " + five);
    }

    @Test
    void sumSkipsCurvesFromAnotherGrid() {
        double[] ones = new double[N];
        Arrays.fill(ones, 1.0);
        double[] total = EloEstimator.sum(Arrays.asList(ones, new double[N + 9], null, ones));
        double[] expected = new double[N];
        Arrays.fill(expected, 2.0);
        assertArrayEquals(expected, total);
    }
}
