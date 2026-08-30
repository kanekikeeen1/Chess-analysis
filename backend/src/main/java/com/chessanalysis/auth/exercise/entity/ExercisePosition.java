package com.chessanalysis.auth.exercise.entity;

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
@Table(name = "exercise_positions")
public class ExercisePosition {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lesson_id", nullable = false)
    private ExerciseLesson lesson;

    @Column(name = "starting_fen", nullable = false, length = 180)
    private String startingFen;

    @Column(name = "goal_type", nullable = false, length = 24)
    private String goalType;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(nullable = false)
    private boolean active;

    protected ExercisePosition() {}

    public Long getId() { return id; }
    public ExerciseLesson getLesson() { return lesson; }
    public String getStartingFen() { return startingFen; }
    public String getGoalType() { return goalType; }
}
