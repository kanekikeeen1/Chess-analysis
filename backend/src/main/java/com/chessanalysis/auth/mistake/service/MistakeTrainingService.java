package com.chessanalysis.auth.mistake.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.chessanalysis.auth.analysis.dto.EvaluateMoveResponse;
import com.chessanalysis.auth.analysis.service.MoveEvaluationService;
import com.chessanalysis.auth.chess.ChessRules;
import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.game.entity.AnalyzedGame;
import com.chessanalysis.auth.game.entity.AnalyzedMove;
import com.chessanalysis.auth.game.repository.AnalyzedGameRepository;
import com.chessanalysis.auth.game.repository.AnalyzedMoveRepository;
import com.chessanalysis.auth.mistake.dto.MistakeAnswerResponse;
import com.chessanalysis.auth.mistake.dto.MistakeItemResponse;
import com.chessanalysis.auth.mistake.dto.MistakeSummaryResponse;
import com.chessanalysis.auth.mistake.entity.MistakeReview;
import com.chessanalysis.auth.mistake.repository.MistakeRepository;
import com.chessanalysis.auth.review.ReviewCard;
import com.chessanalysis.auth.review.ReviewService;
import com.chessanalysis.auth.review.dto.ReviewOutcome;
import com.chessanalysis.auth.service.ApiException;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * "Học từ sai lầm": biến các nước mistake/blunder trong ván đã phân tích của chính người
 * học thành bài tập "tìm nước tốt hơn".
 *
 * <p>Một thế cờ thường có nhiều nước tốt, nên đáp án không chỉ là đúng nước PV1 đã lưu.
 * Chấm theo thứ tự rẻ tới đắt: trùng PV1 → đúng; trùng PV2 mà PV2 chỉ kém PV1 không quá
 * {@link #SECOND_BEST_MAX_GAP_CP} centipawn → đúng (dùng số liệu đã lưu, không cần engine);
 * còn lại hỏi Stockfish và coi là đúng khi nước đó được xếp "best" hoặc "excellent"
 * (mất dưới 2% cơ hội thắng).
 */
@Service
public class MistakeTrainingService {
    private static final Logger LOGGER = LoggerFactory.getLogger(MistakeTrainingService.class);
    static final Set<String> GOOD_ENOUGH = Set.of("best", "excellent");
    static final int SECOND_BEST_MAX_GAP_CP = 30;
    static final int ENGINE_DEPTH = 18;
    static final Set<String> PHASES = Set.of("OPENING", "MIDDLEGAME", "ENDGAME");

    private final MistakeRepository mistakes;
    private final AnalyzedMoveRepository moves;
    private final AnalyzedGameRepository games;
    private final MoveEvaluationService moveEvaluation;
    private final ReviewService reviews;

    public MistakeTrainingService(
            MistakeRepository mistakes,
            AnalyzedMoveRepository moves,
            AnalyzedGameRepository games,
            MoveEvaluationService moveEvaluation,
            ReviewService reviews) {
        this.mistakes = mistakes;
        this.moves = moves;
        this.games = games;
        this.moveEvaluation = moveEvaluation;
        this.reviews = reviews;
    }

    public MistakeSummaryResponse summary(UserAccount user) {
        List<MistakeSummaryResponse.Group> groups = new ArrayList<>();
        long total = 0;
        long fixed = 0;
        for (Object[] row : mistakes.summarize(user.getId(), lowerName(user))) {
            long groupTotal = ((Number) row[2]).longValue();
            long groupFixed = row[3] == null ? 0 : ((Number) row[3]).longValue();
            groups.add(new MistakeSummaryResponse.Group((String) row[0], (String) row[1], groupTotal, groupFixed));
            total += groupTotal;
            fixed += groupFixed;
        }
        return new MistakeSummaryResponse(total, fixed, groups);
    }

    public MistakeItemResponse next(UserAccount user, String phase) {
        if (phase != null && !PHASES.contains(phase)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Giai đoạn phải là OPENING, MIDDLEGAME hoặc ENDGAME.");
        }
        Long id = mistakes.findNextMistakeId(user.getId(), lowerName(user), phase)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                        "Chưa có sai lầm nào để luyện. Hãy chạy Game Review cho một ván và lưu vào kho."));
        return item(user, id);
    }

    /** Một sai lầm cụ thể (dùng khi ôn tập theo lịch). */
    public MistakeItemResponse item(UserAccount user, Long id) {
        AnalyzedMove move = ownedMove(user, id);
        String title = games.findById(move.getGameId()).map(AnalyzedGame::getTitle).orElse("Ván đã lưu");
        return new MistakeItemResponse(move.getId(), move.getBeforeFen(), move.getSideToMove(), move.getGameId(),
                title, move.getMoveNumber(), move.getSan(), move.getUci(), move.getRuleLabel(), move.getPhase(),
                move.getWinPercentLoss());
    }

    public MistakeAnswerResponse answer(UserAccount user, Long moveId, String uci) {
        AnalyzedMove mistake = ownedMove(user, moveId);
        Board board = ChessRules.load(mistake.getBeforeFen());
        Move played = ChessRules.findLegal(board, uci)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Nước đi không hợp lệ."));
        String answer = played.toString();

        String assessment = null;
        String detail;
        boolean correct;
        boolean judged = true;
        if (answer.equals(mistake.getBestMoveUci())) {
            correct = true;
            detail = "Đúng nước tốt nhất của Stockfish.";
        } else if (answer.equals(mistake.getSecondBestUci())
                && mistake.getPvGapCp() != null && mistake.getPvGapCp() <= SECOND_BEST_MAX_GAP_CP) {
            correct = true;
            detail = "Nước tốt thứ hai, gần như ngang nước tốt nhất.";
        } else if (answer.equals(mistake.getUci())) {
            correct = false;
            detail = "Đây chính là nước sai trong ván gốc.";
        } else {
            board.doMove(played);
            try {
                EvaluateMoveResponse evaluation = moveEvaluation.evaluate(mistake.getBeforeFen(),
                        ChessRules.chessJsFen(board), answer, board.isMated(), ENGINE_DEPTH);
                assessment = evaluation.assessmentKey();
                correct = GOOD_ENOUGH.contains(assessment);
                detail = correct ? "Stockfish đánh giá nước này gần như ngang nước tốt nhất." : evaluation.detail();
            } catch (RuntimeException exception) {
                // Máy chưa cấu hình Stockfish hoặc engine đang quá tải: không chấm được
                // nước lạ, nên báo rõ thay vì trả lỗi 500.
                LOGGER.warn("Không chấm được nước {} cho sai lầm {}", answer, moveId, exception);
                correct = false;
                judged = false;
                detail = "Engine chưa sẵn sàng nên chỉ chấp nhận nước tốt nhất đã lưu.";
            }
        }

        mistakes.save(new MistakeReview(user.getId(), mistake.getId(), correct, answer, Instant.now()));
        // Không chấm được (engine lỗi) thì không đụng tới lịch ôn: "sai" lúc đó chỉ là "không biết".
        ReviewOutcome review = judged ? reviews.record(user.getId(), ReviewCard.MISTAKE, mistake.getId(), correct) : null;
        return new MistakeAnswerResponse(correct, answer, assessment, detail, mistake.getBestMoveUci(),
                mistake.getUci(), mistake.getRuleLabel(), review);
    }

    /** Bỏ qua: ghi là chưa sửa được và tiết lộ nước tốt nhất. */
    public MistakeAnswerResponse reveal(UserAccount user, Long moveId) {
        AnalyzedMove mistake = ownedMove(user, moveId);
        mistakes.save(new MistakeReview(user.getId(), mistake.getId(), false, null, Instant.now()));
        ReviewOutcome review = reviews.record(user.getId(), ReviewCard.MISTAKE, mistake.getId(), false);
        return new MistakeAnswerResponse(false, null, null, "Đã hiện nước tốt nhất.", mistake.getBestMoveUci(),
                mistake.getUci(), mistake.getRuleLabel(), review);
    }

    private AnalyzedMove ownedMove(UserAccount user, Long id) {
        return moves.findById(id)
                .filter(move -> user.getId().equals(move.getUserId()))
                .filter(move -> move.getBestMoveUci() != null)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy sai lầm này."));
    }

    private static String lowerName(UserAccount user) {
        return user.getUsernameDisplay().trim().toLowerCase(Locale.ROOT);
    }
}
