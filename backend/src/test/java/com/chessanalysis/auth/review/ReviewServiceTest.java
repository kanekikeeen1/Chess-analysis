package com.chessanalysis.auth.review;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.chessanalysis.auth.game.repository.AnalyzedGameRepository;
import com.chessanalysis.auth.game.repository.AnalyzedMoveRepository;
import com.chessanalysis.auth.puzzle.repository.PuzzleRepository;
import com.chessanalysis.auth.review.dto.ReviewOutcome;

class ReviewServiceTest {
    private final ReviewCardRepository cards = mock(ReviewCardRepository.class);
    private final ReviewService service = new ReviewService(cards, mock(PuzzleRepository.class),
            mock(AnalyzedMoveRepository.class), mock(AnalyzedGameRepository.class));

    @Test
    void failingCreatesACardDueTomorrow() {
        when(cards.findByUserIdAndKindAndItemId(7L, ReviewCard.PUZZLE, 11L)).thenReturn(Optional.empty());

        ReviewOutcome outcome = service.record(7L, ReviewCard.PUZZLE, 11L, false);

        assertTrue(outcome.newCard());
        assertEquals(1, outcome.intervalDays());
        Duration untilDue = Duration.between(Instant.now(), outcome.dueAt());
        assertTrue(untilDue.toHours() >= 23 && untilDue.toHours() <= 24, "đến hạn sau một ngày: " + untilDue);
        ArgumentCaptor<ReviewCard> saved = ArgumentCaptor.forClass(ReviewCard.class);
        verify(cards).save(saved.capture());
        assertEquals(1, saved.getValue().getLapses());
    }

    @Test
    void solvingSomethingNeverFailedNeedsNoCard() {
        when(cards.findByUserIdAndKindAndItemId(7L, ReviewCard.PUZZLE, 11L)).thenReturn(Optional.empty());

        assertNull(service.record(7L, ReviewCard.PUZZLE, 11L, true));
        verify(cards, never()).save(any());
    }

    @Test
    void reviewingAnExistingCardFollowsSm2() {
        ReviewCard card = new ReviewCard(7L, ReviewCard.MISTAKE, 5L, Instant.now());
        when(cards.findByUserIdAndKindAndItemId(7L, ReviewCard.MISTAKE, 5L)).thenReturn(Optional.of(card));

        ReviewOutcome first = service.record(7L, ReviewCard.MISTAKE, 5L, true);
        ReviewOutcome second = service.record(7L, ReviewCard.MISTAKE, 5L, true);
        assertFalse(first.newCard());
        assertEquals(1, first.intervalDays());
        assertEquals(6, second.intervalDays());

        ReviewOutcome forgotten = service.record(7L, ReviewCard.MISTAKE, 5L, false);
        assertEquals(1, forgotten.intervalDays());
        assertEquals(0, forgotten.repetitions());
        assertEquals(2, card.getLapses());
        assertEquals(3, card.getReviews());
    }
}
