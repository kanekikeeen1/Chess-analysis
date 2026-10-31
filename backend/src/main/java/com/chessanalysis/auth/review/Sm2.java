package com.chessanalysis.auth.review;

/**
 * Thuật toán ôn tập ngắt quãng SM-2 (Woźniak, SuperMemo 2, 1987) — thuật toán gốc của Anki.
 *
 * <p>Mỗi thẻ có hệ số dễ {@code EF} (khởi đầu 2,5), số lần nhớ liên tiếp {@code n} và
 * khoảng cách {@code I} (ngày). Sau mỗi lần ôn với chất lượng {@code q} (0–5):
 * <ul>
 *   <li>{@code q < 3} (quên): bắt đầu lại từ đầu, {@code n = 0}, {@code I = 1}; EF giữ nguyên.</li>
 *   <li>{@code q ≥ 3} (nhớ): {@code I(1) = 1}, {@code I(2) = 6}, {@code I(n) = I(n−1) × EF};
 *       EF cập nhật theo {@code EF + (0,1 − (5−q)(0,08 + (5−q)·0,02))}, không nhỏ hơn 1,3.</li>
 * </ul>
 * Ở đây kết quả chỉ có đúng/sai nên quy đổi: đúng → {@link #CORRECT}, sai → {@link #WRONG}.
 */
public final class Sm2 {
    public static final double INITIAL_EASE = 2.5;
    static final double MIN_EASE = 1.3;
    /** "Trả lời đúng sau một chút suy nghĩ" theo thang SM-2; giữ nguyên EF. */
    public static final int CORRECT = 4;
    /** "Sai, nhưng nhận ra đáp án khi được xem". */
    public static final int WRONG = 1;

    private Sm2() {}

    public record State(double ease, int repetitions, int intervalDays) {
        /** Thẻ mới tạo từ một lần làm sai: ôn lại sau một ngày. */
        public static State afterFirstFailure() {
            return new State(INITIAL_EASE, 0, 1);
        }
    }

    public static State review(State state, int quality) {
        if (quality < 0 || quality > 5) throw new IllegalArgumentException("Chất lượng SM-2 phải trong 0–5: " + quality);
        if (quality < 3) return new State(state.ease(), 0, 1);

        int repetitions = state.repetitions() + 1;
        int interval = switch (repetitions) {
            case 1 -> 1;
            case 2 -> 6;
            default -> (int) Math.round(state.intervalDays() * state.ease());
        };
        int distance = 5 - quality;
        double ease = Math.max(MIN_EASE, state.ease() + 0.1 - distance * (0.08 + distance * 0.02));
        return new State(ease, repetitions, interval);
    }
}
