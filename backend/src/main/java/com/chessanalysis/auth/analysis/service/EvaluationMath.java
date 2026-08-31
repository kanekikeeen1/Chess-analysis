package com.chessanalysis.auth.analysis.service;

/**
 * Các công thức chuyển đổi đánh giá dùng chung cho bộ luật ngưỡng hiện tại và
 * cho phần trích đặc trưng của mô hình học máy ở M1.
 *
 * <p>Tách riêng ra đây vì báo cáo cần trích dẫn đúng một chỗ định nghĩa
 * win-percent và accuracy, thay vì hai bản sao trôi lệch nhau giữa backend và
 * frontend như trước.
 */
public final class EvaluationMath {
    /** Giới hạn centipawn khi lưu vào cơ sở dữ liệu; điểm chiếu hết bị kẹp về đây. */
    public static final int CENTIPAWN_CLAMP = 3000;

    private EvaluationMath() {}

    /** Xác suất thắng của Trắng, thang 0–100, theo đường cong logistic của Lichess. */
    public static double whiteWinPercent(double pawns) {
        double centipawns = clamp(pawns * 100, -1000, 1000);
        return 100 / (1 + Math.exp(-0.00368208 * centipawns));
    }

    /** Phần trăm cơ hội thắng mà bên vừa đi đánh mất. */
    public static double chanceLoss(double before, double after, boolean whiteMoved) {
        double beforeChance = whiteWinPercent(before);
        double afterChance = whiteWinPercent(after);
        return Math.max(0, whiteMoved ? beforeChance - afterChance : afterChance - beforeChance);
    }

    /** Đánh giá tụt bao nhiêu tốt dưới góc nhìn của bên vừa đi. */
    public static double pawnLoss(double before, double after, boolean whiteMoved) {
        return Math.max(0, whiteMoved ? before - after : after - before);
    }

    /** Accuracy một nước, thang 0–100. */
    public static double accuracy(double before, double after, boolean whiteMoved) {
        double loss = chanceLoss(before, after, whiteMoved);
        return clamp(103.1668 * Math.exp(-0.04354 * loss) - 3.1669, 0, 100);
    }

    /** Điểm centipawn đã kẹp, an toàn để lưu vào cột INT. */
    public static int centipawns(double pawns) {
        return (int) Math.round(clamp(pawns * 100, -CENTIPAWN_CLAMP, CENTIPAWN_CLAMP));
    }

    public static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
