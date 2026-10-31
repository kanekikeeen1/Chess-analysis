package com.chessanalysis.auth.puzzle.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "puzzle_attempts")
public class PuzzleAttempt {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "puzzle_id", nullable = false)
    private Long puzzleId;

    @Column(nullable = false)
    private boolean solved;

    @Column(name = "rating_before", nullable = false)
    private double ratingBefore;

    @Column(name = "rating_after", nullable = false)
    private double ratingAfter;

    @Column(name = "deviation_after", nullable = false)
    private double deviationAfter;

    @Column(name = "puzzle_rating", nullable = false)
    private int puzzleRating;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PuzzleAttempt() {}

    public PuzzleAttempt(Long userId, Long puzzleId, boolean solved, double ratingBefore, double ratingAfter,
            double deviationAfter, int puzzleRating, Instant createdAt) {
        this.userId = userId;
        this.puzzleId = puzzleId;
        this.solved = solved;
        this.ratingBefore = ratingBefore;
        this.ratingAfter = ratingAfter;
        this.deviationAfter = deviationAfter;
        this.puzzleRating = puzzleRating;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public Long getPuzzleId() { return puzzleId; }
    public boolean isSolved() { return solved; }
    public double getRatingBefore() { return ratingBefore; }
    public double getRatingAfter() { return ratingAfter; }
    public double getDeviationAfter() { return deviationAfter; }
    public int getPuzzleRating() { return puzzleRating; }
    public Instant getCreatedAt() { return createdAt; }
}
