package com.chessanalysis.auth.analysis.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.chessanalysis.auth.analysis.entity.AnalysisJob;

public interface AnalysisJobRepository extends JpaRepository<AnalysisJob, Long> {
    Optional<AnalysisJob> findByPublicId(String publicId);
    List<AnalysisJob> findAllByStatusIn(List<String> statuses);
}
