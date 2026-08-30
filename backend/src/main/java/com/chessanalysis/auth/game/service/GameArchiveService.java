package com.chessanalysis.auth.game.service;

import java.time.Instant;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.game.dto.GameDetailResponse;
import com.chessanalysis.auth.game.dto.GameSummaryResponse;
import com.chessanalysis.auth.game.dto.SaveGameRequest;
import com.chessanalysis.auth.game.entity.AnalyzedGame;
import com.chessanalysis.auth.game.repository.AnalyzedGameRepository;
import com.chessanalysis.auth.service.ApiException;
import com.chessanalysis.auth.service.AuthService;

@Service
public class GameArchiveService {
    private final AnalyzedGameRepository games;
    private final AuthService authService;

    public GameArchiveService(AnalyzedGameRepository games, AuthService authService) {
        this.games = games;
        this.authService = authService;
    }

    @Transactional
    public GameDetailResponse save(String token, SaveGameRequest request) {
        UserAccount user = authService.requireCurrentAccount(token);
        String pgn = request.pgn() == null || request.pgn().isBlank() ? null : request.pgn().trim();
        AnalyzedGame game = new AnalyzedGame(
                user,
                request.title().trim(),
                request.whitePlayer().trim(),
                request.blackPlayer().trim(),
                request.result().trim(),
                request.sourceType(),
                pgn,
                request.initialFen().trim(),
                request.finalFen().trim(),
                trimToNull(request.openingEco()),
                trimToNull(request.openingName()),
                roundAccuracy(request.whiteAccuracy()),
                roundAccuracy(request.blackAccuracy()),
                request.depth(),
                request.moveCount(),
                request.analysisJson(),
                Instant.now());
        return toDetail(games.saveAndFlush(game));
    }

    @Transactional(readOnly = true)
    public List<GameSummaryResponse> list(String token) {
        UserAccount user = authService.requireCurrentAccount(token);
        return games.findAllByUserIdOrderByCreatedAtDesc(user.getId()).stream()
                .map(this::toSummary)
                .toList();
    }

    @Transactional(readOnly = true)
    public GameDetailResponse get(String token, Long id) {
        UserAccount user = authService.requireCurrentAccount(token);
        return toDetail(findOwned(id, user.getId()));
    }

    @Transactional
    public void delete(String token, Long id) {
        UserAccount user = authService.requireCurrentAccount(token);
        games.delete(findOwned(id, user.getId()));
    }

    private AnalyzedGame findOwned(Long id, Long userId) {
        return games.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy ván cờ trong tài khoản của bạn."));
    }

    private Double roundAccuracy(Double value) {
        return value == null ? null : Math.round(value * 100.0) / 100.0;
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }

    private GameSummaryResponse toSummary(AnalyzedGame game) {
        return new GameSummaryResponse(
                game.getId(), game.getTitle(), game.getWhitePlayer(), game.getBlackPlayer(),
                game.getResult(), game.getSourceType(), game.getOpeningEco(), game.getOpeningName(),
                game.getWhiteAccuracy(), game.getBlackAccuracy(), game.getDepth(), game.getMoveCount(),
                game.getCreatedAt());
    }

    private GameDetailResponse toDetail(AnalyzedGame game) {
        return new GameDetailResponse(
                game.getId(), game.getTitle(), game.getWhitePlayer(), game.getBlackPlayer(),
                game.getResult(), game.getSourceType(), game.getPgn(), game.getInitialFen(), game.getFinalFen(),
                game.getOpeningEco(), game.getOpeningName(), game.getWhiteAccuracy(), game.getBlackAccuracy(),
                game.getDepth(), game.getMoveCount(), game.getAnalysisJson(), game.getCreatedAt(), game.getUpdatedAt());
    }
}
