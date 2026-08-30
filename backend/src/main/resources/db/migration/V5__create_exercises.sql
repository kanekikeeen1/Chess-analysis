CREATE TABLE exercise_lessons (
    id BIGINT NOT NULL AUTO_INCREMENT,
    slug VARCHAR(100) NOT NULL,
    category VARCHAR(16) NOT NULL,
    group_name VARCHAR(80) NOT NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL,
    starting_fen VARCHAR(180) NULL,
    solution_line VARCHAR(1000) NOT NULL,
    difficulty VARCHAR(32) NOT NULL,
    sort_order INT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    CONSTRAINT uq_exercise_lessons_slug UNIQUE (slug)
);

CREATE TABLE exercise_attempts (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    lesson_id BIGINT NOT NULL,
    score INT NOT NULL,
    completed BOOLEAN NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_exercise_attempts_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT fk_exercise_attempts_lesson FOREIGN KEY (lesson_id)
        REFERENCES exercise_lessons (id) ON DELETE CASCADE,
    CONSTRAINT chk_exercise_attempts_score CHECK (score BETWEEN 0 AND 100)
);

CREATE INDEX idx_exercise_lessons_category ON exercise_lessons (category, sort_order);
CREATE INDEX idx_exercise_attempts_user ON exercise_attempts (user_id, created_at);

INSERT INTO exercise_lessons
    (slug, category, group_name, title, description, starting_fen, solution_line, difficulty, sort_order, active)
