-- Một lượt giải puzzle, do server giữ trạng thái.
--
-- Lời giải không bao giờ được gửi cho trình duyệt trước khi lượt giải kết thúc: mỗi
-- nước người học đi được server so với lời giải, server đi nước đáp của đối thủ, và
-- rating Glicko-2 được cập nhật đúng một lần khi phiên kết thúc.
CREATE TABLE puzzle_sessions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(36) NOT NULL,
    user_id BIGINT NULL,
    puzzle_id BIGINT NOT NULL,
    -- Số nước trong lời giải đã đi (của cả hai bên).
    progress INT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL,
    -- Có tính rating không: chỉ khi đã đăng nhập và đây là lần đầu gặp puzzle này.
    rated BOOLEAN NOT NULL,
    version INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_puzzle_sessions_public_id UNIQUE (public_id),
    CONSTRAINT fk_puzzle_sessions_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT fk_puzzle_sessions_puzzle FOREIGN KEY (puzzle_id)
        REFERENCES puzzles (id) ON DELETE CASCADE
);
