package com.chessanalysis.auth.analysis.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.chessanalysis.auth.analysis.dto.CreateAnalysisJobRequest;
import com.chessanalysis.auth.analysis.entity.AnalysisJob;
import com.chessanalysis.auth.analysis.repository.AnalysisJobRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Xử lý các tác vụ dở dang sau khi máy chủ khởi động lại.
 *
 * <p>Hàng đợi nằm trong bộ nhớ, nên job QUEUED/RUNNING lúc tắt máy sẽ không tự
 * chạy tiếp. Yêu cầu gốc đã được lưu trong {@code request_json}, nên job còn mới
 * được xếp hàng lại từ đầu; các vị trí đã phân tích trước đó nằm sẵn trong cache
 * đánh giá nên lần chạy lại nhanh hơn nhiều. Job quá cũ (người dùng gần như chắc
 * chắn đã rời trang) hoặc không đọc lại được thì đánh dấu thất bại như trước.
 */
@Component
public class AnalysisJobRecovery {
    private static final Logger LOGGER = LoggerFactory.getLogger(AnalysisJobRecovery.class);
    private static final Duration REQUEUE_WINDOW = Duration.ofHours(1);

    private final AnalysisJobRepository jobs;
    private final AnalysisJobStateService state;
    private final AnalysisJobQueue queue;
    private final ObjectMapper objectMapper;

    public AnalysisJobRecovery(
            AnalysisJobRepository jobs,
            AnalysisJobStateService state,
            AnalysisJobQueue queue,
            ObjectMapper objectMapper) {
        this.jobs = jobs;
        this.state = state;
        this.queue = queue;
        this.objectMapper = objectMapper;
    }

    /**
     * Không chạy trong một giao dịch chung: trạng thái QUEUED phải được commit
     * trước khi đưa vào hàng đợi, nếu không worker có thể đánh dấu RUNNING rồi bị
     * lần commit sau ghi đè.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void recoverOrphanedJobs() {
        List<AnalysisJob> orphans = jobs.findAllByStatusIn(List.of("QUEUED", "RUNNING"));
        if (orphans.isEmpty()) return;

        Instant cutoff = Instant.now().minus(REQUEUE_WINDOW);
        int requeued = 0;
        for (AnalysisJob job : orphans) {
            if (job.getUpdatedAt().isBefore(cutoff)) {
                state.fail(job.getId(), "Máy chủ khởi động lại khi tác vụ đang chạy. Hãy phân tích lại ván này.");
                continue;
            }
            try {
                CreateAnalysisJobRequest request =
                        objectMapper.readValue(job.getRequestJson(), CreateAnalysisJobRequest.class);
                state.requeue(job.getId());
                queue.submit(job.getId(), request);
                requeued++;
            } catch (Exception exception) {
                LOGGER.warn("Không xếp hàng lại được tác vụ {}", job.getId(), exception);
                state.fail(job.getId(), "Máy chủ khởi động lại và không thể tiếp tục tác vụ. Hãy phân tích lại ván này.");
            }
        }
        LOGGER.warn("Khôi phục {} tác vụ mồ côi: {} xếp hàng lại, {} thất bại.",
                orphans.size(), requeued, orphans.size() - requeued);
    }
}
