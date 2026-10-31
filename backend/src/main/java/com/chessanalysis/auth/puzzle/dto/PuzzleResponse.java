package com.chessanalysis.auth.puzzle.dto;

import java.util.Arrays;
import java.util.List;

import com.chessanalysis.auth.puzzle.entity.Puzzle;

/** Một puzzle gửi cho người giải. Không chứa lời giải: server giữ và kiểm tra từng nước. */
public record PuzzleResponse(
        Long id,
        String lichessId,
        String startFen,
        String playerSide,
        int rating,
        List<String> themes,
        int solutionLength,
        String gameUrl) {

    public static PuzzleResponse from(Puzzle puzzle) {
        return new PuzzleResponse(
                puzzle.getId(), puzzle.getLichessId(), puzzle.getStartFen(), puzzle.getStartFen().split(" ")[1],
                puzzle.getRating(), Arrays.asList(puzzle.getThemes().split(" ")), puzzle.getSolutionLength(),
                puzzle.getGameUrl());
    }
}
