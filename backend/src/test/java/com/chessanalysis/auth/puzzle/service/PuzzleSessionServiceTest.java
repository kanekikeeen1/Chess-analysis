package com.chessanalysis.auth.puzzle.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import com.chessanalysis.auth.chess.ChessRules;
import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.puzzle.dto.PuzzleMoveResponse;
import com.chessanalysis.auth.puzzle.entity.Puzzle;
import com.chessanalysis.auth.puzzle.entity.PuzzleSession;
import com.chessanalysis.auth.puzzle.rating.Glicko2;
import com.chessanalysis.auth.puzzle.repository.PuzzleAttemptRepository;
import com.chessanalysis.auth.puzzle.repository.PuzzleRepository;
import com.chessanalysis.auth.puzzle.repository.PuzzleSessionRepository;
import com.chessanalysis.auth.service.ApiException;
import com.chessanalysis.auth.service.AuthService;
import com.github.bhlangonijr.chesslib.Board;

class PuzzleSessionServiceTest {
    /** Puzzle ví dụ trong tài liệu Lichess: đối thủ đi Kd7, lời giải Be6+ Kd8 Qf8#. */
    private static final String SOURCE_FEN = "q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17";
    /** Hai xe trên hàng 1: cả Ra8# lẫn Rb8# đều chiếu hết, lời giải chỉ ghi Ra8#. */
    private static final String TWO_MATES_FEN = "6k1/5ppp/8/8/8/8/5PPP/RR4K1 w - - 0 1";

    private final PuzzleSessionRepository sessions = mock(PuzzleSessionRepository.class);
    private final PuzzleRepository puzzles = mock(PuzzleRepository.class);
    private final PuzzleRatingService ratings = mock(PuzzleRatingService.class);
    private final AuthService authService = mock(AuthService.class);
    private PuzzleSessionService service;

    @BeforeEach
    void setUp() {
        service = new PuzzleSessionService(sessions, puzzles, mock(PuzzleAttemptRepository.class),
                mock(PuzzleSelectionService.class), ratings, authService);
        UserAccount user = mock(UserAccount.class);
        when(user.getId()).thenReturn(7L);
        when(authService.currentAccountOrNull("token")).thenReturn(user);
        when(ratings.record(eq(7L), any(), anyBoolean())).thenReturn(new PuzzleRatingService.RatingChange(
                new Glicko2.Rating(1500, 200, 0.06), new Glicko2.Rating(1540, 180, 0.06)));
    }

    @Test
    void followingTheSolutionSolvesThePuzzleAndUpdatesRatingOnce() {
        PuzzleSession session = session(puzzle(1L, startFenOf(SOURCE_FEN, "e8d7"), "a2e6 d7d8 f7f8"), true);

        PuzzleMoveResponse first = service.move("token", "s", "a2e6");
        assertTrue(first.correct());
        assertEquals("d7d8", first.opponentReply(), "server tự đi nước đáp của đối thủ");
        assertEquals(PuzzleSession.ACTIVE, first.session().status());
        assertNull(first.ratingChange());

        PuzzleMoveResponse last = service.move("token", "s", "f7f8");
        assertTrue(last.correct());
        assertEquals(PuzzleSession.SOLVED, session.getStatus());
        assertEquals(40, last.ratingChange().delta());
        verify(ratings).record(eq(7L), any(), eq(true));
    }

    @Test
    void anyCheckmateIsAcceptedEvenIfNotTheRecordedMove() {
        session(puzzle(2L, TWO_MATES_FEN, "a1a8"), true);

        PuzzleMoveResponse response = service.move("token", "s", "b1b8");

        assertTrue(response.correct());
        assertEquals(PuzzleSession.SOLVED, response.session().status());
    }

    @Test
    void wrongMoveFailsAndRevealsTheRestOfTheSolution() {
        String startFen = startFenOf(SOURCE_FEN, "e8d7");
        PuzzleSession session = session(puzzle(1L, startFen, "a2e6 d7d8 f7f8"), true);

        PuzzleMoveResponse response = service.move("token", "s", "a2b1");

        assertFalse(response.correct());
        assertEquals("a2e6", response.expectedMove());
        assertEquals(List.of("a2e6", "d7d8", "f7f8"), response.solution());
        assertEquals(startFen, response.session().currentFen(), "vị trí quay về trước nước sai");
        assertEquals(PuzzleSession.FAILED, session.getStatus());
        verify(ratings).record(eq(7L), any(), eq(false));
    }

    @Test
    void replayingAKnownPuzzleIsLoggedButNotRated() {
        session(puzzle(2L, TWO_MATES_FEN, "a1a8"), false);

        PuzzleMoveResponse response = service.move("token", "s", "a1a8");

        assertNull(response.ratingChange());
        verify(ratings).recordUnrated(eq(7L), any(), eq(true));
        verify(ratings, never()).record(any(), any(), anyBoolean());
    }

    @Test
    void finishedSessionRejectsFurtherMovesAndOthersCannotUseIt() {
        PuzzleSession session = session(puzzle(2L, TWO_MATES_FEN, "a1a8"), true);
        service.giveUp("token", "s");
        assertEquals(PuzzleSession.FAILED, session.getStatus());

        ApiException finished = assertThrows(ApiException.class, () -> service.move("token", "s", "a1a8"));
        assertEquals(HttpStatus.CONFLICT, finished.getStatus());
        ApiException stranger = assertThrows(ApiException.class, () -> service.move(null, "s", "a1a8"));
        assertEquals(HttpStatus.NOT_FOUND, stranger.getStatus());
    }

    @Test
    void illegalMoveIsRejectedWithoutEndingTheSession() {
        PuzzleSession session = session(puzzle(2L, TWO_MATES_FEN, "a1a8"), true);
        ApiException error = assertThrows(ApiException.class, () -> service.move("token", "s", "a1h8"));
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
        assertEquals(PuzzleSession.ACTIVE, session.getStatus());
        assertNotNull(session.getPublicId());
    }

    private PuzzleSession session(Puzzle puzzle, boolean rated) {
        PuzzleSession session = new PuzzleSession("s", 7L, puzzle.getId(), rated, Instant.now());
        when(sessions.findByPublicId("s")).thenReturn(Optional.of(session));
        when(puzzles.findById(puzzle.getId())).thenReturn(Optional.of(puzzle));
        return session;
    }

    private static Puzzle puzzle(long id, String startFen, String solution) {
        Puzzle puzzle = mock(Puzzle.class);
        when(puzzle.getId()).thenReturn(id);
        when(puzzle.getStartFen()).thenReturn(startFen);
        when(puzzle.getSolution()).thenReturn(solution);
        when(puzzle.getThemes()).thenReturn("mate");
        when(puzzle.getRating()).thenReturn(1600);
        when(puzzle.getRatingDeviation()).thenReturn(75);
        return puzzle;
    }

    private static String startFenOf(String sourceFen, String setupMove) {
        Board board = ChessRules.load(sourceFen);
        board.doMove(ChessRules.findLegal(board, setupMove).orElseThrow());
        return ChessRules.chessJsFen(board);
    }
}
