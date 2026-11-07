# Cài đặt và chạy Chess Analysis trên máy mới (Windows)

Hướng dẫn từ máy trắng đến khi mở được web, theo đúng thứ tự. Lệnh viết cho PowerShell.

Hệ thống gồm 3 phần chạy cùng lúc:

| Phần | Công nghệ | Cổng |
| --- | --- | --- |
| MySQL | Docker (`backend/docker-compose.yml`) | 3306 |
| Backend | Spring Boot 3, Java 17, Stockfish, ONNX Runtime | 8080 |
| Frontend | Next.js 16, React 19 | 3000 |

Python (`ml/`) **chỉ cần khi train lại mô hình**. Web chạy bằng các file mô hình đã xuất sẵn.

## Cách nhanh: script cài một lượt

1. Chép cả thư mục dự án từ máy cũ (gồm `ml/models` và `ml/data/puzzles`) sang máy mới.
2. Bấm đúp **`setup.cmd`** ở thư mục gốc. Script tự xin quyền Administrator.

   Script làm các việc sau:
   - cài Git, JDK 17, Node.js LTS và Docker Desktop bằng winget;
   - tải Stockfish và đặt `STOCKFISH_PATH`, `JAVA_HOME`;
   - kiểm tra mô hình, tải file puzzle nếu thiếu;
   - chạy `npm install`;
   - bật WSL, mở Docker, chạy MySQL và nhập puzzle.
3. Nếu script báo **khởi động lại máy** (lần đầu cài Docker/WSL): khởi động lại, mở Docker Desktop, bấm Accept điều
   khoản, rồi chạy `setup.cmd` thêm lần nữa. Các bước đã xong sẽ được bỏ qua.
4. Từ đó trở đi, bấm đúp **`start.cmd`** để chạy. Script bật MySQL, mở cửa sổ backend và frontend, rồi mở trình duyệt.

Tùy chọn (chạy trong PowerShell hoặc cmd tại thư mục gốc):

```powershell
.\setup.cmd -DumpFile C:\duong\dan\dump.sql      # nhập tài khoản/ván đã lưu từ máy cũ (mục 5)
.\setup.cmd -WithPython -Torch cu130              # thêm Python 3.13 + ml\.venv để train lại
.\setup.cmd -StockfishBuild x86-64                # CPU cũ không có AVX2
```

Các mục dưới đây mô tả từng bước làm tay, dùng khi script báo lỗi ở một bước.

---

## 1. Cài phần mềm

