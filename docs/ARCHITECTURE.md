# Kiến trúc Chess Analysis

## Phân chia trách nhiệm

| Thành phần | Trách nhiệm |
| --- | --- |
| Next.js 16 + chess.js | Giao diện, kiểm tra nước hợp lệ, chuẩn hóa PGN thành timeline FEN và hiển thị kết quả |
| Stockfish Web Worker | Chỉ phân tích thao tác tự đi tức thời ở depth 16; dùng bản WASM (nhanh hơn asm.js ~5,5 lần), tự lùi về asm.js nếu WASM không khởi động được |
| ECO JSON | Nhận diện khai cuộc và biến thể ngay theo chuỗi nước |
| Spring Boot + Stockfish native | Hàng đợi Game Review, depth tùy chọn 10–14/16–20, PV1/PV2, nhãn, accuracy và chấm bài tàn cuộc |
| MySQL/Flyway | Tài khoản, phiên, kho ván, analysis jobs, bài học, thế cờ và lịch sử luyện tập |

## Luồng Game Review backend

```mermaid
sequenceDiagram
    participant U as Người dùng
    participant F as Frontend
    participant B as Spring Boot
    participant S as Stockfish native
    participant D as MySQL
    U->>F: Nạp PGN hoặc FEN
    F->>F: Chuẩn hóa FEN + khớp ECO
    F->>B: POST /api/analysis/jobs
    B->>D: Lưu job QUEUED
    B->>S: Phân tích từng vị trí theo dải depth đã chọn
    loop Mỗi vị trí
        S-->>B: Eval + PV1/PV2 + mate + depth
        B->>D: Cập nhật progress và kết quả từng phần
        F->>B: GET /api/analysis/jobs/{id}?from=k
        B-->>F: Tiến độ + các eval mới từ vị trí k
    end
    B->>B: Phân loại nước + tính accuracy
    B->>D: Lưu COMPLETED + result_json
    B-->>F: Nhãn và độ chính xác hai bên
```

Sau khi review, frontend giữ một `reviewTimeline` bất biến. Nếu người dùng đi khác ở bất kỳ nước nào, một `variationTimeline` được tạo từ đúng điểm rẽ. Web Worker chỉ phân tích các vị trí của biến thử ở depth 16, còn kết quả backend, accuracy và lịch sử ván gốc vẫn tồn tại để chuyển qua lại tức thời.

Người dùng chọn Nhanh 10–14 hoặc Sâu 16–20. Depth đi theo giai đoạn ván: khai cuộc (ít nhất 12 nửa nước đầu, kéo dài theo chuỗi nước lý thuyết liên tục từ đầu ván) dùng mức thấp nhất, trung cuộc dùng mức giữa, tàn cuộc (≤ 14 quân) và FEN đơn dùng mức cao nhất. Vì cả ba điều kiện chỉ đi một chiều theo thời gian, depth đổi tối đa hai lần trong một ván, nên hai vị trí trước/sau của hầu hết các nước được đánh giá cùng depth và chênh lệch depth không bị tính nhầm thành lỗi người chơi. ECO không thay thế Stockfish: mọi vị trí vẫn được đánh giá để báo cáo có thể tái lập.

Hàng đợi nằm trong bộ nhớ. Khi máy chủ khởi động lại, job còn QUEUED/RUNNING trong vòng một giờ được xếp hàng lại từ `request_json`; các vị trí đã phân tích nằm sẵn trong cache `position_evaluations` nên lần chạy lại nhanh. Job cũ hơn bị đánh dấu thất bại.

## Quy tắc nhãn backend

1. Chiếu hết luôn là `Best`.
2. Chỉ có một nước hợp lệ là `Forced`.
3. Chuỗi còn nằm trong ECO **và** engine đánh giá mất dưới 5% cơ hội thắng là `Theory`. Sách ECO có cả những dòng yếu (Grob, Barnes…), nên nước trong sách mà engine thấy là sai sót sẽ được chấm như nước thường.
4. `Brilliant` bắt buộc là PV1 có thí vật chất thật (không phải quân chỉ đang bị tấn công), không làm xấu thế trận và xuất hiện khi vị trí còn cạnh tranh; thế đã thắng áp đảo chỉ nhận `Best`.
5. PV1 có khoảng cách rõ với PV2, không hiển nhiên và giữ lợi thế là `Critical`.
6. Các nhãn còn lại chỉ dựa trên mức mất cơ hội thắng (win%) của bên vừa đi:

| Mất win% | Nhãn |
| --- | --- |
| < 2 | Excellent |
| 2 – < 5 | Okay |
| 5 – < 10 | Inaccuracy |
| 10 – < 15 | Mistake |
| ≥ 15 | Blunder |

Ba mốc 5/10/15 trùng với Lichess (0,1/0,2/0,3 trên thang winning chances [-1, 1]).

Win% của Trắng: `win% = 100 / (1 + exp(-0.00368208 × cp))`, với cp kẹp trong ±1000.

Accuracy **từng nước** dùng mức giảm win% giữa đánh giá trước/sau nước đi:

```text
accuracy = 103.1668 × exp(-0.04354 × chanceLoss) - 3.1669     (kẹp 0–100)
```

Accuracy **toàn ván** của mỗi bên theo cách tiếp cận của Lichess, là trung bình của hai đại lượng:

- **Trung bình có trọng số**: trọng số của mỗi nước là độ lệch chuẩn win% trong cửa sổ trượt quanh nước đó (kích thước cửa sổ = số nước / 10, kẹp 2–8; trọng số kẹp 0,5–12), nên nước đi trong giai đoạn thế cờ biến động được tính nặng hơn.
- **Trung bình điều hòa** các accuracy (mỗi giá trị chặn dưới ở 1), nhạy với nước tệ nên một blunder quyết định không bị hàng chục nước dễ che lấp.

Trung bình cộng thông thường (cách cũ) thổi phồng accuracy của các ván có nhiều nước yên tĩnh.

## Luồng bài tập tàn cuộc

Backend chọn ngẫu nhiên một hàng trong `exercise_positions`. Người dùng đi nước hợp lệ trên frontend; Spring Boot gọi Stockfish depth 20 để so nước đã đi với PV1 và ưu tiên đường chiếu hết nhanh. Kết quả được hiển thị bằng cùng hệ icon nhãn của trang phân tích và gắn ở góc trên bên phải ô đích. Với nước chưa chuẩn, frontend giữ nguyên vị trí và hiển thị nước tốt nhất có thể bấm để triển khai. Với nước được chấp nhận, PV1 của thế sau được dùng làm nước đáp của Stockfish. Khi đạt mục tiêu chiếu hết, phong cấp, thắng xe hoặc hòa, backend lưu điểm vào `exercise_attempts` nếu người dùng đã đăng nhập.

## Mô hình dữ liệu chính

```mermaid
erDiagram
    USER_ACCOUNTS ||--o{ USER_SESSIONS : owns
    USER_ACCOUNTS ||--o{ ANALYZED_GAMES : saves
    USER_ACCOUNTS ||--o{ ANALYSIS_JOBS : starts
    USER_ACCOUNTS ||--o{ EXERCISE_ATTEMPTS : performs
    EXERCISE_LESSONS ||--o{ EXERCISE_POSITIONS : contains
    EXERCISE_LESSONS ||--o{ EXERCISE_ATTEMPTS : receives
```

Kho ván vẫn được bảo vệ theo `user_id` từ cookie phiên. Analysis job có `public_id` UUID để thăm dò tiến độ mà không lộ khóa tăng dần của database.
