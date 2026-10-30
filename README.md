# Chess Analysis — Full-stack

Ứng dụng phân tích cờ vua được chia rõ thành frontend và backend:

```text
chess-analysis/
├── frontend/   Next.js 16, React 19, Stockfish 18 WASM, chess.js và Tailwind CSS
└── backend/    Spring Boot 3, Java 17, Spring Security, JPA, Flyway và MySQL 8
```

## Các phân hệ đã có

- Trang chủ và thanh điều hướng responsive.
- Phân tích thủ công ở frontend depth 16; Game Review PGN/FEN chạy bất đồng bộ trên backend với hai chế độ thích nghi: Nhanh 10–14 và Sâu 16–20.
- Đăng ký/đăng nhập nội bộ, BCrypt, cookie HttpOnly và avatar theo tài khoản.
- Kho ván cờ được bảo vệ: lưu PGN/FEN, hai kỳ thủ, kết quả, khai cuộc, độ chính xác, depth và dữ liệu từng nước.
- Nút **Xem lại** mở thẳng báo cáo trong giao diện Game Analysis, có bàn cờ, icon nhãn, accuracy, lịch sử và điều khiển từng nước.
- Khi thử một nước khác trong ván đã phân tích, ứng dụng tạo **biến thử** riêng; ván gốc và toàn bộ báo cáo backend vẫn được giữ để chuyển qua lại.
- 30 bài khai cuộc có bàn cờ minh họa và điều khiển xem từng nước.
- 10 bài tàn cuộc có ba thế cờ ngẫu nhiên mỗi bài; backend Stockfish chấm từng nước, đặt icon nhãn trên bàn cờ, gợi ý nước tốt nhất và đánh trả.
- Lưu lần làm bài và điểm tốt nhất của từng tài khoản.

## Yêu cầu

- Node.js 22 trở lên
- Java JDK 17 (JDK 21 hoặc 24 cũng chạy được, nhưng Project language level nên để 17)
- Docker Desktop
- IntelliJ IDEA cho `backend`, VS Code cho `frontend`

## Khởi động trên Windows

### 1. MySQL

Mở Docker Desktop, đợi góc dưới trái hiện **Engine running**. Trong PowerShell tại `backend`:

```powershell
docker compose up -d mysql
docker compose ps
```

Container `mysql` phải có trạng thái `Up` hoặc `healthy`.

### 2. Spring Boot

Mở thư mục `backend` bằng IntelliJ, chọn Project SDK 17 rồi chạy:

```text
src/main/java/com/chessanalysis/auth/ChessAnalysisBackendApplication.java
```

Backend sẵn sàng khi log có `Started ChessAnalysisBackendApplication`, tại `http://localhost:8080`.

Flyway tự áp dụng các migration:

- `V1–V3`: tài khoản, phiên đăng nhập và avatar.
- `V4`: kho báo cáo `analyzed_games`.
- `V5`: bài học `exercise_lessons` và lịch sử `exercise_attempts`.
- `V6`: tác vụ Stockfish bất đồng bộ `analysis_jobs`.
- `V7`: ngân hàng thế cờ ngẫu nhiên `exercise_positions`.
- `V8–V11`: dữ liệu từng nước `analyzed_moves`, cache `position_evaluations`, hồ sơ kỹ năng.
- `V12`: sửa 10 thế tàn cuộc sai luật hoặc sai nội dung trong V5/V7.
- `V13`: phiên làm bài tàn cuộc `exercise_sessions` do server giữ trạng thái.

Nếu chạy Spring Boot trực tiếp trong IntelliJ, tải Stockfish cho Windows rồi thêm biến môi trường vào Run Configuration:

```text
STOCKFISH_PATH=D:\tools\stockfish\stockfish-windows-x86-64-avx2.exe
```

Nếu chạy `docker compose up --build`, image backend tự cài Stockfish nên không cần tải riêng.

Dockerfile tạo tên JAR ổn định là `app.jar`; khi vừa thay từ một bản cũ, nên build sạch một lần:

```powershell
docker compose build --no-cache backend
docker compose up
```

### 3. Frontend

Trong VS Code mở PowerShell tại `frontend`:

```powershell
npm install
npm run dev
```

Mở `http://localhost:3000`.

Nếu backend không chạy ở cổng 8080, sao chép `.env.example` thành `.env.local` và sửa:

```env
NEXT_PUBLIC_AUTH_API_URL=http://localhost:8080
```

## Kiểm tra dữ liệu trực tiếp trong Docker

```powershell
docker compose exec mysql mysql -uchess_user -pchess_password chess_analysis
```

```sql
SELECT id, username_display, avatar_preset, created_at FROM user_accounts;
SELECT id, user_id, title, opening_name, white_accuracy, black_accuracy FROM analyzed_games;
SELECT category, COUNT(*) FROM exercise_lessons GROUP BY category;
SELECT user_id, lesson_id, score, completed, created_at FROM exercise_attempts;
SELECT public_id, status, progress_percent, min_depth, max_depth FROM analysis_jobs ORDER BY id DESC;
SELECT lesson_id, starting_fen, goal_type FROM exercise_positions;
```

Mật khẩu chỉ được lưu dưới dạng BCrypt hash; database không chứa mật khẩu nguyên bản.

## Kiểm tra mã nguồn

Frontend:

```powershell
npm run build
npm run lint
npm test
```

Backend:

```powershell
.\mvnw.cmd test
```

Maven Wrapper tự tải Maven 3.9.11 ở lần chạy đầu, không cần cài Maven riêng.

Chi tiết endpoint nằm trong `backend/README.md`; sơ đồ luồng và mô hình dữ liệu nằm trong `docs/ARCHITECTURE.md`.
