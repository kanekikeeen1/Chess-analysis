package com.chessanalysis.auth.humanmove.style.dto;

import java.util.List;

/** "Nước của bạn trùng lựa chọn của kiện tướng bao nhiêu %", tách theo bên đi như ước lượng Elo. */
public record StyleMatchResponse(List<StyleMatch> white, List<StyleMatch> black) {

    /**
     * @param moves  số nước của bên này được tính
     * @param top1   số nước trùng đúng nước kỳ thủ có khả năng đi nhất
     * @param top3   số nước nằm trong 3 lựa chọn đầu của kỳ thủ
     * @param inBook số thế cờ có trong sổ khai cuộc của kỳ thủ (xếp hạng theo ván thật, không qua mô hình)
     */
    public record StyleMatch(String style, String displayName, int moves, int top1, int top3, int inBook) {}
}
