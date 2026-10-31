package com.chessanalysis.auth.mistake.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.mistake.dto.MistakeAnswerRequest;
import com.chessanalysis.auth.mistake.dto.MistakeAnswerResponse;
import com.chessanalysis.auth.mistake.dto.MistakeItemResponse;
import com.chessanalysis.auth.mistake.dto.MistakeSummaryResponse;
import com.chessanalysis.auth.mistake.service.MistakeTrainingService;
import com.chessanalysis.auth.service.AuthService;
import com.chessanalysis.auth.web.SessionCookieReader;

/** Mọi endpoint đều cần đăng nhập: sai lầm là dữ liệu riêng của từng người. */
@RestController
@RequestMapping("/api/mistakes")
public class MistakeController {
    private final MistakeTrainingService training;
    private final AuthService authService;
    private final SessionCookieReader cookies;

    public MistakeController(MistakeTrainingService training, AuthService authService, SessionCookieReader cookies) {
        this.training = training;
        this.authService = authService;
        this.cookies = cookies;
    }

    @GetMapping("/summary")
    public MistakeSummaryResponse summary(HttpServletRequest request) {
        return training.summary(user(request));
    }

    @GetMapping("/next")
    public MistakeItemResponse next(@RequestParam(required = false) String phase, HttpServletRequest request) {
        return training.next(user(request), phase);
    }

    @GetMapping("/{id}")
    public MistakeItemResponse item(@PathVariable Long id, HttpServletRequest request) {
        return training.item(user(request), id);
    }

    @PostMapping("/{id}/answer")
    public MistakeAnswerResponse answer(
            @PathVariable Long id,
            @Valid @RequestBody MistakeAnswerRequest body,
            HttpServletRequest request) {
        return training.answer(user(request), id, body.uci());
    }

    @PostMapping("/{id}/reveal")
    public MistakeAnswerResponse reveal(@PathVariable Long id, HttpServletRequest request) {
        return training.reveal(user(request), id);
    }

    private UserAccount user(HttpServletRequest request) {
        return authService.requireCurrentAccount(cookies.read(request));
    }
}
