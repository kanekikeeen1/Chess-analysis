package com.chessanalysis.auth.puzzle.service;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.chess.ChessRules;
import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.puzzle.dto.PuzzleMoveResponse;
import com.chessanalysis.auth.puzzle.dto.PuzzleResponse;
import com.chessanalysis.auth.puzzle.dto.PuzzleSessionResponse;
import com.chessanalysis.auth.puzzle.entity.Puzzle;
import com.chessanalysis.auth.puzzle.entity.PuzzleSession;
import com.chessanalysis.auth.puzzle.repository.PuzzleAttemptRepository;
import com.chessanalysis.auth.puzzle.repository.PuzzleRepository;
import com.chessanalysis.auth.puzzle.repository.PuzzleSessionRepository;
import com.chessanalysis.auth.service.ApiException;
import com.chessanalysis.auth.service.AuthService;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * Giải puzzle trên server.
 *
 * <p>Luật giống Lichess: mỗi nước của người học phải đúng nước trong lời giải, trừ khi
 * nước đó chiếu hết (một puzzle có thể có nhiều cách chiếu hết, và cách nào cũng đúng).
 * Một nước sai là lượt giải thất bại. Sau mỗi nước đúng, server tự đi nước đáp của đối
 * thủ theo lời giải. Rating Glicko-2 được cập nhật đúng một lần khi phiên kết thúc.
 */
@Service
public class PuzzleSessionService {
    private final PuzzleSessionRepository sessions;
    private final PuzzleRepository puzzles;
    private final PuzzleAttemptRepository attempts;
    private final PuzzleSelectionService selection;
    private final PuzzleRatingService ratings;
    private final AuthService authService;

    public PuzzleSessionService(
            PuzzleSessionRepository sessions,
            PuzzleRepository puzzles,
            PuzzleAttemptRepository attempts,
            PuzzleSelectionService selection,
            PuzzleRatingService ratings,
            AuthService authService) {
        this.sessions = sessions;
        this.puzzles = puzzles;
        this.attempts = attempts;
        this.selection = selection;
        this.ratings = ratings;
        this.authService = authService;
    }

    /** Rating dùng để chọn độ khó: của chính người học nếu đã đăng nhập, ngược lại theo yêu cầu (mặc định 1500). */
    public double targetRating(Long userId, Integer requestedRating) {
        if (userId != null) return ratings.current(userId).rating().rating();
        return requestedRating == null ? 1500 : requestedRating;
    }

