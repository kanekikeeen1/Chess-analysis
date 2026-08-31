package com.chessanalysis.auth.game.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.analysis.dto.AnalysisMoveRequest;
import com.chessanalysis.auth.analysis.dto.AnalysisResultResponse;
import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;
import com.chessanalysis.auth.analysis.dto.MoveReviewResponse;
import com.chessanalysis.auth.analysis.dto.PositionEvaluationResponse;
import com.chessanalysis.auth.analysis.service.EvaluationMath;
import com.chessanalysis.auth.analysis.service.FenNormalizer;
import com.chessanalysis.auth.game.entity.AnalyzedMove;
import com.chessanalysis.auth.game.repository.AnalyzedMoveRepository;

/**
 * Trải kết quả một tác vụ review thành các dòng {@code analyzed_moves}.
 *
 * <p>Đây là bước biến ứng dụng từ chỗ chỉ lưu một khối JSON thành chỗ có dữ
 * liệu truy vấn được: sau khi chạy, có thể hỏi thẳng cơ sở dữ liệu "những nước
 * blunder của tôi trong tàn cuộc" mà không phải đọc và giải mã từng ván.
 */
@Service
public class AnalyzedMoveWriter {
    private static final int OPENING_MAX_PLY = 20;
    private static final int ENDGAME_MAX_PIECES = 12;
    private static final int QUEENLESS_ENDGAME_MAX_PIECES = 16;

    private final AnalyzedMoveRepository moves;

    public AnalyzedMoveWriter(AnalyzedMoveRepository moves) {
        this.moves = moves;
    }

    @Transactional
    public int write(Long gameId, Long userId, List<AnalysisMoveRequest> requestMoves,
            AnalysisResultResponse result) {
        if (requestMoves == null || requestMoves.isEmpty() || result == null) return 0;
        List<PositionEvaluationResponse> evaluations = result.evaluations();
        if (evaluations == null || evaluations.size() < requestMoves.size() + 1) return 0;

        moves.deleteAllByGameId(gameId);
        Instant now = Instant.now();
        List<AnalyzedMove> rows = new ArrayList<>(requestMoves.size());
        for (int index = 0; index < requestMoves.size(); index++) {
            AnalysisMoveRequest move = requestMoves.get(index);
            MoveReviewResponse review = result.moves() != null && index < result.moves().size()
                    ? result.moves().get(index)
                    : null;
            rows.add(toRow(gameId, userId, index + 1, move,
                    evaluations.get(index), evaluations.get(index + 1), review, now));
        }
        moves.saveAll(rows);
        return rows.size();
    }

    private AnalyzedMove toRow(Long gameId, Long userId, int ply, AnalysisMoveRequest move,
            PositionEvaluationResponse before, PositionEvaluationResponse after,
            MoveReviewResponse review, Instant now) {
        boolean whiteMoved = FenNormalizer.whiteToMove(move.beforeFen());
        String label = review == null ? "unlabeled" : review.assessmentKey();

        AnalyzedMove row = new AnalyzedMove(gameId, userId, ply, move.san(), move.uci(),
                move.beforeFen(), move.afterFen(), label, now);

        row.setPhase(phaseOf(ply, move));
        row.setEngineDepth(after.depth());
        row.setEvalBeforeCp(EvaluationMath.centipawns(before.pawns()));
        row.setEvalAfterCp(EvaluationMath.centipawns(after.pawns()));
        row.setMateBefore(before.mate());
        row.setMateAfter(after.mate());

        List<EngineVariationResponse> lines = before.variations();
        EngineVariationResponse best = lines == null || lines.isEmpty() ? null : lines.get(0);
        EngineVariationResponse second = lines == null || lines.size() < 2 ? null : lines.get(1);
        row.setBestMoveUci(firstMove(best));
        row.setSecondBestUci(firstMove(second));
        if (best != null && second != null) {
            double gap = whiteMoved ? best.pawns() - second.pawns() : second.pawns() - best.pawns();
            row.setPvGapCp(Math.max(0, (int) Math.round(gap * 100)));
        }
        row.setBest(row.getBestMoveUci() != null
                && row.getBestMoveUci().equalsIgnoreCase(move.uci().trim()));

        double pawnLoss = EvaluationMath.pawnLoss(before.pawns(), after.pawns(), whiteMoved);
        row.setCentipawnLoss((int) Math.round(
                EvaluationMath.clamp(pawnLoss * 100, 0, EvaluationMath.CENTIPAWN_CLAMP)));
        row.setWinPercentLoss(EvaluationMath.chanceLoss(before.pawns(), after.pawns(), whiteMoved));
        row.setAccuracy(review == null ? null : review.accuracy());

        row.setCapture(move.capture());
        row.setCheck(move.check());
        row.setCheckmate(move.checkmate());
        row.setPromotion(move.promotion());
        row.setCastle(move.san().startsWith("O-O"));
        row.setTheory(move.theory());
        row.setTheoryName(move.theoryName());
        row.setLegalMoveCount(move.legalMoveCount());
        row.setSacrificeValue(move.sacrificeValue());
        row.setSacrificeKind(move.sacrificeKind());
        row.setMaterialBalance(FenNormalizer.materialBalance(move.afterFen()));
        row.setPieceCount(FenNormalizer.pieceCount(move.afterFen()));
        return row;
    }

    /**
     * Giai đoạn ván theo quy ước thường dùng trong tài liệu cờ vua: tàn cuộc xác
     * định bằng số quân còn lại (nới lỏng khi hai bên đã đổi hết hậu), khai cuộc
     * kết thúc ở nước 10 hoặc khi rời sách lý thuyết.
     */
    private String phaseOf(int ply, AnalysisMoveRequest move) {
        String fen = move.afterFen();
        int pieces = FenNormalizer.pieceCount(fen);
        boolean queenless = FenNormalizer.queenCount(fen) == 0;
        if (pieces <= ENDGAME_MAX_PIECES || (queenless && pieces <= QUEENLESS_ENDGAME_MAX_PIECES)) {
            return "ENDGAME";
        }
        if (ply <= OPENING_MAX_PLY || move.theory()) return "OPENING";
        return "MIDDLEGAME";
    }

    private String firstMove(EngineVariationResponse variation) {
        if (variation == null || variation.moves() == null || variation.moves().isEmpty()) return null;
        String move = variation.moves().get(0).trim();
        return move.length() > 6 ? move.substring(0, 6) : move;
    }
}
