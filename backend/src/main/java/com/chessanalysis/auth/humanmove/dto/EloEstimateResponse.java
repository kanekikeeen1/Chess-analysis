package com.chessanalysis.auth.humanmove.dto;

import com.chessanalysis.auth.humanmove.EloEstimator;
import com.chessanalysis.auth.humanmove.M2Encoding;

/** Elo ước lượng của mỗi bên; {@code null} cho bên không có nước nào trong request. */
public record EloEstimateResponse(SideEstimate white, SideEstimate black, Integer trainStep) {

    /**
     * @param stdError độ lệch chuẩn hậu nghiệm; ván ngắn thì lớn, nên giao diện phải hiện kèm
     * @param level    dải Elo chứa {@code elo}, ví dụ {@code 1400-1599}
     */
    public record SideEstimate(int elo, int stdError, int moves, String level) {

        public static SideEstimate of(EloEstimator.Estimate estimate, M2Encoding encoding) {
            return new SideEstimate((int) Math.round(estimate.elo()), (int) Math.round(estimate.stdError()),
                    estimate.moves(), encoding.bucketLabel(encoding.eloBucket(estimate.elo())));
        }
    }
}
