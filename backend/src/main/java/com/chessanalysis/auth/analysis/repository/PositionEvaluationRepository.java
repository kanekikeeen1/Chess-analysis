package com.chessanalysis.auth.analysis.repository;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.chessanalysis.auth.analysis.entity.PositionEvaluationEntry;

public interface PositionEvaluationRepository extends JpaRepository<PositionEvaluationEntry, Long> {
    Optional<PositionEvaluationEntry> findByFenKeyAndDepth(String fenKey, int depth);

    /**
     * Cache hit vẫn dùng được khi bản lưu có depth cao hơn mức đang yêu cầu:
     * đánh giá sâu hơn không bao giờ tệ hơn đánh giá nông hơn.
     */
    @Query("""
            SELECT e FROM PositionEvaluationEntry e
            WHERE e.fenKey = :fenKey AND e.depth >= :depth
            ORDER BY e.depth ASC
            """)
    java.util.List<PositionEvaluationEntry> findUsableAtLeastDepth(
            @Param("fenKey") String fenKey, @Param("depth") int depth);

    @Modifying
    @Query("""
            UPDATE PositionEvaluationEntry e
            SET e.hitCount = e.hitCount + 1, e.lastUsedAt = :now
            WHERE e.id = :id
            """)
    void recordHit(@Param("id") Long id, @Param("now") Instant now);
}
