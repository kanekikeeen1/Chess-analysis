package com.chessanalysis.auth.review;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chessanalysis.auth.review.dto.ReviewSummaryResponse;
import com.chessanalysis.auth.service.AuthService;
import com.chessanalysis.auth.web.SessionCookieReader;

@RestController
@RequestMapping("/api/reviews")
public class ReviewController {
    private final ReviewService reviews;
    private final AuthService authService;
    private final SessionCookieReader cookies;

    public ReviewController(ReviewService reviews, AuthService authService, SessionCookieReader cookies) {
        this.reviews = reviews;
        this.authService = authService;
        this.cookies = cookies;
    }

    /** Số thẻ đến hạn, tổng số, số đã thuộc, lần đến hạn kế tiếp và danh sách thẻ cần ôn ngay. */
    @GetMapping("/summary")
    public ReviewSummaryResponse summary(HttpServletRequest request) {
        return reviews.summary(authService.requireCurrentAccount(cookies.read(request)).getId());
    }
}
