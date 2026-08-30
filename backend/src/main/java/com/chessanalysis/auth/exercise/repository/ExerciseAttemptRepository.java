package com.chessanalysis.auth.exercise.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.chessanalysis.auth.exercise.entity.ExerciseAttempt;

public interface ExerciseAttemptRepository extends JpaRepository<ExerciseAttempt, Long> {
    List<ExerciseAttempt> findAllByUserId(Long userId);
}
