package com.chessanalysis.auth.analysis.service;

import java.util.regex.Pattern;

/**
 * Kiểm tra một chuỗi FEN có phải là vị trí cờ vua hợp lệ hay không.
 *
 * <p>FEN đi thẳng vào stdin của Stockfish qua lệnh {@code position fen ...}, nên
 * một chuỗi chứa ký tự xuống dòng có thể chèn thêm lệnh UCI tùy ý (ví dụ
 * {@code setoption name Debug Log File}). Ngoài ra Stockfish không tự kiểm tra
 * vị trí: thiếu vua hoặc vua của bên không đến lượt đang bị chiếu có thể làm
 * tiến trình engine dừng bất thường. Mọi FEN từ client phải qua lớp này trước.
 */
public final class FenRules {
    public static final int MAX_LENGTH = 100;

    private static final Pattern RANK = Pattern.compile("[pnbrqkPNBRQK1-8]+");
    private static final Pattern CASTLING = Pattern.compile("-|K?Q?k?q?");
    private static final Pattern EN_PASSANT = Pattern.compile("-|[a-h][36]");
    private static final Pattern HALFMOVE = Pattern.compile("\\d{1,4}");
    private static final Pattern FULLMOVE = Pattern.compile("[1-9]\\d{0,4}");

    private static final int[][] KNIGHT_STEPS = {
            {1, 2}, {2, 1}, {2, -1}, {1, -2}, {-1, -2}, {-2, -1}, {-2, 1}, {-1, 2}};
    private static final int[][] KING_STEPS = {
            {1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}, {-1, -1}, {0, -1}, {1, -1}};
    private static final int[][] ROOK_DIRECTIONS = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
    private static final int[][] BISHOP_DIRECTIONS = {{1, 1}, {1, -1}, {-1, 1}, {-1, -1}};

    private FenRules() {}

    public static boolean isValid(String fen) {
        return violation(fen) == null;
    }

    /** Ném {@link IllegalArgumentException} nếu FEN không hợp lệ. */
    public static void requireValid(String fen) {
        String violation = violation(fen);
        if (violation != null) throw new IllegalArgumentException(violation);
    }

    /**
     * Lý do FEN không hợp lệ, hoặc {@code null} nếu hợp lệ. Chấp nhận dạng đủ 6
     * trường hoặc dạng rút gọn 4 trường (không có hai bộ đếm nước).
     */
    public static String violation(String fen) {
        if (fen == null || fen.isEmpty()) return "FEN không được để trống.";
        if (fen.length() > MAX_LENGTH) return "FEN quá dài.";

        String[] fields = fen.split(" ", -1);
        if (fields.length != 4 && fields.length != 6) {
            return "FEN phải có 4 hoặc 6 trường cách nhau bởi một dấu cách.";
        }

        char[][] board = new char[8][8];
        String boardViolation = parsePlacement(fields[0], board);
        if (boardViolation != null) return boardViolation;

        if (!fields[1].equals("w") && !fields[1].equals("b")) {
            return "Lượt đi trong FEN phải là 'w' hoặc 'b'.";
        }
        boolean whiteToMove = fields[1].equals("w");

        if (fields[2].isEmpty() || !CASTLING.matcher(fields[2]).matches()) {
            return "Quyền nhập thành trong FEN không hợp lệ.";
        }
        if (!EN_PASSANT.matcher(fields[3]).matches()) {
            return "Ô bắt tốt qua đường trong FEN không hợp lệ.";
        }
        if (!fields[3].equals("-") && fields[3].charAt(1) != (whiteToMove ? '6' : '3')) {
            return "Ô bắt tốt qua đường không khớp với lượt đi.";
        }
        if (fields.length == 6
                && (!HALFMOVE.matcher(fields[4]).matches() || !FULLMOVE.matcher(fields[5]).matches())) {
            return "Bộ đếm nước trong FEN không hợp lệ.";
        }

        char opponentKing = whiteToMove ? 'k' : 'K';
        if (isAttacked(board, find(board, opponentKing), whiteToMove)) {
            return "Vua của bên không đến lượt đi đang bị chiếu.";
        }
        return null;
    }

