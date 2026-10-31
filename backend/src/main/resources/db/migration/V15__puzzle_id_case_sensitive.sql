-- Mã puzzle của Lichess phân biệt hoa thường ("0000D" và "0000d" là hai puzzle khác
-- nhau), nhưng V14 để lichess_id theo collation mặc định utf8mb4_0900_ai_ci, vốn
-- không phân biệt hoa thường. Lần import đầu vì vậy coi 16 cặp mã là trùng: puzzle
-- sau ghi đè puzzle trước, và theme của hai puzzle bị gộp vào cùng một dòng.
--
-- Dữ liệu puzzle chỉ là bản sao của file Lichess và chưa bảng nào tham chiếu tới, nên
-- cách sửa sạch nhất là xóa rồi import lại (lệnh import chạy lại được bất kỳ lúc nào).
DELETE FROM puzzle_themes;
DELETE FROM puzzles;

ALTER TABLE puzzles
    MODIFY COLUMN lichess_id VARCHAR(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
