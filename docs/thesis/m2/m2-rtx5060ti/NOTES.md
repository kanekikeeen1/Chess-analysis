# Nhận xét kết quả M2 — run `m2-rtx5060ti` (lần huấn luyện đầu)

File này viết tay; `build_m2_report.py` không bao giờ ghi đè nó.
Số liệu gốc nằm ở `README.md`, `tables/` và `data/`.

## Cấu hình chạy

- Phần cứng: RTX 5060 Ti 8 GB, i5-14400F, torch 2.14.1 + CUDA 13.0, AMP bật.
- Mô hình: ResNet 10 khối × 128 kênh, FiLM theo Elo, 7.09M tham số.
- Huấn luyện: batch 512, 6 epoch (22,446 bước), lr 0.002 với warmup 1,500 bước,
  tổng thời gian khoảng 27 phút.
- Dữ liệu: Lichess tháng 09/2026, 10 dải Elo, tối đa 200,000 vị trí mỗi dải.
  Gồm 34,531 ván cho khoảng 2M vị trí; train, val và test được chia theo ván,
  nên không có vị trí của cùng một ván nằm ở cả hai tập.

## Kết quả chính

| Chỉ số (tập test, 43,273 vị trí) | Giá trị |
| --- | --- |
| Top-1 | 41.39% |
| Top-3 | 69.12% |
| Top-1 khi bỏ qua Elo | 41.12% |
| Đoán ngẫu nhiên đều | 5.71% |

Mô hình đoán đúng nước người thật đi trong khoảng 41% số trường hợp, cao gấp
khoảng 7 lần so với đoán ngẫu nhiên. Trong top-3 nước gợi ý, nước người thật
đi xuất hiện ở khoảng 69% số trường hợp. Để so sánh, Maia (McIlroy-Young và
cộng sự, 2020) báo cáo top-1 khoảng 46–52%. Maia dùng khoảng 12 triệu ván cho
mỗi dải Elo, gấp hàng trăm lần dữ liệu ở đây, nên mức 41% là hợp lý cho một
lần chạy đầu.

## Vấn đề 1 — Quá khớp (hình 01)

- Loss validation thấp nhất là 1.967 ở bước 8,000, rồi tăng dần lên khoảng
  2.10 ở cuối. Trong cùng thời gian, loss train tiếp tục giảm xuống khoảng 1.44.
- Khoảng cách này là dấu hiệu quá khớp. Có khoảng 2M vị trí nhưng chỉ đến từ
  34.5k ván, tức trung bình 58 vị trí mỗi ván. Các vị trí trong cùng một ván
  rất giống nhau, nên lượng thông tin thật ít hơn nhiều so với con số 2M, và
  mô hình học thuộc thay vì học quy luật.
- Checkpoint `best.pt` được chọn theo **top-1 trên val** (0.4165 ở bước 21,000),
  không theo loss. Top-1 vẫn tăng nhẹ trong khi loss xấu đi. Điều đó nghĩa là
  mô hình vẫn xếp hạng nước đi tốt hơn, nhưng xác suất nó đưa ra ngày càng tự
  tin quá mức (kém hiệu chỉnh).

## Vấn đề 2 — Điều kiện hóa Elo gần như chưa có tác dụng (hình 03, 04, 05)

- Khi cho mô hình biết Elo, top-1 chỉ tăng +0.27 điểm % (41.39% so với 41.12%).
  Ở dải <1000, việc cho biết Elo thậm chí làm kết quả kém đi 1.17 điểm.
- Ma trận nội suy (hình 05) có giá trị cao nhất nằm đúng trên đường chéo ở
  5/10 hàng. Ở các hàng còn lại, giá trị cao nhất vẫn rơi vào cột kề bên. Mỗi
  hàng có dạng "đồi" với đỉnh gần đường chéo, cho thấy mô hình đã bắt được một
  ít tín hiệu Elo, nhưng còn yếu.
- Hàng 2600+ thấp hơn hẳn các hàng khác (khoảng 35%). Dải này chỉ gồm ít tài
  khoản, chủ yếu chơi bullet/blitz rất nhanh, nên khó đoán và dễ bị học thuộc
  theo từng người chơi.
- Ước lượng Elo từ nước đi (hình 06) có MAE từ 471 đến 561 điểm, mới tính trên
  60 người chơi. Mẫu này quá nhỏ để kết luận chắc chắn, và đường phân vị 90 dao
  động mạnh vì thế.

## Lỗi đã sửa trong lúc đánh giá

Chỉ số `elo_sep` trong log huấn luyện (có lúc lên đến +1029) **không đáng tin**.
Lỗi nằm ở cách tính: hàm này đưa vào mô hình chỉ số dải Elo đã dịch và giá trị
Elo chuẩn hóa bị đảo dấu (`-elo_norm`), hai thông tin mâu thuẫn nhau. Mã đã được
sửa trong `ml/m2/train.py` để dùng tâm của dải Elo đã dịch (`BUCKET_CENTER_NORM`).
Từ run sau, chỉ số này mới có ý nghĩa. Đừng đưa `elo_sep` của run này vào báo cáo.

## Hướng cải thiện (cho run tiếp theo)

1. Giới hạn số vị trí lấy từ mỗi ván, khoảng 6 vị trí cho mỗi bên, và đọc
   nhiều ván hơn. Cùng khoảng 2M vị trí nhưng đến từ hàng trăm nghìn ván, nhờ
   đó giảm quá khớp và mô hình thấy được nhiều người chơi hơn ở mỗi dải Elo.
2. Giảm số epoch hoặc dừng sớm theo loss validation.
3. Tăng số người chơi dùng cho bài đánh giá ước lượng Elo, để MAE có ý nghĩa
   thống kê.

Khi có run mới, đặt hai run cạnh nhau trong báo cáo, ví dụ
`m2-rtx5060ti` và `m2-rtx5060ti-v2`, để thể hiện tác động của từng thay đổi.
