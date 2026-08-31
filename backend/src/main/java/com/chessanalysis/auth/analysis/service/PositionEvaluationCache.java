package com.chessanalysis.auth.analysis.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;
import com.chessanalysis.auth.analysis.dto.PositionEvaluationResponse;
import com.chessanalysis.auth.analysis.entity.PositionEvaluationEntry;
import com.chessanalysis.auth.analysis.repository.PositionEvaluationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Cache đánh giá vị trí. Hai vai trò trong đồ án:
 *
 * <ol>
 *   <li>Kỹ thuật: thế khai cuộc lặp lại giữa các ván không phải chạy lại engine,
 *       nên thời gian review giảm mạnh ở các ván có khai cuộc phổ biến.</li>
 *   <li>Nghiên cứu: bảng này tự tích lũy thành tập vị trí đã gán nhãn Stockfish,
 *       là nguồn dữ liệu miễn phí cho M1.</li>
 * </ol>
 */
@Service
public class PositionEvaluationCache {
    private static final Logger LOGGER = LoggerFactory.getLogger(PositionEvaluationCache.class);

    private final PositionEvaluationRepository repository;
    private final ObjectMapper objectMapper;
    private final AtomicLong hits = new AtomicLong();
    private final AtomicLong misses = new AtomicLong();
    private final AtomicLong skipped = new AtomicLong();

    public PositionEvaluationCache(PositionEvaluationRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<PositionEvaluationResponse> lookup(String fen, int depth, int positionIndex) {
        if (!FenNormalizer.cacheable(fen)) {
            skipped.incrementAndGet();
            return Optional.empty();
        }
        String key = FenNormalizer.key(fen);
        List<PositionEvaluationEntry> usable = repository.findUsableAtLeastDepth(key, depth);
        if (usable.isEmpty()) {
            misses.incrementAndGet();
            return Optional.empty();
        }
        PositionEvaluationEntry entry = usable.get(0);
        try {
            PositionEvaluationResponse stored = objectMapper.readValue(
                    entry.getPayloadJson(), PositionEvaluationResponse.class);
            repository.recordHit(entry.getId(), Instant.now());
            hits.incrementAndGet();
            return Optional.of(new PositionEvaluationResponse(
                    positionIndex, fen, stored.depth(), stored.mate(), stored.moves(),
                    stored.pawns(), stored.variations()));
        } catch (JsonProcessingException exception) {
            LOGGER.warn("Bỏ qua dòng cache hỏng id={}", entry.getId(), exception);
            misses.incrementAndGet();
            return Optional.empty();
        }
    }

    /**
     * Lưu một đánh giá mới. Ghi trong giao dịch riêng để một lỗi cache không bao
     * giờ làm hỏng tác vụ phân tích đang chạy.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void store(String fen, int requestedDepth, PositionEvaluationResponse evaluation, String engineName) {
        if (!FenNormalizer.cacheable(fen)) return;
        String key = FenNormalizer.key(fen);
        int depth = Math.max(requestedDepth, evaluation.depth());
        if (repository.findByFenKeyAndDepth(key, depth).isPresent()) return;

        List<EngineVariationResponse> variations = evaluation.variations();
        EngineVariationResponse first = variations.isEmpty() ? null : variations.get(0);
        EngineVariationResponse second = variations.size() < 2 ? null : variations.get(1);
        boolean whiteToMove = FenNormalizer.whiteToMove(fen);
        Integer gap = first == null || second == null ? null : Math.max(0, (int) Math.round(
                (whiteToMove ? first.pawns() - second.pawns() : second.pawns() - first.pawns()) * 100));

        try {
            repository.save(new PositionEvaluationEntry(
                    key,
                    FenNormalizer.normalize(fen),
                    depth,
                    Math.max(1, variations.size()),
                    evaluation.mate() == null ? (int) Math.round(evaluation.pawns() * 100) : null,
                    evaluation.mate(),
                    firstMove(first),
                    firstMove(second),
                    gap,
                    objectMapper.writeValueAsString(evaluation),
                    engineName,
                    Instant.now()));
        } catch (JsonProcessingException exception) {
            LOGGER.warn("Không đóng gói được đánh giá để cache", exception);
        } catch (DataIntegrityViolationException exception) {
            // Một worker khác vừa ghi đúng khóa đó; kết quả giống nhau nên bỏ qua.
            LOGGER.debug("Cache đã có sẵn khóa {} depth {}", key, depth);
        }
    }

    public CacheStats stats() {
        long hit = hits.get();
        long miss = misses.get();
        long total = hit + miss;
        return new CacheStats(hit, miss, skipped.get(), total == 0 ? 0 : (double) hit / total,
                repository.count());
    }

    private String firstMove(EngineVariationResponse variation) {
        if (variation == null || variation.moves().isEmpty()) return null;
        String move = variation.moves().get(0).trim();
        return move.length() > 6 ? move.substring(0, 6) : move;
    }

    public record CacheStats(long hits, long misses, long skipped, double hitRate, long storedPositions) {}
}
