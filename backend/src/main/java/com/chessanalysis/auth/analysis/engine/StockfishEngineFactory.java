package com.chessanalysis.auth.analysis.engine;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class StockfishEngineFactory {
    private final String executable;
    private final int threads;
    private final int hashMb;
    private final Duration timeout;

    public StockfishEngineFactory(
            @Value("${app.stockfish.path:stockfish}") String executable,
            @Value("${app.stockfish.threads:2}") int threads,
            @Value("${app.stockfish.hash-mb:128}") int hashMb,
            @Value("${app.stockfish.position-timeout-seconds:120}") int timeoutSeconds) {
        this.executable = executable;
        this.threads = threads;
        this.hashMb = hashMb;
        this.timeout = Duration.ofSeconds(Math.max(20, timeoutSeconds));
    }

    public StockfishEngine open() {
        return new StockfishEngine(executable, threads, hashMb, timeout);
    }
}
