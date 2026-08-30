package com.chessanalysis.auth.exercise.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.chessanalysis.auth.exercise.entity.ExercisePosition;

public interface ExercisePositionRepository extends JpaRepository<ExercisePosition, Long> {
    @Query(value = """
            SELECT ep.* FROM exercise_positions ep
            JOIN exercise_lessons el ON el.id = ep.lesson_id
            WHERE el.slug = :slug AND el.active = TRUE AND ep.active = TRUE
            ORDER BY RAND() LIMIT 1
            """, nativeQuery = true)
    Optional<ExercisePosition> findRandomByLessonSlug(@Param("slug") String slug);
}
