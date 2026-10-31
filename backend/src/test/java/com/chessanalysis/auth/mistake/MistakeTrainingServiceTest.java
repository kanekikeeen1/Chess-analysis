package com.chessanalysis.auth.mistake;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

import com.chessanalysis.auth.analysis.dto.EvaluateMoveResponse;
import com.chessanalysis.auth.analysis.service.MoveEvaluationService;
import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.game.entity.AnalyzedMove;
import com.chessanalysis.auth.game.repository.AnalyzedGameRepository;
import com.chessanalysis.auth.game.repository.AnalyzedMoveRepository;
import com.chessanalysis.auth.mistake.dto.MistakeAnswerResponse;
import com.chessanalysis.auth.mistake.entity.MistakeReview;
import com.chessanalysis.auth.mistake.repository.MistakeRepository;
import com.chessanalysis.auth.mistake.service.MistakeTrainingService;
import com.chessanalysis.auth.review.ReviewService;
import com.chessanalysis.auth.service.ApiException;

class MistakeTrainingServiceTest {
    /** Hai xe trên hàng 1: Ra8# là PV1, Rb8# là PV2 (cũng chiếu hết), người chơi đã đi h3?? */
    private static final String BEFORE = "6k1/5ppp/8/8/8/8/5PPP/RR4K1 w - - 0 30";
    private static final String AFTER = "6k1/5ppp/8/8/8/7P/5PP1/RR4K1 b - - 0 30";

    private final MistakeRepository mistakes = mock(MistakeRepository.class);
    private final AnalyzedMoveRepository moves = mock(AnalyzedMoveRepository.class);
    private final MoveEvaluationService evaluation = mock(MoveEvaluationService.class);
    private final ReviewService reviews = mock(ReviewService.class);
    private final MistakeTrainingService service =
            new MistakeTrainingService(mistakes, moves, mock(AnalyzedGameRepository.class), evaluation, reviews);
    private final UserAccount user = mock(UserAccount.class);

    @BeforeEach
    void setUp() {
        when(user.getId()).thenReturn(7L);
        when(user.getUsernameDisplay()).thenReturn("An");
        AnalyzedMove mistake = new AnalyzedMove(1L, 7L, 59, "h3", "h2h3", BEFORE, AFTER, "blunder", Instant.now());
        mistake.setBestMoveUci("a1a8");
        mistake.setSecondBestUci("b1b8");
        mistake.setPvGapCp(0);
        when(moves.findById(5L)).thenReturn(Optional.of(mistake));
    }

    @Test
    void bestMoveIsCorrectWithoutAskingTheEngine() {
        MistakeAnswerResponse response = service.answer(user, 5L, "a1a8");
        assertTrue(response.correct());
        assertEquals("a1a8", response.bestMove());
        verify(evaluation, never()).evaluate(anyString(), anyString(), anyString(), anyBoolean(), anyInt());
        ArgumentCaptor<MistakeReview> review = ArgumentCaptor.forClass(MistakeReview.class);
        verify(mistakes).save(review.capture());
        assertTrue(review.getValue().isCorrect());
    }

    @Test
    void nearlyEqualSecondBestIsAlsoCorrect() {
        assertTrue(service.answer(user, 5L, "b1b8").correct());
        verify(evaluation, never()).evaluate(anyString(), anyString(), anyString(), anyBoolean(), anyInt());
    }

    @Test
    void repeatingTheOriginalMistakeIsWrong() {
        MistakeAnswerResponse response = service.answer(user, 5L, "h2h3");
        assertFalse(response.correct());
        assertEquals("blunder", response.originalLabel());
    }

    @Test
    void otherMovesAreJudgedByStockfish() {
        when(evaluation.evaluate(anyString(), anyString(), anyString(), anyBoolean(), anyInt()))
                .thenReturn(new EvaluateMoveResponse("excellent", "x", 0, "a1a8", null, null, null));
        assertTrue(service.answer(user, 5L, "g2g3").correct());

        when(evaluation.evaluate(anyString(), anyString(), anyString(), anyBoolean(), anyInt()))
                .thenReturn(new EvaluateMoveResponse("mistake", "Sai lầm", 2, "a1a8", null, null, null));
        MistakeAnswerResponse wrong = service.answer(user, 5L, "g2g3");
        assertFalse(wrong.correct());
        assertEquals("mistake", wrong.assessmentKey());
    }

    @Test
    void missingEngineIsReportedInsteadOfFailingTheRequest() {
        when(evaluation.evaluate(anyString(), anyString(), anyString(), anyBoolean(), anyInt()))
                .thenThrow(new IllegalStateException("Không khởi động được Stockfish"));
        MistakeAnswerResponse response = service.answer(user, 5L, "g2g3");
        assertFalse(response.correct());
        assertTrue(response.detail().contains("Engine"));
    }

    @Test
    void cannotPracticeSomeoneElsesMistakeOrSendIllegalMoves() {
        when(user.getId()).thenReturn(8L);
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ApiException.class, () -> service.answer(user, 5L, "a1a8")).getStatus());
        when(user.getId()).thenReturn(7L);
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ApiException.class, () -> service.answer(user, 5L, "a1h8")).getStatus());
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ApiException.class, () -> service.next(user, "LATE")).getStatus());
    }

    @Test
    void sideAndMoveNumberComeFromTheFenNotFromPlyParity() {
        // Ván bắt đầu từ FEN Đen đi: ply 1 là nước của Đen, ở nước 12.
        AnalyzedMove move = new AnalyzedMove(1L, 7L, 1, "Kf8", "g8f8",
                "6k1/5ppp/8/8/8/8/5PPP/RR4K1 b - - 3 12", AFTER, "mistake", Instant.now());
        assertEquals("b", move.getSideToMove());
        assertEquals(12, move.getMoveNumber());
    }
}
