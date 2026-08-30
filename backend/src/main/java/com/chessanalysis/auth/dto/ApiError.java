package com.chessanalysis.auth.dto;

import java.time.Instant;
import java.util.Map;

public record ApiError(String message, Map<String, String> fields, Instant timestamp) {
    public ApiError(String message) {
        this(message, Map.of(), Instant.now());
    }
}
