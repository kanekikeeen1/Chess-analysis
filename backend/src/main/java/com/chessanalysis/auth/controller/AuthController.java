package com.chessanalysis.auth.controller;

import java.time.Duration;
import java.util.Arrays;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.chessanalysis.auth.dto.AvatarPresetRequest;
import com.chessanalysis.auth.dto.AuthResponse;
import com.chessanalysis.auth.dto.LoginRequest;
import com.chessanalysis.auth.dto.RegisterRequest;
import com.chessanalysis.auth.dto.UserResponse;
import com.chessanalysis.auth.service.AuthService;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final String cookieName;
    private final boolean cookieSecure;

    public AuthController(
            AuthService authService,
            @Value("${app.auth.cookie-name:chess_session}") String cookieName,
            @Value("${app.auth.cookie-secure:false}") boolean cookieSecure) {
        this.authService = authService;
        this.cookieName = cookieName;
        this.cookieSecure = cookieSecure;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        UserResponse user = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new AuthResponse("Đăng ký thành công. Hãy đăng nhập để tiếp tục.", user));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletResponse response) {
        AuthService.LoginResult result = authService.login(request);
        response.addHeader(HttpHeaders.SET_COOKIE, sessionCookie(result.token(), result.duration()).toString());
        return ResponseEntity.ok(new AuthResponse("Đăng nhập thành công.", result.user()));
    }

    @GetMapping("/me")
    public UserResponse me(HttpServletRequest request) {
        return authService.currentUser(readCookie(request));
    }

    @PostMapping("/logout")
    public ResponseEntity<AuthResponse> logout(HttpServletRequest request, HttpServletResponse response) {
        authService.logout(readCookie(request));
        response.addHeader(HttpHeaders.SET_COOKIE, expiredCookie().toString());
        return ResponseEntity.ok(new AuthResponse("Đã đăng xuất.", null));
    }

    @PutMapping("/avatar/preset")
    public UserResponse updateAvatarPreset(
            @Valid @RequestBody AvatarPresetRequest request,
            HttpServletRequest servletRequest) {
        return authService.updateAvatarPreset(readCookie(servletRequest), request.preset());
    }

    @PostMapping(value = "/avatar/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UserResponse uploadAvatar(
            @RequestParam("file") MultipartFile file,
            HttpServletRequest request) throws java.io.IOException {
        return authService.updateCustomAvatar(readCookie(request), file.getBytes());
    }

    @GetMapping("/avatar/image")
    public ResponseEntity<byte[]> avatarImage(HttpServletRequest request) {
        AuthService.AvatarImage image = authService.currentAvatarImage(readCookie(request));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.contentType()))
                .contentLength(image.data().length)
                .header(HttpHeaders.CACHE_CONTROL, "no-store, max-age=0")
                .header("X-Content-Type-Options", "nosniff")
                .body(image.data());
    }

    private String readCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        return Arrays.stream(request.getCookies())
                .filter(cookie -> cookieName.equals(cookie.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private ResponseCookie sessionCookie(String token, Duration duration) {
        return ResponseCookie.from(cookieName, token)
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Lax")
                .path("/")
                .maxAge(duration)
                .build();
    }

    private ResponseCookie expiredCookie() {
        return ResponseCookie.from(cookieName, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ZERO)
                .build();
    }
}
