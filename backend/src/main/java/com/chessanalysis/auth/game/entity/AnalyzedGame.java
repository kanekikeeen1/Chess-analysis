package com.chessanalysis.auth.game.entity;

import java.time.Instant;

import com.chessanalysis.auth.entity.UserAccount;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "analyzed_games")
public class AnalyzedGame {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserAccount user;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(name = "white_player", nullable = false, length = 100)
    private String whitePlayer;

    @Column(name = "black_player", nullable = false, length = 100)
    private String blackPlayer;

    @Column(name = "game_result", nullable = false, length = 12)
    private String result;

    @Column(name = "source_type", nullable = false, length = 16)
    private String sourceType;

    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String pgn;

    @Column(name = "initial_fen", nullable = false, length = 180)
    private String initialFen;

    @Column(name = "final_fen", nullable = false, length = 180)
    private String finalFen;

    @Column(name = "opening_eco", length = 12)
    private String openingEco;

    @Column(name = "opening_name", length = 255)
    private String openingName;

    @Column(name = "white_accuracy")
    private Double whiteAccuracy;

    @Column(name = "black_accuracy")
    private Double blackAccuracy;

    @Column(name = "engine_depth")
    private Integer depth;

    @Column(name = "move_count", nullable = false)
    private Integer moveCount;

    @Lob
    @Column(name = "analysis_json", nullable = false, columnDefinition = "LONGTEXT")
    private String analysisJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected AnalyzedGame() {}

    public AnalyzedGame(
            UserAccount user,
            String title,
            String whitePlayer,
            String blackPlayer,
            String result,
            String sourceType,
            String pgn,
            String initialFen,
            String finalFen,
            String openingEco,
            String openingName,
            Double whiteAccuracy,
            Double blackAccuracy,
            Integer depth,
            Integer moveCount,
            String analysisJson,
            Instant now) {
        this.user = user;
        this.title = title;
        this.whitePlayer = whitePlayer;
        this.blackPlayer = blackPlayer;
        this.result = result;
        this.sourceType = sourceType;
        this.pgn = pgn;
        this.initialFen = initialFen;
        this.finalFen = finalFen;
        this.openingEco = openingEco;
        this.openingName = openingName;
        this.whiteAccuracy = whiteAccuracy;
        this.blackAccuracy = blackAccuracy;
        this.depth = depth;
        this.moveCount = moveCount;
        this.analysisJson = analysisJson;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public Long getId() { return id; }
    public UserAccount getUser() { return user; }
    public String getTitle() { return title; }
    public String getWhitePlayer() { return whitePlayer; }
    public String getBlackPlayer() { return blackPlayer; }
    public String getResult() { return result; }
    public String getSourceType() { return sourceType; }
    public String getPgn() { return pgn; }
    public String getInitialFen() { return initialFen; }
    public String getFinalFen() { return finalFen; }
    public String getOpeningEco() { return openingEco; }
    public String getOpeningName() { return openingName; }
    public Double getWhiteAccuracy() { return whiteAccuracy; }
    public Double getBlackAccuracy() { return blackAccuracy; }
    public Integer getDepth() { return depth; }
    public Integer getMoveCount() { return moveCount; }
    public String getAnalysisJson() { return analysisJson; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
