-- Ngân hàng puzzle chiến thuật, nhập từ Lichess Puzzle Database (CC0).
--
-- Dữ liệu gốc của Lichess cho FEN *trước* nước của đối thủ, và cột Moves bắt đầu
-- bằng chính nước đó. Khi import, server đi nước dàn dựng này bằng chesslib và lưu
-- sẵn vị trí người giải bắt đầu (start_fen), để mọi chỗ khác không phải lặp lại.
CREATE TABLE puzzles (
    id BIGINT NOT NULL AUTO_INCREMENT,
    lichess_id VARCHAR(8) NOT NULL,

    source_fen VARCHAR(100) NOT NULL,
    setup_move VARCHAR(5) NOT NULL,
    start_fen VARCHAR(100) NOT NULL,
    -- Lời giải dạng UCI cách nhau bởi dấu cách, bắt đầu bằng nước của người giải,
    -- xen kẽ với nước đáp của đối thủ.
    solution VARCHAR(255) NOT NULL,
    -- Số nước người giải phải tự đi (không tính nước đáp).
    solution_length INT NOT NULL,

    rating INT NOT NULL,
    rating_deviation INT NOT NULL,
    popularity INT NOT NULL,
    nb_plays INT NOT NULL,
    themes VARCHAR(300) NOT NULL,
    opening_tags VARCHAR(255) NULL,
    game_url VARCHAR(120) NULL,

    imported_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_puzzles_lichess_id UNIQUE (lichess_id)
);

CREATE INDEX idx_puzzles_rating ON puzzles (rating);

-- Một dòng cho mỗi (puzzle, theme) để lọc puzzle theo chủ đề bằng index, thay vì
-- LIKE trên cột themes. Cũng là đầu vào cho phần gán theme lỗi và luyện tập thích nghi.
CREATE TABLE puzzle_themes (
    puzzle_id BIGINT NOT NULL,
    theme VARCHAR(48) NOT NULL,
    PRIMARY KEY (puzzle_id, theme),
    CONSTRAINT fk_puzzle_themes_puzzle FOREIGN KEY (puzzle_id)
        REFERENCES puzzles (id) ON DELETE CASCADE
);

CREATE INDEX idx_puzzle_themes_theme ON puzzle_themes (theme, puzzle_id);
