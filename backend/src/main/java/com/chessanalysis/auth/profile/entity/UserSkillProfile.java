package com.chessanalysis.auth.profile.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Một ô trong vector điểm yếu: người dùng × chủ đề chiến thuật.
 * {@code mastery} là xác suất đã nắm chủ đề theo Bayesian Knowledge Tracing,
 * {@code theta} là năng lực kiểu Elo dùng chung thang với độ khó bài tập ở M3.
 */
@Entity
@Table(name = "user_skill_profiles")
public class UserSkillProfile {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 48)
    private String theme;

    @Column(nullable = false)
    private int exposures;

    @Column(nullable = false)
    private int errors;

    @Column(nullable = false)
    private double mastery;

    @Column(nullable = false)
    private double theta;

    @Column(nullable = false)
    private double confidence;

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserSkillProfile() {}

    public UserSkillProfile(Long userId, String theme, Instant now) {
        this.userId = userId;
        this.theme = theme;
        this.exposures = 0;
        this.errors = 0;
        this.mastery = 0.35;
        this.theta = 1200;
        this.confidence = 0;
        this.updatedAt = now;
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public String getTheme() { return theme; }
    public int getExposures() { return exposures; }
    public int getErrors() { return errors; }
    public double getMastery() { return mastery; }
    public double getTheta() { return theta; }
    public double getConfidence() { return confidence; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void setExposures(int exposures) { this.exposures = exposures; }
    public void setErrors(int errors) { this.errors = errors; }
    public void setMastery(double mastery) { this.mastery = mastery; }
    public void setTheta(double theta) { this.theta = theta; }
    public void setConfidence(double confidence) { this.confidence = confidence; }
    public void setLastSeenAt(Instant lastSeenAt) { this.lastSeenAt = lastSeenAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
