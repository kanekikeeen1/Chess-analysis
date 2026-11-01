package com.chessanalysis.auth.humanmove.style;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chessanalysis.auth.humanmove.HumanMoveService;
import com.chessanalysis.auth.humanmove.dto.EloEstimateRequest;
import com.chessanalysis.auth.humanmove.style.dto.StyleCompareRequest;
import com.chessanalysis.auth.humanmove.style.dto.StyleCompareResponse;
import com.chessanalysis.auth.humanmove.style.dto.StyleMatchResponse;
import com.chessanalysis.auth.humanmove.style.dto.StyleMoveRequest;
import com.chessanalysis.auth.humanmove.style.dto.StyleMoveResponse;
import com.chessanalysis.auth.humanmove.style.dto.StyleOpinionRequest;
import com.chessanalysis.auth.humanmove.style.dto.StyleOpinionResponse;
import com.chessanalysis.auth.humanmove.style.dto.StyleReviewResponse;
import com.chessanalysis.auth.humanmove.style.dto.StylesResponse;

/** Mô hình phong cách kiện tướng (giai đoạn D): đấu bot, so sánh trên trang phân tích, báo cáo ván. Không cần đăng nhập. */
@RestController
@RequestMapping("/api/styles")
public class StyleController {
    private final StyleMoveService service;

    public StyleController(StyleMoveService service) {
        this.service = service;
    }

    @GetMapping
    public StylesResponse list() {
        return service.list();
    }

    @PostMapping("/compare")
    public StyleCompareResponse compare(@Valid @RequestBody StyleCompareRequest request) {
        return service.compare(request.fen(), request.topKOrDefault(), request.engineDepth());
    }

    @PostMapping("/opinion")
    public StyleOpinionResponse opinion(@Valid @RequestBody StyleOpinionRequest request) {
        return service.opinion(request.fen(), request.uci(), request.engineDepth());
    }

    /** Cùng định dạng request với ước lượng Elo: các nước của một ván, bên đi suy ra từ FEN. */
    @PostMapping("/match")
    public StyleMatchResponse match(@Valid @RequestBody EloEstimateRequest request) {
        return service.match(request.moves().stream()
                .map(move -> HumanMoveService.played(move.fen(), move.uci()))
                .toList());
    }

    /** Cả ván theo góc nhìn kỳ thủ {@code id}; cùng định dạng request với ước lượng Elo. */
    @PostMapping("/{id}/review")
    public StyleReviewResponse review(@PathVariable String id, @Valid @RequestBody EloEstimateRequest request) {
        return service.review(id, request.moves().stream()
                .map(move -> HumanMoveService.played(move.fen(), move.uci()))
                .toList());
    }

    @PostMapping("/{id}/moves")
    public StyleMoveResponse moves(@PathVariable String id, @Valid @RequestBody StyleMoveRequest request) {
        return service.moves(id, request.fen(), request.topKOrDefault());
    }
}
