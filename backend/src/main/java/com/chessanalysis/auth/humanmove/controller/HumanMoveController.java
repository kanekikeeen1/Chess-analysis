package com.chessanalysis.auth.humanmove.controller;

import java.util.List;
import java.util.stream.IntStream;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chessanalysis.auth.humanmove.HumanMoveModel;
import com.chessanalysis.auth.humanmove.HumanMoveService;
import com.chessanalysis.auth.humanmove.M2Encoding;
import com.chessanalysis.auth.humanmove.dto.EloEstimateRequest;
import com.chessanalysis.auth.humanmove.dto.EloEstimateResponse;
import com.chessanalysis.auth.humanmove.dto.HumanMoveLevelsResponse;
import com.chessanalysis.auth.humanmove.dto.HumanMoveRequest;
import com.chessanalysis.auth.humanmove.dto.HumanMoveResponse;

/**
 * "Người ở Elo X thường đi nước nào" (mô hình M2). Không cần đăng nhập: chỉ đọc, không lưu gì.
 */
@RestController
@RequestMapping("/api/human-moves")
public class HumanMoveController {
    private final HumanMoveModel model;
    private final HumanMoveService service;

    public HumanMoveController(HumanMoveModel model, HumanMoveService service) {
        this.model = model;
        this.service = service;
    }

    @PostMapping
    public HumanMoveResponse predict(@Valid @RequestBody HumanMoveRequest request) {
        return service.predict(request);
    }

    /** Elo ước lượng của Trắng và Đen từ các nước trong một ván (báo cáo ván). */
    @PostMapping("/estimate")
    public EloEstimateResponse estimate(@Valid @RequestBody EloEstimateRequest request) {
        return service.estimate(request);
    }

    @GetMapping("/levels")
    public HumanMoveLevelsResponse levels() {
        if (!model.available()) {
            return new HumanMoveLevelsResponse(false, model.unavailableReason(), List.of());
        }
        M2Encoding encoding = model.encoding();
        List<HumanMoveLevelsResponse.Level> levels = IntStream.range(0, encoding.numEloBuckets())
                .mapToObj(b -> new HumanMoveLevelsResponse.Level(b, encoding.bucketLabel(b), encoding.bucketCenter(b)))
                .toList();
        return new HumanMoveLevelsResponse(true, null, levels);
    }
}
