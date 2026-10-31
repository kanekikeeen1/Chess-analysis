package com.chessanalysis.auth.mistake.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.chessanalysis.auth.mistake.entity.MistakeReview;

/**
 * Truy vấn "sai lầm của tôi" trên {@code analyzed_moves} và lưu lượt ôn lại.
 *
 * <p>Nước nào là của người học: nếu tên tài khoản trùng tên kỳ thủ Trắng hoặc Đen của
 * ván thì chỉ lấy nước của bên đó; nếu không trùng bên nào (ví dụ phân tích ván của
 * người khác) thì lấy cả hai bên. Điều kiện này lặp lại ở cả hai truy vấn dưới đây.
 */
public interface MistakeRepository extends JpaRepository<MistakeReview, Long> {
    /**
     * Id của sai lầm nên ôn tiếp theo: sai lầm chưa từng sửa đúng trước, trong đó cái
     * chưa ôn lần nào đứng đầu, rồi tới cái ôn lâu nhất; cùng nhóm thì sai lầm nặng
     * hơn (mất nhiều cơ hội thắng hơn) trước.
     */
    @Query(value = """
            SELECT m.id FROM analyzed_moves m
            JOIN analyzed_games g ON g.id = m.game_id
            LEFT JOIN (
                SELECT analyzed_move_id, SUM(correct) AS fixed, MAX(created_at) AS last_review
                FROM mistake_reviews WHERE user_id = :userId GROUP BY analyzed_move_id
            ) r ON r.analyzed_move_id = m.id
            WHERE m.user_id = :userId
              AND m.rule_label IN ('mistake', 'blunder')
              AND m.best_move_uci IS NOT NULL
              AND (:phase IS NULL OR m.phase = :phase)
              AND ((LOWER(g.white_player) = :name AND m.side_to_move = 'w')
                OR (LOWER(g.black_player) = :name AND m.side_to_move = 'b')
                OR (LOWER(g.white_player) <> :name AND LOWER(g.black_player) <> :name))
            ORDER BY COALESCE(r.fixed, 0) ASC,
                     r.last_review IS NOT NULL,
                     r.last_review ASC,
                     m.win_percent_loss DESC
            LIMIT 1
            """, nativeQuery = true)
    Optional<Long> findNextMistakeId(
            @Param("userId") Long userId, @Param("name") String lowerCaseName, @Param("phase") String phase);

    /** Mỗi dòng: phase, nhãn, tổng số sai lầm, số đã sửa đúng ít nhất một lần. */
    @Query(value = """
            SELECT m.phase, m.rule_label, COUNT(*) AS total,
                   SUM(CASE WHEN EXISTS (
                       SELECT 1 FROM mistake_reviews r
                       WHERE r.analyzed_move_id = m.id AND r.user_id = :userId AND r.correct
                   ) THEN 1 ELSE 0 END) AS fixed
            FROM analyzed_moves m
            JOIN analyzed_games g ON g.id = m.game_id
            WHERE m.user_id = :userId
              AND m.rule_label IN ('mistake', 'blunder')
              AND m.best_move_uci IS NOT NULL
              AND ((LOWER(g.white_player) = :name AND m.side_to_move = 'w')
                OR (LOWER(g.black_player) = :name AND m.side_to_move = 'b')
                OR (LOWER(g.white_player) <> :name AND LOWER(g.black_player) <> :name))
            GROUP BY m.phase, m.rule_label
            """, nativeQuery = true)
    List<Object[]> summarize(@Param("userId") Long userId, @Param("name") String lowerCaseName);
}
