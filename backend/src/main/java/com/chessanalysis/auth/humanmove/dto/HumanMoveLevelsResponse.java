package com.chessanalysis.auth.humanmove.dto;

import java.util.List;

/** Các dải Elo của mô hình, cho bộ chọn mức trên giao diện; rỗng khi chưa nạp được mô hình. */
public record HumanMoveLevelsResponse(boolean available, String unavailableReason, List<Level> levels) {

    /** @param center Elo đại diện, dùng làm giá trị gửi lên khi người dùng chọn dải này */
    public record Level(int bucket, String label, int center) {}
}