    @Transactional
    public PuzzleSessionResponse start(String token, String theme, Integer requestedRating) {
        UserAccount user = authService.currentAccountOrNull(token);
        Long userId = user == null ? null : user.getId();
        Puzzle puzzle = selection.next(userId, targetRating(userId, requestedRating), theme)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                        "Không có puzzle phù hợp. Đã import ngân hàng puzzle chưa?"));
        boolean rated = userId != null && !attempts.existsByUserIdAndPuzzleId(userId, puzzle.getId());
        PuzzleSession session = sessions.save(
                new PuzzleSession(UUID.randomUUID().toString(), userId, puzzle.getId(), rated, Instant.now()));
        return toResponse(session, puzzle, puzzle.getStartFen());
    }

    @Transactional
    public PuzzleMoveResponse move(String token, String sessionId, String uci) {
        PuzzleSession session = activeSession(token, sessionId);
        Puzzle puzzle = puzzleOf(session);
        List<String> solution = solutionOf(puzzle);
        Board board = replay(puzzle, solution, session.getProgress());

        Move move = ChessRules.findLegal(board, uci)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Nước đi không hợp lệ."));
        String expected = solution.get(session.getProgress());
        board.doMove(move);
        boolean mated = board.isMated();
        Instant now = Instant.now();

        if (!move.toString().equals(expected) && !mated) {
            board.undoMove();
            session.finish(PuzzleSession.FAILED, now);
            return new PuzzleMoveResponse(
                    toResponse(session, puzzle, ChessRules.chessJsFen(board)), false, move.toString(), null,
                    expected, solution.subList(session.getProgress(), solution.size()),
                    recordResult(session, puzzle, false));
        }

        int progress = session.getProgress() + 1;
        String reply = null;
        if (!mated && progress < solution.size()) {
            reply = solution.get(progress);
            board.doMove(ChessRules.findLegal(board, reply)
                    .orElseThrow(() -> new IllegalStateException("Lời giải của puzzle " + puzzle.getId() + " hỏng.")));
            progress++;
        }
        session.advance(progress, now);

        boolean solved = mated || progress >= solution.size();
        PuzzleMoveResponse.RatingChange change = null;
        if (solved) {
            session.finish(PuzzleSession.SOLVED, now);
            change = recordResult(session, puzzle, true);
        }
        return new PuzzleMoveResponse(
                toResponse(session, puzzle, ChessRules.chessJsFen(board)), true, move.toString(), reply,
                null, solved ? List.of() : null, change);
    }

    @Transactional
    public PuzzleMoveResponse giveUp(String token, String sessionId) {
        PuzzleSession session = activeSession(token, sessionId);
        Puzzle puzzle = puzzleOf(session);
        List<String> solution = solutionOf(puzzle);
        Board board = replay(puzzle, solution, session.getProgress());
        session.finish(PuzzleSession.FAILED, Instant.now());
        return new PuzzleMoveResponse(
                toResponse(session, puzzle, ChessRules.chessJsFen(board)), false, null, null,
                solution.get(session.getProgress()), solution.subList(session.getProgress(), solution.size()),
                recordResult(session, puzzle, false));
    }

    private PuzzleMoveResponse.RatingChange recordResult(PuzzleSession session, Puzzle puzzle, boolean solved) {
        if (session.getUserId() == null) return null;
        if (!session.isRated()) {
            ratings.recordUnrated(session.getUserId(), puzzle, solved);
            return null;
        }
        PuzzleRatingService.RatingChange change = ratings.record(session.getUserId(), puzzle, solved);
        int before = (int) Math.round(change.before().rating());
        int after = (int) Math.round(change.after().rating());
        return new PuzzleMoveResponse.RatingChange(before, after, after - before,
                (int) Math.round(change.after().deviation()),
                change.after().deviation() > PuzzleRatingService.PROVISIONAL_DEVIATION);
    }

    private PuzzleSession activeSession(String token, String sessionId) {
        PuzzleSession session = sessions.findByPublicId(sessionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy lượt giải."));
        UserAccount user = authService.currentAccountOrNull(token);
        if (session.getUserId() != null && (user == null || !session.getUserId().equals(user.getId()))) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy lượt giải.");
        }
        if (!PuzzleSession.ACTIVE.equals(session.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "Lượt giải này đã kết thúc. Hãy chọn puzzle tiếp theo.");
        }
        return session;
    }

    private Puzzle puzzleOf(PuzzleSession session) {
        return puzzles.findById(session.getPuzzleId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Puzzle không còn tồn tại."));
    }

    private static List<String> solutionOf(Puzzle puzzle) {
        return Arrays.asList(puzzle.getSolution().split(" "));
    }

    /** Vị trí sau {@code plies} nước đầu của lời giải, tính từ vị trí bắt đầu của người giải. */
    private static Board replay(Puzzle puzzle, List<String> solution, int plies) {
        Board board = ChessRules.load(puzzle.getStartFen());
        for (int index = 0; index < plies; index++) {
            board.doMove(ChessRules.findLegal(board, solution.get(index))
                    .orElseThrow(() -> new IllegalStateException("Lời giải của puzzle " + puzzle.getId() + " hỏng.")));
        }
        return board;
    }

    private static PuzzleSessionResponse toResponse(PuzzleSession session, Puzzle puzzle, String currentFen) {
        return new PuzzleSessionResponse(
                session.getPublicId(), PuzzleResponse.from(puzzle), puzzle.getSourceFen(), puzzle.getSetupMove(),
                currentFen, session.getStatus(), session.getProgress(), session.isRated());
    }
}
