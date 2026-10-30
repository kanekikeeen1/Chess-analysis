package com.chessanalysis.auth.analysis.dto;

/** Ràng buộc chung cho nước đi dạng UCI, ví dụ {@code e2e4} hoặc {@code e7e8q}. */
public final class UciMove {
    public static final String PATTERN = "[a-h][1-8][a-h][1-8][qrbn]?";
    public static final String MESSAGE = "Nước đi phải ở dạng UCI, ví dụ e2e4 hoặc e7e8q.";

    private UciMove() {}
}
