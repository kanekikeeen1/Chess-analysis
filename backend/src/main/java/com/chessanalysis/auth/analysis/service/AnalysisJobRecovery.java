package com.chessanalysis.auth.analysis.service;

import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.analysis.entity.AnalysisJob;
import com.chessanalysis.auth.analysis.repository.AnalysisJobRepository;

/**
 * Dọn các tác vụ mồ côi sau khi máy chủ khởi động lại.
 *
 * <p>Hàng đợi nằm trong bộ nhớ, nên mọi job còn QUEUED hoặc RUNNING lúc tắt máy
 * sẽ không bao giờ chạy tiếp. Không đánh dấu chúng thất bại thì frontend poll
 * mãi mà không có gì xảy ra.
 */
@Component
public class AnalysisJobRecovery {
    private static final Logger LOGGER = LoggerFactory.getLogger(AnalysisJobRecovery.class);

    private final AnalysisJobRepository jobs;

    public AnalysisJobRecovery(AnalysisJobRepository jobs) {
        this.jobs = jobs;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void failOrphanedJobs() {
        List<AnalysisJob> orphans = jobs.findAllByStatusIn(List.of("QUEUED", "RUNNING"));
        if (orphans.isEmpty()) return;
        Instant now = Instant.now();
        for (AnalysisJob job : orphans) {
            job.fail("Máy chủ khởi động lại khi tác vụ đang chạy. Hãy phân tích lại ván này.", now);
        }
        LOGGER.warn("Đã đánh dấu thất bại {} tác vụ phân tích mồ côi.", orphans.size());
    }
}
