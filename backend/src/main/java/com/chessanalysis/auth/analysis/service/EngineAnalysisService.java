package com.chessanalysis.auth.analysis.service;

import org.springframework.stereotype.Service;

import com.chessanalysis.auth.analysis.dto.PositionEvaluationResponse;
import com.chessanalysis.auth.analysis.engine.StockfishEnginePool;

/**
 * Điểm vào duy nhất để lấy đánh giá một vị trí: đọc cache trước, chỉ chạm tới
 * pool Stockfish khi thật sự trượt cache.
 *
 * <p>Một phiên ({@link Session}) chỉ mượn engine ở lần trượt cache đầu tiên,
 * nên một ván có khai cuộc phổ biến và đã từng được phân tích không chiếm chỗ
 * nào trong pool.
 */
@Service
public class EngineAnalysisService {
    private final StockfishEnginePool pool;
    private final PositionEvaluationCache cache;

    public EngineAnalysisService(StockfishEnginePool pool, PositionEvaluationCache cache) {
        this.pool = pool;
        this.cache = cache;
    }

    public PositionEvaluationResponse analyze(String fen, int depth, int positionIndex) {
        try (Session session = openSession()) {
            return session.analyze(fen, depth, positionIndex);
        }
    }

    public Session openSession() {
        return new Session();
    }

    public final class Session implements AutoCloseable {
        private StockfishEnginePool.Lease lease;
        private int cacheHits;
        private int engineRuns;

        private Session() {}

        public PositionEvaluationResponse analyze(String fen, int depth, int positionIndex) {
            return cache.lookup(fen, depth, positionIndex)
                    .map(hit -> {
                        cacheHits++;
                        return hit;
                    })
                    .orElseGet(() -> runEngine(fen, depth, positionIndex));
        }

        private PositionEvaluationResponse runEngine(String fen, int depth, int positionIndex) {
            if (lease == null) {
                lease = pool.borrow();
                lease.engine().newGame();
            }
            try {
                PositionEvaluationResponse evaluation = lease.engine().analyze(fen, depth, positionIndex);
                engineRuns++;
                cache.store(fen, depth, evaluation, lease.engine().engineName());
                return evaluation;
            } catch (RuntimeException exception) {
                // Sau một lần engine timeout hoặc chết, trạng thái UCI không còn
                // tin được; hủy tiến trình để lần mượn sau khởi động lại sạch.
                lease.discard();
                throw exception;
            }
        }

        public int cacheHits() { return cacheHits; }
        public int engineRuns() { return engineRuns; }

        @Override
        public void close() {
            if (lease != null) lease.close();
        }
    }
}
