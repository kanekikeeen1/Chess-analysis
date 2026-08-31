package com.chessanalysis.auth.analysis.engine;

/** Không mượn được engine trong thời gian chờ cho phép. */
public class EngineUnavailableException extends RuntimeException {
    public EngineUnavailableException(String message) {
        super(message);
    }
}
