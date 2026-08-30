package com.chessanalysis.auth.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "user_accounts")
public class UserAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "username_normalized", nullable = false, unique = true, length = 64)
    private String usernameNormalized;

    @Column(name = "username_display", nullable = false, length = 64)
    private String usernameDisplay;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "avatar_preset", nullable = false, length = 32)
    private String avatarPreset = "default";

    @Column(name = "avatar_updated_at")
    private Instant avatarUpdatedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected UserAccount() {}

    public UserAccount(String usernameNormalized, String usernameDisplay, String passwordHash, Instant createdAt) {
        this.usernameNormalized = usernameNormalized;
        this.usernameDisplay = usernameDisplay;
        this.passwordHash = passwordHash;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public String getUsernameNormalized() { return usernameNormalized; }
    public String getUsernameDisplay() { return usernameDisplay; }
    public String getPasswordHash() { return passwordHash; }
    public String getAvatarPreset() { return avatarPreset; }
    public Instant getAvatarUpdatedAt() { return avatarUpdatedAt; }
    public Instant getCreatedAt() { return createdAt; }

    public void usePresetAvatar(String preset, Instant updatedAt) {
        this.avatarPreset = preset;
        this.avatarUpdatedAt = updatedAt;
    }

    public void markAvatarUpdated(Instant updatedAt) {
        this.avatarUpdatedAt = updatedAt;
    }
}
