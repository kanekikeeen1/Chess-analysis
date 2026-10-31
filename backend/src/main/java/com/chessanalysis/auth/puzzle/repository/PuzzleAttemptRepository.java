package com.chessanalysis.auth.puzzle.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.chessanalysis.auth.puzzle.entity.PuzzleAttempt;

public interface PuzzleAttemptRepository extends JpaRepository<PuzzleAttempt, Long> {
}
