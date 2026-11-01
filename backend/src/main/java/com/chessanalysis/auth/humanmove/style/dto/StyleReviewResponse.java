package com.chessanalysis.auth.humanmove.style.dto;

import java.util.List;

/**
 * Cả ván theo góc nhìn một kỳ thủ: phần tử thứ i ứng với nước thứ i trong request (mọi bên đi), mỗi phần tử có
 * tối đa 2 nước kỳ thủ chọn, không kèm điểm Stockfish.
 */
public record StyleReviewResponse(String style, String displayName, List<StyleOpinionResponse.StyleOpinion> moves) {}
