# Chess Analysis Backend

Backend nghiệp vụ của đồ án Chess Analysis, dùng Spring Boot 3, Java 17, MySQL, JPA và Flyway.

## Chức năng

- Đăng ký bằng tên đăng nhập, mật khẩu và xác nhận mật khẩu.
- Mật khẩu tối thiểu 8 ký tự, tối đa 72 ký tự.
- Mật khẩu được băm bằng BCrypt (cost 12), không lưu mật khẩu nguyên bản.
- Đăng nhập tạo token ngẫu nhiên; database chỉ lưu SHA-256 của token.
- Trình duyệt nhận cookie `HttpOnly`, JavaScript không đọc được token.
- Đăng xuất xóa phiên trong database.
- Avatar mặc định, avatar chủ đề cờ vua hoặc ảnh PNG/JPG/WEBP tải lên tối đa 2 MB.
- Ảnh tải lên được lưu trong bảng `user_avatar_images` và gắn với tài khoản.
- Lưu báo cáo phân tích theo đúng chủ tài khoản; chống đọc/xóa chéo bằng `user_id` lấy từ phiên.
- Chạy Game Review toàn ván bằng Stockfish native trên backend, chọn Nhanh depth 10–14 hoặc Sâu depth 16–20 và lưu tiến độ trong MySQL.
- Cung cấp danh mục bài tập, thế tàn cuộc ngẫu nhiên, API chấm nước đi Stockfish và lưu tiến trình.
- Flyway quản lý toàn bộ cấu trúc và dữ liệu bài học mẫu.

## Chạy nhanh bằng Docker

Yêu cầu Docker Desktop. Tại thư mục dự án chạy:

```bash
docker compose up --build
```

Backend chạy tại `http://localhost:8080`, MySQL tại cổng `3306`.
Image backend tự cài Stockfish tại `/usr/games/stockfish`.

Nếu chạy backend trực tiếp bằng IntelliJ thay vì Docker, cài Stockfish cho Windows và đặt `STOCKFISH_PATH` trong Run Configuration trỏ tới file `.exe`.

## API phân tích Stockfish

| Phương thức | Endpoint | Nghiệp vụ |
| --- | --- | --- |
| `POST` | `/api/analysis/jobs` | Tạo tác vụ Game Review PGN/FEN |
| `GET` | `/api/analysis/jobs/{publicId}` | Đọc tiến độ và kết quả từng phần |
| `POST` | `/api/analysis/evaluate-move` | Chấm một nước bài tập, xử lý cả chiếu hết và trả nước tốt nhất/PV |

Backend phân tích đủ mọi vị trí. Chế độ Nhanh dùng depth 10 cho khai cuộc, 12–13 cho trung cuộc và 14 cho FEN/tàn cuộc; chế độ Sâu tương ứng là 16, 18–19 và 20. Mỗi vị trí hoàn tất sẽ cập nhật `progress_percent` và `result_json`; trình duyệt chỉ cần thăm dò endpoint tiến độ.

Vị trí cuối đã chiếu hết được backend kết thúc trực tiếp ở ±100 thay vì tiếp tục chờ một PV không tồn tại từ `bestmove (none)`. Vì vậy PGN có dấu `#` vẫn hoàn tất job và trả nhãn `Best` đúng cách.

## API tài khoản

### Đăng ký

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "chessplayer",
  "password": "12345678",
  "confirmPassword": "12345678"
}
```

Đăng ký thành công không tự đăng nhập; giao diện cần chuyển về trang đăng nhập.

### Đăng nhập

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "chessplayer",
  "password": "12345678"
}
```

### Kiểm tra người dùng hiện tại

```http
GET /api/auth/me
```

### Đăng xuất

```http
POST /api/auth/logout
```

### Chọn avatar có sẵn

```http
PUT /api/auth/avatar/preset
Content-Type: application/json

{
  "preset": "knight-blue"
}
```

Các mã hợp lệ: `default`, `knight-blue`, `queen-purple`, `rook-red`, `bishop-gold`, `pawn-green`.

### Tải avatar từ máy tính

```http
POST /api/auth/avatar/upload
Content-Type: multipart/form-data
```

Form field có tên `file`. Đọc ảnh hiện tại bằng `GET /api/auth/avatar/image`.

Frontend phải gửi request với `credentials: "include"`.

## API kho ván cờ

Tất cả endpoint dưới đây yêu cầu cookie đăng nhập hợp lệ.

| Phương thức | Endpoint | Nghiệp vụ |
| --- | --- | --- |
| `POST` | `/api/games` | Lưu một báo cáo Game Review |
| `GET` | `/api/games` | Liệt kê ván của tài khoản hiện tại |
| `GET` | `/api/games/{id}` | Đọc báo cáo chi tiết nếu là chủ sở hữu |
| `DELETE` | `/api/games/{id}` | Xóa báo cáo nếu là chủ sở hữu |

Ví dụ phần thân khi lưu:

```json
{
  "title": "An vs Bình",
  "whitePlayer": "An",
  "blackPlayer": "Bình",
  "result": "1-0",
  "sourceType": "PGN",
  "pgn": "[Event \"Training\"] ...",
  "initialFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "finalFen": "...",
  "openingEco": "C50",
  "openingName": "Italian Game",
  "whiteAccuracy": 91.8,
  "blackAccuracy": 87.4,
  "depth": 20,
  "moveCount": 54,
  "analysisJson": "{\"engine\":\"Stockfish 18\",\"moves\":[]}"
}
```

## API bài tập

| Phương thức | Endpoint | Quyền | Nghiệp vụ |
| --- | --- | --- | --- |
| `GET` | `/api/exercises` | Công khai | Danh sách 30 khai cuộc + 10 tàn cuộc |
| `GET` | `/api/exercises/{slug}` | Công khai | Nội dung một bài |
| `GET` | `/api/exercises/{slug}/positions/random` | Công khai | Lấy ngẫu nhiên một thế tàn cuộc |
| `POST` | `/api/exercises/{slug}/attempts` | Đăng nhập | Lưu điểm/lần làm |
| `GET` | `/api/exercises/progress/me` | Đăng nhập | Tổng hợp tiến trình và điểm tốt nhất |

## Bảng dữ liệu

- `user_accounts`: tài khoản và BCrypt hash.
- `user_sessions`: SHA-256 token phiên và hạn dùng.
- `user_avatar_images`: ảnh nhị phân theo tài khoản.
- `analyzed_games`: báo cáo, accuracy, ECO và JSON từng nước.
- `exercise_lessons`: kho nội dung bài tập do backend quản lý.
- `exercise_attempts`: lịch sử và điểm luyện tập của người dùng.
- `exercise_positions`: ngân hàng thế tàn cuộc theo mục tiêu.
- `analysis_jobs`: hàng đợi, tiến độ và kết quả Stockfish của PGN/FEN.

## Cấu hình production

- Đổi toàn bộ mật khẩu MySQL mẫu.
- Đặt `COOKIE_SECURE=true` khi dùng HTTPS.
- Đặt `CORS_ALLOWED_ORIGINS` đúng domain frontend.
- Nên đặt frontend và backend sau cùng một domain/reverse proxy, ví dụ frontend ở `/` và backend ở `/api`.
- Không commit file `.env`.

## Kết nối frontend

Frontend trong thư mục gốc đã gọi trực tiếp bốn API trên và không còn phụ thuộc dịch vụ đăng nhập bên thứ ba. Khi chạy local, giữ backend tại `http://localhost:8080`. Khi triển khai thật, đặt `NEXT_PUBLIC_AUTH_API_URL` của frontend bằng URL HTTPS của backend.
