package com.chessanalysis.auth.analysis.service;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.chessanalysis.auth.analysis.dto.CreateAnalysisJobRequest;
import com.chessanalysis.auth.service.ApiException;

import jakarta.annotation.PostConstruct;

/**
 * Hàng đợi phân tích thật, thay cho {@code @Async}.
 *
 * <p>Với {@code @Async} và một {@code ThreadPoolTaskExecutor}, khi hàng đợi đầy
 * Spring ném {@code RejectedExecutionException} ở giữa giao dịch tạo job: người
 * dùng nhận lỗi 500 còn bản ghi job vẫn nằm lại ở trạng thái QUEUED vĩnh viễn.
 * Ở đây hàng đợi được kiểm tra trước, có độ sâu quan sát được, và người dùng
 * nhận đúng mã 503 kèm thông báo tiếng Việt khi hệ thống quá tải.
 */
@Component
public class AnalysisJobQueue implements DisposableBean {
    private static final Logger LOGGER = LoggerFactory.getLogger(AnalysisJobQueue.class);

    private final AnalysisWorker worker;
    private final AnalysisJobStateService state;
    private final int workerCount;
    private final BlockingQueue<Task> queue;
    private final AtomicInteger running = new AtomicInteger();
    private ExecutorService executor;
    private volatile boolean shuttingDown;

    public AnalysisJobQueue(
            AnalysisWorker worker,
            AnalysisJobStateService state,
            @Value("${app.analysis.workers:2}") int workerCount,
            @Value("${app.analysis.queue-capacity:32}") int queueCapacity) {
        this.worker = worker;
        this.state = state;
        this.workerCount = Math.max(1, workerCount);
        this.queue = new ArrayBlockingQueue<>(Math.max(1, queueCapacity));
    }

    @PostConstruct
    void start() {
        executor = Executors.newFixedThreadPool(workerCount, runnable -> {
            Thread thread = new Thread(runnable);
            thread.setName("analysis-worker-" + thread.getId());
            thread.setDaemon(true);
            return thread;
        });
        for (int index = 0; index < workerCount; index++) {
            executor.submit(this::consume);
        }
        LOGGER.info("Hàng đợi phân tích khởi động với {} worker, sức chứa {}", workerCount, queue.remainingCapacity());
    }

    public void submit(Long jobId, CreateAnalysisJobRequest request) {
        if (shuttingDown) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Máy chủ đang tắt, hãy thử lại sau.");
        }
        if (!queue.offer(new Task(jobId, request))) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Hàng đợi phân tích đã đầy. Hãy thử lại sau vài phút.");
        }
    }

    private void consume() {
        while (!shuttingDown) {
            Task task;
            try {
                task = queue.poll(1, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return;
            }
            if (task == null) continue;
            running.incrementAndGet();
            try {
                worker.process(task.jobId(), task.request());
            } catch (RuntimeException exception) {
                // AnalysisWorker đã tự bắt lỗi; đây là lưới an toàn cuối cùng để
                // job không bị treo mãi ở trạng thái QUEUED nếu có gì lọt qua.
                LOGGER.error("Tác vụ phân tích {} thoát bất thường", task.jobId(), exception);
                safeFail(task.jobId(), exception);
            } finally {
                running.decrementAndGet();
            }
        }
    }

    private void safeFail(Long jobId, RuntimeException cause) {
        try {
            state.fail(jobId, cause.getMessage());
        } catch (RuntimeException ignored) {
            LOGGER.warn("Không ghi được trạng thái thất bại cho tác vụ {}", jobId);
        }
    }

    public QueueStats stats() {
        return new QueueStats(queue.size(), running.get(), workerCount, queue.remainingCapacity());
    }

    @Override
    public void destroy() {
        shuttingDown = true;
        if (executor == null) return;
        executor.shutdownNow();
        try {
            if (!executor.awaitTermination(10, TimeUnit.SECONDS)) {
                LOGGER.warn("Worker phân tích chưa dừng hết sau 10 giây.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }

    public record QueueStats(int queued, int running, int workers, int remainingCapacity) {}

    private record Task(Long jobId, CreateAnalysisJobRequest request) {}
}
