-- Sửa dữ liệu bài tàn cuộc gốc trong V5/V7. Mọi FEN dưới đây đã được kiểm tra bằng
-- FenRules (xem EndgameSeedDataTest).
--
-- 1. Năm FEN bất hợp lệ: bên không đến lượt đi đang bị chiếu. Stockfish không định
--    nghĩa hành vi cho vị trí như vậy, và từ khi có FenRules backend trả 400 ngay
--    khi người học đi nước đầu tiên.
--      8/5kr1/8/8/8/3K4/8/5Q2 w     hậu f1 chiếu vua f7 qua cột f
--      2K5/2P2k2/8/8/8/8/1r6/5R2 w  xe f1 chiếu vua f7 qua cột f
--      7k/6P1/6K1/8/8/8/8/2B5 w     tốt g7 chiếu vua h8
UPDATE exercise_positions SET starting_fen = '8/5kr1/8/8/8/3K4/8/4Q3 w - - 0 1'
WHERE starting_fen = '8/5kr1/8/8/8/3K4/8/5Q2 w - - 0 1';

UPDATE exercise_positions SET starting_fen = '2K5/2P2k2/8/8/8/8/1r6/4R3 w - - 0 1'
WHERE starting_fen = '2K5/2P2k2/8/8/8/8/1r6/5R2 w - - 0 1';

--    Hai thế cùng lỗi trong bài song tượng và tượng + mã: tượng d1 chiếu vua h5 qua
--    đường chéo d1–h5. Thế song tượng còn sai thêm một chỗ: d1 và f1 cùng là ô trắng,
--    mà hai tượng cùng màu thì không thể ép chiếu hết. Đặt tượng ô đen ở c1 như hai
--    thế còn lại của mỗi bài.
UPDATE exercise_positions SET starting_fen = '8/8/8/7k/8/4K3/8/2B2B2 w - - 0 1'
WHERE starting_fen = '8/8/8/7k/8/4K3/8/3B1B2 w - - 0 1';

UPDATE exercise_positions SET starting_fen = '8/8/8/7k/8/4K3/8/2B2N2 w - - 0 1'
WHERE starting_fen = '8/8/8/7k/8/4K3/8/3B1N2 w - - 0 1';

-- 2. Bài "Tượng sai màu và tốt biên" (mục tiêu DRAW) thực ra đặt tượng ĐÚNG màu ô
--    phong cấp và cho Trắng đi trước, nên Trắng có chiếu hết một nước (Bb2#, Bg2#).
--    Thay bằng pháo đài thật: tượng không kiểm soát ô phong cấp, người học cầm Đen
--    (bên phòng thủ) và phải giữ vua trong góc để cầm hòa.
UPDATE exercise_positions SET starting_fen = '7k/8/6KP/8/8/8/8/5B2 b - - 0 1'
WHERE starting_fen = '7k/7P/6K1/8/8/8/8/2B5 w - - 0 1';

UPDATE exercise_positions SET starting_fen = 'k7/8/PK6/8/8/8/8/2B5 b - - 0 1'
WHERE starting_fen = 'k7/P7/1K6/8/8/8/8/5B2 w - - 0 1';

UPDATE exercise_positions SET starting_fen = '7k/8/7P/6K1/8/8/8/5B2 b - - 0 1', goal_type = 'DRAW'
WHERE starting_fen = '7k/6P1/6K1/8/8/8/8/2B5 w - - 0 1';

UPDATE exercise_lessons
SET starting_fen = '7k/8/6KP/8/8/8/8/5B2 b - - 0 1',
    solution_line = 'Giữ vua ở góc phong cấp: tượng không kiểm soát ô đó nên Trắng không thể đuổi vua ra'
WHERE slug = 'rook-pawn-bishop';

-- 3. Bài "Phòng thủ Philidor" lại cho Đen — bên được giao nhiệm vụ cầm hòa — có tốt
--    và thừa vật chất, tức là không phải cấu trúc Philidor. Thế Philidor đúng: Trắng
--    có xe + tốt ở hàng 5, Đen chỉ có xe; vua Đen đứng trước tốt, xe Đen giữ hàng 6.
UPDATE exercise_positions SET starting_fen = '4k3/8/r7/4P3/4K3/8/8/7R b - - 0 1'
WHERE starting_fen = '8/8/4k3/R2p4/3K4/8/8/5r2 b - - 0 1';

UPDATE exercise_positions SET starting_fen = '3k4/8/1r6/3P4/3K4/8/8/6R1 b - - 0 1'
WHERE starting_fen = '8/8/3k4/3p3R/3K4/8/8/4r3 b - - 0 1';

UPDATE exercise_positions SET starting_fen = '5k2/8/r7/5P2/5K2/8/8/1R6 b - - 0 1'
WHERE starting_fen = '8/8/5k2/5p1R/5K2/8/8/6r1 b - - 0 1';

UPDATE exercise_lessons SET starting_fen = '4k3/8/r7/4P3/4K3/8/8/7R b - - 0 1'
WHERE slug = 'philidor-position';
