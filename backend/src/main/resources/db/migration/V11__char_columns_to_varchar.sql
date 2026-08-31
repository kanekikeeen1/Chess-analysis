-- Hibernate chạy `ddl-auto: validate` và ánh xạ mọi trường String sang VARCHAR.
-- Ba cột dưới đây khai báo CHAR nên schema-validation thất bại ngay lúc khởi
-- động, kèm thông báo dạng:
--
--   wrong column type encountered in column [side_to_move] in table
--   [analyzed_moves]; found [char], but expecting [varchar(1)]
--
-- Đây đúng là lỗi đã gặp ở V2 với `user_sessions.token_hash`, và cách xử lý
-- cũng giống: đổi cột sang VARCHAR thay vì thêm columnDefinition vào entity.
-- Lý do chọn hướng này là entity giữ được ánh xạ mặc định, không phải mang theo
-- kiểu cột riêng của MySQL, nên đổi hệ quản trị sau này không phải sửa Java.
--
-- Về lưu trữ, khác biệt là không đáng kể: MySQL đệm CHAR bằng khoảng trắng còn
-- VARCHAR thêm một byte độ dài. Với ba cột này thì cả hai đều không ảnh hưởng.

ALTER TABLE analyzed_moves
    MODIFY COLUMN side_to_move VARCHAR(1) NOT NULL;

ALTER TABLE position_evaluations
    MODIFY COLUMN fen_key VARCHAR(64) NOT NULL;

ALTER TABLE analysis_jobs
    MODIFY COLUMN public_id VARCHAR(36) NOT NULL;
