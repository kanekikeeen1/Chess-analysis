package com.chessanalysis.auth.analysis.entity;

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
@Table(name = "analysis_jobs")
public class AnalysisJob {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, length = 36)
    private String publicId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private UserAccount user;

    @Column(name = "source_type", nullable = false, length = 8)
    private String sourceType;

    @Column(nullable = false, length = 16)
    private String status;

    @Column(name = "progress_percent", nullable = false)
    private int progressPercent;

    @Column(name = "completed_positions", nullable = false)
    private int completedPositions;

    @Column(name = "total_positions", nullable = false)
    private int totalPositions;

    @Column(name = "min_depth", nullable = false)
    private int minDepth;

    @Column(name = "max_depth", nullable = false)
    private int maxDepth;

    @Column(name = "current_position")
    private Integer currentPosition;

    @Column(name = "request_json", nullable = false, columnDefinition = "LONGTEXT")
    private String requestJson;

    @Column(name = "result_json", columnDefinition = "LONGTEXT")
    private String resultJson;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected AnalysisJob() {}

    public AnalysisJob(String publicId, UserAccount user, String sourceType, int totalPositions,
            int minDepth, int maxDepth, String requestJson, Instant now) {
        this.publicId = publicId;
        this.user = user;
        this.sourceType = sourceType;
        this.status = "QUEUED";
        this.totalPositions = totalPositions;
        this.minDepth = minDepth;
        this.maxDepth = maxDepth;
        this.requestJson = requestJson;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void markRunning(Instant now) {
        status = "RUNNING";
        updatedAt = now;
        errorMessage = null;
    }

    public void updateProgress(int completed, int current, String partialResult, Instant now) {
        completedPositions = completed;
        currentPosition = current;
        progressPercent = totalPositions == 0 ? 100 : Math.min(99, completed * 100 / totalPositions);
        resultJson = partialResult;
        updatedAt = now;
    }

    public void complete(String result, Instant now) {
        status = "COMPLETED";
        completedPositions = totalPositions;
        progressPercent = 100;
        currentPosition = totalPositions == 0 ? null : totalPositions - 1;
        resultJson = result;
        completedAt = now;
        updatedAt = now;
    }

    public void fail(String message, Instant now) {
        status = "FAILED";
        errorMessage = message == null ? "Stockfish không thể hoàn thành phân tích." : message.substring(0, Math.min(500, message.length()));
        completedAt = now;
        updatedAt = now;
    }

    public Long getId() { return id; }
    public String getPublicId() { return publicId; }
    public String getSourceType() { return sourceType; }
    public String getStatus() { return status; }
    public int getProgressPercent() { return progressPercent; }
    public int getCompletedPositions() { return completedPositions; }
    public int getTotalPositions() { return totalPositions; }
    public int getMinDepth() { return minDepth; }
    public int getMaxDepth() { return maxDepth; }
    public Integer getCurrentPosition() { return currentPosition; }
    public String getResultJson() { return resultJson; }
    public String getErrorMessage() { return errorMessage; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getCompletedAt() { return completedAt; }
}
