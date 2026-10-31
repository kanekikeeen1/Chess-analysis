package com.chessanalysis.auth.puzzle.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.chessanalysis.auth.puzzle.entity.PuzzleSession;

public interface PuzzleSessionRepository extends JpaRepository<PuzzleSession, Long> {
    Optional<PuzzleSession> findByPublicId(String publicId);
}
