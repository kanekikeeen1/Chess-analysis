package com.chessanalysis.auth.analysis.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chessanalysis.auth.analysis.engine.StockfishEnginePool;
import com.chessanalysis.auth.analysis.service.AnalysisJobQueue;
import com.chessanalysis.auth.analysis.service.PositionEvaluationCache;

/**
 * Số liệu vận hành của tầng phân tích.
 *
 * <p>Không chỉ để giám sát: chương thực nghiệm của báo cáo cần con số tỉ lệ
 * trúng cache và mức độ dùng lại tiến trình engine, và đây là chỗ đọc chúng.
 */
@RestController
@RequestMapping("/api/analysis/metrics")
public class AnalysisMetricsController {
    private final PositionEvaluationCache cache;
    private final StockfishEnginePool pool;
    private final AnalysisJobQueue queue;

    public AnalysisMetricsController(
            PositionEvaluationCache cache,
            StockfishEnginePool pool,
            AnalysisJobQueue queue) {
        this.cache = cache;
        this.pool = pool;
        this.queue = queue;
    }

    @GetMapping
    public Map<String, Object> metrics() {
        return Map.of(
                "cache", cache.stats(),
                "enginePool", pool.stats(),
                "queue", queue.stats());
    }
}
