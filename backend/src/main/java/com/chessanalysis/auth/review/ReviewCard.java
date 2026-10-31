package com.chessanalysis.auth.review;

import java.time.Duration;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "review_cards")
public class ReviewCard {
    public static final String PUZZLE = "PUZZLE";
    public static final String MISTAKE = "MISTAKE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 16)
    private String kind;

    @Column(name = "item_id", nullable = false)
    private Long itemId;

    @Column(nullable = false)
    private double ease;

    @Column(nullable = false)
    private int repetitions;

    @Column(name = "interval_days", nullable = false)
    private int intervalDays;

    @Column(nullable = false)
    private int lapses;

    @Column(nullable = false)
    private int reviews;

    @Column(name = "due_at", nullable = false)
    private Instant dueAt;

    @Column(name = "last_reviewed_at")
    private Instant lastReviewedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ReviewCard() {}

    /** Thẻ mới sinh ra từ một lần làm sai: SM-2 bắt đầu ở khoảng cách 1 ngày. */
    public ReviewCard(Long userId, String kind, Long itemId, Instant now) {
        this.userId = userId;
        this.kind = kind;
        this.itemId = itemId;
        apply(Sm2.State.afterFirstFailure(), now);
        this.lapses = 1;
        this.createdAt = now;
    }

    public Sm2.State state() {
        return new Sm2.State(ease, repetitions, intervalDays);
    }

    public void review(boolean correct, Instant now) {
        apply(Sm2.review(state(), correct ? Sm2.CORRECT : Sm2.WRONG), now);
        reviews++;
        if (!correct) lapses++;
        lastReviewedAt = now;
    }

    private void apply(Sm2.State next, Instant now) {
        ease = next.ease();
        repetitions = next.repetitions();
        intervalDays = next.intervalDays();
        dueAt = now.plus(Duration.ofDays(next.intervalDays()));
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public String getKind() { return kind; }
    public Long getItemId() { return itemId; }
    public double getEase() { return ease; }
    public int getRepetitions() { return repetitions; }
    public int getIntervalDays() { return intervalDays; }
    public int getLapses() { return lapses; }
    public int getReviews() { return reviews; }
    public Instant getDueAt() { return dueAt; }
    public Instant getLastReviewedAt() { return lastReviewedAt; }
}
