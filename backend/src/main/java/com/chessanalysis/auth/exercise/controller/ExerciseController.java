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

import com.chessanalysis.auth.exercise.dto.ExerciseMoveRequest;
import com.chessanalysis.auth.exercise.dto.ExerciseMoveResponse;
import com.chessanalysis.auth.exercise.dto.ExerciseProgressResponse;
import com.chessanalysis.auth.exercise.dto.ExerciseResponse;
import com.chessanalysis.auth.exercise.dto.ExerciseSessionResponse;
import com.chessanalysis.auth.exercise.dto.StartExerciseSessionRequest;
import com.chessanalysis.auth.exercise.service.ExerciseService;
import com.chessanalysis.auth.exercise.service.ExerciseSessionService;
import com.chessanalysis.auth.web.SessionCookieReader;

@RestController
@RequestMapping("/api/exercises")
public class ExerciseController {
    private final ExerciseService exercises;
    private final ExerciseSessionService sessions;
    private final SessionCookieReader cookies;

    public ExerciseController(ExerciseService exercises, ExerciseSessionService sessions, SessionCookieReader cookies) {
        this.exercises = exercises;
        this.sessions = sessions;
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

    /** Bắt đầu một phiên tàn cuộc: thế ngẫu nhiên, hoặc chơi lại đúng {@code positionId}. */
    @PostMapping("/{slug}/sessions")
    public ResponseEntity<ExerciseSessionResponse> startSession(
            @PathVariable String slug,
            @RequestBody(required = false) StartExerciseSessionRequest request,
            HttpServletRequest servletRequest) {
        Long positionId = request == null ? null : request.positionId();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(sessions.start(cookies.read(servletRequest), slug, positionId));
    }

    @PostMapping("/sessions/{sessionId}/moves")
    public ExerciseMoveResponse move(
            @PathVariable String sessionId,
            @Valid @RequestBody ExerciseMoveRequest request,
            HttpServletRequest servletRequest) {
        return sessions.move(cookies.read(servletRequest), sessionId, request.uci());
    }

    @GetMapping("/progress/me")
    public ExerciseProgressResponse progress(HttpServletRequest request) {
        return exercises.progress(cookies.read(request));
    }
}
