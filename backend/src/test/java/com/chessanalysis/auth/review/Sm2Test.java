package com.chessanalysis.auth.review;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class Sm2Test {
    @Test
    void intervalsGrowAsOneSixThenTimesEase() {
        Sm2.State state = Sm2.State.afterFirstFailure();
        state = Sm2.review(state, Sm2.CORRECT);
        assertEquals(1, state.intervalDays());
        state = Sm2.review(state, Sm2.CORRECT);
        assertEquals(6, state.intervalDays());
        state = Sm2.review(state, Sm2.CORRECT);
        assertEquals(15, state.intervalDays(), "6 × 2,5");
        state = Sm2.review(state, Sm2.CORRECT);
        assertEquals(38, state.intervalDays(), "15 × 2,5 = 37,5 làm tròn");
        assertEquals(2.5, state.ease(), 1e-9, "q = 4 giữ nguyên EF");
    }

    @Test
    void forgettingRestartsTheScheduleButKeepsEase() {
        Sm2.State learned = new Sm2.State(2.2, 4, 30);
        Sm2.State forgotten = Sm2.review(learned, Sm2.WRONG);
        assertEquals(new Sm2.State(2.2, 0, 1), forgotten);
    }

    @Test
    void easeChangesWithQualityAndNeverDropsBelowFloor() {
        assertEquals(2.6, Sm2.review(Sm2.State.afterFirstFailure(), 5).ease(), 1e-9);
        assertEquals(2.36, Sm2.review(Sm2.State.afterFirstFailure(), 3).ease(), 1e-9);
        Sm2.State hard = new Sm2.State(1.35, 3, 10);
        assertEquals(1.3, Sm2.review(hard, 3).ease(), 1e-9);
        assertThrows(IllegalArgumentException.class, () -> Sm2.review(hard, 6));
    }
}
