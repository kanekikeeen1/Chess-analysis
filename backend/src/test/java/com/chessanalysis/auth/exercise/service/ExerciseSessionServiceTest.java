package com.chessanalysis.auth.exercise.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.chessanalysis.auth.analysis.dto.EvaluateMoveResponse;
import com.chessanalysis.auth.analysis.service.MoveEvaluationService;
import com.chessanalysis.auth.exercise.dto.ExerciseMoveResponse;
import com.chessanalysis.auth.exercise.entity.ExerciseSession;
import com.chessanalysis.auth.exercise.repository.ExerciseAttemptRepository;
import com.chessanalysis.auth.exercise.repository.ExerciseLessonRepository;
import com.chessanalysis.auth.exercise.repository.ExercisePositionRepository;
import com.chessanalysis.auth.exercise.repository.ExerciseSessionRepository;
import com.chessanalysis.auth.repository.UserAccountRepository;
import com.chessanalysis.auth.service.AuthService;

class ExerciseSessionServiceTest {
    private static final String QUEEN_VS_ROOK = "6rk/8/8/8/8/4K3/8/6Q1 w - - 0 1";

    private final ExerciseSessionRepository sessions = mock(ExerciseSessionRepository.class);
    private final ExerciseAttemptRepository attempts = mock(ExerciseAttemptRepository.class);
    private final MoveEvaluationService evaluation = mock(MoveEvaluationService.class);
    private ExerciseSessionService service;
    private ExerciseSession session;

    @BeforeEach
    void setUp() {
        service = new ExerciseSessionService(
                mock(ExerciseLessonRepository.class), mock(ExercisePositionRepository.class), sessions, attempts,
                mock(UserAccountRepository.class), mock(AuthService.class), evaluation,
                new TransactionTemplate(mock(PlatformTransactionManager.class)));
        session = new ExerciseSession("s-1", null, 1L, 1L, "WIN_ROOK", "w", QUEEN_VS_ROOK, Instant.now());
        when(sessions.findByPublicId("s-1")).thenReturn(Optional.of(session));
    }

    @Test
    void rejectedMoveKeepsPositionAndCountsMistake() {
        engineSays("blunder", "g1g2", "h8g8");

        ExerciseMoveResponse response = service.move(null, "s-1", "g1g8");

        assertFalse(response.accepted());
        assertEquals("g1g2", response.bestMove());
        assertEquals(QUEEN_VS_ROOK, response.session().currentFen());
        assertEquals(1, response.session().mistakes());
        assertEquals(ExerciseSession.ACTIVE, response.session().status());
    }

    @Test
    void queenForRookTradeCannotCompleteEvenIfEngineAcceptedIt() {
        // Giả sử engine (sai) chấp nhận Qxg8+: server vẫn đi nước đáp Kxg8 và thấy hậu đã mất.
        engineSays("okay", "g1g8", "h8g8");

        ExerciseMoveResponse response = service.move(null, "s-1", "g1g8");

        assertTrue(response.accepted());
        assertEquals("h8g8", response.opponentReply());
        assertEquals(ExerciseSession.FAILED, response.session().status());
        assertNull(response.session().score());
        verify(attempts, never()).save(any());
    }

    private void engineSays(String key, String bestMove, String reply) {
        when(evaluation.evaluate(anyString(), anyString(), anyString(), anyBoolean(), eq(ExerciseSessionService.ENGINE_DEPTH)))
                .thenReturn(new EvaluateMoveResponse(key, key, 0, bestMove, reply, null, null));
    }
}
