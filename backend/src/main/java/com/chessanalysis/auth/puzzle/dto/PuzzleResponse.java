package com.chessanalysis.auth.puzzle.dto;

import java.util.List;

/** Một puzzle gửi cho người giải. Không chứa lời giải: server giữ và kiểm tra từng nước. */
public record PuzzleResponse(
        Long id,
        String lichessId,
        String startFen,
        String playerSide,
        int rating,
        List<String> themes,
        int solutionLength,
        String gameUrl) {}
