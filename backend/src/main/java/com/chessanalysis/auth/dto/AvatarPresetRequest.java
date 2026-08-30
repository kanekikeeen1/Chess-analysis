package com.chessanalysis.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record AvatarPresetRequest(
        @NotBlank(message = "Hãy chọn một ảnh đại diện.") String preset) {}
