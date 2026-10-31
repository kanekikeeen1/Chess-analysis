package com.chessanalysis.auth.chess;

import java.util.ArrayList;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.chessanalysis.auth.analysis.dto.AnalysisMoveRequest;
import com.chessanalysis.auth.analysis.dto.CreateAnalysisJobRequest;
import com.chessanalysis.auth.service.ApiException;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.move.Move;

/**
 * Đi lại một ván trên server trước khi phân tích.
 *
 * <p>Client vẫn gửi danh sách vị trí và nước đi (để giữ nguyên định dạng FEN mà
 * frontend dùng làm khóa tra cứu), nhưng không còn được tin: mỗi nước phải hợp lệ
 * trên vị trí trước nó, mỗi vị trí phải khớp với vị trí server tự đi ra, và mọi
 * đặc trưng của nước (bắt quân, chiếu, chiếu hết, phong cấp, số nước hợp lệ, thí
 * quân) đều được tính lại. Riêng {@code theory} vẫn lấy từ client vì sách ECO nằm
 * ở frontend, nhưng nó chỉ là gợi ý: bộ gán nhãn chỉ công nhận Theory khi engine
 * cũng xác nhận.
 */
@Service
public class GameReplayService {
    public CreateAnalysisJobRequest verify(CreateAnalysisJobRequest request) {
        if (request.sourceType().equals("FEN")) return request;

        List<String> positions = request.positions();
        Board board = ChessRules.load(positions.get(0));
        List<AnalysisMoveRequest> verified = new ArrayList<>(request.moves().size());

        for (int index = 0; index < request.moves().size(); index++) {
            verified.add(verifyMove(board, request.moves().get(index),
                    positions.get(index), positions.get(index + 1), index + 1));
        }

        return new CreateAnalysisJobRequest(
                request.sourceType(), request.sourceText(), positions, verified,
                request.openingEco(), request.openingName(), request.minDepth(), request.maxDepth());
    }

    /**
     * Kiểm tra từng nước độc lập, cho chế độ phân tích tay: các nước có thể đến từ
     * nhiều biến thử khác nhau nên không đòi chúng nối tiếp nhau thành một ván.
     */
    public List<AnalysisMoveRequest> verifyEach(List<AnalysisMoveRequest> moves) {
        List<AnalysisMoveRequest> verified = new ArrayList<>(moves.size());
        for (int index = 0; index < moves.size(); index++) {
            AnalysisMoveRequest move = moves.get(index);
            verified.add(verifyMove(ChessRules.load(move.beforeFen()), move,
                    move.beforeFen(), move.afterFen(), index + 1));
        }
        return verified;
    }

    /** Đi {@code move} trên {@code board} (bàn cờ bị thay đổi) và trả bản đặc trưng do server tính. */
    private AnalysisMoveRequest verifyMove(Board board, AnalysisMoveRequest move, String before, String after, int ply) {
        if (!ChessRules.samePosition(move.beforeFen(), before) || !ChessRules.samePosition(board.getFen(), before)) {
            throw mismatch("Vị trí trước nước " + ply + " không khớp với danh sách vị trí.");
        }
        Move legal = ChessRules.findLegal(board, move.uci())
                .orElseThrow(() -> mismatch("Nước " + ply + " (" + move.san() + ") không hợp lệ."));
        MoveFacts facts = MoveFacts.of(board, legal);
        board.doMove(legal);

        if (!ChessRules.samePosition(board.getFen(), after) || !ChessRules.samePosition(move.afterFen(), after)) {
            throw mismatch("Vị trí sau nước " + ply + " không khớp với nước đã đi.");
        }
        return new AnalysisMoveRequest(
                move.san(), legal.toString(), before, after,
                move.theory(), move.theoryName(),
                facts.capture(), facts.check(), facts.checkmate(), facts.promotion(),
                facts.sacrificeCandidate(), facts.abandonedPieceCandidate(),
                facts.sacrificeValue(), facts.sacrificeKind(), facts.legalMoveCount());
    }

    private ApiException mismatch(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message);
    }
}
