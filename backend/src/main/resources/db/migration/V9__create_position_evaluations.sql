-- M0: cache đánh giá vị trí theo (FEN chuẩn hóa, depth).
-- Vừa bỏ được việc chạy lại Stockfish cho thế khai cuộc đã gặp hàng nghìn lần,
-- vừa tự tích lũy thành tập huấn luyện có nhãn cho M1.
CREATE TABLE position_evaluations (
    id BIGINT NOT NULL AUTO_INCREMENT,

    -- SHA-256 của FEN đã chuẩn hóa; dùng làm khóa để tránh index trên chuỗi dài.
    fen_key CHAR(64) NOT NULL,
    normalized_fen VARCHAR(180) NOT NULL,
    depth INT NOT NULL,
    multi_pv INT NOT NULL DEFAULT 2,

    score_cp INT NULL,
    mate INT NULL,
    best_move_uci VARCHAR(6) NULL,
    second_best_uci VARCHAR(6) NULL,
    pv_gap_cp INT NULL,

    -- Toàn bộ PositionEvaluationResponse đã serialize, để trả nguyên vẹn khi hit.
    payload_json MEDIUMTEXT NOT NULL,

    engine_name VARCHAR(64) NULL,
    hit_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL,
    last_used_at TIMESTAMP(6) NOT NULL,

    PRIMARY KEY (id),
    CONSTRAINT uq_position_evaluations_key UNIQUE (fen_key, depth)
);

CREATE INDEX idx_position_evaluations_last_used ON position_evaluations (last_used_at);
CREATE INDEX idx_position_evaluations_depth ON position_evaluations (depth, created_at);