| Phần mềm | Ghi chú |
| --- | --- |
| Git | |
| Docker Desktop | Mở lên, đợi góc dưới trái hiện *Engine running* |
| JDK 17 trở lên | `java -version` để kiểm tra |
| Node.js 22 trở lên | `node -v` để kiểm tra |
| Stockfish cho Windows | Tải ở stockfishchess.org, giải nén vào ví dụ `C:\tools\stockfish\` |
| Python 3.13 | **Chỉ khi train lại** (mục 9) |

Maven không cần cài: dùng Maven Wrapper `mvnw.cmd`, lần đầu tự tải về.

## 2. Lấy mã nguồn

```powershell
git clone git@github.com:kanekikeeen1/Chess-analysis.git C:\Workspace\Project\Chess-analysis
cd C:\Workspace\Project\Chess-analysis
git checkout fix/uci-injection-fen-validation   # hoặc main nếu đã merge
```

## 3. Chép các file không nằm trong git

Mô hình và dữ liệu quá nặng nên bị `ml/.gitignore` loại khỏi git. Chép từ máy cũ (USB, ổ mạng…) vào **đúng
đường dẫn** dưới đây:

| Đường dẫn | Dung lượng | Bắt buộc? | Dùng cho |
| --- | --- | --- | --- |
| `ml/models/m2.onnx`, `m2.meta.json`, `m2.reference.json` | ~29 MB | **Có** | Tab "Theo Elo", Elo ước lượng, bot theo Elo |
| `ml/models/styles/` (cả thư mục) | ~85 MB | **Có** | Tab "Kiện tướng", góc nhìn phân tích, đấu kiện tướng, `/gm-puzzles` |
| `ml/data/puzzles/lichess_db_puzzle.csv.zst` | ~290 MB | Cho `/puzzles` | Tải lại được ở https://database.lichess.org/#puzzles |
| `ml/data/`, `ml/runs/` (phần còn lại) | ~3,5 GB | Không | Chỉ để train/đánh giá lại |

Thiếu `ml/models` thì backend **vẫn khởi động**, chỉ các tính năng mô hình báo "chưa có mô hình".

Thư mục `ml/models/styles/` phải có: `styles.json`, `puzzles.json`, và với mỗi kỳ thủ (`liem`, `carlsen`,
`hikaru`) bốn file `.onnx`, `.meta.json`, `.book.json`, `.reference.json`.

## 4. Biến môi trường Stockfish (một lần)

```powershell
[Environment]::SetEnvironmentVariable("STOCKFISH_PATH", "C:\tools\stockfish\stockfish-windows-x86-64-avx2.exe", "User")
```

Sửa đường dẫn đúng tên file đã giải nén. **Đóng hết PowerShell / VS Code / IntelliJ rồi mở lại** để nhận biến mới.
Kiểm tra: `$env:STOCKFISH_PATH` phải in ra đường dẫn, và chạy được file đó.

## 5. MySQL

```powershell
cd C:\Workspace\Project\Chess-analysis\backend
docker compose up -d mysql
docker compose ps          # mysql phải ở trạng thái healthy
```

Chỉ chạy service `mysql`. **Không** dùng `docker compose up` cho backend: image Docker không chứa `ml/models`.

### (Tùy chọn) Mang tài khoản và ván đã lưu từ máy cũ sang

Làm **trước** lần đầu chạy backend ở máy mới.

Máy cũ, trong `backend`:

```powershell
docker compose exec mysql sh -c "mysqldump --no-tablespaces -uchess_user -pchess_password chess_analysis > /tmp/dump.sql"
docker compose cp mysql:/tmp/dump.sql .\dump.sql
```

Máy mới, chép `dump.sql` vào `backend` rồi:

```powershell
docker compose cp .\dump.sql mysql:/tmp/dump.sql
docker compose exec mysql sh -c "mysql -uchess_user -pchess_password chess_analysis < /tmp/dump.sql"
```

Dump đã có sẵn bảng puzzle nên **bỏ qua mục 6**. (Không dùng `>` của PowerShell 5.1 để dump: nó ghi UTF-16, MySQL
không đọc được; vì vậy lệnh trên ghi file bên trong container rồi mới chép ra.)

## 6. Nhập ngân hàng puzzle Lichess (một lần, nếu không nhập dump)

```powershell
cd C:\Workspace\Project\Chess-analysis\backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.arguments=--spring.main.web-application-type=none --app.puzzles.import-file=../ml/data/puzzles/lichess_db_puzzle.csv.zst"
```

Flyway tự tạo toàn bộ bảng ở lần chạy đầu. Lệnh tự thoát khi nhập xong (lần trước: 44.581 puzzle, 12 dải rating).

## 7. Backend

```powershell
cd C:\Workspace\Project\Chess-analysis\backend
.\mvnw.cmd spring-boot:run
```

Hoặc chạy `ChessAnalysisBackendApplication` trong IntelliJ, với **Working directory = thư mục `backend`** (đường
dẫn mô hình mặc định là `../ml/models`).

Log đúng phải có:

```text
Đã nạp mô hình M2 ...\ml\models\m2.onnx (bước huấn luyện 9000, 1858 nước, 10 dải Elo)
Đã nạp mô hình phong cách Lê Quang Liêm (...)
Đã nạp mô hình phong cách Magnus Carlsen (...)
Đã nạp mô hình phong cách Hikaru Nakamura (...)
Đã nạp 450 puzzle kiện tướng
Started ChessAnalysisBackendApplication
```

## 8. Frontend

PowerShell thứ hai:

```powershell
cd C:\Workspace\Project\Chess-analysis\frontend
npm install
npm run dev
```

Mở http://localhost:3000. Nếu backend không ở cổng 8080: chép `.env.example` thành `.env.local` và sửa
`NEXT_PUBLIC_AUTH_API_URL`.

### Kiểm tra nhanh từng tính năng

| Trang | Kiểm tra |
| --- | --- |
| `/analysis` → Nạp ván | Chọn Nhanh/Sâu và góc nhìn (Chỉ Stockfish / kiện tướng), dán PGN, Phân tích |
| `/analysis` → Engine / Báo cáo | Nhãn từng nước, bảng "Góc nhìn phân tích" (lời bình kiện tướng), báo cáo theo góc nhìn kiện tướng, Elo ước lượng |
| `/analysis` → Theo Elo | Bảng xác suất nước đi theo mức Elo + điểm Stockfish |
| `/analysis` → Kiện tướng | Top-3 nước của từng kiện tướng + điểm Stockfish |
| `/play` | Đấu kiện tướng hoặc bot theo Elo |
| `/gm-puzzles` | Đoán nước kiện tướng đã đi |
| `/puzzles`, `/mistakes`, `/review` | Puzzle Lichess, học từ sai lầm, ôn tập SM-2 |

## Những lần sau

PowerShell 1:

```powershell
cd C:\Workspace\Project\Chess-analysis\backend
docker compose up -d mysql
.\mvnw.cmd spring-boot:run
```

PowerShell 2:

```powershell
cd C:\Workspace\Project\Chess-analysis\frontend
npm run dev
```

## 9. (Chỉ khi train lại) Môi trường Python

```powershell
cd C:\Workspace\Project\Chess-analysis\ml
py -3.13 -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cu130   # theo bản CUDA, xem requirements.txt
.\.venv\Scripts\python -c "import torch; print(torch.cuda.is_available())"
.\.venv\Scripts\python -m pytest tests -q
```

Quy trình train M2 ở `ml/README.md`; quy trình giai đoạn D (phong cách kiện tướng) ở
`docs/thesis/BAO_VE_ML.md` mục 4.9. Sau khi xuất mô hình mới chỉ cần khởi động lại backend.

## Kiểm thử mã nguồn

```powershell
cd backend;  .\mvnw.cmd test
cd frontend; npm run lint; npm run build; npm test
cd ml;       .\.venv\Scripts\python -m pytest tests -q
```

## Sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
| --- | --- |
| "Không chạy được Stockfish trên máy chủ (kiểm tra STOCKFISH_PATH)" | Biến chưa đặt, sai đường dẫn, hoặc IDE mở trước khi đặt biến → mở lại IDE |
| "Chưa có mô hình M2 tại …" / "Chưa có mô hình kỳ thủ tại …" | Thiếu `ml/models` hoặc Working directory của backend không phải `backend` |
| Backend lỗi kết nối DB | `docker compose ps` — MySQL chưa healthy hoặc Docker Desktop chưa chạy |
| Trang puzzle trống | Chưa chạy mục 6 |
| Frontend báo lỗi mạng | Backend chưa chạy, hoặc sai `NEXT_PUBLIC_AUTH_API_URL` |
| Cổng 3306/8080/3000 bị chiếm | Tắt MySQL cài sẵn trên máy / tiến trình cũ, hoặc đổi cổng |
