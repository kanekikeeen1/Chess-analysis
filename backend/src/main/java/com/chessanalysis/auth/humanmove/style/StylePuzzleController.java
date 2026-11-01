package com.chessanalysis.auth.humanmove.style;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.chessanalysis.auth.humanmove.style.dto.StylePuzzleCheckRequest;
import com.chessanalysis.auth.humanmove.style.dto.StylePuzzleCheckResponse;
import com.chessanalysis.auth.humanmove.style.dto.StylePuzzleResponse;

/** Puzzle "Tìm nước kiện tướng đã đi" (D6). Không cần đăng nhập, không lưu tiến độ. */
@RestController
@RequestMapping("/api/styles/puzzles")
public class StylePuzzleController {
    /** Giới hạn danh sách id đã làm, để query string không dài vô hạn. */
    private static final int MAX_EXCLUDE = 200;

    private final StylePuzzleService service;

    public StylePuzzleController(StylePuzzleService service) {
        this.service = service;
    }

    /** @param exclude các id vừa làm, cách nhau bởi dấu phẩy */
    @GetMapping("/next")
    public StylePuzzleResponse next(@RequestParam(required = false) String style,
            @RequestParam(required = false, defaultValue = "") String exclude) {
        Set<String> ids = Arrays.stream(exclude.split(","))
                .map(String::trim)
                .filter(id -> !id.isEmpty())
                .limit(MAX_EXCLUDE)
                .collect(Collectors.toSet());
        return service.next(style, ids);
    }

    @PostMapping("/{id}/check")
    public StylePuzzleCheckResponse check(@PathVariable String id, @Valid @RequestBody StylePuzzleCheckRequest request) {
        return service.check(id, request.uci());
    }
}
