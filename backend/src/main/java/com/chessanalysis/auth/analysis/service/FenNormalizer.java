package com.chessanalysis.auth.analysis.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Chuẩn hóa FEN thành khóa cache.
 *
 * <p>Bỏ hai trường cuối (halfmove clock, fullmove number) vì chúng không đổi
 * đánh giá của engine trong phần lớn trường hợp; giữ lại quyền nhập thành và ô
 * bắt tốt qua đường vì chúng đổi. Ngoại lệ là khi đồng hồ 50 nước đã gần chạm
 * ngưỡng: lúc đó luật hòa mới thực sự chi phối đánh giá, nên vị trí bị đánh dấu
 * không cache được thay vì trả về một con số sai.
 */
public final class FenNormalizer {
    private static final int FIFTY_MOVE_DANGER_ZONE = 80;

    private FenNormalizer() {}

    public static String normalize(String fen) {
        String[] parts = fen.trim().split("\\s+");
        if (parts.length < 4) return fen.trim();
        return String.join(" ", parts[0], parts[1], parts[2], parts[3]);
    }

    public static boolean cacheable(String fen) {
        String[] parts = fen.trim().split("\\s+");
        if (parts.length < 5) return true;
        try {
            return Integer.parseInt(parts[4]) < FIFTY_MOVE_DANGER_ZONE;
        } catch (NumberFormatException exception) {
            return true;
        }
    }

    public static String key(String fen) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(normalize(fen).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("JVM thiếu SHA-256.", exception);
        }
    }

    public static boolean whiteToMove(String fen) {
        String[] parts = fen.trim().split("\\s+");
        return parts.length < 2 || parts[1].equals("w");
    }

    /** Số quân còn trên bàn, dùng cho đặc trưng giai đoạn ván. */
    public static int pieceCount(String fen) {
        String placement = fen.trim().split("\\s+")[0];
        int count = 0;
        for (int index = 0; index < placement.length(); index++) {
            if ("prnbqkPRNBQK".indexOf(placement.charAt(index)) >= 0) count++;
        }
        return count;
    }

    /** Số hậu còn trên bàn; dùng để phân biệt trung cuộc với tàn cuộc. */
    public static int queenCount(String fen) {
        String placement = fen.trim().split("\\s+")[0];
        int count = 0;
        for (int index = 0; index < placement.length(); index++) {
            char piece = placement.charAt(index);
            if (piece == 'q' || piece == 'Q') count++;
        }
        return count;
    }

    /** Cân bằng vật chất theo centipawn, dương nghĩa là Trắng hơn quân. */
    public static int materialBalance(String fen) {
        String placement = fen.trim().split("\\s+")[0];
        int balance = 0;
        for (int index = 0; index < placement.length(); index++) {
            char piece = placement.charAt(index);
            int value = switch (Character.toLowerCase(piece)) {
                case 'p' -> 100;
                case 'n', 'b' -> 300;
                case 'r' -> 500;
                case 'q' -> 900;
                default -> 0;
            };
            if (value == 0) continue;
            balance += Character.isUpperCase(piece) ? value : -value;
        }
        return balance;
    }
}
