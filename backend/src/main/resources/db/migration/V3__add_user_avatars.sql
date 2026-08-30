ALTER TABLE user_accounts
    ADD COLUMN avatar_preset VARCHAR(32) NOT NULL DEFAULT 'default' AFTER password_hash,
    ADD COLUMN avatar_updated_at TIMESTAMP(6) NULL AFTER avatar_preset;

CREATE TABLE user_avatar_images (
    user_id BIGINT NOT NULL,
    content_type VARCHAR(64) NOT NULL,
    image_data MEDIUMBLOB NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_avatar_images_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE CASCADE
);
