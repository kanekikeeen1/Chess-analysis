package com.chessanalysis.auth.analysis.controller;

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

import com.chessanalysis.auth.analysis.dto.AnalysisJobResponse;
import com.chessanalysis.auth.analysis.dto.CreateAnalysisJobRequest;
import com.chessanalysis.auth.analysis.dto.EvaluateMoveRequest;
import com.chessanalysis.auth.analysis.dto.EvaluateMoveResponse;
import com.chessanalysis.auth.analysis.service.AnalysisJobService;
import com.chessanalysis.auth.analysis.service.MoveEvaluationService;
import com.chessanalysis.auth.web.SessionCookieReader;

@RestController
@RequestMapping("/api/analysis")
public class AnalysisController {
    private final AnalysisJobService jobs;
    private final MoveEvaluationService moveEvaluation;
    private final SessionCookieReader cookies;

    public AnalysisController(
            AnalysisJobService jobs,
            MoveEvaluationService moveEvaluation,
            SessionCookieReader cookies) {
        this.jobs = jobs;
        this.moveEvaluation = moveEvaluation;
        this.cookies = cookies;
    }

    @PostMapping("/jobs")
    public ResponseEntity<AnalysisJobResponse> create(
            @Valid @RequestBody CreateAnalysisJobRequest request,
            HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(jobs.create(cookies.read(servletRequest), request));
    }

    @GetMapping("/jobs/{publicId}")
    public AnalysisJobResponse get(@PathVariable String publicId) {
        return jobs.get(publicId);
    }

    @PostMapping("/evaluate-move")
    public EvaluateMoveResponse evaluateMove(@Valid @RequestBody EvaluateMoveRequest request) {
        return moveEvaluation.evaluate(request);
    }
}
