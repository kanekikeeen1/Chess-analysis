package com.chessanalysis.auth.puzzle.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.chessanalysis.auth.puzzle.entity.Puzzle;
import com.chessanalysis.auth.puzzle.entity.PuzzleAttempt;
import com.chessanalysis.auth.puzzle.entity.UserPuzzleRating;
import com.chessanalysis.auth.puzzle.rating.Glicko2;
import com.chessanalysis.auth.puzzle.repository.PuzzleAttemptRepository;
import com.chessanalysis.auth.puzzle.repository.PuzzleRepository;
import com.chessanalysis.auth.puzzle.repository.UserPuzzleRatingRepository;

class PuzzleServicesTest {
    private final UserPuzzleRatingRepository ratingRepository = mock(UserPuzzleRatingRepository.class);
    private final PuzzleAttemptRepository attemptRepository = mock(PuzzleAttemptRepository.class);
    private final PuzzleRatingService ratings = new PuzzleRatingService(ratingRepository, attemptRepository);

    @Test
    void firstSolveCreatesRatingAboveDefaultAndLogsAttempt() {
        when(ratingRepository.findForUpdate(7L)).thenReturn(Optional.empty());

        PuzzleRatingService.RatingChange change = ratings.record(7L, puzzle(11L, 1500), true);

        assertEquals(1500, change.before().rating(), 1e-9);
        assertTrue(change.delta() > 100, "người mới có RD 350 nên lượt đầu dịch chuyển mạnh: " + change.delta());
        ArgumentCaptor<PuzzleAttempt> attempt = ArgumentCaptor.forClass(PuzzleAttempt.class);
        verify(attemptRepository).save(attempt.capture());
        assertEquals(11L, attempt.getValue().getPuzzleId());
        assertTrue(attempt.getValue().isSolved());
        assertEquals(change.after().rating(), attempt.getValue().getRatingAfter(), 1e-9);
    }

    @Test
    void failingAPuzzleLowersAnEstablishedRatingModestly() {
        UserPuzzleRating existing = new UserPuzzleRating(7L, new Glicko2.Rating(1800, 60, 0.06), Instant.now());
        when(ratingRepository.findForUpdate(7L)).thenReturn(Optional.of(existing));

        PuzzleRatingService.RatingChange change = ratings.record(7L, puzzle(12L, 1800), false);

        assertTrue(change.delta() < 0 && change.delta() > -15, "rating ổn định chỉ giảm ít: " + change.delta());
        assertEquals(1, existing.getAttempts());
        assertEquals(0, existing.getSolved());
    }

    @Test
    void longBreakMakesRatingLessCertain() {
        UserPuzzleRating existing = new UserPuzzleRating(7L, new Glicko2.Rating(1800, 60, 0.06),
                Instant.now().minus(120, ChronoUnit.DAYS));
        when(ratingRepository.findById(7L)).thenReturn(Optional.of(existing));

        assertTrue(ratings.current(7L).rating().deviation() > 100);
        assertTrue(ratings.current(7L).provisional());
    }

    @Test
    void selectionWidensTheRatingWindowUntilAPuzzleIsFound() {
        PuzzleRepository repository = mock(PuzzleRepository.class);
        Puzzle found = puzzle(99L, 2350);
        when(repository.findRandomInRange(anyInt(), anyInt(), any(), any())).thenReturn(Optional.empty());
        when(repository.findRandomInRange(eq(1600), eq(2400), isNull(), eq(7L))).thenReturn(Optional.of(found));

        assertSame(found, new PuzzleSelectionService(repository).next(7L, 2000, null).orElseThrow());
        verify(repository).findRandomInRange(1900, 2100, null, 7L);
        verify(repository).findRandomInRange(1800, 2200, null, 7L);
    }

    @Test
    void selectionAllowsRepeatsOnlyWhenEverythingWasAttempted() {
        PuzzleRepository repository = mock(PuzzleRepository.class);
        Puzzle repeat = puzzle(5L, 1500);
        when(repository.findRandomInRange(anyInt(), anyInt(), any(), any())).thenReturn(Optional.empty());
        when(repository.findRandomInRange(anyInt(), anyInt(), any(), isNull())).thenReturn(Optional.of(repeat));

        assertSame(repeat, new PuzzleSelectionService(repository).next(7L, 1500, "fork").orElseThrow());
    }

    private Puzzle puzzle(long id, int rating) {
        Puzzle puzzle = mock(Puzzle.class);
        when(puzzle.getId()).thenReturn(id);
        when(puzzle.getRating()).thenReturn(rating);
        when(puzzle.getRatingDeviation()).thenReturn(75);
        return puzzle;
    }
}
