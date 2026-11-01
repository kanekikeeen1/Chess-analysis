# Giai đoạn D — Mô hình phong cách kiện tướng: nhận xét thực nghiệm

Số liệu gốc: `d1-data/` (thu thập), `d2-split/` (chia tập), `d4-eval-v1/` (fine-tune một tầng),
`d4-eval-v2/` (fine-tune hai tầng, có cột GM chung). Mỗi thư mục D4 có `evaluation.json`, các bảng CSV và
2 hình (`01_accuracy_matrix.png`, `02_style_identification.png`).

## 1. Dữ liệu

| Kỳ thủ | Ván (D1) | Train sau D2 (bỏ bullet) | Ván test | Test từ |
| --- | ---: | ---: | ---: | --- |
| Lê Quang Liêm | 6.863 | 3.967 ván · 157k vị trí | 467 | 2026-05 |
| Magnus Carlsen | 22.218 | 7.385 ván · 301k vị trí | 873 | 2026-01 |
| Hikaru Nakamura | 68.937 | 40.831 ván · 1,61M vị trí | 4.804 | 2025-08 |

Dữ liệu lệch rất mạnh: Nakamura có lượng vị trí train gấp khoảng 10 lần Liêm. Đây là yếu tố chi phối mọi kết quả bên dưới.

## 2. Kết quả chính (top-1 trên test, %)

Vòng 1, fine-tune một tầng: M2 nền → từng kỳ thủ.

| Ván của \ Mô hình | M2 nền | Liêm | Carlsen | Nakamura | Stockfish d12 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Liêm | 33,37 | 38,59 | 38,76 | **40,17** | 49,6 |
| Carlsen | 33,50 | 38,31 | 40,38 | **40,71** | 52,6 |
| Nakamura | 32,67 | 36,89 | 38,06 | **41,65** | 47,2 |

Vòng 2, fine-tune hai tầng: M2 nền → GM chung (mỗi người ≤ 300k vị trí) → từng kỳ thủ.

| Ván của \ Mô hình | M2 nền | GM chung | Liêm | Carlsen | Nakamura |
| --- | ---: | ---: | ---: | ---: | ---: |
| Liêm | 33,37 | 40,24 | 40,29 | 40,01 | **40,70** |
| Carlsen | 33,50 | 41,45 | 41,16 | 41,52 | **41,71** |
| Nakamura | 32,67 | 40,33 | 40,08 | 39,64 | **42,09** |

Mô hình của chính kỳ thủ trừ mô hình khác (vòng 2, điểm %, khoảng tin cậy 95% bootstrap theo ván):

| Kỳ thủ | so với M2 nền | so với GM chung | so với 2 người còn lại |
| --- | --- | --- | --- |
| Liêm | +6,92 [+6,32; +7,50] | +0,05 (không ý nghĩa) | Carlsen +0,27 (không ý nghĩa) · Nakamura −0,41 (không ý nghĩa) |
| Carlsen | +8,02 [+7,54; +8,50] | +0,07 (không ý nghĩa) | Liêm +0,35 [+0,06; +0,65] · Nakamura −0,19 (không ý nghĩa) |
| Nakamura | +9,42 [+9,21; +9,64] | +1,76 [+1,63; +1,88] | Liêm +2,00 · Carlsen +2,45 |

Nhận diện kỳ thủ, đã hiệu chỉnh độ lệch theo tập val (trung bình 3 người; ngẫu nhiên là 33%):

| Số ván | Vòng 1 | Vòng 2 |
| --- | ---: | ---: |
| 1 | 51,6% | 49,1% |
| 5 | 71,5% | 67,3% |
| 10 | **82,8%** | 77,5% |

Nếu không hiệu chỉnh, gần như mọi ván đều bị gán cho Nakamura: 100% từ 5 ván trở lên, macro ≈ 35%.

## 3. Diễn giải

1. **Mọi mô hình phong cách đều vượt M2 nền rõ rệt và có ý nghĩa** (+5 đến +9 điểm). Tiêu chí thứ nhất
   của D4 đạt. Tuy vậy, phần lớn mức tăng này là **"blitz kiện tướng nói chung"** chứ không phải phong cách
   riêng: GM chung đã đạt 40–41%, và tầng cuối của Liêm và Carlsen chỉ thêm khoảng +0,05 đến +0,07 điểm (không ý nghĩa).
2. **Đường chéo ma trận chỉ trội có ý nghĩa ở Nakamura.** Mô hình Nakamura đoán ván của Liêm và Carlsen
   tốt hơn chính mô hình của họ ở vòng 1. Ở vòng 2, khoảng cách thu hẹp về mức không ý nghĩa. Lý do là
   lượng dữ liệu: tầng cuối của Nakamura học thêm 1,6M vị trí (nhiều gấp 5 lần GM chung), nên vừa học phong cách
   vừa giỏi hơn ở cờ blitz nói chung. Với ~150–300k vị trí, tầng cuối của Liêm và Carlsen quá khớp gần như ngay lập tức:
   loss val tăng từ bước 100–200, dừng sớm ở bước 600 và 1.200.
