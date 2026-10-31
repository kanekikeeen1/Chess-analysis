package com.chessanalysis.auth.profile;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.analysis.dto.AnalysisMoveRequest;
import com.chessanalysis.auth.analysis.service.FenNormalizer;
import com.chessanalysis.auth.game.entity.AnalyzedGame;
import com.chessanalysis.auth.game.repository.AnalyzedGameRepository;
import com.chessanalysis.auth.humanmove.EloEstimator;
import com.chessanalysis.auth.humanmove.HumanMoveModel.PlayedMove;
import com.chessanalysis.auth.humanmove.HumanMoveService;
import com.chessanalysis.auth.profile.dto.PlayingProfileResponse;
import com.chessanalysis.auth.profile.entity.UserPlayingProfile;
import com.chessanalysis.auth.profile.repository.UserPlayingProfileRepository;
import com.chessanalysis.auth.service.AuthService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Trình độ tổng thể của người dùng ({@code user_playing_profiles}), ước lượng bằng M2 từ những ván họ đã
 * lưu và cho biết mình cầm bên nào.
 *
 * <p>Mỗi ván giữ đường log-likelihood của riêng nó; hồ sơ là hậu nghiệm của tổng các đường đó. Vì vậy
 * thêm hay xóa ván đều tính lại đúng mà không phải chạy lại mô hình, và độ lệch chuẩn tự thu hẹp khi có
 * thêm ván.
 */
@Service
public class PlayingProfileService {
    private static final Logger LOGGER = LoggerFactory.getLogger(PlayingProfileService.class);
    /** Như giới hạn của API ước lượng: ván dài hơn chỉ lấy 120 nước đầu của người dùng. */
    private static final int MAX_MOVES_PER_GAME = 120;

    private final AnalyzedGameRepository games;
    private final UserPlayingProfileRepository profiles;
    private final HumanMoveService humanMoves;
    private final AuthService authService;
    private final ObjectMapper objectMapper;

    public PlayingProfileService(
            AnalyzedGameRepository games,
            UserPlayingProfileRepository profiles,
            HumanMoveService humanMoves,
            AuthService authService,
            ObjectMapper objectMapper) {
        this.games = games;
        this.profiles = profiles;
        this.humanMoves = humanMoves;
        this.authService = authService;
        this.objectMapper = objectMapper;
    }

    /**
     * Ước lượng Elo cho bên người dùng cầm trong một ván vừa lưu rồi cập nhật hồ sơ. Không làm gì khi ván
     * không ghi bên của người dùng hoặc chưa có mô hình.
     *
     * <p>Cố ý không đánh {@code @Transactional}: chạy trong giao dịch lưu ván của người gọi. Nếu có, một lỗi
     * ném qua proxy sẽ đánh dấu cả giao dịch đó phải rollback, dù người gọi đã bắt lỗi để vẫn lưu được ván.
     */
    public void recordGame(AnalyzedGame game, List<AnalysisMoveRequest> moves) {
        String side = game.getUserSide();
        if (side == null || moves == null || !humanMoves.available()) return;
        boolean white = "w".equals(side);

        List<PlayedMove> played = new ArrayList<>();
        for (AnalysisMoveRequest move : moves) {
            if (FenNormalizer.whiteToMove(move.beforeFen()) != white) continue;
            played.add(HumanMoveService.played(move.beforeFen(), move.uci()));
            if (played.size() >= MAX_MOVES_PER_GAME) break;
        }
        if (played.isEmpty()) return;

        double[] curve = humanMoves.logLikelihood(played);
        EloEstimator.Estimate estimate = EloEstimator.posterior(curve, played.size());
        game.setEloEstimate(estimate.elo(), estimate.stdError(), played.size(), humanMoves.trainStep(), json(curve));
        games.saveAndFlush(game);
        refresh(game.getUser().getId());
    }

    /** Tính lại hồ sơ từ mọi ván đã có đường log-likelihood; gọi sau khi thêm hoặc xóa ván. */
    @Transactional
    public void refresh(Long userId) {
        List<double[]> curves = new ArrayList<>();
        int moves = 0;
        for (AnalyzedGame game : games.findAllByUserIdAndEloLogLikelihoodJsonIsNotNull(userId)) {
            double[] curve = curve(game);
            if (curve == null) continue;
            curves.add(curve);
            moves += game.getEloMoves() == null ? 0 : game.getEloMoves();
        }

        Instant now = Instant.now();
        UserPlayingProfile profile = profiles.findById(userId).orElseGet(() -> new UserPlayingProfile(userId, now));
        if (curves.isEmpty()) {
            profile.setEstimatedElo(null);
            profile.setEloStdError(null);
        } else {
            EloEstimator.Estimate estimate = EloEstimator.posterior(EloEstimator.sum(curves), moves);
            profile.setEstimatedElo(Math.round(estimate.elo() * 10) / 10.0);
            profile.setEloStdError(Math.round(estimate.stdError() * 10) / 10.0);
            profile.setLastEstimatedAt(now);
        }
        profile.setGamesAnalyzed(curves.size());
        profile.setMovesAnalyzed(moves);
        profile.setUpdatedAt(now);
        profiles.save(profile);
    }

    @Transactional(readOnly = true)
    public PlayingProfileResponse view(String token) {
        Long userId = authService.requireCurrentAccount(token).getId();
        return profiles.findById(userId)
                .map(profile -> new PlayingProfileResponse(
                        profile.getEstimatedElo() == null ? null : (int) Math.round(profile.getEstimatedElo()),
                        profile.getEloStdError() == null ? null : (int) Math.round(profile.getEloStdError()),
                        profile.getGamesAnalyzed(), profile.getMovesAnalyzed(), profile.getLastEstimatedAt()))
                .orElse(new PlayingProfileResponse(null, null, 0, 0, null));
    }

    private double[] curve(AnalyzedGame game) {
        try {
            double[] curve = objectMapper.readValue(game.getEloLogLikelihoodJson(), double[].class);
            // Đường tính trên lưới khác (phiên bản cũ) không cộng được với lưới hiện tại.
            return curve.length == EloEstimator.GRID.length ? curve : null;
        } catch (JsonProcessingException exception) {
            LOGGER.warn("Đường log-likelihood của ván {} hỏng", game.getId(), exception);
            return null;
        }
    }

    private String json(double[] curve) {
        try {
            return objectMapper.writeValueAsString(curve);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
