CREATE TABLE exercise_positions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    lesson_id BIGINT NOT NULL,
    starting_fen VARCHAR(180) NOT NULL,
    goal_type VARCHAR(24) NOT NULL,
    sort_order INT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    CONSTRAINT fk_exercise_positions_lesson FOREIGN KEY (lesson_id)
        REFERENCES exercise_lessons (id) ON DELETE CASCADE
);

CREATE INDEX idx_exercise_positions_lesson ON exercise_positions (lesson_id, active, sort_order);

INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '7k/8/8/8/8/4K3/8/6R1 w - - 0 1', 'CHECKMATE', 1, TRUE FROM exercise_lessons WHERE slug = 'mate-king-rook';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/8/8/2K5/8/7k/R7 w - - 0 1', 'CHECKMATE', 2, TRUE FROM exercise_lessons WHERE slug = 'mate-king-rook';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/6k1/8/8/8/3K4/8/5R2 w - - 0 1', 'CHECKMATE', 3, TRUE FROM exercise_lessons WHERE slug = 'mate-king-rook';

INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '7k/8/8/8/8/4K3/8/6Q1 w - - 0 1', 'CHECKMATE', 1, TRUE FROM exercise_lessons WHERE slug = 'mate-king-queen';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/8/8/2K5/8/7k/Q7 w - - 0 1', 'CHECKMATE', 2, TRUE FROM exercise_lessons WHERE slug = 'mate-king-queen';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/5k2/8/8/8/3K4/8/6Q1 w - - 0 1', 'CHECKMATE', 3, TRUE FROM exercise_lessons WHERE slug = 'mate-king-queen';

INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1', 'PROMOTE', 1, TRUE FROM exercise_lessons WHERE slug = 'king-pawn-promotion';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/5k2/8/4P3/4K3/8/8 w - - 0 1', 'PROMOTE', 2, TRUE FROM exercise_lessons WHERE slug = 'king-pawn-promotion';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/8/2k5/8/2K5/3P4/8 w - - 0 1', 'PROMOTE', 3, TRUE FROM exercise_lessons WHERE slug = 'king-pawn-promotion';

INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '7k/8/8/8/8/4K3/8/2B2B2 w - - 0 1', 'CHECKMATE', 1, TRUE FROM exercise_lessons WHERE slug = 'mate-two-bishops';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/6k1/8/8/8/3K4/8/2B2B2 w - - 0 1', 'CHECKMATE', 2, TRUE FROM exercise_lessons WHERE slug = 'mate-two-bishops';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/8/7k/8/4K3/8/3B1B2 w - - 0 1', 'CHECKMATE', 3, TRUE FROM exercise_lessons WHERE slug = 'mate-two-bishops';

INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '7k/8/8/8/8/4K3/8/2B2N2 w - - 0 1', 'CHECKMATE', 1, TRUE FROM exercise_lessons WHERE slug = 'mate-bishop-knight';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/6k1/8/8/8/3K4/8/2B2N2 w - - 0 1', 'CHECKMATE', 2, TRUE FROM exercise_lessons WHERE slug = 'mate-bishop-knight';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/8/7k/8/4K3/8/3B1N2 w - - 0 1', 'CHECKMATE', 3, TRUE FROM exercise_lessons WHERE slug = 'mate-bishop-knight';

INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '6rk/8/8/8/8/4K3/8/6Q1 w - - 0 1', 'WIN_ROOK', 1, TRUE FROM exercise_lessons WHERE slug = 'queen-versus-rook';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/5kr1/8/8/8/3K4/8/5Q2 w - - 0 1', 'WIN_ROOK', 2, TRUE FROM exercise_lessons WHERE slug = 'queen-versus-rook';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/7k/6r1/8/3K4/8/4Q3 w - - 0 1', 'WIN_ROOK', 3, TRUE FROM exercise_lessons WHERE slug = 'queen-versus-rook';

INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '1K6/1P3k2/8/8/8/8/r7/4R3 w - - 0 1', 'PROMOTE', 1, TRUE FROM exercise_lessons WHERE slug = 'lucena-position';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '2K5/2P2k2/8/8/8/8/1r6/5R2 w - - 0 1', 'PROMOTE', 2, TRUE FROM exercise_lessons WHERE slug = 'lucena-position';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '5K2/5P1k/8/8/8/8/3r4/6R1 w - - 0 1', 'PROMOTE', 3, TRUE FROM exercise_lessons WHERE slug = 'lucena-position';

INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/4k3/R2p4/3K4/8/8/5r2 b - - 0 1', 'DRAW', 1, TRUE FROM exercise_lessons WHERE slug = 'philidor-position';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/3k4/3p3R/3K4/8/8/4r3 b - - 0 1', 'DRAW', 2, TRUE FROM exercise_lessons WHERE slug = 'philidor-position';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/5k2/5p1R/5K2/8/8/6r1 b - - 0 1', 'DRAW', 3, TRUE FROM exercise_lessons WHERE slug = 'philidor-position';

INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '7k/7P/6K1/8/8/8/8/2B5 w - - 0 1', 'DRAW', 1, TRUE FROM exercise_lessons WHERE slug = 'rook-pawn-bishop';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, 'k7/P7/1K6/8/8/8/8/5B2 w - - 0 1', 'DRAW', 2, TRUE FROM exercise_lessons WHERE slug = 'rook-pawn-bishop';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '7k/6P1/6K1/8/8/8/8/2B5 w - - 0 1', 'PROMOTE', 3, TRUE FROM exercise_lessons WHERE slug = 'rook-pawn-bishop';

INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/4k3/4p3/8/4K3/4P3/8 w - - 0 1', 'PROMOTE', 1, TRUE FROM exercise_lessons WHERE slug = 'opposition-kings';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/3k4/3p4/8/3P4/3K4/8/8 w - - 0 1', 'PROMOTE', 2, TRUE FROM exercise_lessons WHERE slug = 'opposition-kings';
INSERT INTO exercise_positions (lesson_id, starting_fen, goal_type, sort_order, active)
SELECT id, '8/8/5k2/5p2/8/5K2/5P2/8 w - - 0 1', 'PROMOTE', 3, TRUE FROM exercise_lessons WHERE slug = 'opposition-kings';
