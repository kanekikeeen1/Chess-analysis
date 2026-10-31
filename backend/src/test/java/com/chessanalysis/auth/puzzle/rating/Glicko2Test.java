package com.chessanalysis.auth.puzzle.rating;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

class Glicko2Test {
    /** Không có sàn RD, để so đúng với ví dụ của bài báo. */
    private final Glicko2 glicko = new Glicko2(0.5, 0);

    @Test
    void reproducesWorkedExampleFromGlickmansPaper() {
        // Glickman (2012), mục "Example": người chơi 1500/200/0,06 gặp ba đối thủ.
        Glicko2.Rating updated = glicko.update(new Glicko2.Rating(1500, 200, 0.06), List.of(
                new Glicko2.Result(1400, 30, 1),
                new Glicko2.Result(1550, 100, 0),
                new Glicko2.Result(1700, 300, 0)));

        assertEquals(1464.06, updated.rating(), 0.01);
        assertEquals(151.52, updated.deviation(), 0.01);
        assertEquals(0.05999, updated.volatility(), 0.00001);
    }

    @Test
    void solvingRaisesRatingAndFailingLowersIt() {
        Glicko2.Rating start = Glicko2.Rating.initial();
        Glicko2.Rating solved = glicko.update(start, List.of(new Glicko2.Result(1500, 80, 1)));
        Glicko2.Rating failed = glicko.update(start, List.of(new Glicko2.Result(1500, 80, 0)));

        assertTrue(solved.rating() > start.rating());
        assertTrue(failed.rating() < start.rating());
        assertTrue(solved.deviation() < start.deviation(), "mỗi lượt giải làm hệ thống chắc chắn hơn");
    }

    @Test
    void beatingAHardPuzzleGainsMoreThanBeatingAnEasyOne() {
        Glicko2.Rating start = new Glicko2.Rating(1500, 120, 0.06);
        double easyGain = glicko.update(start, List.of(new Glicko2.Result(1100, 80, 1))).rating() - 1500;
        double hardGain = glicko.update(start, List.of(new Glicko2.Result(1900, 80, 1))).rating() - 1500;
        assertTrue(hardGain > easyGain * 3, "dễ +" + easyGain + ", khó +" + hardGain);
    }

    @Test
    void idlePeriodsGrowDeviationUpToTheInitialValue() {
        Glicko2.Rating settled = new Glicko2.Rating(1700, 60, 0.06);
        assertTrue(glicko.decay(settled, 30).deviation() > 60);
        assertEquals(350, glicko.decay(settled, 1_000_000).deviation(), 1e-9);
        assertEquals(settled, glicko.decay(settled, 0));
    }

    @Test
    void deviationFloorKeepsRatingResponsive() {
        // Với σ = 0,06 mỗi lượt giải lại cộng thêm độ bất định nên RD tự cân bằng quanh 50–60;
        // sàn chỉ có tác dụng khi σ đã giảm thấp ở người chơi rất ổn định.
        Glicko2.Rating settled = new Glicko2.Rating(1500, 50, 0.01);
        List<Glicko2.Result> game = List.of(new Glicko2.Result(1500, 80, 1));
        assertTrue(glicko.update(settled, game).deviation() < 50, "không có sàn, RD tiếp tục co lại");
        assertEquals(50, new Glicko2(0.5, 50).update(settled, game).deviation(), 1e-9);
    }

    @Test
    void expectedScoreIsHalfAgainstEqualOpponent() {
        assertEquals(0.5, Glicko2.expectedScore(Glicko2.Rating.initial(), 1500, 80), 1e-9);
        assertTrue(Glicko2.expectedScore(Glicko2.Rating.initial(), 1100, 80) > 0.85);
    }
}
