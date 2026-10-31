package com.chessanalysis.auth.puzzle.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Puzzle đã nhập từ Lichess (chỉ đọc; dữ liệu do {@code PuzzleImportService} ghi). */
@Entity
@Table(name = "puzzles")
public class Puzzle {
    @Id
    private Long id;

    @Column(name = "lichess_id", nullable = false, length = 8)
    private String lichessId;

    @Column(name = "source_fen", nullable = false, length = 100)
    private String sourceFen;

    @Column(name = "setup_move", nullable = false, length = 5)
    private String setupMove;

    @Column(name = "start_fen", nullable = false, length = 100)
    private String startFen;

    @Column(nullable = false, length = 255)
    private String solution;

    @Column(name = "solution_length", nullable = false)
    private int solutionLength;

    @Column(nullable = false)
    private int rating;

    @Column(name = "rating_deviation", nullable = false)
    private int ratingDeviation;

    @Column(nullable = false)
    private int popularity;

    @Column(name = "nb_plays", nullable = false)
    private int nbPlays;

    @Column(nullable = false, length = 300)
    private String themes;

    @Column(name = "opening_tags", length = 255)
    private String openingTags;

    @Column(name = "game_url", length = 120)
    private String gameUrl;

    @Column(name = "imported_at", nullable = false)
    private Instant importedAt;

    protected Puzzle() {}

    public Long getId() { return id; }
    public String getLichessId() { return lichessId; }
    public String getSourceFen() { return sourceFen; }
    public String getSetupMove() { return setupMove; }
    public String getStartFen() { return startFen; }
    public String getSolution() { return solution; }
    public int getSolutionLength() { return solutionLength; }
    public int getRating() { return rating; }
    public int getRatingDeviation() { return ratingDeviation; }
    public int getPopularity() { return popularity; }
    public int getNbPlays() { return nbPlays; }
    public String getThemes() { return themes; }
    public String getOpeningTags() { return openingTags; }
    public String getGameUrl() { return gameUrl; }
}
