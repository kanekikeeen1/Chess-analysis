package com.chessanalysis.auth.mistake.dto;

import java.util.List;

/** Thống kê sai lầm theo giai đoạn ván và nhãn, kèm số đã sửa đúng ít nhất một lần. */
public record MistakeSummaryResponse(long total, long fixed, List<Group> groups) {
    public record Group(String phase, String label, long total, long fixed) {}
}
