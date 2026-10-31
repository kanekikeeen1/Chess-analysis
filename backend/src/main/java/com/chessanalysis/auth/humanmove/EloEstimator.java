package com.chessanalysis.auth.humanmove;

import java.util.List;
import java.util.stream.IntStream;

/**
 * Ước lượng trình độ từ những nước người chơi đã đi, như {@code estimate_elo} bên {@code ml/m2/inference.py}.
 *
 * <p>Với mỗi mức Elo trên lưới, log-likelihood là tổng log-xác suất mô hình M2 gán cho các nước đã đi.
 * Cộng thêm tiên nghiệm Gauss quanh 1500 (để vài nước đầu không đẩy kết quả ra biên), chuẩn hóa thành
 * hậu nghiệm rồi lấy kỳ vọng và độ lệch chuẩn.
 *
 * <p>Đường log-likelihood của các ván độc lập cộng thẳng vào nhau, nên hồ sơ người chơi lưu đường của
 * từng ván rồi cộng lại, thay vì lấy trung bình các con số Elo; tiên nghiệm chỉ cộng một lần ở cuối.
 */
public final class EloEstimator {
    /**
     * 900, 1100, …, 2700: tâm của 10 dải Elo mô hình học. Lưới mịn hơn gần như không đổi kết quả (mô hình
     * nhận Elo chủ yếu qua dải) mà tốn thêm lượt chạy: mỗi nước đã đi tốn một hàng cho mỗi điểm lưới.
     */
    public static final double[] GRID = IntStream.range(0, 10).mapToDouble(i -> 900.0 + 200.0 * i).toArray();
    static final double PRIOR_MEAN = 1500.0;
    static final double PRIOR_STD = 400.0;

    private EloEstimator() {}

    /** @param moves số nước đã góp vào log-likelihood, chỉ để hiển thị */
    public record Estimate(double elo, double stdError, int moves) {}

    public static Estimate posterior(double[] logLikelihood, int moves) {
        if (logLikelihood.length != GRID.length) {
            throw new IllegalArgumentException("Đường log-likelihood phải có " + GRID.length + " điểm.");
        }
        double[] weights = new double[GRID.length];
        double max = Double.NEGATIVE_INFINITY;
        for (int g = 0; g < GRID.length; g++) {
            double z = (GRID[g] - PRIOR_MEAN) / PRIOR_STD;
            weights[g] = logLikelihood[g] - 0.5 * z * z;
            max = Math.max(max, weights[g]);
        }
        double sum = 0;
        for (int g = 0; g < GRID.length; g++) {
            weights[g] = Math.exp(weights[g] - max);
            sum += weights[g];
        }
        double mean = 0;
        for (int g = 0; g < GRID.length; g++) {
            weights[g] /= sum;
            mean += weights[g] * GRID[g];
        }
        double variance = 0;
        for (int g = 0; g < GRID.length; g++) {
            variance += weights[g] * (GRID[g] - mean) * (GRID[g] - mean);
        }
        return new Estimate(mean, Math.sqrt(variance), moves);
    }

    /** Cộng đường log-likelihood của nhiều ván; đường sai độ dài (lưới cũ) bị bỏ qua. */
    public static double[] sum(List<double[]> curves) {
        double[] total = new double[GRID.length];
        for (double[] curve : curves) {
            if (curve == null || curve.length != GRID.length) continue;
            for (int g = 0; g < GRID.length; g++) total[g] += curve[g];
        }
        return total;
    }
}
