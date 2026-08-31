-- M0: vector điểm yếu theo chủ đề, cập nhật dần sau mỗi ván và mỗi bài tập.
-- M3 đọc bảng này để chọn bài thích nghi; M2 ghi trình độ ước lượng.
CREATE TABLE user_skill_profiles (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    theme VARCHAR(48) NOT NULL,

    exposures INT NOT NULL DEFAULT 0,
    errors INT NOT NULL DEFAULT 0,

    -- Bayesian Knowledge Tracing: xác suất người dùng đã nắm chủ đề.
    mastery DOUBLE NOT NULL DEFAULT 0.35,
    -- Ước lượng năng lực kiểu Elo trên chủ đề (thang cùng đơn vị độ khó bài).
    theta DOUBLE NOT NULL DEFAULT 1200,
    confidence DOUBLE NOT NULL DEFAULT 0,

    last_seen_at TIMESTAMP(6) NULL,
    updated_at TIMESTAMP(6) NOT NULL,

    PRIMARY KEY (id),
    CONSTRAINT uq_user_skill_profiles UNIQUE (user_id, theme),
    CONSTRAINT fk_user_skill_profiles_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE CASCADE
);

CREATE INDEX idx_user_skill_profiles_user ON user_skill_profiles (user_id, mastery);

-- Trình độ tổng thể ước lượng từ M2 (chọn dải Elo cực đại hóa likelihood).
CREATE TABLE user_playing_profiles (
    user_id BIGINT NOT NULL,
    estimated_elo DOUBLE NULL,
    elo_std_error DOUBLE NULL,
    games_analyzed INT NOT NULL DEFAULT 0,
    moves_analyzed INT NOT NULL DEFAULT 0,
    last_estimated_at TIMESTAMP(6) NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_playing_profiles_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE CASCADE
);
