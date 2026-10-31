-- Rating luyện puzzle của người học theo Glicko-2, và lịch sử từng lượt giải.
--
-- Chỉ rating của người học được cập nhật. Rating của puzzle giữ nguyên giá trị từ
-- Lichess: mỗi puzzle đã được hàng trăm tới hàng chục nghìn người chơi và có RD ≤ 90,
-- nên vài người dùng của đồ án chỉ làm nó nhiễu thêm chứ không chính xác hơn.
CREATE TABLE user_puzzle_ratings (
    user_id BIGINT NOT NULL,
    rating DOUBLE NOT NULL,
    deviation DOUBLE NOT NULL,
    volatility DOUBLE NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    solved INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_puzzle_ratings_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE CASCADE
);

-- Mỗi lượt giải một dòng: vừa để không đưa lại puzzle đã làm, vừa là dữ liệu cho
-- biểu đồ tiến bộ, ôn tập ngắt quãng (SRS) và phân tích điểm yếu theo theme.
CREATE TABLE puzzle_attempts (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    puzzle_id BIGINT NOT NULL,
    solved BOOLEAN NOT NULL,
    rating_before DOUBLE NOT NULL,
    rating_after DOUBLE NOT NULL,
    deviation_after DOUBLE NOT NULL,
    puzzle_rating INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_puzzle_attempts_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT fk_puzzle_attempts_puzzle FOREIGN KEY (puzzle_id)
        REFERENCES puzzles (id) ON DELETE CASCADE
);

CREATE INDEX idx_puzzle_attempts_user_created ON puzzle_attempts (user_id, created_at);
CREATE INDEX idx_puzzle_attempts_user_puzzle ON puzzle_attempts (user_id, puzzle_id);
