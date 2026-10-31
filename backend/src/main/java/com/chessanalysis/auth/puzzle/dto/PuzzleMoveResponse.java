package com.chessanalysis.auth.puzzle.dto;

import java.util.List;

/**
 * Kết quả một nước. Khi sai: {@code expectedMove} là nước đúng. Khi phiên kết thúc:
 * {@code solution} là phần lời giải còn lại tính từ nước vừa đi (để xem lại), và
 * {@code ratingChange} có giá trị nếu lượt giải được tính rating.
 */
public record PuzzleMoveResponse(
        PuzzleSessionResponse session,
        boolean correct,
        String playedUci,
        String opponentReply,
        String expectedMove,
        List<String> solution,
        RatingChange ratingChange) {

    public record RatingChange(int before, int after, int delta, int deviation, boolean provisional) {}
}
