package com.chessanalysis.auth.dto;

public record UserResponse(
        Long id,
        String username,
        String avatarPreset,
        boolean hasCustomAvatar,
        long avatarVersion) {}
