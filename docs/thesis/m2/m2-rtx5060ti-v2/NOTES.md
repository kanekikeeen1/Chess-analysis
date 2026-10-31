# Nhận xét kết quả M2 — run `m2-rtx5060ti-v2` (lần huấn luyện thứ hai)

File này viết tay; `build_m2_report.py` không ghi đè nó. So sánh với lần 1 ở
`../m2-rtx5060ti/NOTES.md`.

## Thay đổi so với lần 1

| | Lần 1 | Lần 2 |
| --- | --- | --- |
| Vị trí lấy từ mỗi ván train | cả ván (~58) | tối đa 8 mỗi bên |
| Giới hạn mỗi tài khoản | không | 3.000 vị trí |
| Số ván dùng | 34.531 | 121.933 |
| Số ván phải đọc | 1,9 triệu | 9,2 triệu |
| Người chơi ở dải 2600+ | (không đo) | 1.101 |
| Dừng sớm | không | có (sau 6 lần đánh giá không giảm loss) |
| Baseline Stockfish | không | có (300 vị trí mỗi dải, depth 12) |
| Ma trận nội suy theo NLL | không | có |

## Kết quả chính (tập test, 148.183 vị trí)

| Chỉ số | Giá trị |
| --- | --- |
| Top-1 | 39,49% |
| Top-3 | 67,18% |
| Top-1 khi bỏ qua Elo | 39,03% (Elo góp +0,46 điểm) |
| Stockfish depth 12, top-1 | 39,07% (3.000 vị trí) |
| Đường chéo thắng: top-1 / NLL | 1/10 / **6/10** (lệch trung bình 0,40 dải) |
| MAE ước lượng Elo (80 nước, 300 ván) | 428 |

## Phát hiện 1 — Điều kiện hóa Elo có tác dụng, nhưng top-1 không thấy được (hình 05, 07)

- Ma trận top-1 chỉ thắng đường chéo ở 1/10 hàng. Chênh lệch giữa các cột trong
  một hàng chỉ khoảng 0,2–0,5 điểm, nhỏ hơn sai số thống kê (khoảng ±0,4–0,5 điểm
  với 11–20 nghìn vị trí mỗi hàng). Vì vậy top-1 **không đủ nhạy** cho câu hỏi này.
- NLL (log-likelihood âm của nước người thật đi) được tính trên cùng các vị trí
  cho mọi cột. Theo NLL, cột tốt nhất nằm trên đường chéo ở 6/10 hàng và lệch
  trung bình 0,4 dải.
- Từng hàng có dạng đồi rõ rệt. Ví dụ, với người <1000, NLL tăng đều từ 2,136
  (hỏi ở <1000) lên 2,29 (hỏi ở 2600+). Với người 2600+, xu hướng ngược lại:
  NLL giảm đều từ 2,425 xuống 2,306.
- Kết luận: mô hình mô phỏng một người chơi tốt nhất khi được hỏi ở đúng, hoặc
  sát, dải Elo của người đó. Đây là bằng chứng chính cho việc điều kiện hóa Elo
  có tác dụng.
- Maia cũng dùng NLL và độ khớp theo từng dải làm thước đo, nên cách đánh giá
  này là chuẩn của bài toán.

## Phát hiện 2 — So với Stockfish: M2 tốt ở dải thấp, yếu ở dải cao (hình 03)

| Dải | M2 | Stockfish d12 | Chênh lệch |
| --- | --- | --- | --- |
| <1000 | 38,9% | 27,3% | **+11,5** |
| 1400–1599 | 41,3% | 30,3% | **+11,0** |
| 1800–1999 | 41,9% | 39,7% | +2,2 |
| 2200–2399 | 40,0% | 46,0% | −6,0 |
| 2600+ | 33,7% | 53,7% | **−20,0** |

(Stockfish chỉ được chấm trên 300 vị trí mỗi dải, nên sai số khoảng ±2,8 điểm.)

- Ở dải thấp, người chơi hay đi nước "kiểu người" mà engine không bao giờ chọn.
  M2 học được điều này, còn engine thì không. Đây là lý do cần một mô hình riêng
  để mô phỏng người chơi.
- Ở dải cao, người chơi đi gần với engine. M2 chưa đủ mạnh về cờ để đoán các nước
  tốt đó: mô hình có 7M tham số, chỉ khoảng 200k vị trí mỗi dải, và không tìm
  kiếm trước nước nào. Dải 2600+ còn có NLL cao bất thường (2,31 so với khoảng
  2,0 ở dải giữa).
- Hệ quả cho giai đoạn D (phong cách kiện tướng): mô hình nền ở dải 2600+ còn
  yếu, nên fine-tune trực tiếp từ checkpoint này sẽ bị giới hạn. Nên làm một lần
  chạy v3 với nhiều dữ liệu dải cao hơn trước khi làm D3.

## Phát hiện 3 — Vẫn quá khớp, nhưng nhẹ hơn (hình 01)

- Loss validation thấp nhất là 2,024 ở bước 7.000, tức khoảng 2,1 epoch. Huấn
  luyện tự dừng ở bước 13.000.
- Checkpoint `best.pt` được chọn theo top-1 trên val, ở bước 9.000.
- Nguyên nhân: 7M tham số so với 1,7M vị trí train vẫn là quá ít dữ liệu. Muốn
  cải thiện tiếp cần thêm dữ liệu, chứ không phải chỉnh siêu tham số.

## Ghi chú khi so sánh với lần 1

Top-1 của lần 2 (39,5%) thấp hơn lần 1 (41,4%), nhưng hai con số **không so trực
tiếp được**:

- Tập test của lần 2 có nhiều vị trí ở dải 2600+ hơn (20k), mà đây là dải khó
  nhất.
- Lần 1 không giới hạn số vị trí mỗi tài khoản, nên cùng một tài khoản chơi nhiều
  có thể xuất hiện ở cả tập train và tập test. Mô hình khi đó đoán được một phần
  nhờ "nhớ" người chơi, khiến con số bị thổi phồng.

Chỉ số `elo_sep` trong log của lần này đã được tính đúng, sau khi sửa lỗi ở lần 1.
Nó tăng đều từ +0,015 lên +0,084, cho thấy mô hình dần học cách dùng thông tin Elo.

## Hướng tiếp theo

- **v3**: khoảng 1 triệu vị trí mỗi dải, đọc gần hết dữ liệu một tháng (khoảng
  2–3 giờ). Mục tiêu là nâng độ chính xác ở dải ≥ 2000 để có mô hình nền tốt
  cho giai đoạn D.
- Có thể thử mạng lớn hơn (ví dụ 15 khối × 192 kênh) khi đã có nhiều dữ liệu
  hơn. Hiện tại tăng kích thước mạng chỉ làm quá khớp nặng thêm.
