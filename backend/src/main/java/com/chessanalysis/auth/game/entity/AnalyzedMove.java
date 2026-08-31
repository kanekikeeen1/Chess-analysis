package com.chessanalysis.auth.game.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Một nước đi đã phân tích, lưu phẳng thay vì nằm trong khối analysis_json.
 * Đây là bảng sự kiện cho toàn bộ phần học máy: M1 đọc cột đặc trưng để huấn
 * luyện bộ phân loại, M3 đọc error_theme để dựng hồ sơ điểm yếu.
 */
@Entity
@Table(name = "analyzed_moves")
public class AnalyzedMove {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "game_id", nullable = false)
    private Long gameId;

    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false)
    private int ply;

    @Column(name = "move_number", nullable = false)
    private int moveNumber;

    @Column(name = "side_to_move", nullable = false, length = 1)
    private String sideToMove;

    @Column(nullable = false, length = 12)
    private String phase;

    @Column(nullable = false, length = 32)
    private String san;

    @Column(nullable = false, length = 6)
    private String uci;

    @Column(name = "before_fen", nullable = false, length = 180)
    private String beforeFen;

    @Column(name = "after_fen", nullable = false, length = 180)
    private String afterFen;

    @Column(name = "engine_depth")
    private Integer engineDepth;

    @Column(name = "eval_before_cp")
    private Integer evalBeforeCp;

    @Column(name = "eval_after_cp")
    private Integer evalAfterCp;

    @Column(name = "mate_before")
    private Integer mateBefore;

    @Column(name = "mate_after")
    private Integer mateAfter;

    @Column(name = "best_move_uci", length = 6)
    private String bestMoveUci;

    @Column(name = "second_best_uci", length = 6)
    private String secondBestUci;

    @Column(name = "pv_gap_cp")
    private Integer pvGapCp;

    @Column(name = "centipawn_loss")
    private Integer centipawnLoss;

    @Column(name = "win_percent_loss")
    private Double winPercentLoss;

    private Double accuracy;

    @Column(name = "is_best", nullable = false)
    private boolean best;

    @Column(name = "is_capture", nullable = false)
    private boolean capture;

    @Column(name = "is_check", nullable = false)
    private boolean check;

    @Column(name = "is_checkmate", nullable = false)
    private boolean checkmate;

    @Column(name = "is_promotion", nullable = false)
    private boolean promotion;

    @Column(name = "is_castle", nullable = false)
    private boolean castle;

    @Column(name = "is_theory", nullable = false)
    private boolean theory;

    @Column(name = "theory_name", length = 250)
    private String theoryName;

    @Column(name = "legal_move_count")
    private Integer legalMoveCount;

    @Column(name = "sacrifice_value")
    private Double sacrificeValue;

    @Column(name = "sacrifice_kind", length = 12)
    private String sacrificeKind;

    @Column(name = "material_balance")
    private Integer materialBalance;

    @Column(name = "piece_count")
    private Integer pieceCount;

    @Column(name = "rule_label", nullable = false, length = 16)
    private String ruleLabel;

    @Column(name = "ml_label", length = 16)
    private String mlLabel;

    @Column(name = "ml_confidence")
    private Double mlConfidence;

    @Column(name = "error_theme", length = 48)
    private String errorTheme;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AnalyzedMove() {}

    public AnalyzedMove(Long gameId, Long userId, int ply, String san, String uci,
            String beforeFen, String afterFen, String ruleLabel, Instant createdAt) {
        this.gameId = gameId;
        this.userId = userId;
        this.ply = ply;
        this.moveNumber = (ply + 1) / 2;
        this.sideToMove = ply % 2 == 1 ? "w" : "b";
        this.phase = "MIDDLEGAME";
        this.san = san;
        this.uci = uci;
        this.beforeFen = beforeFen;
        this.afterFen = afterFen;
        this.ruleLabel = ruleLabel;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public Long getGameId() { return gameId; }
    public Long getUserId() { return userId; }
    public int getPly() { return ply; }
    public int getMoveNumber() { return moveNumber; }
    public String getSideToMove() { return sideToMove; }
    public String getPhase() { return phase; }
    public String getSan() { return san; }
    public String getUci() { return uci; }
    public String getBeforeFen() { return beforeFen; }
    public String getAfterFen() { return afterFen; }
    public Integer getEngineDepth() { return engineDepth; }
    public Integer getEvalBeforeCp() { return evalBeforeCp; }
    public Integer getEvalAfterCp() { return evalAfterCp; }
    public Integer getMateBefore() { return mateBefore; }
    public Integer getMateAfter() { return mateAfter; }
    public String getBestMoveUci() { return bestMoveUci; }
    public String getSecondBestUci() { return secondBestUci; }
    public Integer getPvGapCp() { return pvGapCp; }
    public Integer getCentipawnLoss() { return centipawnLoss; }
    public Double getWinPercentLoss() { return winPercentLoss; }
    public Double getAccuracy() { return accuracy; }
    public boolean isBest() { return best; }
    public boolean isCapture() { return capture; }
    public boolean isCheck() { return check; }
    public boolean isCheckmate() { return checkmate; }
    public boolean isPromotion() { return promotion; }
    public boolean isCastle() { return castle; }
    public boolean isTheory() { return theory; }
    public String getTheoryName() { return theoryName; }
    public Integer getLegalMoveCount() { return legalMoveCount; }
    public Double getSacrificeValue() { return sacrificeValue; }
    public String getSacrificeKind() { return sacrificeKind; }
    public Integer getMaterialBalance() { return materialBalance; }
    public Integer getPieceCount() { return pieceCount; }
    public String getRuleLabel() { return ruleLabel; }
    public String getMlLabel() { return mlLabel; }
    public Double getMlConfidence() { return mlConfidence; }
    public String getErrorTheme() { return errorTheme; }
    public Instant getCreatedAt() { return createdAt; }

    public void setPhase(String phase) { this.phase = phase; }
    public void setEngineDepth(Integer engineDepth) { this.engineDepth = engineDepth; }
    public void setEvalBeforeCp(Integer evalBeforeCp) { this.evalBeforeCp = evalBeforeCp; }
    public void setEvalAfterCp(Integer evalAfterCp) { this.evalAfterCp = evalAfterCp; }
    public void setMateBefore(Integer mateBefore) { this.mateBefore = mateBefore; }
    public void setMateAfter(Integer mateAfter) { this.mateAfter = mateAfter; }
    public void setBestMoveUci(String bestMoveUci) { this.bestMoveUci = bestMoveUci; }
    public void setSecondBestUci(String secondBestUci) { this.secondBestUci = secondBestUci; }
    public void setPvGapCp(Integer pvGapCp) { this.pvGapCp = pvGapCp; }
    public void setCentipawnLoss(Integer centipawnLoss) { this.centipawnLoss = centipawnLoss; }
    public void setWinPercentLoss(Double winPercentLoss) { this.winPercentLoss = winPercentLoss; }
    public void setAccuracy(Double accuracy) { this.accuracy = accuracy; }
    public void setBest(boolean best) { this.best = best; }
    public void setCapture(boolean capture) { this.capture = capture; }
    public void setCheck(boolean check) { this.check = check; }
    public void setCheckmate(boolean checkmate) { this.checkmate = checkmate; }
    public void setPromotion(boolean promotion) { this.promotion = promotion; }
    public void setCastle(boolean castle) { this.castle = castle; }
    public void setTheory(boolean theory) { this.theory = theory; }
    public void setTheoryName(String theoryName) { this.theoryName = theoryName; }
    public void setLegalMoveCount(Integer legalMoveCount) { this.legalMoveCount = legalMoveCount; }
    public void setSacrificeValue(Double sacrificeValue) { this.sacrificeValue = sacrificeValue; }
    public void setSacrificeKind(String sacrificeKind) { this.sacrificeKind = sacrificeKind; }
    public void setMaterialBalance(Integer materialBalance) { this.materialBalance = materialBalance; }
    public void setPieceCount(Integer pieceCount) { this.pieceCount = pieceCount; }
    public void setMlLabel(String mlLabel) { this.mlLabel = mlLabel; }
    public void setMlConfidence(Double mlConfidence) { this.mlConfidence = mlConfidence; }
    public void setErrorTheme(String errorTheme) { this.errorTheme = errorTheme; }
}
