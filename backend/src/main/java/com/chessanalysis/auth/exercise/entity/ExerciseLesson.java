package com.chessanalysis.auth.exercise.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "exercise_lessons")
public class ExerciseLesson {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String slug;

    @Column(nullable = false, length = 16)
    private String category;

    @Column(name = "group_name", nullable = false, length = 80)
    private String groupName;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(name = "starting_fen", length = 180)
    private String startingFen;

    @Column(name = "solution_line", nullable = false, length = 1000)
    private String solutionLine;

    @Column(nullable = false, length = 32)
    private String difficulty;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(nullable = false)
    private boolean active;

    protected ExerciseLesson() {}

    public Long getId() { return id; }
    public String getSlug() { return slug; }
    public String getCategory() { return category; }
    public String getGroupName() { return groupName; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getStartingFen() { return startingFen; }
    public String getSolutionLine() { return solutionLine; }
    public String getDifficulty() { return difficulty; }
    public Integer getSortOrder() { return sortOrder; }
    public boolean isActive() { return active; }
}
