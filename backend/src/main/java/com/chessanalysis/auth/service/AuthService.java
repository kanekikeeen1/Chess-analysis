package com.chessanalysis.auth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.dto.LoginRequest;
import com.chessanalysis.auth.dto.RegisterRequest;
import com.chessanalysis.auth.dto.UserResponse;
import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.entity.UserSession;
import com.chessanalysis.auth.repository.AvatarStorageRepository;
import com.chessanalysis.auth.repository.UserAccountRepository;
import com.chessanalysis.auth.repository.UserSessionRepository;

@Service
public class AuthService {
    private static final Pattern USERNAME_PATTERN = Pattern.compile("[\\p{L}\\p{N}_]{4,24}");
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int MAX_AVATAR_BYTES = 2 * 1024 * 1024;
    private static final Set<String> AVATAR_PRESETS = Set.of(
            "default",
            "knight-blue",
            "queen-purple",
            "rook-red",
            "bishop-gold",
            "pawn-green");

    private final UserAccountRepository users;
    private final UserSessionRepository sessions;
    private final AvatarStorageRepository avatarStorage;
    private final PasswordEncoder passwordEncoder;
    private final Duration sessionDuration;

    public AuthService(
            UserAccountRepository users,
            UserSessionRepository sessions,
            AvatarStorageRepository avatarStorage,
            PasswordEncoder passwordEncoder,
            @Value("${app.auth.session-days:7}") long sessionDays) {
        this.users = users;
        this.sessions = sessions;
        this.avatarStorage = avatarStorage;
        this.passwordEncoder = passwordEncoder;
        this.sessionDuration = Duration.ofDays(sessionDays);
    }

    @Transactional
    public UserResponse register(RegisterRequest request) {
        String displayUsername = Normalizer.normalize(request.username().trim(), Normalizer.Form.NFKC);
        String normalizedUsername = normalizeUsername(displayUsername);

        if (!USERNAME_PATTERN.matcher(displayUsername).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Tên đăng nhập chỉ được dùng chữ, số, dấu gạch dưới và dài 4–24 ký tự.");
        }
        if (!request.password().equals(request.confirmPassword())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Mật khẩu xác nhận chưa khớp.");
        }
        if (users.existsByUsernameNormalized(normalizedUsername)) {
            throw new ApiException(HttpStatus.CONFLICT, "Tên đăng nhập đã được sử dụng.");
        }

        UserAccount account = users.save(new UserAccount(
                normalizedUsername,
                displayUsername,
                passwordEncoder.encode(request.password()),
                Instant.now()));
        return toResponse(account);
    }

    @Transactional
    public LoginResult login(LoginRequest request) {
        UserAccount account = users.findByUsernameNormalized(normalizeUsername(request.username()))
                .orElseThrow(this::invalidCredentials);
        if (!passwordEncoder.matches(request.password(), account.getPasswordHash())) {
            throw invalidCredentials();
        }

        Instant now = Instant.now();
        sessions.deleteByExpiresAtBefore(now);
        String rawToken = newToken();
        sessions.save(new UserSession(account, hashToken(rawToken), now, now.plus(sessionDuration)));
        return new LoginResult(rawToken, sessionDuration, toResponse(account));
    }

    @Transactional(readOnly = true)
    public UserResponse currentUser(String rawToken) {
        return toResponse(requireCurrentAccount(rawToken));
    }

    @Transactional
    public UserResponse updateAvatarPreset(String rawToken, String preset) {
        if (!AVATAR_PRESETS.contains(preset)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Ảnh đại diện được chọn không hợp lệ.");
        }
        UserAccount account = requireCurrentAccount(rawToken);
        account.usePresetAvatar(preset, Instant.now());
        avatarStorage.deleteByUserId(account.getId());
        return toResponse(account);
    }

    @Transactional
    public UserResponse updateCustomAvatar(String rawToken, byte[] data) {
        if (data == null || data.length == 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Hãy chọn một tệp ảnh.");
        }
        if (data.length > MAX_AVATAR_BYTES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Ảnh đại diện không được lớn hơn 2 MB.");
        }

        String contentType = detectImageType(data);
        UserAccount account = requireCurrentAccount(rawToken);
        avatarStorage.save(account.getId(), contentType, data);
        account.markAvatarUpdated(Instant.now());
        return toResponse(account);
    }

    @Transactional(readOnly = true)
    public AvatarImage currentAvatarImage(String rawToken) {
        UserAccount account = requireCurrentAccount(rawToken);
        AvatarStorageRepository.AvatarData avatar = avatarStorage.findByUserId(account.getId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "Tài khoản chưa có ảnh đại diện tải lên."));
        return new AvatarImage(avatar.data(), avatar.contentType());
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken != null && !rawToken.isBlank()) {
            sessions.deleteByTokenHash(hashToken(rawToken));
        }
    }

    private String normalizeUsername(String username) {
        return Normalizer.normalize(username.trim(), Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
    }

    private ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "Tên đăng nhập hoặc mật khẩu không đúng.");
    }

    public UserAccount requireCurrentAccount(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Bạn chưa đăng nhập.");
        }
        return sessions.findByTokenHashAndExpiresAtAfter(hashToken(rawToken), Instant.now())
                .map(UserSession::getUser)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Phiên đăng nhập đã hết hạn."));
    }

    @Transactional(readOnly = true)
    public UserAccount currentAccountOrNull(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return null;
        return sessions.findByTokenHashAndExpiresAtAfter(hashToken(rawToken), Instant.now())
                .map(UserSession::getUser)
                .orElse(null);
    }

    private String detectImageType(byte[] data) {
        if (data.length >= 8
                && (data[0] & 0xff) == 0x89
                && data[1] == 0x50
                && data[2] == 0x4e
                && data[3] == 0x47
                && data[4] == 0x0d
                && data[5] == 0x0a
                && data[6] == 0x1a
                && data[7] == 0x0a) {
            return "image/png";
        }
        if (data.length >= 3
                && (data[0] & 0xff) == 0xff
                && (data[1] & 0xff) == 0xd8
                && (data[2] & 0xff) == 0xff) {
            return "image/jpeg";
        }
        if (data.length >= 12
                && data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F'
                && data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P') {
            return "image/webp";
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "Chỉ hỗ trợ ảnh PNG, JPG hoặc WEBP.");
    }

    private String newToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hashToken(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    private UserResponse toResponse(UserAccount account) {
        String preset = account.getAvatarPreset() == null ? "default" : account.getAvatarPreset();
        boolean hasCustomAvatar = avatarStorage.existsByUserId(account.getId());
        long avatarVersion = account.getAvatarUpdatedAt() == null
                ? 0L
                : account.getAvatarUpdatedAt().toEpochMilli();
        return new UserResponse(
                account.getId(),
                account.getUsernameDisplay(),
                preset,
                hasCustomAvatar,
                avatarVersion);
    }

    public record LoginResult(String token, Duration duration, UserResponse user) {}
    public record AvatarImage(byte[] data, String contentType) {}
}
