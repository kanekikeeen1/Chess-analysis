-- M0: mỗi nước đi một dòng, thay cho việc chỉ nhét tất cả vào analysis_json.
-- Cho phép truy vấn kiểu "tất cả nước sai của tôi trong tàn cuộc xe" và là
-- nguồn dữ liệu huấn luyện cho M1 (phân loại) và M3 (hồ sơ điểm yếu).
CREATE TABLE analyzed_moves (
    id BIGINT NOT NULL AUTO_INCREMENT,
    game_id BIGINT NOT NULL,
    user_id BIGINT NULL,

    -- Vị trí trong ván
    ply INT NOT NULL,
    move_number INT NOT NULL,
    side_to_move CHAR(1) NOT NULL,
    phase VARCHAR(12) NOT NULL,

    -- Nước đi
    san VARCHAR(32) NOT NULL,
    uci VARCHAR(6) NOT NULL,
    before_fen VARCHAR(180) NOT NULL,
    after_fen VARCHAR(180) NOT NULL,

    -- Đặc trưng engine
    engine_depth INT NULL,
    eval_before_cp INT NULL,
    eval_after_cp INT NULL,
    mate_before INT NULL,
    mate_after INT NULL,
    best_move_uci VARCHAR(6) NULL,
    second_best_uci VARCHAR(6) NULL,
    pv_gap_cp INT NULL,
    centipawn_loss INT NULL,
    win_percent_loss DOUBLE NULL,
    accuracy DOUBLE NULL,
    is_best BOOLEAN NOT NULL DEFAULT FALSE,

    -- Đặc trưng bàn cờ
    is_capture BOOLEAN NOT NULL DEFAULT FALSE,
    is_check BOOLEAN NOT NULL DEFAULT FALSE,
    is_checkmate BOOLEAN NOT NULL DEFAULT FALSE,
    is_promotion BOOLEAN NOT NULL DEFAULT FALSE,
    is_castle BOOLEAN NOT NULL DEFAULT FALSE,
    is_theory BOOLEAN NOT NULL DEFAULT FALSE,
    theory_name VARCHAR(250) NULL,
    legal_move_count INT NULL,
    sacrifice_value DOUBLE NULL,
    sacrifice_kind VARCHAR(12) NULL,
    material_balance INT NULL,
    piece_count INT NULL,

    -- Nhãn
    rule_label VARCHAR(16) NOT NULL,
    ml_label VARCHAR(16) NULL,
    ml_confidence DOUBLE NULL,
    error_theme VARCHAR(48) NULL,

    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_analyzed_moves_game_ply UNIQUE (game_id, ply),
    CONSTRAINT fk_analyzed_moves_game FOREIGN KEY (game_id)
        REFERENCES analyzed_games (id) ON DELETE CASCADE,
    CONSTRAINT fk_analyzed_moves_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE SET NULL
);

CREATE INDEX idx_analyzed_moves_user_label ON analyzed_moves (user_id, rule_label);
CREATE INDEX idx_analyzed_moves_user_phase ON analyzed_moves (user_id, phase, rule_label);
CREATE INDEX idx_analyzed_moves_user_theme ON analyzed_moves (user_id, error_theme);
CREATE INDEX idx_analyzed_moves_game ON analyzed_moves (game_id, ply);