VALUES
('italian-game', 'OPENING', 'Khai cuộc mở', 'Italian Game', 'Phát triển tượng tới c4, nhập thành sớm và gây sức ép lên f7.', NULL, '1. e4 e5 2. Nf3 Nc6 3. Bc4', 'Cơ bản', 1, TRUE),
('ruy-lopez', 'OPENING', 'Khai cuộc mở', 'Ruy Lopez', 'Ghim mã c6 và tạo áp lực dài hạn lên tốt e5.', NULL, '1. e4 e5 2. Nf3 Nc6 3. Bb5', 'Cơ bản', 2, TRUE),
('scotch-game', 'OPENING', 'Khai cuộc mở', 'Scotch Game', 'Mở trung tâm sớm bằng d4 và tận dụng phát triển nhanh.', NULL, '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4', 'Cơ bản', 3, TRUE),
('four-knights', 'OPENING', 'Khai cuộc mở', 'Four Knights Game', 'Phát triển đủ bốn mã với thế trận chắc chắn và linh hoạt.', NULL, '1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6', 'Cơ bản', 4, TRUE),
('vienna-game', 'OPENING', 'Khai cuộc mở', 'Vienna Game', 'Phát triển Nc3 trước Nf3 để giữ lựa chọn f4.', NULL, '1. e4 e5 2. Nc3 Nf6 3. f4', 'Trung bình', 5, TRUE),
('kings-gambit', 'OPENING', 'Khai cuộc mở', 'King''s Gambit', 'Thí tốt f để giành không gian, cột f và nhịp phát triển.', NULL, '1. e4 e5 2. f4 exf4 3. Nf3', 'Trung bình', 6, TRUE),
('danish-gambit', 'OPENING', 'Khai cuộc mở', 'Danish Gambit', 'Đổi tốt lấy hai đường chéo mạnh và ưu thế phát triển.', NULL, '1. e4 e5 2. d4 exd4 3. c3 dxc3 4. Bc4', 'Trung bình', 7, TRUE),
('petrov-defense', 'OPENING', 'Khai cuộc mở', 'Petrov Defense', 'Đen phản công trực tiếp tốt e4 thay vì chỉ phòng thủ e5.', NULL, '1. e4 e5 2. Nf3 Nf6', 'Trung bình', 8, TRUE),
('sicilian-defense', 'OPENING', 'Khai cuộc bán mở', 'Sicilian Defense', 'Đen tạo bất cân xứng ngay từ nước đầu bằng c5.', NULL, '1. e4 c5 2. Nf3 d6 3. d4 cxd4', 'Cơ bản', 9, TRUE),
('french-defense', 'OPENING', 'Khai cuộc bán mở', 'French Defense', 'Đen xây chuỗi tốt e6-d5 và phản công trung tâm.', NULL, '1. e4 e6 2. d4 d5', 'Cơ bản', 10, TRUE),
('caro-kann', 'OPENING', 'Khai cuộc bán mở', 'Caro-Kann Defense', 'Cấu trúc chắc chắn với c6-d5 và thường giữ được tượng ô trắng.', NULL, '1. e4 c6 2. d4 d5', 'Cơ bản', 11, TRUE),
('pirc-defense', 'OPENING', 'Khai cuộc bán mở', 'Pirc Defense', 'Cho trắng chiếm trung tâm rồi phản kích bằng g6, Bg7 và e5/c5.', NULL, '1. e4 d6 2. d4 Nf6 3. Nc3 g6', 'Trung bình', 12, TRUE),
('modern-defense', 'OPENING', 'Khai cuộc bán mở', 'Modern Defense', 'Fianchetto tượng vua và trì hoãn phát triển mã g8.', NULL, '1. e4 g6 2. d4 Bg7', 'Trung bình', 13, TRUE),
('scandinavian-defense', 'OPENING', 'Khai cuộc bán mở', 'Scandinavian Defense', 'Thách thức e4 ngay lập tức bằng d5.', NULL, '1. e4 d5 2. exd5 Qxd5 3. Nc3', 'Cơ bản', 14, TRUE),
('alekhine-defense', 'OPENING', 'Khai cuộc bán mở', 'Alekhine Defense', 'Khiêu khích tốt trắng tiến lên để trở thành mục tiêu phản công.', NULL, '1. e4 Nf6 2. e5 Nd5 3. d4 d6', 'Nâng cao', 15, TRUE),
('owen-defense', 'OPENING', 'Khai cuộc bán mở', 'Owen''s Defense', 'Fianchetto tượng hậu để gây sức ép lên e4.', NULL, '1. e4 b6 2. d4 Bb7', 'Nâng cao', 16, TRUE),
('queens-gambit', 'OPENING', 'Khai cuộc kín', 'Queen''s Gambit', 'Dùng c4 gây sức ép lên trung tâm d5.', NULL, '1. d4 d5 2. c4', 'Cơ bản', 17, TRUE),
('london-system', 'OPENING', 'Khai cuộc kín', 'London System', 'Thiết lập cấu trúc d4-Nf3-Bf4-e3 chắc chắn.', NULL, '1. d4 d5 2. Nf3 Nf6 3. Bf4', 'Cơ bản', 18, TRUE),
('slav-defense', 'OPENING', 'Khai cuộc kín', 'Slav Defense', 'Bảo vệ d5 bằng c6 mà không khóa tượng c8.', NULL, '1. d4 d5 2. c4 c6', 'Cơ bản', 19, TRUE),
('kings-indian-defense', 'OPENING', 'Khai cuộc kín', 'King''s Indian Defense', 'Đen nhường trung tâm, nhập thành rồi tấn công bằng e5 hoặc c5.', NULL, '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6', 'Trung bình', 20, TRUE),
('nimzo-indian', 'OPENING', 'Khai cuộc kín', 'Nimzo-Indian Defense', 'Ghim mã c3 để kiểm soát e4 và tạo áp lực cấu trúc.', NULL, '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4', 'Trung bình', 21, TRUE),
('queens-indian', 'OPENING', 'Khai cuộc kín', 'Queen''s Indian Defense', 'Kiểm soát e4 bằng b6, Bb7 khi trắng tránh Nc3.', NULL, '1. d4 Nf6 2. c4 e6 3. Nf3 b6', 'Trung bình', 22, TRUE),
('dutch-defense', 'OPENING', 'Khai cuộc kín', 'Dutch Defense', 'Đen dùng f5 để tranh ô e4 và tạo tấn công cánh vua.', NULL, '1. d4 f5', 'Nâng cao', 23, TRUE),
('grunfeld-defense', 'OPENING', 'Khai cuộc kín', 'Grünfeld Defense', 'Cho trắng dựng trung tâm lớn rồi công kích bằng d5 và Bg7.', NULL, '1. d4 Nf6 2. c4 g6 3. Nc3 d5', 'Nâng cao', 24, TRUE),
('catalan-opening', 'OPENING', 'Khai cuộc kín', 'Catalan Opening', 'Kết hợp Queen''s Gambit với fianchetto tượng g2.', NULL, '1. d4 Nf6 2. c4 e6 3. g3', 'Nâng cao', 25, TRUE),
('english-opening', 'OPENING', 'Khai cuộc cánh', 'English Opening', 'Kiểm soát d5 từ c4 và giữ cấu trúc linh hoạt.', NULL, '1. c4', 'Cơ bản', 26, TRUE),
('reti-opening', 'OPENING', 'Khai cuộc cánh', 'Réti Opening', 'Kiểm soát trung tâm từ xa bằng Nf3 và c4/g3.', NULL, '1. Nf3 d5 2. c4', 'Trung bình', 27, TRUE),
('bird-opening', 'OPENING', 'Khai cuộc cánh', 'Bird Opening', 'Dùng f4 để chiếm e5 và chuẩn bị tấn công cánh vua.', NULL, '1. f4', 'Trung bình', 28, TRUE),
('nimzo-larsen', 'OPENING', 'Khai cuộc cánh', 'Nimzo-Larsen Attack', 'Fianchetto tượng hậu để gây áp lực dài hạn lên trung tâm.', NULL, '1. b3 d5 2. Bb2', 'Nâng cao', 29, TRUE),
('polish-opening', 'OPENING', 'Khai cuộc cánh', 'Polish Opening', 'Mở rộng cánh hậu bằng b4 và kiểm soát c5.', NULL, '1. b4', 'Nâng cao', 30, TRUE),
('mate-king-rook', 'ENDGAME', 'Chiếu hết cơ bản', 'Vua và xe đấu vua', 'Dùng vua cắt đường thoát rồi thu hẹp dần chiếc hộp của vua đối phương.', '7k/8/8/8/8/4K3/8/6R1 w - - 0 1', 'Cắt vua bằng xe → đưa vua tới đối diện → chiếu hết ở hàng biên', 'Cơ bản', 101, TRUE),
('mate-king-queen', 'ENDGAME', 'Chiếu hết cơ bản', 'Vua và hậu đấu vua', 'Dùng hậu tạo chiếc hộp, tránh stalemate và đưa vua tới hỗ trợ.', '7k/8/8/8/8/4K3/8/6Q1 w - - 0 1', 'Thu hẹp chiếc hộp bằng hậu → đưa vua tới → chiếu hết có hậu bảo vệ', 'Cơ bản', 102, TRUE),
('king-pawn-promotion', 'ENDGAME', 'Phong cấp', 'Vua và tốt thông', 'Chiếm ô đối diện và đưa vua lên trước tốt để bảo đảm phong hậu.', '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1', '1. Kd3 Kf4 2. Kd4 Kf3 3. e5', 'Cơ bản', 103, TRUE),
('mate-two-bishops', 'ENDGAME', 'Chiếu hết nâng cao', 'Vua và song tượng đấu vua', 'Hai tượng khống chế hai màu ô; vua đẩy đối thủ về một góc.', '7k/8/8/8/8/4K3/8/2B2B2 w - - 0 1', 'Thu hẹp vùng bằng hai đường chéo → đưa vua tới → tạo lưới chiếu hết', 'Trung bình', 104, TRUE),
('mate-bishop-knight', 'ENDGAME', 'Chiếu hết nâng cao', 'Vua, tượng và mã đấu vua', 'Ép vua vào góc cùng màu với tượng bằng kỹ thuật chữ W.', '7k/8/8/8/8/4K3/8/2B2N2 w - - 0 1', 'Ép về biên → đẩy sang góc đúng màu → hoàn tất lưới tượng mã', 'Nâng cao', 105, TRUE),
('queen-versus-rook', 'ENDGAME', 'Chuyển hóa lợi thế', 'Hậu đấu xe', 'Phối hợp vua và hậu để tạo nĩa, ghim hoặc zugzwang bắt xe.', '6rk/8/8/8/8/4K3/8/6Q1 w - - 0 1', 'Đưa vua tới gần → tạo chiếu kép/nĩa → đổi hậu lấy xe khi cần', 'Nâng cao', 106, TRUE),
('lucena-position', 'ENDGAME', 'Xe và tốt', 'Thế Lucena', 'Dựng cầu bằng xe để che các nước chiếu và phong tốt.', '1K6/1P3k2/8/8/8/8/r7/4R3 w - - 0 1', 'Đẩy vua khỏi cột phong cấp → xe dựng cầu ở hàng bốn → che chiếu', 'Nâng cao', 107, TRUE),
('philidor-position', 'ENDGAME', 'Xe và tốt', 'Phòng thủ Philidor', 'Giữ xe ở hàng sáu rồi chuyển xuống hàng sau để chiếu ngang.', '8/8/4k3/R2p4/3K4/8/8/5r2 b - - 0 1', 'Giữ hàng sáu → chờ tốt tiến → chiếu từ phía sau', 'Nâng cao', 108, TRUE),
('rook-pawn-bishop', 'ENDGAME', 'Tượng và tốt', 'Tượng sai màu và tốt biên', 'Nhận diện pháo đài hòa khi tượng không kiểm soát ô phong cấp.', '7k/7P/6K1/8/8/8/8/2B5 w - - 0 1', 'Không thể đuổi vua khỏi h8: hiểu điều kiện hòa thay vì cố thắng', 'Trung bình', 109, TRUE),
('opposition-kings', 'ENDGAME', 'Vua và tốt', 'Đối vua trực diện', 'Giành quyền đối vua để xâm nhập hoặc ngăn vua đối thủ tiến lên.', '8/8/8/4k3/8/4K3/8/8 w - - 0 1', 'Đi tam giác hoặc giữ khoảng cách lẻ để buộc đối thủ nhường đường', 'Cơ bản', 110, TRUE);
