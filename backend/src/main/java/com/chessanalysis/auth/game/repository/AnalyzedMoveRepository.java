package com.chessanalysis.auth.game.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.chessanalysis.auth.game.entity.AnalyzedMove;

public interface AnalyzedMoveRepository extends JpaRepository<AnalyzedMove, Long> {
    List<AnalyzedMove> findAllByGameIdOrderByPlyAsc(Long gameId);

    void deleteAllByGameId(Long gameId);

    List<AnalyzedMove> findAllByUserIdAndRuleLabelIn(Long userId, List<String> ruleLabels);

    /**
     * Truy vấn mà schema cũ không làm được: mọi nước hỏng của một người dùng,
     * lọc theo giai đoạn ván. Đây là đầu vào cho hồ sơ điểm yếu ở M3.
     */
    @Query("""
            SELECT m FROM AnalyzedMove m
            WHERE m.userId = :userId
              AND m.phase = :phase
              AND m.ruleLabel IN ('inaccuracy', 'mistake', 'blunder')
            ORDER BY m.centipawnLoss DESC
            """)
    List<AnalyzedMove> findWeakMovesInPhase(@Param("userId") Long userId, @Param("phase") String phase);

    @Query("""
            SELECT m.ruleLabel, COUNT(m) FROM AnalyzedMove m
            WHERE m.userId = :userId
            GROUP BY m.ruleLabel
            """)
    List<Object[]> countByLabel(@Param("userId") Long userId);

    @Query("""
            SELECT m.errorTheme, COUNT(m) FROM AnalyzedMove m
            WHERE m.userId = :userId AND m.errorTheme IS NOT NULL
            GROUP BY m.errorTheme
            ORDER BY COUNT(m) DESC
            """)
    List<Object[]> countByErrorTheme(@Param("userId") Long userId);
}
