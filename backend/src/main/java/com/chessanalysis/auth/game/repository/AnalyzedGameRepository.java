package com.chessanalysis.auth.game.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.chessanalysis.auth.game.entity.AnalyzedGame;

public interface AnalyzedGameRepository extends JpaRepository<AnalyzedGame, Long> {
    List<AnalyzedGame> findAllByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<AnalyzedGame> findByIdAndUserId(Long id, Long userId);
}
