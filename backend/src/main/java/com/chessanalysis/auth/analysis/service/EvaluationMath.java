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

    /**
     * Accuracy toàn ván của hai bên theo cách tiếp cận của Lichess.
     *
     * <p>Trung bình cộng các accuracy từng nước bị thổi phồng bởi hàng chục nước dễ
     * trong thế yên tĩnh, còn một blunder quyết định chỉ kéo xuống vài điểm. Lichess
     * lấy trung bình của hai đại lượng:
     * <ul>
     *   <li><b>trung bình có trọng số</b>, trọng số là độ lệch chuẩn của win% trong một
     *       cửa sổ trượt quanh nước đó (kẹp 0,5–12): nước đi ở giai đoạn thế cờ biến
     *       động mạnh được tính nặng hơn;</li>
     *   <li><b>trung bình điều hòa</b>, vốn nhạy với các giá trị thấp nên một nước rất
     *       tệ không bị các nước tốt che lấp.</li>
     * </ul>
     *
     * @param pawnsByPosition đánh giá (góc nhìn Trắng, đơn vị tốt) của N+1 vị trí của N nước
     * @param whiteMovesFirst bên đi nước đầu tiên có phải Trắng không
     */
    public static GameAccuracy gameAccuracy(java.util.List<Double> pawnsByPosition, boolean whiteMovesFirst) {
        int moves = pawnsByPosition.size() - 1;
        if (moves < 1) return new GameAccuracy(null, null);

        double[] winPercents = pawnsByPosition.stream().mapToDouble(EvaluationMath::whiteWinPercent).toArray();
        int windowSize = (int) clamp(moves / 10, 2, 8);

        // Cửa sổ thứ k ứng với nước thứ k. windowSize - 2 nước đầu dùng chung cửa sổ
        // đầu tiên, phần còn lại trượt từng bước; tổng cộng đúng `moves` cửa sổ.
        double[] weights = new double[moves];
        for (int move = 0; move < moves; move++) {
            int start = Math.max(0, move - (windowSize - 2));
            weights[move] = clamp(standardDeviation(winPercents, start, start + windowSize), 0.5, 12);
        }

        double[] weightedSum = new double[2];
        double[] weightSum = new double[2];
        double[] reciprocalSum = new double[2];
        int[] count = new int[2];
        for (int move = 0; move < moves; move++) {
            boolean white = (move % 2 == 0) == whiteMovesFirst;
            int side = white ? 0 : 1;
            double accuracy = accuracy(pawnsByPosition.get(move), pawnsByPosition.get(move + 1), white);
            weightedSum[side] += accuracy * weights[move];
            weightSum[side] += weights[move];
            // Chặn dưới ở 1 để một nước accuracy 0 không làm trung bình điều hòa sụp về 0.
            reciprocalSum[side] += 1 / Math.max(1, accuracy);
            count[side]++;
        }
        return new GameAccuracy(sideAccuracy(weightedSum[0], weightSum[0], reciprocalSum[0], count[0]),
                sideAccuracy(weightedSum[1], weightSum[1], reciprocalSum[1], count[1]));
    }

    private static Double sideAccuracy(double weightedSum, double weightSum, double reciprocalSum, int count) {
        if (count == 0) return null;
        double weighted = weightedSum / weightSum;
        double harmonic = count / reciprocalSum;
        return (weighted + harmonic) / 2;
    }

    private static double standardDeviation(double[] values, int from, int to) {
        double mean = 0;
        for (int index = from; index < to; index++) mean += values[index];
        mean /= to - from;
        double variance = 0;
        for (int index = from; index < to; index++) variance += (values[index] - mean) * (values[index] - mean);
        return Math.sqrt(variance / (to - from));
    }

    /** Accuracy hai bên; {@code null} khi bên đó không có nước nào. */
    public record GameAccuracy(Double white, Double black) {}

    /** Điểm centipawn đã kẹp, an toàn để lưu vào cột INT. */
    public static int centipawns(double pawns) {
        return (int) Math.round(clamp(pawns * 100, -CENTIPAWN_CLAMP, CENTIPAWN_CLAMP));
    }

    public static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
