package com.chessanalysis.auth.profile.dto;

import java.time.Instant;

/**
 * Elo ước lượng của người dùng qua mọi ván đã lưu có ghi bên mình cầm.
 *
 * @param estimatedElo {@code null} khi chưa có ván nào để ước lượng
 * @param eloStdError  độ lệch chuẩn hậu nghiệm; nhỏ dần khi có thêm ván
 */
public record PlayingProfileResponse(
        Integer estimatedElo,
        Integer eloStdError,
        int gamesAnalyzed,
        int movesAnalyzed,
        Instant lastEstimatedAt) {}
