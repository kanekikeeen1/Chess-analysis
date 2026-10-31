package com.chessanalysis.auth.puzzle.controller;

import java.util.Arrays;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.puzzle.dto.PuzzleRatingResponse;
import com.chessanalysis.auth.puzzle.dto.PuzzleResponse;
import com.chessanalysis.auth.puzzle.dto.PuzzleThemeResponse;
import com.chessanalysis.auth.puzzle.entity.Puzzle;
import com.chessanalysis.auth.puzzle.repository.PuzzleRepository;
import com.chessanalysis.auth.puzzle.service.PuzzleRatingService;
import com.chessanalysis.auth.puzzle.service.PuzzleSelectionService;
import com.chessanalysis.auth.service.ApiException;
import com.chessanalysis.auth.service.AuthService;
import com.chessanalysis.auth.web.SessionCookieReader;

@RestController
@RequestMapping("/api/puzzles")
@Validated
public class PuzzleController {
    private final PuzzleSelectionService selection;
    private final PuzzleRatingService ratings;
    private final PuzzleRepository puzzles;
    private final AuthService authService;
    private final SessionCookieReader cookies;

    public PuzzleController(
            PuzzleSelectionService selection,
            PuzzleRatingService ratings,
            PuzzleRepository puzzles,
            AuthService authService,
            SessionCookieReader cookies) {
        this.selection = selection;
        this.ratings = ratings;
        this.puzzles = puzzles;
        this.authService = authService;
        this.cookies = cookies;
    }

    /**
     * Puzzle tiếp theo. Người đã đăng nhập nhận puzzle quanh rating của mình và không
     * gặp lại puzzle đã làm; khách dùng {@code rating} (mặc định 1500).
     */
    @GetMapping("/next")
    public PuzzleResponse next(
            @RequestParam(required = false) @Pattern(regexp = "[A-Za-z0-9]{1,48}") String theme,
            @RequestParam(required = false) @Min(400) @Max(3200) Integer rating,
            HttpServletRequest request) {
        UserAccount user = authService.currentAccountOrNull(cookies.read(request));
        double target = user != null
                ? ratings.current(user.getId()).rating().rating()
                : rating == null ? 1500 : rating;
        Puzzle puzzle = selection.next(user == null ? null : user.getId(), target, theme)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                        "Không có puzzle phù hợp. Đã import ngân hàng puzzle chưa?"));
        return toResponse(puzzle);
    }

    @GetMapping("/rating/me")
    public PuzzleRatingResponse myRating(HttpServletRequest request) {
        UserAccount user = authService.requireCurrentAccount(cookies.read(request));
        PuzzleRatingService.Snapshot snapshot = ratings.current(user.getId());
        return new PuzzleRatingResponse(
                (int) Math.round(snapshot.rating().rating()),
                (int) Math.round(snapshot.rating().deviation()),
                snapshot.rating().volatility(),
                snapshot.provisional(),
                snapshot.attempts(),
                snapshot.solved());
    }

    /** Các theme và số puzzle của mỗi theme, để giao diện cho chọn luyện theo chủ đề. */
    @GetMapping("/themes")
    public List<PuzzleThemeResponse> themes() {
        return puzzles.countByTheme().stream()
                .map(row -> new PuzzleThemeResponse((String) row[0], ((Number) row[1]).longValue()))
                .toList();
    }

    private PuzzleResponse toResponse(Puzzle puzzle) {
        String side = puzzle.getStartFen().split(" ")[1];
        return new PuzzleResponse(
                puzzle.getId(), puzzle.getLichessId(), puzzle.getStartFen(), side, puzzle.getRating(),
                Arrays.asList(puzzle.getThemes().split(" ")), puzzle.getSolutionLength(), puzzle.getGameUrl());
    }
}
