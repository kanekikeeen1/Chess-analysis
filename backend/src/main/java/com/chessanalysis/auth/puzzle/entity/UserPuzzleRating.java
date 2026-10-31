package com.chessanalysis.auth.puzzle.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import com.chessanalysis.auth.puzzle.rating.Glicko2;

@Entity
@Table(name = "user_puzzle_ratings")
public class UserPuzzleRating {
    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false)
    private double rating;

    @Column(nullable = false)
    private double deviation;

    @Column(nullable = false)
    private double volatility;

    @Column(nullable = false)
    private int attempts;

    @Column(nullable = false)
    private int solved;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserPuzzleRating() {}

    public UserPuzzleRating(Long userId, Glicko2.Rating initial, Instant now) {
        this.userId = userId;
        this.rating = initial.rating();
        this.deviation = initial.deviation();
        this.volatility = initial.volatility();
        this.updatedAt = now;
    }

    public Glicko2.Rating toRating() {
        return new Glicko2.Rating(rating, deviation, volatility);
    }

    public void apply(Glicko2.Rating updated, boolean wasSolved, Instant now) {
        rating = updated.rating();
        deviation = updated.deviation();
        volatility = updated.volatility();
        attempts++;
        if (wasSolved) solved++;
        updatedAt = now;
    }

    public Long getUserId() { return userId; }
    public double getRating() { return rating; }
    public double getDeviation() { return deviation; }
    public double getVolatility() { return volatility; }
    public int getAttempts() { return attempts; }
    public int getSolved() { return solved; }
    public Instant getUpdatedAt() { return updatedAt; }
}
