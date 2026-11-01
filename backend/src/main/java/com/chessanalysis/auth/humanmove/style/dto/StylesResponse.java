package com.chessanalysis.auth.humanmove.style.dto;

import java.util.List;
import java.util.Map;

/**
 * Danh sách kỳ thủ có mô hình phong cách. Số ván, khoảng năm và độ khớp trên tập test đi kèm để giao diện ghi nhãn
 * trung thực: đây là mô phỏng từ ván công khai, không phải chính kỳ thủ.
 */
public record StylesResponse(boolean available, String unavailableReason, List<StyleSummary> styles) {

    /**
     * @param elo      Elo dùng khi hỏi mô hình (trung vị Elo của kỳ thủ trong dữ liệu train)
     * @param testTop1 tỉ lệ đoán trúng nước kỳ thủ thật đi trên các ván mới nhất (tập test), nếu đã đánh giá
     * @param baseTop1 cùng chỉ số của mô hình M2 nền trên cùng tập, để so sánh
     */
    public record StyleSummary(
            String id,
            String displayName,
            int elo,
            int games,
            Integer firstYear,
            Integer lastYear,
            Map<String, Integer> bySpeed,
            Map<String, Integer> bySource,
            Double testTop1,
            Double baseTop1,
            int bookPositions) {}
}
