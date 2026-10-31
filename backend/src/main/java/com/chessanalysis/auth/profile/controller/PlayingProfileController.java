package com.chessanalysis.auth.profile.controller;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.chessanalysis.auth.profile.PlayingProfileService;
import com.chessanalysis.auth.profile.dto.PlayingProfileResponse;
import com.chessanalysis.auth.web.SessionCookieReader;

@RestController
@RequestMapping("/api/profile")
public class PlayingProfileController {
    private final PlayingProfileService profiles;
    private final SessionCookieReader cookies;

    public PlayingProfileController(PlayingProfileService profiles, SessionCookieReader cookies) {
        this.profiles = profiles;
        this.cookies = cookies;
    }

    @GetMapping("/playing")
    public PlayingProfileResponse playing(HttpServletRequest request) {
        return profiles.view(cookies.read(request));
    }
}
