package com.chessanalysis.auth.exercise.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.chessanalysis.auth.analysis.dto.EvaluateMoveResponse;
import com.chessanalysis.auth.analysis.service.MoveEvaluationService;
import com.chessanalysis.auth.chess.ChessRules;
import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.exercise.dto.ExerciseMoveResponse;
import com.chessanalysis.auth.exercise.dto.ExerciseSessionResponse;
import com.chessanalysis.auth.exercise.entity.ExerciseAttempt;
import com.chessanalysis.auth.exercise.entity.ExerciseLesson;
import com.chessanalysis.auth.exercise.entity.ExercisePosition;
import com.chessanalysis.auth.exercise.entity.ExerciseSession;
import com.chessanalysis.auth.exercise.repository.ExerciseAttemptRepository;
import com.chessanalysis.auth.exercise.repository.ExerciseLessonRepository;
import com.chessanalysis.auth.exercise.repository.ExercisePositionRepository;
import com.chessanalysis.auth.exercise.repository.ExerciseSessionRepository;
import com.chessanalysis.auth.repository.UserAccountRepository;
import com.chessanalysis.auth.service.ApiException;
import com.chessanalysis.auth.service.AuthService;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.Side;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * Bài tàn cuộc chạy hoàn toàn trên server.
 *
 * <p>Mỗi nước của người học: server kiểm tra nước hợp lệ, tự tính chiếu hết, chấm
 * bằng Stockfish depth 20, đi nước đáp của engine, kiểm tra mục tiêu ({@link
 * EndgameGoals}) và — khi hoàn thành — tự tính điểm từ số lần đi sai rồi lưu vào
 * {@code exercise_attempts}. Trình duyệt chỉ hiển thị kết quả.
 */
@Service
public class ExerciseSessionService {
    static final Set<String> ACCEPTED_KEYS = Set.of("best", "excellent", "okay");
    static final int ENGINE_DEPTH = 20;
    /** Giới hạn độ dài một phiên; dài hơn thì người học gần như chắc đã đi vòng vòng. */
    static final int MAX_PLIES = 150;

    private final ExerciseLessonRepository lessons;
    private final ExercisePositionRepository positions;
    private final ExerciseSessionRepository sessions;
    private final ExerciseAttemptRepository attempts;
    private final UserAccountRepository users;
    private final AuthService authService;
    private final MoveEvaluationService moveEvaluation;
    private final TransactionTemplate transactions;

    public ExerciseSessionService(
            ExerciseLessonRepository lessons,
            ExercisePositionRepository positions,
            ExerciseSessionRepository sessions,
            ExerciseAttemptRepository attempts,
            UserAccountRepository users,
            AuthService authService,
            MoveEvaluationService moveEvaluation,
            TransactionTemplate transactions) {
        this.lessons = lessons;
        this.positions = positions;
        this.sessions = sessions;
        this.attempts = attempts;
        this.users = users;
        this.authService = authService;
        this.moveEvaluation = moveEvaluation;
        this.transactions = transactions;
    }

    @Transactional
    public ExerciseSessionResponse start(String token, String slug, Long positionId) {
        ExerciseLesson lesson = lessons.findBySlugAndActiveTrue(slug)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bài tập."));
        if (!"ENDGAME".equals(lesson.getCategory())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Bàn thực chiến chỉ dành cho bài tàn cuộc.");
        }
        ExercisePosition position = (positionId == null
                ? positions.findRandomByLessonSlug(slug)
                : positions.findById(positionId).filter(found -> found.getLesson().getId().equals(lesson.getId())))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Bài tàn cuộc chưa có thế cờ thực hành."));

        UserAccount user = authService.currentAccountOrNull(token);
        Board board = ChessRules.load(position.getStartingFen());
        ExerciseSession session = sessions.save(new ExerciseSession(
                UUID.randomUUID().toString(),
                user == null ? null : user.getId(),
                lesson.getId(),
                position.getId(),
                position.getGoalType(),
                board.getSideToMove() == Side.WHITE ? "w" : "b",
                position.getStartingFen(),
                Instant.now()));
        return toResponse(session, slug);
    }

