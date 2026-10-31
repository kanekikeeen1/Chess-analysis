package com.chessanalysis.auth.puzzle.controller;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.puzzle.dto.PuzzleMoveRequest;
import com.chessanalysis.auth.puzzle.dto.PuzzleMoveResponse;
import com.chessanalysis.auth.puzzle.dto.PuzzleRatingResponse;
import com.chessanalysis.auth.puzzle.dto.PuzzleResponse;
import com.chessanalysis.auth.puzzle.dto.PuzzleSessionResponse;
import com.chessanalysis.auth.puzzle.dto.PuzzleThemeResponse;
import com.chessanalysis.auth.puzzle.dto.StartPuzzleRequest;
import com.chessanalysis.auth.puzzle.repository.PuzzleRepository;
import com.chessanalysis.auth.puzzle.service.PuzzleRatingService;
import com.chessanalysis.auth.puzzle.service.PuzzleSelectionService;
import com.chessanalysis.auth.puzzle.service.PuzzleSessionService;
import com.chessanalysis.auth.service.ApiException;
import com.chessanalysis.auth.service.AuthService;
import com.chessanalysis.auth.web.SessionCookieReader;

@RestController
@RequestMapping("/api/puzzles")
@Validated
public class PuzzleController {
    private final PuzzleSelectionService selection;
    private final PuzzleSessionService sessions;
    private final PuzzleRatingService ratings;
    private final PuzzleRepository puzzles;
    private final AuthService authService;
    private final SessionCookieReader cookies;

    public PuzzleController(
            PuzzleSelectionService selection,
            PuzzleSessionService sessions,
            PuzzleRatingService ratings,
            PuzzleRepository puzzles,
            AuthService authService,
            SessionCookieReader cookies) {
        this.selection = selection;
        this.sessions = sessions;
        this.ratings = ratings;
        this.puzzles = puzzles;
        this.authService = authService;
        this.cookies = cookies;
    }

    /**
     * Xem trước puzzle tiếp theo (không mở phiên giải). Người đã đăng nhập nhận puzzle
     * quanh rating của mình; khách dùng {@code rating} (mặc định 1500).
     */
    @GetMapping("/next")
    public PuzzleResponse next(
            @RequestParam(required = false) @Pattern(regexp = "[A-Za-z0-9]{1,48}") String theme,
            @RequestParam(required = false) @Min(400) @Max(3200) Integer rating,
            HttpServletRequest request) {
        UserAccount user = authService.currentAccountOrNull(cookies.read(request));
        Long userId = user == null ? null : user.getId();
        return selection.next(userId, sessions.targetRating(userId, rating), theme)
                .map(PuzzleResponse::from)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                        "Không có puzzle phù hợp. Đã import ngân hàng puzzle chưa?"));
    }

    /** Bắt đầu giải một puzzle mới chọn theo trình độ (và theme, nếu có). */
    @PostMapping("/sessions")
    public ResponseEntity<PuzzleSessionResponse> start(
            @Valid @RequestBody(required = false) StartPuzzleRequest body,
            HttpServletRequest request) {
        StartPuzzleRequest options = body == null ? new StartPuzzleRequest(null, null) : body;
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(sessions.start(cookies.read(request), options.theme(), options.rating()));
    }

    @PostMapping("/sessions/{sessionId}/moves")
    public PuzzleMoveResponse move(
            @PathVariable String sessionId,
            @Valid @RequestBody PuzzleMoveRequest body,
            HttpServletRequest request) {
        return sessions.move(cookies.read(request), sessionId, body.uci());
    }

    /** Bỏ cuộc và xem lời giải; tính là giải sai nếu lượt này có tính rating. */
    @PostMapping("/sessions/{sessionId}/give-up")
    public PuzzleMoveResponse giveUp(@PathVariable String sessionId, HttpServletRequest request) {
        return sessions.giveUp(cookies.read(request), sessionId);
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
}
