package com.chessanalysis.auth.puzzle.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;

/** Mọi trường đều tùy chọn; {@code rating} chỉ dùng cho khách (người đăng nhập dùng rating của mình). */
public record StartPuzzleRequest(
        @Pattern(regexp = "[A-Za-z0-9]{1,48}") String theme,
        @Min(400) @Max(3200) Integer rating) {}
