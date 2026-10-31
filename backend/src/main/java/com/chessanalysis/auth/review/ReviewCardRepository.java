package com.chessanalysis.auth.review;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReviewCardRepository extends JpaRepository<ReviewCard, Long> {
    Optional<ReviewCard> findByUserIdAndKindAndItemId(Long userId, String kind, Long itemId);

    @Query("SELECT c FROM ReviewCard c WHERE c.userId = :userId AND c.dueAt <= :now ORDER BY c.dueAt ASC")
    List<ReviewCard> findDue(@Param("userId") Long userId, @Param("now") Instant now, Pageable page);

    long countByUserIdAndDueAtLessThanEqual(Long userId, Instant now);

    long countByUserId(Long userId);

    /** Thẻ "đã thuộc": khoảng cách ôn từ 21 ngày trở lên (quy ước thường dùng của Anki). */
    long countByUserIdAndIntervalDaysGreaterThanEqual(Long userId, int days);

    @Query("SELECT MIN(c.dueAt) FROM ReviewCard c WHERE c.userId = :userId AND c.dueAt > :now")
    Optional<Instant> findNextDueAfter(@Param("userId") Long userId, @Param("now") Instant now);
}
