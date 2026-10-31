package com.chessanalysis.auth.puzzle.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "puzzle_sessions")
public class PuzzleSession {
    public static final String ACTIVE = "ACTIVE";
    public static final String SOLVED = "SOLVED";
    public static final String FAILED = "FAILED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, length = 36)
    private String publicId;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "puzzle_id", nullable = false)
    private Long puzzleId;

    @Column(nullable = false)
    private int progress;

    @Column(nullable = false, length = 16)
    private String status;

    @Column(nullable = false)
    private boolean rated;

    /** Hai nước gửi cùng lúc cho một phiên: chỉ nước đầu được ghi. */
    @Version
    private int version;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PuzzleSession() {}

    public PuzzleSession(String publicId, Long userId, Long puzzleId, boolean rated, Instant now) {
        this.publicId = publicId;
        this.userId = userId;
        this.puzzleId = puzzleId;
        this.rated = rated;
        this.status = ACTIVE;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void advance(int newProgress, Instant now) {
        progress = newProgress;
        updatedAt = now;
    }

    public void finish(String finalStatus, Instant now) {
        status = finalStatus;
        updatedAt = now;
    }

    public Long getId() { return id; }
    public String getPublicId() { return publicId; }
    public Long getUserId() { return userId; }
    public Long getPuzzleId() { return puzzleId; }
    public int getProgress() { return progress; }
    public String getStatus() { return status; }
    public boolean isRated() { return rated; }
}
