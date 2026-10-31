package com.chessanalysis.auth.mistake.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Một lần người học thử lại một nước sai của chính mình. */
@Entity
@Table(name = "mistake_reviews")
public class MistakeReview {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "analyzed_move_id", nullable = false)
    private Long analyzedMoveId;

    @Column(nullable = false)
    private boolean correct;

    @Column(name = "answered_uci", length = 5)
    private String answeredUci;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected MistakeReview() {}

    public MistakeReview(Long userId, Long analyzedMoveId, boolean correct, String answeredUci, Instant createdAt) {
        this.userId = userId;
        this.analyzedMoveId = analyzedMoveId;
        this.correct = correct;
        this.answeredUci = answeredUci;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public Long getAnalyzedMoveId() { return analyzedMoveId; }
    public boolean isCorrect() { return correct; }
    public String getAnsweredUci() { return answeredUci; }
    public Instant getCreatedAt() { return createdAt; }
}
