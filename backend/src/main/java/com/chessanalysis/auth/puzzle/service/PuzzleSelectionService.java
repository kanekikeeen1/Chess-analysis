package com.chessanalysis.auth.puzzle.service;

import java.util.Optional;

import org.springframework.stereotype.Service;

import com.chessanalysis.auth.puzzle.entity.Puzzle;
import com.chessanalysis.auth.puzzle.repository.PuzzleRepository;

/**
 * Chọn puzzle có độ khó gần trình độ người học.
 *
 * <p>Khi rating người học bằng rating puzzle, Glicko-2 dự đoán xác suất giải đúng
 * khoảng 50%: đủ khó để học được điều mới mà không quá khó để nản. Puzzle được lấy
 * ngẫu nhiên trong khoảng ±100 quanh rating người học, nới dần nếu khoảng đó không
 * còn puzzle (ví dụ đã làm hết, hoặc theme hiếm), và không lặp lại puzzle đã làm cho
 * tới khi không còn lựa chọn nào khác.
 */
@Service
public class PuzzleSelectionService {
    static final int[] WINDOWS = {100, 200, 400, 800, 3000};

    private final PuzzleRepository puzzles;

    public PuzzleSelectionService(PuzzleRepository puzzles) {
        this.puzzles = puzzles;
    }

    public Optional<Puzzle> next(Long userId, double targetRating, String theme) {
        int target = (int) Math.round(targetRating);
        for (int window : WINDOWS) {
            Optional<Puzzle> found = puzzles.findRandomInRange(target - window, target + window, theme, userId);
            if (found.isPresent()) return found;
        }
        // Đã làm hết mọi puzzle phù hợp: cho phép lặp lại thay vì báo không còn bài.
        int widest = WINDOWS[WINDOWS.length - 1];
        return userId == null
                ? Optional.empty()
                : puzzles.findRandomInRange(target - widest, target + widest, theme, null);
    }
}
