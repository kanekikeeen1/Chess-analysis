package com.chessanalysis.auth.game.controller;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chessanalysis.auth.game.dto.GameDetailResponse;
import com.chessanalysis.auth.game.dto.GameSummaryResponse;
import com.chessanalysis.auth.game.dto.SaveGameRequest;
import com.chessanalysis.auth.game.service.GameArchiveService;
import com.chessanalysis.auth.web.SessionCookieReader;

@RestController
@RequestMapping("/api/games")
public class GameArchiveController {
    private final GameArchiveService archive;
    private final SessionCookieReader cookies;

    public GameArchiveController(GameArchiveService archive, SessionCookieReader cookies) {
        this.archive = archive;
        this.cookies = cookies;
    }

    @PostMapping
    public ResponseEntity<GameDetailResponse> save(
            @Valid @RequestBody SaveGameRequest request,
            HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(archive.save(cookies.read(servletRequest), request));
    }

    @GetMapping
    public List<GameSummaryResponse> list(HttpServletRequest request) {
        return archive.list(cookies.read(request));
    }

    @GetMapping("/{id}")
    public GameDetailResponse get(@PathVariable Long id, HttpServletRequest request) {
        return archive.get(cookies.read(request), id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        archive.delete(cookies.read(request), id);
        return ResponseEntity.noContent().build();
    }
}