    /** Dựng bàn cờ; board[rank][file] với rank 0 là hàng 1. */
    private static String parsePlacement(String placement, char[][] board) {
        String[] ranks = placement.split("/", -1);
        if (ranks.length != 8) return "Phần bố trí quân trong FEN phải có đúng 8 hàng.";

        int whiteKings = 0;
        int blackKings = 0;
        for (int index = 0; index < 8; index++) {
            String rank = ranks[index];
            if (!RANK.matcher(rank).matches()) return "Hàng " + (8 - index) + " trong FEN chứa ký tự lạ.";
            int rankIndex = 7 - index;
            int file = 0;
            boolean previousWasDigit = false;
            for (char symbol : rank.toCharArray()) {
                if (Character.isDigit(symbol)) {
                    if (previousWasDigit) return "Hàng " + (8 - index) + " trong FEN có hai chữ số liền nhau.";
                    file += symbol - '0';
                    previousWasDigit = true;
                    continue;
                }
                previousWasDigit = false;
                if (file >= 8) return "Hàng " + (8 - index) + " trong FEN không đủ hoặc thừa 8 ô.";
                if ((symbol == 'p' || symbol == 'P') && (rankIndex == 0 || rankIndex == 7)) {
                    return "Tốt không được nằm ở hàng 1 hoặc hàng 8.";
                }
                if (symbol == 'K') whiteKings++;
                if (symbol == 'k') blackKings++;
                board[rankIndex][file++] = symbol;
            }
            if (file != 8) return "Hàng " + (8 - index) + " trong FEN không đủ hoặc thừa 8 ô.";
        }
        if (whiteKings != 1 || blackKings != 1) return "Mỗi bên phải có đúng một vua.";
        return null;
    }

    private static int[] find(char[][] board, char piece) {
        for (int rank = 0; rank < 8; rank++) {
            for (int file = 0; file < 8; file++) {
                if (board[rank][file] == piece) return new int[] {rank, file};
            }
        }
        throw new IllegalStateException("Không tìm thấy quân " + piece);
    }

    /** Ô {@code square} có bị bên {@code byWhite} tấn công không. */
    private static boolean isAttacked(char[][] board, int[] square, boolean byWhite) {
        int rank = square[0];
        int file = square[1];

        // Tốt Trắng tấn công lên trên, nên tốt Trắng đứng ở hàng thấp hơn ô bị tấn công.
        int pawnRank = byWhite ? rank - 1 : rank + 1;
        char pawn = byWhite ? 'P' : 'p';
        if (pieceAt(board, pawnRank, file - 1) == pawn || pieceAt(board, pawnRank, file + 1) == pawn) {
            return true;
        }
        if (stepAttack(board, rank, file, KNIGHT_STEPS, byWhite ? 'N' : 'n')) return true;
        if (stepAttack(board, rank, file, KING_STEPS, byWhite ? 'K' : 'k')) return true;
        char queen = byWhite ? 'Q' : 'q';
        return slideAttack(board, rank, file, ROOK_DIRECTIONS, byWhite ? 'R' : 'r', queen)
                || slideAttack(board, rank, file, BISHOP_DIRECTIONS, byWhite ? 'B' : 'b', queen);
    }

    private static boolean stepAttack(char[][] board, int rank, int file, int[][] steps, char attacker) {
        for (int[] step : steps) {
            if (pieceAt(board, rank + step[0], file + step[1]) == attacker) return true;
        }
        return false;
    }

    private static boolean slideAttack(
            char[][] board, int rank, int file, int[][] directions, char slider, char queen) {
        for (int[] direction : directions) {
            int r = rank + direction[0];
            int f = file + direction[1];
            while (r >= 0 && r < 8 && f >= 0 && f < 8) {
                char piece = board[r][f];
                if (piece != 0) {
                    if (piece == slider || piece == queen) return true;
                    break;
                }
                r += direction[0];
                f += direction[1];
            }
        }
        return false;
    }

    private static char pieceAt(char[][] board, int rank, int file) {
        if (rank < 0 || rank > 7 || file < 0 || file > 7) return 0;
        return board[rank][file];
    }
}
