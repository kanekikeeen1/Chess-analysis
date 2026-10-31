-- C5: Elo ước lượng bằng M2 cho bên người dùng đã cầm trong ván.
-- elo_log_likelihood_json giữ đường log-likelihood trên lưới Elo của riêng ván này (mảng JSON số thực):
-- hồ sơ user_playing_profiles cộng các đường đó lại rồi mới lấy hậu nghiệm, nên xóa ván thì hồ sơ
-- tính lại đúng mà không phải chạy lại mô hình.
ALTER TABLE analyzed_games
    ADD COLUMN user_side VARCHAR(1) NULL,
    ADD COLUMN estimated_elo DOUBLE NULL,
    ADD COLUMN elo_std_error DOUBLE NULL,
    ADD COLUMN elo_moves INT NULL,
    ADD COLUMN elo_model_step INT NULL,
    ADD COLUMN elo_log_likelihood_json TEXT NULL;
