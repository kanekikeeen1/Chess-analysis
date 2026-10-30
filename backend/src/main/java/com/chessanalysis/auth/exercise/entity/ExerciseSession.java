package com.chessanalysis.auth.exercise.entity;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "exercise_sessions")
public class ExerciseSession {
    public static final String ACTIVE = "ACTIVE";
    public static final String COMPLETED = "COMPLETED";
    public static final String FAILED = "FAILED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, length = 36)
    private String publicId;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "lesson_id", nullable = false)
    private Long lessonId;

    @Column(name = "position_id", nullable = false)
    private Long positionId;

    @Column(name = "goal_type", nullable = false, length = 24)
    private String goalType;

    @Column(name = "player_side", nullable = false, length = 1)
    private String playerSide;

    @Column(name = "starting_fen", nullable = false, length = 100)
    private String startingFen;

    @Column(name = "current_fen", nullable = false, length = 100)
    private String currentFen;

    @Column(name = "moves_uci", nullable = false, length = 1000)
    private String movesUci;

    @Column(nullable = false)
    private int mistakes;

    @Column(name = "accepted_moves", nullable = false)
    private int acceptedMoves;

    @Column(nullable = false, length = 16)
    private String status;

    private Integer score;

    /** Hai request nước đi đến cùng lúc cho một phiên: chỉ request đầu được ghi. */
    @Version
    private int version;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ExerciseSession() {}

    public ExerciseSession(String publicId, Long userId, Long lessonId, Long positionId, String goalType,
            String playerSide, String startingFen, Instant now) {
        this.publicId = publicId;
        this.userId = userId;
        this.lessonId = lessonId;
        this.positionId = positionId;
        this.goalType = goalType;
        this.playerSide = playerSide;
        this.startingFen = startingFen;
        this.currentFen = startingFen;
        this.movesUci = "";
        this.status = ACTIVE;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public List<String> moves() {
        return movesUci.isBlank() ? List.of() : Arrays.asList(movesUci.split(" "));
    }

    public void recordMistake(Instant now) {
        mistakes++;
        updatedAt = now;
    }

    /** Ghi nước của người học đã được chấp nhận và (nếu có) nước đáp của engine. */
    public void recordMoves(List<String> uciMoves, String fenAfter, Instant now) {
        String added = String.join(" ", uciMoves);
        movesUci = movesUci.isBlank() ? added : movesUci + " " + added;
        acceptedMoves++;
        currentFen = fenAfter;
        updatedAt = now;
    }

    public void finish(String finalStatus, Integer finalScore, Instant now) {
        status = finalStatus;
        score = finalScore;
        updatedAt = now;
    }

    public Long getId() { return id; }
    public String getPublicId() { return publicId; }
    public Long getUserId() { return userId; }
    public Long getLessonId() { return lessonId; }
    public Long getPositionId() { return positionId; }
    public String getGoalType() { return goalType; }
    public String getPlayerSide() { return playerSide; }
    public String getStartingFen() { return startingFen; }
    public String getCurrentFen() { return currentFen; }
    public int getMistakes() { return mistakes; }
    public int getAcceptedMoves() { return acceptedMoves; }
    public String getStatus() { return status; }
    public Integer getScore() { return score; }
}