3. **Vẫn có tín hiệu phong cách đo được, nhưng yếu, và chỉ thấy khi gộp nhiều ván.** Từ 10 ván, bộ nhận diện
   đã hiệu chỉnh đoán đúng người chơi 78–83%, so với 33% nếu đoán ngẫu nhiên. Tín hiệu này nằm ở **phân phối xác suất** (log-likelihood)
   chứ không ở top-1. Vòng 1 nhận diện tốt hơn vòng 2: các mô hình vòng 1 khác nhau nhiều hơn vì xuất phát
   riêng từ M2 nền, còn ở vòng 2 cả ba gần như trùng GM chung, đánh đổi độ chính xác lấy khả năng phân biệt.
4. **So với Stockfish** (depth 12, 500 vị trí mỗi người): Stockfish trùng nước kiện tướng 47–53%, cao
   hơn mọi mô hình (40–42%). Ở trình độ 2800+, nước của người thường trùng với nước tốt nhất của engine, nên chỉ số top-1
   không phân biệt được "đi giống người" với "đi mạnh". Chỉ số NLL và nhận diện kỳ thủ phản ánh phong cách tốt hơn.
5. **Kết luận trung thực cho báo cáo:** với dữ liệu công khai (phần lớn là blitz online) và quy mô
   150k–1,6M vị trí, phương pháp fine-tune tái hiện tốt "cách đi của kiện tướng" nhưng chỉ tách được phong cách
   cá nhân rõ rệt khi có trên khoảng 1M vị trí (trường hợp Nakamura). Kết quả này khớp với McIlroy-Young và cộng sự (2022):
   mô hình cá nhân hóa cần nhiều ván, và độ khác biệt giữa các người chơi mạnh nhỏ hơn giữa người chơi yếu.

## 4. Thí nghiệm đối chứng: cùng lượng dữ liệu (vòng 3, `style3-*.yaml`)

Để tách "phong cách" khỏi "lượng dữ liệu", cả 3 người được fine-tune từ GM chung với **cùng 157k vị trí
train**, bằng của Liêm (`prepare_style_data.py --equal-only`), cùng số bước và cùng siêu tham số. Để giảm quá khớp,
lr là 1e-4 và đóng băng 6/10 khối. Nếu đường chéo vẫn không trội, có thể kết luận phong cách riêng ở quy mô
này không đo được bằng top-1. Nếu trội, sự áp đảo của Nakamura ở vòng 1–2 là do dữ liệu.
*(Điền kết quả sau khi chạy.)*

## 5. Lựa chọn mô hình phục vụ (D5)

Web dùng **vòng 2** (`--prefix style2`), vì có top-1 cao nhất trên test của chính từng người: Liêm 40,29 · Carlsen
41,52 · Nakamura 42,09, so với vòng 1 là 38,59 · 40,38 · 41,65. Với bot đấu, đi giống kiện tướng quan trọng hơn khả năng
phân biệt giữa họ. Phần khác biệt dễ thấy nhất giữa các bot là **sổ khai cuộc dựng từ chính ván của từng người**
(12 nửa nước đầu, thế cờ có ≥ 3 ván): Liêm 1.520 thế cờ · Carlsen 2.554 · Nakamura 9.253. Phần này không phụ thuộc vào mô hình.

## 6. Hạn chế

- Dữ liệu chủ yếu là blitz online: tỉ lệ cờ chậm dưới 10% với mọi người. Phong cách blitz khác cờ tiêu chuẩn.
- Tài khoản online không xác minh được chắc chắn 100% là chính kỳ thủ chơi. Mình chỉ dùng tài khoản đã được công khai
  thừa nhận, ghi trong `ml/config/players.yaml`.
- Test là các ván mới nhất (chia theo thời gian), nên phong cách thay đổi theo năm cũng là một nguồn sai số.
- Stockfish chỉ chấm 500 vị trí mỗi người ở depth 12: đủ để so sánh thô, không đủ để kết luận chi tiết.

## 7. Hướng cải thiện

- Một mô hình chung có **embedding kỳ thủ** (FiLM cạnh Elo), train đồng thời trên mọi người: phần chung
  học từ toàn bộ dữ liệu, còn embedding chỉ phải học phần khác biệt (D3, phương án cải tiến).
- Điều kiện hóa theo nhịp độ (blitz/rapid/classical) để không trộn hai kiểu chơi.
- Thêm kỳ thủ có nhiều ván cờ chậm hơn để so sánh.
