-- 1. Sửa side_to_move / move_number của analyzed_moves: trước đây hai cột này được suy
--    ra từ thứ tự nước với giả định Trắng luôn đi trước, nên sai với ván bắt đầu từ
--    một FEN Đen đi trước. Giá trị đúng nằm sẵn trong before_fen (trường 2 và 6).
UPDATE analyzed_moves
SET side_to_move = SUBSTRING_INDEX(SUBSTRING_INDEX(before_fen, ' ', 2), ' ', -1),
    move_number = CAST(SUBSTRING_INDEX(before_fen, ' ', -1) AS UNSIGNED)
WHERE before_fen LIKE '% % % % % %';

-- 2. "Học từ sai lầm": mỗi lần người học thử lại một nước mistake/blunder của chính
--    mình một dòng. Dùng để ưu tiên các sai lầm chưa sửa được, và là đầu vào cho lịch
--    ôn tập ngắt quãng (SRS) ở bước sau.
CREATE TABLE mistake_reviews (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    analyzed_move_id BIGINT NOT NULL,
    correct BOOLEAN NOT NULL,
    answered_uci VARCHAR(5) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_mistake_reviews_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT fk_mistake_reviews_move FOREIGN KEY (analyzed_move_id)
        REFERENCES analyzed_moves (id) ON DELETE CASCADE
);

CREATE INDEX idx_mistake_reviews_move ON mistake_reviews (analyzed_move_id, created_at);
CREATE INDEX idx_mistake_reviews_user ON mistake_reviews (user_id, created_at);
