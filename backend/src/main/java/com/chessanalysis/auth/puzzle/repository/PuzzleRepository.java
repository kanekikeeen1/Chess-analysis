package com.chessanalysis.auth.puzzle.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.chessanalysis.auth.puzzle.entity.Puzzle;

public interface PuzzleRepository extends JpaRepository<Puzzle, Long> {
    /**
     * Một puzzle ngẫu nhiên trong khoảng rating, tùy chọn lọc theo theme, bỏ qua puzzle
     * người dùng đã làm ({@code userId = null}: không loại trừ). {@code ORDER BY RAND()}
     * chạy trên vài nghìn dòng của một dải rating nên vẫn nhanh.
     */
    @Query(value = """
            SELECT p.* FROM puzzles p
            WHERE p.rating BETWEEN :minRating AND :maxRating
              AND (:theme IS NULL OR EXISTS (
                    SELECT 1 FROM puzzle_themes t WHERE t.puzzle_id = p.id AND t.theme = :theme))
              AND (:userId IS NULL OR NOT EXISTS (
                    SELECT 1 FROM puzzle_attempts a WHERE a.user_id = :userId AND a.puzzle_id = p.id))
            ORDER BY RAND()
            LIMIT 1
            """, nativeQuery = true)
    Optional<Puzzle> findRandomInRange(
            @Param("minRating") int minRating,
            @Param("maxRating") int maxRating,
            @Param("theme") String theme,
            @Param("userId") Long userId);

    @Query(value = """
            SELECT theme, COUNT(*) AS puzzles FROM puzzle_themes
            GROUP BY theme
            ORDER BY puzzles DESC
            """, nativeQuery = true)
    List<Object[]> countByTheme();
}
