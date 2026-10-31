package com.chessanalysis.auth.analysis.engine;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Pool tiến trình Stockfish có giới hạn cứng.
 *
 * <p>Bản trước mở một tiến trình mới cho mỗi tác vụ và mỗi lần chấm nước đi:
 * chi phí khởi động UCI lặp lại, và không có gì chặn số tiến trình khi nhiều
 * người dùng cùng bấm review. Pool này giữ số tiến trình sống luôn ≤
 * {@code app.stockfish.pool-size}; ai xin thêm thì xếp hàng chờ, quá hạn thì
 * nhận lỗi rõ ràng thay vì làm máy chủ nghẽn.
 */
@Component
public class StockfishEnginePool implements DisposableBean {
    private static final Logger LOGGER = LoggerFactory.getLogger(StockfishEnginePool.class);

    private final String executable;
    private final int threads;
    private final int hashMb;
    private final Duration positionTimeout;
    private final Duration acquireTimeout;
    private final Duration idleTimeout;
    private final int poolSize;

    private final Semaphore permits;
    private final Deque<Parked> idle = new ArrayDeque<>();
    private final AtomicLong borrowed = new AtomicLong();
    private final AtomicLong reused = new AtomicLong();
    private final AtomicLong started = new AtomicLong();
    private volatile boolean shuttingDown;

    public StockfishEnginePool(
            @Value("${app.stockfish.path:stockfish}") String executable,
            @Value("${app.stockfish.threads:2}") int threads,
            @Value("${app.stockfish.hash-mb:128}") int hashMb,
            @Value("${app.stockfish.position-timeout-seconds:120}") int positionTimeoutSeconds,
            @Value("${app.stockfish.pool-size:2}") int poolSize,
            @Value("${app.stockfish.acquire-timeout-seconds:60}") int acquireTimeoutSeconds,
            @Value("${app.stockfish.idle-timeout-seconds:300}") int idleTimeoutSeconds) {
        this.executable = executable;
        this.threads = threads;
        this.hashMb = hashMb;
        this.positionTimeout = Duration.ofSeconds(Math.max(20, positionTimeoutSeconds));
        this.acquireTimeout = Duration.ofSeconds(Math.max(5, acquireTimeoutSeconds));
        this.idleTimeout = Duration.ofSeconds(Math.max(30, idleTimeoutSeconds));
        this.poolSize = Math.max(1, poolSize);
        this.permits = new Semaphore(this.poolSize, true);
    }

    /**
     * Mượn một engine. Luôn dùng trong try-with-resources; khi đóng, engine
     * quay lại pool nếu còn khỏe, còn không thì bị hủy và lần mượn sau tạo mới.
     */
    public Lease borrow() {
        return borrow(acquireTimeout);
    }

    /**
     * Như {@link #borrow()} nhưng chờ tối đa {@code wait}. Dùng cho việc phụ, như chấm điểm gợi ý M2, để
     * khi pool đang bận review thì bỏ qua sớm thay vì giữ request của người dùng cả phút.
     */
    public Lease borrow(Duration wait) {
        if (shuttingDown) throw new IllegalStateException("Máy chủ đang tắt, không nhận thêm phân tích.");
        boolean acquired;
        try {
            acquired = permits.tryAcquire(wait.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Tác vụ Stockfish đã bị hủy khi chờ engine.", exception);
        }
        if (!acquired) {
            throw new EngineUnavailableException(
                    "Tất cả " + poolSize + " tiến trình Stockfish đang bận. Hãy thử lại sau ít phút.");
        }
        try {
            StockfishEngine engine = takeIdle();
            if (engine == null) {
                engine = new StockfishEngine(executable, threads, hashMb, positionTimeout);
                started.incrementAndGet();
            } else {
                reused.incrementAndGet();
            }
            borrowed.incrementAndGet();
            return new Lease(engine);
        } catch (RuntimeException exception) {
            permits.release();
            throw exception;
        }
    }

    private synchronized StockfishEngine takeIdle() {
        Instant cutoff = Instant.now().minus(idleTimeout);
        while (!idle.isEmpty()) {
            Parked parked = idle.pollFirst();
            if (!parked.engine().healthy() || parked.since().isBefore(cutoff)) {
                closeQuietly(parked.engine());
                continue;
            }
            return parked.engine();
        }
        return null;
    }

    private synchronized void park(StockfishEngine engine) {
        idle.addFirst(new Parked(engine, Instant.now()));
    }

    private void closeQuietly(StockfishEngine engine) {
        try {
            engine.close();
        } catch (RuntimeException exception) {
            LOGGER.debug("Không đóng sạch được tiến trình Stockfish", exception);
        }
    }

    public PoolStats stats() {
        synchronized (this) {
            return new PoolStats(poolSize, idle.size(), poolSize - permits.availablePermits(),
                    borrowed.get(), reused.get(), started.get());
        }
    }

    @Override
    public void destroy() {
        shuttingDown = true;
        synchronized (this) {
            while (!idle.isEmpty()) closeQuietly(idle.pollFirst().engine());
        }
    }

    /** Quyền dùng một engine trong một khoảng thời gian. */
    public final class Lease implements AutoCloseable {
        private final StockfishEngine engine;
        private boolean broken;
        private boolean closed;

        private Lease(StockfishEngine engine) {
            this.engine = engine;
        }

        public StockfishEngine engine() {
            return engine;
        }

        /** Đánh dấu engine không còn tin được; đóng lease sẽ hủy tiến trình. */
        public void discard() {
            broken = true;
        }

        @Override
        public void close() {
            if (closed) return;
            closed = true;
            try {
                if (broken || !engine.healthy() || shuttingDown) {
                    closeQuietly(engine);
                } else {
                    park(engine);
                }
            } finally {
                permits.release();
            }
        }
    }

    public record PoolStats(int size, int idleCount, int inUse, long totalBorrows,
            long reusedEngines, long startedProcesses) {}

    private record Parked(StockfishEngine engine, Instant since) {}
}
