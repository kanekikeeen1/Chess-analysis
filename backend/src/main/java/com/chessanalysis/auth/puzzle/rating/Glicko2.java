package com.chessanalysis.auth.puzzle.rating;

import java.util.List;

/**
 * Hệ thống rating Glicko-2 (Glickman, "Example of the Glicko-2 system", 2012).
 *
 * <p>Khác Elo, mỗi người chơi có ba đại lượng: rating {@code r}, độ lệch rating
 * {@code RD} (độ bất định: lớn nghĩa là hệ thống chưa chắc về trình độ) và độ biến
 * động {@code σ} (trình độ thay đổi thất thường tới đâu). Người mới có RD lớn nên
 * rating dịch chuyển nhanh; giải càng nhiều thì RD càng nhỏ và rating càng ổn định.
 * Puzzle được coi là một "đối thủ" có rating và RD lấy từ Lichess; giải đúng là thắng,
 * giải sai là thua.
 *
 * <p>Lớp này là thuật toán thuần, không phụ thuộc Spring hay database, và được kiểm
 * tra bằng ví dụ tính tay trong bài báo gốc (xem {@code Glicko2Test}).
 */
public final class Glicko2 {
    /** Hệ số đổi thang giữa rating Glicko và thang nội bộ của Glicko-2. */
    static final double SCALE = 173.7178;
    static final double DEFAULT_RATING = 1500;
    static final double DEFAULT_DEVIATION = 350;
    static final double DEFAULT_VOLATILITY = 0.06;
    /** Sai số hội tụ của bước 5 (tìm độ biến động mới). */
    private static final double EPSILON = 0.000001;

    /**
     * τ ràng buộc độ biến động thay đổi nhanh tới đâu. Glickman khuyên 0,3–1,2; 0,5 là
     * giá trị dùng trong ví dụ của bài báo.
     */
    private final double tau;
    /**
     * RD tối thiểu. Khi người học giải đều đặn, độ biến động σ giảm dần và RD có thể
     * co lại rất nhỏ, khiến rating gần như đứng yên dù người học tiến bộ thật; sàn giữ
     * cho rating vẫn theo kịp.
     */
    private final double minDeviation;

    public Glicko2(double tau, double minDeviation) {
        this.tau = tau;
        this.minDeviation = minDeviation;
    }

    public record Rating(double rating, double deviation, double volatility) {
        public static Rating initial() {
            return new Rating(DEFAULT_RATING, DEFAULT_DEVIATION, DEFAULT_VOLATILITY);
        }
    }

    /** Một ván trong kỳ: rating/RD của đối thủ và kết quả (1 thắng, 0,5 hòa, 0 thua). */
    public record Result(double opponentRating, double opponentDeviation, double score) {}

    /** Cập nhật sau một kỳ gồm các ván {@code results} (bước 2–8 của bài báo). */
    public Rating update(Rating player, List<Result> results) {
        double mu = (player.rating() - DEFAULT_RATING) / SCALE;
        double phi = player.deviation() / SCALE;
        double sigma = player.volatility();

        if (results.isEmpty()) {
            // Bước 6 khi không thi đấu: chỉ có độ bất định tăng lên.
            return clamp(new Rating(player.rating(), Math.sqrt(phi * phi + sigma * sigma) * SCALE, sigma));
        }

        // Bước 3–4: phương sai ước lượng v và mức cải thiện ước lượng Δ.
        double inverseV = 0;
        double scoreSum = 0;
        for (Result result : results) {
            double muJ = (result.opponentRating() - DEFAULT_RATING) / SCALE;
            double gJ = g(result.opponentDeviation() / SCALE);
            double expected = expected(mu, muJ, gJ);
            inverseV += gJ * gJ * expected * (1 - expected);
            scoreSum += gJ * (result.score() - expected);
        }
        double v = 1 / inverseV;
        double delta = v * scoreSum;

        // Bước 5–8.
        double newSigma = newVolatility(phi, sigma, v, delta);
        double phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
        double newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
        double newMu = mu + newPhi * newPhi * scoreSum;
        return clamp(new Rating(newMu * SCALE + DEFAULT_RATING, newPhi * SCALE, newSigma));
    }

    /**
     * Áp các kỳ không thi đấu. Ở đây mỗi lượt giải là một kỳ (cập nhật tức thì như
     * Lichess), nên người nghỉ lâu sẽ có RD tăng lên theo số ngày nghỉ, tối đa bằng RD
     * ban đầu.
     */
    public Rating decay(Rating player, long idlePeriods) {
        if (idlePeriods <= 0) return player;
        double phi = player.deviation() / SCALE;
        double sigma = player.volatility();
        double grown = Math.sqrt(phi * phi + idlePeriods * sigma * sigma) * SCALE;
        return clamp(new Rating(player.rating(), grown, sigma));
    }

    /** Xác suất người chơi thắng đối thủ (thang 0–1). */
    public static double expectedScore(Rating player, double opponentRating, double opponentDeviation) {
        return expected((player.rating() - DEFAULT_RATING) / SCALE,
                (opponentRating - DEFAULT_RATING) / SCALE, g(opponentDeviation / SCALE));
    }

    private static double g(double phi) {
        return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
    }

    private static double expected(double mu, double muJ, double gJ) {
        return 1 / (1 + Math.exp(-gJ * (mu - muJ)));
    }

    /** Bước 5: tìm σ' bằng thuật toán Illinois (một biến thể của regula falsi). */
    private double newVolatility(double phi, double sigma, double v, double delta) {
        double a = Math.log(sigma * sigma);
        double phiSquared = phi * phi;
        double deltaSquared = delta * delta;
        java.util.function.DoubleUnaryOperator f = x -> {
            double ex = Math.exp(x);
            double denominator = phiSquared + v + ex;
            return ex * (deltaSquared - phiSquared - v - ex) / (2 * denominator * denominator) - (x - a) / (tau * tau);
        };

        double upper = a;
        double lower;
        if (deltaSquared > phiSquared + v) {
            lower = Math.log(deltaSquared - phiSquared - v);
        } else {
            int k = 1;
            while (f.applyAsDouble(a - k * tau) < 0) k++;
            lower = a - k * tau;
        }

        double fUpper = f.applyAsDouble(upper);
        double fLower = f.applyAsDouble(lower);
        while (Math.abs(lower - upper) > EPSILON) {
            double candidate = upper + (upper - lower) * fUpper / (fLower - fUpper);
            double fCandidate = f.applyAsDouble(candidate);
            if (fCandidate * fLower <= 0) {
                upper = lower;
                fUpper = fLower;
            } else {
                fUpper /= 2;
            }
            lower = candidate;
            fLower = fCandidate;
        }
        return Math.exp(upper / 2);
    }

    private Rating clamp(Rating rating) {
        double deviation = Math.max(minDeviation, Math.min(DEFAULT_DEVIATION, rating.deviation()));
        return new Rating(rating.rating(), deviation, rating.volatility());
    }
}
