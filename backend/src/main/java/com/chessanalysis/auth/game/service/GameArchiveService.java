package com.chessanalysis.auth.game.service;

import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.analysis.dto.AnalysisResultResponse;
import com.chessanalysis.auth.analysis.dto.CreateAnalysisJobRequest;
import com.chessanalysis.auth.analysis.entity.AnalysisJob;
import com.chessanalysis.auth.analysis.repository.AnalysisJobRepository;
import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.game.dto.GameDetailResponse;
import com.chessanalysis.auth.game.dto.GameSummaryResponse;
import com.chessanalysis.auth.game.dto.SaveGameRequest;
import com.chessanalysis.auth.game.entity.AnalyzedGame;
import com.chessanalysis.auth.game.repository.AnalyzedGameRepository;
import com.chessanalysis.auth.service.ApiException;
import com.chessanalysis.auth.service.AuthService;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class GameArchiveService {
    private static final Logger LOGGER = LoggerFactory.getLogger(GameArchiveService.class);

    private final AnalyzedGameRepository games;
    private final AuthService authService;
    private final AnalysisJobRepository jobs;
    private final AnalyzedMoveWriter moveWriter;
    private final ObjectMapper objectMapper;

    public GameArchiveService(
            AnalyzedGameRepository games,
            AuthService authService,
            AnalysisJobRepository jobs,
            AnalyzedMoveWriter moveWriter,
            ObjectMapper objectMapper) {
        this.games = games;
        this.authService = authService;
        this.jobs = jobs;
        this.moveWriter = moveWriter;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public GameDetailResponse save(String token, SaveGameRequest request) {
        UserAccount user = authService.requireCurrentAccount(token);
        String pgn = request.pgn() == null || request.pgn().isBlank() ? null : request.pgn().trim();
        // Ván có Game Review backend: accuracy lấy từ kết quả job, không lấy số client gửi.
        // Ván phân tích tay (không có job) vẫn dùng số client nhận từ /api/analysis/classify.
        CompletedJob job = ownedCompletedJob(request.analysisJobId(), user.getId());
        Double whiteAccuracy = job == null ? request.whiteAccuracy() : job.result().whiteAccuracy();
        Double blackAccuracy = job == null ? request.blackAccuracy() : job.result().blackAccuracy();
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
                roundAccuracy(whiteAccuracy),
                roundAccuracy(blackAccuracy),
                request.depth(),
                request.moveCount(),
                request.analysisJson(),
                Instant.now());
        AnalyzedGame saved = games.saveAndFlush(game);
        if (job != null) indexMoves(saved, user.getId(), job);
        return toDetail(saved);
    }

    /**
     * Job review đã hoàn tất và thuộc về đúng người đang lưu ván. Job của người khác
     * hoặc job khách vãng lai bị bỏ qua, để không ai gắn dữ liệu phân tích của người
     * khác vào tài khoản (và vào tập dữ liệu analyzed_moves) của mình.
     */
    private CompletedJob ownedCompletedJob(String analysisJobId, Long userId) {
        if (analysisJobId == null || analysisJobId.isBlank()) return null;
        AnalysisJob job = jobs.findByPublicId(analysisJobId.trim()).orElse(null);
        if (job == null || !userId.equals(job.getUserId()) || !"COMPLETED".equals(job.getStatus())) return null;
        try {
            return new CompletedJob(
                    objectMapper.readValue(job.getRequestJson(), CreateAnalysisJobRequest.class),
                    objectMapper.readValue(job.getResultJson(), AnalysisResultResponse.class));
        } catch (Exception exception) {
            LOGGER.warn("Không đọc được kết quả tác vụ {}", job.getId(), exception);
            return null;
        }
    }

    /**
     * Ghi bảng analyzed_moves từ tác vụ review tương ứng. Lỗi ở đây không được
     * làm hỏng việc lưu ván: người dùng vẫn phải có báo cáo của mình, dữ liệu
     * cho phần học máy chỉ là phần thêm.
     */
    private void indexMoves(AnalyzedGame game, Long userId, CompletedJob job) {
        try {
            int written = moveWriter.write(game.getId(), userId, job.request().moves(), job.result());
            LOGGER.debug("Đã ghi {} nước đi cho ván {}", written, game.getId());
        } catch (Exception exception) {
            LOGGER.warn("Không lập chỉ mục được nước đi cho ván {}", game.getId(), exception);
        }
    }

    private record CompletedJob(CreateAnalysisJobRequest request, AnalysisResultResponse result) {}

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
