package com.chessanalysis.auth.analysis.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/**
 * Một dòng cache đánh giá vị trí. Khóa là (SHA-256 của FEN chuẩn hóa, depth):
 * cùng một thế khai cuộc chỉ tốn một lần Stockfish cho toàn hệ thống.
 */
@Entity
@Table(name = "position_evaluations")
public class PositionEvaluationEntry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "fen_key", nullable = false, length = 64)
    private String fenKey;

    @Column(name = "normalized_fen", nullable = false, length = 180)
    private String normalizedFen;

    @Column(nullable = false)
    private int depth;

    @Column(name = "multi_pv", nullable = false)
    private int multiPv;

    @Column(name = "score_cp")
    private Integer scoreCp;

    private Integer mate;

    @Column(name = "best_move_uci", length = 6)
    private String bestMoveUci;

    @Column(name = "second_best_uci", length = 6)
    private String secondBestUci;

    @Column(name = "pv_gap_cp")
    private Integer pvGapCp;

    @Lob
    @Column(name = "payload_json", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String payloadJson;

    @Column(name = "engine_name", length = 64)
    private String engineName;

    @Column(name = "hit_count", nullable = false)
    private long hitCount;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_used_at", nullable = false)
    private Instant lastUsedAt;

    protected PositionEvaluationEntry() {}

    public PositionEvaluationEntry(String fenKey, String normalizedFen, int depth, int multiPv,
            Integer scoreCp, Integer mate, String bestMoveUci, String secondBestUci, Integer pvGapCp,
            String payloadJson, String engineName, Instant now) {
        this.fenKey = fenKey;
        this.normalizedFen = normalizedFen;
        this.depth = depth;
        this.multiPv = multiPv;
        this.scoreCp = scoreCp;
        this.mate = mate;
        this.bestMoveUci = bestMoveUci;
        this.secondBestUci = secondBestUci;
        this.pvGapCp = pvGapCp;
        this.payloadJson = payloadJson;
        this.engineName = engineName;
        this.hitCount = 0;
        this.createdAt = now;
        this.lastUsedAt = now;
    }

    public Long getId() { return id; }
    public String getFenKey() { return fenKey; }
    public String getNormalizedFen() { return normalizedFen; }
    public int getDepth() { return depth; }
    public int getMultiPv() { return multiPv; }
    public Integer getScoreCp() { return scoreCp; }
    public Integer getMate() { return mate; }
    public String getBestMoveUci() { return bestMoveUci; }
    public String getSecondBestUci() { return secondBestUci; }
    public Integer getPvGapCp() { return pvGapCp; }
    public String getPayloadJson() { return payloadJson; }
    public String getEngineName() { return engineName; }
    public long getHitCount() { return hitCount; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastUsedAt() { return lastUsedAt; }
}
