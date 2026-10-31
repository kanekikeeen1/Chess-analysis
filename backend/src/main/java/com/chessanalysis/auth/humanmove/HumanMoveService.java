package com.chessanalysis.auth.humanmove;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;
import com.chessanalysis.auth.analysis.engine.EngineUnavailableException;
import com.chessanalysis.auth.analysis.engine.StockfishEnginePool;
import com.chessanalysis.auth.chess.ChessRules;
import com.chessanalysis.auth.humanmove.HumanMoveModel.HumanMove;
import com.chessanalysis.auth.humanmove.HumanMoveModel.PlayedMove;
import com.chessanalysis.auth.humanmove.dto.EloEstimateRequest;
import com.chessanalysis.auth.humanmove.dto.EloEstimateResponse;
import com.chessanalysis.auth.humanmove.dto.HumanMoveRequest;
import com.chessanalysis.auth.humanmove.dto.HumanMoveResponse;
import com.chessanalysis.auth.service.ApiException;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.Side;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * Ghép mô hình M2 với Stockfish: gợi ý "người Elo X thường đi" kèm điểm engine của từng nước, và ước
 * lượng Elo của một ván.
 */
@Service
public class HumanMoveService {
    private static final Logger LOGGER = LoggerFactory.getLogger(HumanMoveService.class);
    /** Chấm điểm gợi ý chỉ là phần thêm: pool đang bận review thì bỏ qua thay vì bắt người dùng chờ. */
    private static final Duration ENGINE_WAIT = Duration.ofSeconds(2);

    private final HumanMoveModel model;
    private final StockfishEnginePool engines;

    public HumanMoveService(HumanMoveModel model, StockfishEnginePool engines) {
        this.model = model;
        this.engines = engines;
    }

    public HumanMoveResponse predict(HumanMoveRequest request) {
        Board board = ChessRules.load(request.fen());
        String fen = ChessRules.chessJsFen(board);
        List<List<HumanMove>> moves = model.predict(
                board, request.elos(), request.topKOrDefault(), request.compareOrDefault());

        Map<String, EngineVariationResponse> scores = Map.of();
        String engineNote = null;
        if (request.engineDepth() != null) {
            Set<String> distinct = new LinkedHashSet<>();
            moves.forEach(level -> level.forEach(move -> distinct.add(move.uci())));
            try {
                scores = score(fen, request.engineDepth(), List.copyOf(distinct));
            } catch (EngineUnavailableException exception) {
                engineNote = "Stockfish đang bận phân tích ván khác nên chưa chấm điểm các nước này.";
            } catch (RuntimeException exception) {
                // Mỗi lần đổi thế cờ đều gọi vào đây; in cả stack trace thì một lỗi cấu hình làm ngập log.
                LOGGER.warn("Không chấm điểm được gợi ý M2 cho {}: {}", fen, exception.getMessage());
                LOGGER.debug("Chi tiết lỗi Stockfish", exception);
                engineNote = "Không chạy được Stockfish trên máy chủ (kiểm tra STOCKFISH_PATH).";
            }
        }

        M2Encoding encoding = model.encoding();
        List<HumanMoveResponse.LevelPrediction> predictions = new ArrayList<>(moves.size());
        for (int i = 0; i < moves.size(); i++) {
            int elo = request.elos().get(i);
            List<HumanMoveResponse.ScoredMove> scored = new ArrayList<>();
            for (HumanMove move : moves.get(i)) {
                EngineVariationResponse score = scores.get(move.uci());
                scored.add(new HumanMoveResponse.ScoredMove(move.uci(), move.san(), move.probability(),
                        score == null ? null : score.pawns(), score == null ? null : score.mate()));
            }
            predictions.add(new HumanMoveResponse.LevelPrediction(
                    elo, encoding.bucketLabel(encoding.eloBucket(elo)), scored));
        }
        return new HumanMoveResponse(fen, predictions, model.trainStep(), engineNote);
    }

    private Map<String, EngineVariationResponse> score(String fen, int depth, List<String> moves) {
        try (StockfishEnginePool.Lease lease = engines.borrow(ENGINE_WAIT)) {
            try {
                Map<String, EngineVariationResponse> byMove = new HashMap<>();
                for (EngineVariationResponse variation : lease.engine().analyzeMoves(fen, depth, moves)) {
                    if (!variation.moves().isEmpty()) byMove.put(variation.moves().get(0), variation);
                }
                return byMove;
            } catch (RuntimeException exception) {
                lease.discard();
                throw exception;
            }
        }
    }

    /** Elo ước lượng của từng bên trong ván, tách theo bên đi của mỗi FEN. */
    public EloEstimateResponse estimate(EloEstimateRequest request) {
        List<PlayedMove> white = new ArrayList<>();
        List<PlayedMove> black = new ArrayList<>();
        for (EloEstimateRequest.Move move : request.moves()) {
            PlayedMove played = played(move.fen(), move.uci());
            (played.board().getSideToMove() == Side.WHITE ? white : black).add(played);
        }
        M2Encoding encoding = model.encoding();
        return new EloEstimateResponse(
                white.isEmpty() ? null : EloEstimateResponse.SideEstimate.of(estimate(white), encoding),
                black.isEmpty() ? null : EloEstimateResponse.SideEstimate.of(estimate(black), encoding),
                model.trainStep());
    }

    public EloEstimator.Estimate estimate(List<PlayedMove> moves) {
        return EloEstimator.posterior(logLikelihood(moves), moves.size());
    }

    /** Đường log-likelihood trên {@link EloEstimator#GRID}; hồ sơ người chơi lưu đường này cho từng ván. */
    public double[] logLikelihood(List<PlayedMove> moves) {
        return model.logLikelihood(moves, EloEstimator.GRID);
    }

    public boolean available() {
        return model.available();
    }

    public Integer trainStep() {
        return model.trainStep();
    }

    /** Dựng lại một nước đã đi từ FEN và UCI; nước không hợp lệ ở thế đó là lỗi của request. */
    public static PlayedMove played(String fen, String uci) {
        Board board = ChessRules.load(fen);
        Move move = ChessRules.findLegal(board, uci).orElseThrow(() -> new ApiException(
                HttpStatus.BAD_REQUEST, "Nước " + uci + " không hợp lệ ở thế cờ " + fen + "."));
        return new PlayedMove(board, move);
    }
}