    public ExerciseMoveResponse move(String token, String sessionId, String uci) {
        // Đọc phiên trong một giao dịch ngắn, chạy Stockfish ngoài giao dịch (mất vài
        // giây), rồi ghi lại trong giao dịch thứ hai có kiểm tra @Version.
        ExerciseSession session = transactions.execute(status -> sessions.findByPublicId(sessionId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy phiên luyện tập."));
        UserAccount user = authService.currentAccountOrNull(token);
        if (session.getUserId() != null && (user == null || !session.getUserId().equals(user.getId()))) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy phiên luyện tập.");
        }
        if (!ExerciseSession.ACTIVE.equals(session.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "Phiên luyện tập này đã kết thúc. Hãy bắt đầu lại.");
        }

        Board board = replay(session);
        Side player = board.getSideToMove();
        Move move = ChessRules.findLegal(board, uci)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Nước đi không hợp lệ."));
        String beforeFen = board.getFen();
        board.doMove(move);
        EvaluateMoveResponse evaluation = moveEvaluation.evaluate(
                beforeFen, board.getFen(), move.toString(), board.isMated(), ENGINE_DEPTH);

        Instant now = Instant.now();
        if (!ACCEPTED_KEYS.contains(evaluation.assessmentKey())) {
            session.recordMistake(now);
            persist(session, null);
            return new ExerciseMoveResponse(toResponse(session, null), false, move.toString(),
                    evaluation.assessmentKey(), evaluation.detail(), evaluation.bestMove(), null, null);
        }

        List<String> played = new ArrayList<>(List.of(move.toString()));
        EndgameGoals.Verdict verdict = EndgameGoals.afterPlayerMove(session.getGoalType(), board, move);
        String reply = null;
        if (verdict.outcome() == EndgameGoals.Outcome.CONTINUE) {
            Move replyMove = ChessRules.findLegal(board, evaluation.opponentReply())
                    // Engine luôn có PV khi ván chưa kết thúc; nhánh này chỉ phòng hờ.
                    .orElseGet(() -> board.legalMoves().get(0));
            board.doMove(replyMove);
            reply = replyMove.toString();
            played.add(reply);
            verdict = EndgameGoals.afterOpponentMove(
                    session.getGoalType(), board, player, session.getAcceptedMoves() + 1);
        }
        session.recordMoves(played, board.getFen(), now);
        if (verdict.outcome() == EndgameGoals.Outcome.CONTINUE && session.moves().size() >= MAX_PLIES) {
            verdict = EndgameGoals.Verdict.failed("Bài đã kéo dài quá " + MAX_PLIES + " nửa nước mà chưa đạt mục tiêu.");
        }

        ExerciseAttempt attempt = null;
        if (verdict.outcome() == EndgameGoals.Outcome.COMPLETED) {
            int score = score(session.getMistakes());
            session.finish(ExerciseSession.COMPLETED, score, now);
            if (session.getUserId() != null) {
                attempt = new ExerciseAttempt(users.getReferenceById(session.getUserId()),
                        lessons.getReferenceById(session.getLessonId()), score, true, now);
            }
        } else if (verdict.outcome() == EndgameGoals.Outcome.FAILED) {
            session.finish(ExerciseSession.FAILED, null, now);
        }
        persist(session, attempt);

        String message = verdict.message();
        if (verdict.outcome() == EndgameGoals.Outcome.COMPLETED) {
            message += " Điểm " + session.getScore() + "/100"
                    + (session.getUserId() != null ? " đã được lưu vào tài khoản." : " — đăng nhập để lưu kết quả.");
        }
        return new ExerciseMoveResponse(toResponse(session, null), true, move.toString(),
                evaluation.assessmentKey(), evaluation.detail(), evaluation.bestMove(), reply, message);
    }

    /** Điểm chỉ phụ thuộc số lần đi sai; tối thiểu 40 cho một lần hoàn thành. */
    static int score(int mistakes) {
        return Math.max(40, 100 - mistakes * 15);
    }

    /** Dựng lại ván từ đầu để chesslib theo dõi được lặp lại ba lần. */
    private Board replay(ExerciseSession session) {
        Board board = ChessRules.load(session.getStartingFen());
        for (String uci : session.moves()) {
            Move move = ChessRules.findLegal(board, uci)
                    .orElseThrow(() -> new IllegalStateException("Lịch sử phiên " + session.getId() + " hỏng."));
            board.doMove(move);
        }
        return board;
    }

    private void persist(ExerciseSession session, ExerciseAttempt attempt) {
        try {
            transactions.executeWithoutResult(status -> {
                sessions.save(session);
                if (attempt != null) attempts.save(attempt);
            });
        } catch (ObjectOptimisticLockingFailureException exception) {
            throw new ApiException(HttpStatus.CONFLICT, "Nước trước vẫn đang được xử lý. Hãy thử lại.");
        }
    }

    private ExerciseSessionResponse toResponse(ExerciseSession session, String slug) {
        String lessonSlug = slug != null ? slug
                : lessons.findById(session.getLessonId()).map(ExerciseLesson::getSlug).orElse(null);
        return new ExerciseSessionResponse(
                session.getPublicId(), lessonSlug, session.getPositionId(), session.getGoalType(),
                session.getPlayerSide(), session.getStartingFen(), session.getCurrentFen(), session.getStatus(),
                session.getMistakes(), session.getAcceptedMoves(), session.getScore());
    }
}
