package com.chessanalysis.auth.puzzle.repository;

import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.chessanalysis.auth.puzzle.entity.UserPuzzleRating;

public interface UserPuzzleRatingRepository extends JpaRepository<UserPuzzleRating, Long> {
    /** Khóa dòng khi cập nhật để hai lượt giải gửi cùng lúc không ghi đè kết quả của nhau. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM UserPuzzleRating r WHERE r.userId = :userId")
    Optional<UserPuzzleRating> findForUpdate(@Param("userId") Long userId);
}
