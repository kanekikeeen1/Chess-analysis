CREATE TABLE analyzed_games (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(160) NOT NULL,
    white_player VARCHAR(100) NOT NULL,
    black_player VARCHAR(100) NOT NULL,
    game_result VARCHAR(12) NOT NULL,
    source_type VARCHAR(16) NOT NULL,
    pgn LONGTEXT NULL,
    initial_fen VARCHAR(180) NOT NULL,
    final_fen VARCHAR(180) NOT NULL,
    opening_eco VARCHAR(12) NULL,
    opening_name VARCHAR(255) NULL,
    white_accuracy DOUBLE NULL,
    black_accuracy DOUBLE NULL,
    engine_depth INT NULL,
    move_count INT NOT NULL,
    analysis_json LONGTEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_analyzed_games_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE CASCADE
);

CREATE INDEX idx_analyzed_games_user_created ON analyzed_games (user_id, created_at);
CREATE INDEX idx_analyzed_games_opening ON analyzed_games (opening_eco);
