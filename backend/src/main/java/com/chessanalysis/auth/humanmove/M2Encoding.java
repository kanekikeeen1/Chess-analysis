package com.chessanalysis.auth.humanmove;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.chessanalysis.auth.chess.ChessRules;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.CastleRight;
import com.github.bhlangonijr.chesslib.Piece;
import com.github.bhlangonijr.chesslib.PieceType;
import com.github.bhlangonijr.chesslib.Side;
import com.github.bhlangonijr.chesslib.Square;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * Bản port Java của {@code ml/m2/encoding.py}: thế cờ → 20 mặt phẳng 8×8, nước đi → chỉ số.
 *
 * <p>Phải khớp Python tới từng giá trị: lệch một mặt phẳng thì mô hình vẫn chạy và vẫn trả về
 * xác suất, chỉ là sai hết mà không có lỗi nào báo ra. {@code M2EncodingTest} so với dữ liệu do
 * {@code ml/scripts/export_m2_fixtures.py} sinh ra từ chính bản Python.
 *
 * <p>Bảng nước đi không sinh lại ở đây mà đọc từ file metadata đi kèm mô hình, nên không thể lệch
 * với bảng lúc huấn luyện. Mặt phẳng "thế cờ đã lặp lại" luôn bằng 0 vì API chỉ nhận FEN, không có
 * lịch sử ván; bản Python dựng bàn cờ từ FEN cũng cho ra đúng như vậy.
 */
public final class M2Encoding {
    public static final int NUM_PLANES = 20;
    public static final int CELLS = 64;

    private static final PieceType[] PIECE_ORDER = {
            PieceType.PAWN, PieceType.KNIGHT, PieceType.BISHOP, PieceType.ROOK, PieceType.QUEEN, PieceType.KING};

    private final List<String> moveUcis;
    private final Map<String, Integer> moveIndex;
    private final int[] eloBucketEdges;
    private final double eloCenter;
    private final double eloScale;

    public M2Encoding(List<String> moveUcis, int[] eloBucketEdges, double eloCenter, double eloScale) {
        this.moveUcis = List.copyOf(moveUcis);
        this.moveIndex = new HashMap<>(moveUcis.size() * 2);
        for (int i = 0; i < moveUcis.size(); i++) {
            moveIndex.put(moveUcis.get(i), i);
        }
        this.eloBucketEdges = eloBucketEdges.clone();
        this.eloCenter = eloCenter;
        this.eloScale = eloScale;
    }

    public int numMoves() {
        return moveUcis.size();
    }

    public int numEloBuckets() {
        return eloBucketEdges.length + 1;
    }

    /** Tensor phẳng độ dài {@code 20 * 64}, chỉ số {@code mặt phẳng * 64 + hàng * 8 + cột}, đã xoay về bên đi. */
    public float[] encode(Board board) {
        float[] planes = new float[NUM_PLANES * CELLS];
        Side mover = board.getSideToMove();

        for (Square square : Square.values()) {
            if (square == Square.NONE) continue;
            Piece piece = board.getPiece(square);
            if (piece == Piece.NONE) continue;
            int plane = pieceIndex(piece.getPieceType()) + (piece.getPieceSide() == mover ? 0 : 6);
            planes[plane * CELLS + view(square.ordinal(), mover)] = 1f;
        }

        Side opponent = mover.flip();
        fill(planes, 12, kingside(board.getCastleRight(mover)) ? 1f : 0f);
        fill(planes, 13, queenside(board.getCastleRight(mover)) ? 1f : 0f);
        fill(planes, 14, kingside(board.getCastleRight(opponent)) ? 1f : 0f);
        fill(planes, 15, queenside(board.getCastleRight(opponent)) ? 1f : 0f);

        // Dữ liệu huấn luyện là FEN do python-chess ghi, vốn chỉ có ô bắt tốt qua đường khi bắt được thật.
        String enPassant = ChessRules.effectiveEnPassant(board);
        if (!"-".equals(enPassant)) {
            Square target = Square.valueOf(enPassant.toUpperCase());
            planes[16 * CELLS + view(target.ordinal(), mover)] = 1f;
        }

        // Chia trong double rồi mới ép về float, như numpy làm, để khớp tới bit cuối.
        fill(planes, 17, (float) (Math.min(board.getHalfMoveCounter(), 100) / 100.0));
        fill(planes, 19, 1f);
        return planes;
    }

    /** Chỉ số của một nước hợp lệ trong không gian đã xoay; phong Hậu dùng chung chỉ số với nước thường. */
    public int moveIndex(Move move, Side mover) {
        int from = view(move.getFrom().ordinal(), mover);
        int to = view(move.getTo().ordinal(), mover);
        StringBuilder uci = new StringBuilder(5).append(squareName(from)).append(squareName(to));
        Piece promotion = move.getPromotion();
        if (promotion != null && promotion != Piece.NONE) {
            switch (promotion.getPieceType()) {
                case KNIGHT -> uci.append('n');
                case BISHOP -> uci.append('b');
                case ROOK -> uci.append('r');
                default -> { }
            }
        }
        Integer index = moveIndex.get(uci.toString());
        if (index == null) {
            throw new IllegalArgumentException("Nước " + move + " không có trong bảng nước đi của mô hình.");
        }
        return index;
    }

    public int eloBucket(double elo) {
        int bucket = 0;
        for (int edge : eloBucketEdges) {
            if (elo >= edge) bucket++;
        }
        return bucket;
    }

    public float normalizeElo(double elo) {
        return (float) ((elo - eloCenter) / eloScale);
    }

    /** Nhãn dải như bên Python: {@code <1000}, {@code 1000-1199}, …, {@code 2600+}. */
    public String bucketLabel(int bucket) {
        if (bucket == 0) return "<" + eloBucketEdges[0];
        if (bucket == eloBucketEdges.length) return eloBucketEdges[eloBucketEdges.length - 1] + "+";
        return eloBucketEdges[bucket - 1] + "-" + (eloBucketEdges[bucket] - 1);
    }

    /** Elo đại diện của một dải, như {@code bucket_center} bên Python. */
    public int bucketCenter(int bucket) {
        if (bucket == 0) return eloBucketEdges[0] - 100;
        if (bucket == eloBucketEdges.length) return eloBucketEdges[eloBucketEdges.length - 1] + 100;
        return (eloBucketEdges[bucket - 1] + eloBucketEdges[bucket]) / 2;
    }

    private static int view(int square, Side mover) {
        // Khi Đen đi, lật dọc bàn cờ (square_mirror của python-chess) để bên đi luôn tiến lên.
        return mover == Side.WHITE ? square : square ^ 56;
    }

    private static String squareName(int square) {
        return "" + (char) ('a' + (square & 7)) + (char) ('1' + (square >> 3));
    }

    private static int pieceIndex(PieceType type) {
        for (int i = 0; i < PIECE_ORDER.length; i++) {
            if (PIECE_ORDER[i] == type) return i;
        }
        throw new IllegalArgumentException("Quân không hợp lệ: " + type);
    }

    private static boolean kingside(CastleRight right) {
        return right == CastleRight.KING_SIDE || right == CastleRight.KING_AND_QUEEN_SIDE;
    }

    private static boolean queenside(CastleRight right) {
        return right == CastleRight.QUEEN_SIDE || right == CastleRight.KING_AND_QUEEN_SIDE;
    }

    private static void fill(float[] planes, int plane, float value) {
        if (value == 0f) return;
        java.util.Arrays.fill(planes, plane * CELLS, (plane + 1) * CELLS, value);
    }
}
