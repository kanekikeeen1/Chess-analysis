package com.chessanalysis.auth.exercise.controller;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chessanalysis.auth.exercise.dto.ExerciseAttemptRequest;
import com.chessanalysis.auth.exercise.dto.ExerciseAttemptResponse;
import com.chessanalysis.auth.exercise.dto.ExerciseProgressResponse;
import com.chessanalysis.auth.exercise.dto.ExerciseResponse;
import com.chessanalysis.auth.exercise.dto.ExercisePositionResponse;
import com.chessanalysis.auth.exercise.service.ExerciseService;
import com.chessanalysis.auth.web.SessionCookieReader;

@RestController
@RequestMapping("/api/exercises")
public class ExerciseController {
    private final ExerciseService exercises;
    private final SessionCookieReader cookies;

    public ExerciseController(ExerciseService exercises, SessionCookieReader cookies) {
        this.exercises = exercises;
        this.cookies = cookies;
    }

    @GetMapping
    public List<ExerciseResponse> list() {
        return exercises.list();
    }

    @GetMapping("/{slug}")
    public ExerciseResponse get(@PathVariable String slug) {
        return exercises.get(slug);
    }

    @GetMapping("/{slug}/positions/random")
    public ExercisePositionResponse randomPosition(@PathVariable String slug) {
        return exercises.randomPosition(slug);
    }

    @PostMapping("/{slug}/attempts")
    public ResponseEntity<ExerciseAttemptResponse> recordAttempt(
            @PathVariable String slug,
            @Valid @RequestBody ExerciseAttemptRequest request,
            HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(exercises.recordAttempt(cookies.read(servletRequest), slug, request));
    }

    @GetMapping("/progress/me")
    public ExerciseProgressResponse progress(HttpServletRequest request) {
        return exercises.progress(cookies.read(request));
    }
}
