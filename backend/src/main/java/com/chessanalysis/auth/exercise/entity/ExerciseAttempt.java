package com.chessanalysis.auth.exercise.entity;

import java.time.Instant;

import com.chessanalysis.auth.entity.UserAccount;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "exercise_attempts")
public class ExerciseAttempt {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserAccount user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lesson_id", nullable = false)
    private ExerciseLesson lesson;

    @Column(nullable = false)
    private Integer score;

    @Column(nullable = false)
    private boolean completed;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ExerciseAttempt() {}

    public ExerciseAttempt(UserAccount user, ExerciseLesson lesson, Integer score, boolean completed, Instant createdAt) {
        this.user = user;
        this.lesson = lesson;
        this.score = score;
        this.completed = completed;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public UserAccount getUser() { return user; }
    public ExerciseLesson getLesson() { return lesson; }
    public Integer getScore() { return score; }
    public boolean isCompleted() { return completed; }
    public Instant getCreatedAt() { return createdAt; }
}
