-- Thẻ ôn tập ngắt quãng (SM-2). Mỗi thẻ là một puzzle đã giải sai, hoặc một nước sai
-- trong ván của người học (analyzed_moves) đã trả lời sai ở "Học từ sai lầm".
-- item_id trỏ tới puzzles.id hoặc analyzed_moves.id tùy kind, nên không đặt khóa ngoại
-- cho cột này; thẻ mồ côi (item đã bị xóa) bị bỏ qua khi lấy danh sách đến hạn.
CREATE TABLE review_cards (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    kind VARCHAR(16) NOT NULL,
    item_id BIGINT NOT NULL,
    ease DOUBLE NOT NULL,
    repetitions INT NOT NULL,
    interval_days INT NOT NULL,
    lapses INT NOT NULL DEFAULT 0,
    reviews INT NOT NULL DEFAULT 0,
    due_at TIMESTAMP(6) NOT NULL,
    last_reviewed_at TIMESTAMP(6) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_review_cards_item UNIQUE (user_id, kind, item_id),
    CONSTRAINT fk_review_cards_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE CASCADE
);

CREATE INDEX idx_review_cards_due ON review_cards (user_id, due_at);
