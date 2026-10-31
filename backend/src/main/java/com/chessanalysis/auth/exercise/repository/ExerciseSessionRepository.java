package com.chessanalysis.auth.exercise.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.chessanalysis.auth.exercise.entity.ExerciseSession;

public interface ExerciseSessionRepository extends JpaRepository<ExerciseSession, Long> {
    Optional<ExerciseSession> findByPublicId(String publicId);
}
