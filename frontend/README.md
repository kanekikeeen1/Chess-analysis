# Chess Analysis Frontend

Đồ án phân tích cờ vua gồm hai phần trong cùng một repository:

- `app/`, `components/`, `lib/`: frontend Next.js 16 (App Router) + React 19.
- `../backend/`: backend Spring Boot + MySQL + Stockfish native cho tài khoản, Game Review, kho ván và bài tập.

Google và Clerk đã được loại bỏ. Người dùng đăng ký bằng tên đăng nhập và mật khẩu riêng của Chess Analysis.

## Chức năng tài khoản

- Tên đăng nhập dài 4–24 ký tự.
- Mật khẩu dài 8–72 ký tự.
- Backend băm mật khẩu bằng BCrypt cost 12 trước khi lưu MySQL.
- Database không lưu mật khẩu nguyên bản.
- Phiên đăng nhập được lưu phía máy chủ; trình duyệt chỉ nhận cookie `HttpOnly`.
- Đăng ký thành công chuyển về trang đăng nhập.
- Cài đặt hiển thị tên tài khoản và nút đăng xuất khi có phiên hợp lệ.
- Sau khi đăng nhập, avatar thay cho nút bánh răng và mở toàn bộ cài đặt tài khoản.
- Có avatar mặc định, 5 avatar chủ đề cờ vua và tùy chọn tải ảnh PNG/JPG/WEBP tối đa 2 MB.
- Ảnh đại diện tải lên được lưu theo tài khoản trong MySQL.

## 1. Khởi động backend và MySQL

Cài Docker Desktop, mở terminal tại thư mục `backend`, sau đó chạy:

```bash
docker compose up --build
```

Backend mặc định chạy ở `http://localhost:8080`. Flyway tự tạo toàn bộ bảng tài khoản, kho ván và bài tập.
Khi chạy toàn bộ bằng Docker, Stockfish đã có sẵn trong image backend. Khi chạy Spring Boot từ IntelliJ, cần cấu hình `STOCKFISH_PATH` tới file Stockfish `.exe` trên Windows.

## 2. Khởi động frontend

Mở terminal thứ hai tại thư mục `frontend`:

```bash
npm install
npm run dev
```

Frontend mặc định kết nối tới `http://localhost:8080`. Nếu backend chạy ở địa chỉ khác, sao chép `.env.example` thành `.env.local` và sửa:

```env
NEXT_PUBLIC_AUTH_API_URL=http://localhost:8080
```

## API tài khoản

| Phương thức | Đường dẫn | Chức năng |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Tạo tài khoản |
| `POST` | `/api/auth/login` | Đăng nhập và tạo cookie phiên |
| `GET` | `/api/auth/me` | Lấy tài khoản hiện tại |
| `POST` | `/api/auth/logout` | Xóa phiên và đăng xuất |
| `PUT` | `/api/auth/avatar/preset` | Chọn avatar có sẵn |
| `POST` | `/api/auth/avatar/upload` | Tải ảnh đại diện lên |
| `GET` | `/api/auth/avatar/image` | Đọc ảnh đại diện của tài khoản hiện tại |

## Các route giao diện

| Route | Chức năng |
| --- | --- |
| `/` | Trang chủ và tổng quan sản phẩm |
| `/analysis` | Bàn cờ, Stockfish, ECO, Game Review và biến thử không làm mất ván gốc |
| `/archive` | Kho ván được bảo vệ bởi đăng nhập |
| `/analysis?archive=:id` | Mở ván đã lưu trong chính giao diện phân tích với icon từng nước |
| `/archive/:id` | Trang chi tiết/phát tự động tương thích với các báo cáo cũ |
| `/exercises` | Danh mục khai cuộc/tàn cuộc |
| `/exercises/:slug` | Bàn cờ khai cuộc hoặc bài tàn cuộc thực chiến với Stockfish |
| `/login`, `/register` | Xác thực nội bộ |

## Cấu hình production

Trước khi đưa lên mạng:

1. Triển khai thư mục `backend/` lên máy chủ có Java 17 và MySQL 8.
2. Đổi toàn bộ mật khẩu MySQL mẫu trong `backend/docker-compose.yml`.
3. Đặt `COOKIE_SECURE=true` khi backend chạy HTTPS.
4. Đặt `CORS_ALLOWED_ORIGINS` bằng đúng domain frontend.
5. Build frontend với `NEXT_PUBLIC_AUTH_API_URL` trỏ tới URL HTTPS của backend.

Nên đặt frontend và backend sau cùng một tên miền hoặc reverse proxy, ví dụ frontend ở `/` và Spring Boot ở `/api`.

## Cấu trúc database

- `user_accounts`: tên đăng nhập, BCrypt hash, avatar và thời điểm tạo.
- `user_sessions`: SHA-256 của token phiên, người sở hữu và thời điểm hết hạn.
- `analyzed_games`: báo cáo Game Review theo người dùng.
- `exercise_lessons`, `exercise_positions`, `exercise_attempts`: nội dung, thế cờ ngẫu nhiên và tiến trình.
- `analysis_jobs`: tiến độ/kết quả Game Review backend với chế độ Nhanh depth 10–14 hoặc Sâu depth 16–20.

Chi tiết backend và ví dụ request nằm trong [`backend/README.md`](backend/README.md).
