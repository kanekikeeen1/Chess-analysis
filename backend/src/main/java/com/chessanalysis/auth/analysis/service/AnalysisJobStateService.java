package com.chessanalysis.auth.analysis.service;

import java.time.Instant;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.analysis.entity.AnalysisJob;
import com.chessanalysis.auth.analysis.repository.AnalysisJobRepository;

@Service
public class AnalysisJobStateService {
    private final AnalysisJobRepository jobs;

    public AnalysisJobStateService(AnalysisJobRepository jobs) {
        this.jobs = jobs;
    }

    @Transactional
    public void requeue(Long id) {
        find(id).requeue(Instant.now());
    }

    @Transactional
    public void markRunning(Long id) {
        find(id).markRunning(Instant.now());
    }

    @Transactional
    public void progress(Long id, int completed, int current, String partialResult) {
        find(id).updateProgress(completed, current, partialResult, Instant.now());
    }

    @Transactional
    public void complete(Long id, String result) {
        find(id).complete(result, Instant.now());
    }

    @Transactional
    public void fail(Long id, String message) {
        find(id).fail(message, Instant.now());
    }

    private AnalysisJob find(Long id) {
        return jobs.findById(id).orElseThrow(() -> new IllegalStateException("Analysis job is missing."));
    }
}
