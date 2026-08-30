package com.chessanalysis.auth.exercise.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.chessanalysis.auth.exercise.entity.ExerciseLesson;

public interface ExerciseLessonRepository extends JpaRepository<ExerciseLesson, Long> {
    List<ExerciseLesson> findAllByActiveTrueOrderBySortOrderAsc();
    Optional<ExerciseLesson> findBySlugAndActiveTrue(String slug);
}
