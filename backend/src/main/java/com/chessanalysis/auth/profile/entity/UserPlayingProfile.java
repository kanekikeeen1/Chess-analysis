package com.chessanalysis.auth.profile.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Trình độ tổng thể ước lượng từ mô hình hành vi ở M2: chọn dải Elo cực đại hóa
 * likelihood của chuỗi nước người dùng đã đi.
 */
@Entity
@Table(name = "user_playing_profiles")
public class UserPlayingProfile {
    @Id
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "estimated_elo")
    private Double estimatedElo;

    @Column(name = "elo_std_error")
    private Double eloStdError;

    @Column(name = "games_analyzed", nullable = false)
    private int gamesAnalyzed;

    @Column(name = "moves_analyzed", nullable = false)
    private int movesAnalyzed;

    @Column(name = "last_estimated_at")
    private Instant lastEstimatedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserPlayingProfile() {}

    public UserPlayingProfile(Long userId, Instant now) {
        this.userId = userId;
        this.gamesAnalyzed = 0;
        this.movesAnalyzed = 0;
        this.updatedAt = now;
    }

    public Long getUserId() { return userId; }
    public Double getEstimatedElo() { return estimatedElo; }
    public Double getEloStdError() { return eloStdError; }
    public int getGamesAnalyzed() { return gamesAnalyzed; }
    public int getMovesAnalyzed() { return movesAnalyzed; }
    public Instant getLastEstimatedAt() { return lastEstimatedAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void setEstimatedElo(Double estimatedElo) { this.estimatedElo = estimatedElo; }
    public void setEloStdError(Double eloStdError) { this.eloStdError = eloStdError; }
    public void setGamesAnalyzed(int gamesAnalyzed) { this.gamesAnalyzed = gamesAnalyzed; }
    public void setMovesAnalyzed(int movesAnalyzed) { this.movesAnalyzed = movesAnalyzed; }
    public void setLastEstimatedAt(Instant lastEstimatedAt) { this.lastEstimatedAt = lastEstimatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
