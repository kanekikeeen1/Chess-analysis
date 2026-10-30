-- Phiên làm một thế tàn cuộc, do server giữ trạng thái.
--
-- Trước đây trình duyệt tự đi quân, tự quyết định đã đạt mục tiêu chưa và tự gửi
-- điểm lên POST /attempts, nên điểm và "hoàn thành" giả được dễ dàng. Giờ mọi nước
-- đi qua server: server kiểm tra nước hợp lệ, chấm bằng Stockfish, đi nước đáp,
-- xác định mục tiêu và tự tính điểm từ số lần đi sai.
CREATE TABLE exercise_sessions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(36) NOT NULL,
    user_id BIGINT NULL,
    lesson_id BIGINT NOT NULL,
    position_id BIGINT NOT NULL,
    goal_type VARCHAR(24) NOT NULL,
    player_side VARCHAR(1) NOT NULL,
    starting_fen VARCHAR(100) NOT NULL,
    current_fen VARCHAR(100) NOT NULL,
    -- Các nước đã đi (của cả hai bên), cách nhau bởi dấu cách. Lưu để dựng lại ván
    -- từ đầu ở mỗi nước, nhờ đó phát hiện được hòa do lặp lại ba lần.
    moves_uci VARCHAR(1000) NOT NULL DEFAULT '',
    mistakes INT NOT NULL DEFAULT 0,
    accepted_moves INT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL,
    score INT NULL,
    version INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_exercise_sessions_public_id UNIQUE (public_id),
    CONSTRAINT fk_exercise_sessions_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT fk_exercise_sessions_lesson FOREIGN KEY (lesson_id)
        REFERENCES exercise_lessons (id) ON DELETE CASCADE,
    CONSTRAINT fk_exercise_sessions_position FOREIGN KEY (position_id)
        REFERENCES exercise_positions (id) ON DELETE CASCADE,
    CONSTRAINT chk_exercise_sessions_score CHECK (score IS NULL OR score BETWEEN 0 AND 100)
);

CREATE INDEX idx_exercise_sessions_user ON exercise_sessions (user_id, created_at);
