# Tài liệu ôn bảo vệ — phần Machine Learning

Phần ML là lõi của đề tài. Tài liệu này gom mọi thứ cần nắm để trình bày và trả lời hội đồng: bài toán,
dữ liệu, mô hình, huấn luyện, đánh giá, kết quả, hạn chế, và câu hỏi hay gặp. Số liệu lấy từ các báo cáo gốc:

- M2 nền: `docs/thesis/m2/m2-rtx5060ti-v2/` (README.md, NOTES.md, hình trong `figures/`)
- Phong cách kiện tướng: `docs/thesis/style/` (NOTES.md, `d1-data/`, `d2-split/`, `d4-eval-v1…v4/`)

Cách đọc: mục 1 để học thuộc, mục 2–5 để hiểu sâu, mục 7 để luyện trả lời.

---

## 1. Tóm tắt 1 phút (học thuộc)

> Stockfish trả lời "nước nào **tốt nhất**". Người học cờ cần thêm câu hỏi khác: "người ở trình độ của tôi, hoặc
> một kiện tướng cụ thể, **sẽ đi nước nào**", vì cách người chơi chọn nước khác cách engine chọn nước.
>
> Đề tài xây dựng hai mô hình học sâu trả lời câu hỏi đó:
>
> 1. **M2**: một mạng ResNet duy nhất, **điều kiện hóa theo Elo bằng FiLM**, dự đoán phân phối xác suất nước đi
>    của người chơi ở mọi mức từ dưới 1000 đến 2600+. Mạng học từ 2 triệu vị trí Lichess, chia tập theo ván.
>    Ở dải dưới 1800, M2 đoán trúng nước người thật nhiều hơn Stockfish tới 11 điểm %. Mạng hỏi ở đúng
>    dải Elo thì khớp người chơi nhất (6/10 dải theo NLL), nên ước lượng được Elo của một ván.
> 2. **Mô hình phong cách** Lê Quang Liêm, Magnus Carlsen, Hikaru Nakamura: **fine-tune** M2 trên ván công khai
>    của từng người. Ở thí nghiệm đối chứng cùng lượng dữ liệu, mô hình của mỗi người đoán ván của chính họ tốt
>    hơn mô hình của hai người kia, ở **cả 6 phép so sánh, có ý nghĩa thống kê** (khoảng tin cậy 95% bootstrap theo
>    ván). Từ 10 ván, hệ thống nhận ra đúng người chơi **78,9%** (ngẫu nhiên là 33%).
>
> Cả hai mô hình được xuất ONNX, chạy trong backend Java. Chúng cung cấp các tính năng: "người Elo X sẽ đi gì",
> ước lượng Elo của ván, bot đấu theo Elo, bot đấu theo phong cách kiện tướng, lời bình theo góc nhìn kiện tướng,
> báo cáo ván theo góc nhìn kiện tướng, và puzzle "đoán nước kiện tướng".

**Ba điểm mới nên nhấn mạnh**

1. Một mạng điều kiện hóa Elo liên tục (FiLM) thay vì 9 mạng rời rạc như Maia.
2. Có **thí nghiệm đối chứng** tách "phong cách" khỏi "lượng dữ liệu". Có cả một sai sót thiết kế tự phát hiện và
   sửa: thể hiện phương pháp làm khoa học trung thực.
3. Kết hợp mô hình người với engine trong sản phẩm. Stockfish nói nước đó **tốt hay xấu**, mô hình nói nước đó
   **có tự nhiên với người chơi** hay không. Từ đó có các tính năng engine không làm được: cảnh báo bẫy, lời bình
   theo phong cách, ước lượng trình độ.

---

## 2. Bài toán và bối cảnh

### 2.1 Vì sao không dùng luôn Stockfish?

- Stockfish tối ưu **kết quả ván**. Nó chọn nước mạnh nhất, kể cả nước con người gần như không bao giờ nghĩ ra.
- Người học cần biết: người cùng trình độ hay mắc lỗi gì (để tránh), người giỏi hơn sẽ đi gì (để học), và một
  nước có phải "bẫy tự nhiên" không: nước nhìn hợp lý, nhiều người đi, nhưng engine chấm là sai.
- Số liệu của chính đề tài chứng minh điều này: ở dải dưới 1000, Stockfish chỉ trùng nước người thật **27,3%**,
  còn M2 trùng **38,9%** (mục 3.6).

### 2.2 Công trình liên quan

| Công trình | Ý chính | Đề tài khác ở đâu |
| --- | --- | --- |
| **Maia** (McIlroy-Young và cộng sự, KDD 2020) | 9 mạng riêng cho 9 dải Elo 1100–1900, top-1 ~50–52% | M2 là **1 mạng**, Elo là đầu vào liên tục (FiLM), phủ dải đến 2600+ |
| **Maia cá nhân hóa** (McIlroy-Young và cộng sự, KDD 2022) | Fine-tune theo từng người, nhận diện người chơi | Áp dụng cho kiện tướng với dữ liệu công khai, thêm thí nghiệm đối chứng lượng dữ liệu |
| **FiLM** (Perez và cộng sự, AAAI 2018) | Điều biến đặc trưng bằng (γ, β) sinh từ đầu vào điều kiện | Dùng để đưa Elo vào từng khối residual |
| **Leela Chess Zero** | Biểu diễn nước đi 1858 lớp | Dùng lại không gian nước đi để so sánh được với Maia |

---

## 3. Mô hình M2 — "người ở Elo X sẽ đi nước nào"

### 3.1 Dữ liệu

| Hạng mục | Giá trị |
| --- | --- |
| Nguồn | Lichess open database, tháng 09/2026 (giấy phép CC0) |
| Số ván đã đọc / dùng | 9.234.922 / 121.933 ván, 63.662 người chơi |
| Tập train / val / test | 1.707.397 / 144.420 / 148.183 vị trí |
| Cân bằng | ~200k vị trí cho **mỗi** dải trong 10 dải Elo |

**Bộ lọc** (ghi trong `dataset_card.json`):

| Bộ lọc | Lý do |
| --- | --- |
| Elo 600–3200, chênh Elo hai bên ≤ 300 | Ván cân sức phản ánh đúng trình độ |
| Thời gian cơ bản 3–180 phút (bỏ bullet) | Bullet bị đồng hồ chi phối, không phản ánh lựa chọn |
| Bỏ 10 nửa nước đầu | Khai cuộc là học thuộc, không phản ánh trình độ |
| Ván ≥ 20 nửa nước; bỏ nước bắt buộc (1 nước hợp lệ) | Không có gì để học |
| Bỏ nước cuối của ván thua do hết giờ | Nước đi vội, nhiễu |
| ≤ 8 vị trí mỗi bên mỗi ván | Tránh nhiều vị trí tương quan mạnh từ cùng một ván |
| ≤ 3.000 vị trí mỗi tài khoản | Tránh mô hình "nhớ" người chơi hoạt động nhiều |

**Chia tập theo ván, không theo nước đi.** Hai vị trí của cùng một ván tương quan rất mạnh. Nếu chia lẫn, một ván
có thể nằm ở cả train lẫn test, làm kết quả kiểm định bị thổi phồng mà không ai thấy.

**Câu chuyện lần 1 → lần 2 (đáng kể với hội đồng):**

- Lần 1 lấy cả ván (~58 vị trí mỗi ván) và không giới hạn số vị trí mỗi tài khoản. Kết quả top-1 41,4%.
- Lần 2 sửa cả hai điều trên. Top-1 còn 39,5%.
- Con số **thấp hơn nhưng đáng tin hơn**, vì lần 1 có rò rỉ theo người chơi và tập test có ít vị trí ở dải khó.

### 3.2 Mã hóa đầu vào (`ml/m2/encoding.py`)

**Bàn cờ** được mã hóa thành **20 mặt phẳng 8×8**:

| Mặt phẳng | Nội dung |
| --- | --- |
| 0–5 | Quân của bên đi (Tốt, Mã, Tượng, Xe, Hậu, Vua) |
| 6–11 | Quân của đối phương |
| 12–15 | Quyền nhập thành (hai cánh × hai bên) |
| 16 | Ô bắt tốt qua đường |
| 17 | Bộ đếm 50 nước (chuẩn hóa) |
| 18 | Có lặp lại thế cờ |
| 19 | Hằng số 1 (giúp tích chập nhận biết mép bàn) |

**Xoay bàn cờ về phía bên đi.** Mạng chỉ học một góc nhìn: "quân của tôi" và "quân đối phương". Nếu không xoay,
mạng phải học riêng chiến thuật cho Trắng và cho Đen, tức cần gấp đôi dữ liệu.

**Nước đi: 1858 lớp** (không gian của Leela/Maia). Nước phong Hậu dùng chung chỉ số với nước đi thường, vì phong
Hậu chiếm ~97% số lần phong cấp. Bảng chỉ số nước đi được lưu trong `m2.meta.json`, **bắt buộc đi kèm mô hình**.
Không có nó thì tầng phục vụ không biết logit thứ i là nước nào.

**Elo được đưa vào hai dạng bổ trợ:**

- **Chỉ số dải (embedding):** 10 dải `<1000, 1000–1199, …, 2400–2599, 2600+`. Dạng này học đặc trưng riêng của
  từng nhóm.
- **Giá trị liên tục chuẩn hóa** `(Elo − 1500) / 400`. Dạng này cho phép hỏi ở mức bất kỳ, ví dụ 1450, và nội suy
  giữa các dải.

### 3.3 Kiến trúc (`ml/m2/model.py`)

```text
bàn cờ 20×8×8 ─► stem conv 3×3 ─► 10 khối residual có FiLM (128 kênh) ─┬─► policy head ─► 1858 logit (nước đi)
                                          ▲                            └─► value head  ─► thắng/hòa/thua (phụ)
Elo (dải, liên tục) ─► EloEncoder (embedding + linear, SiLU) ─► vector 64 chiều
                                          (mỗi khối: Linear → γ, β)
```

**Khối FiLM:**

```text
out = BN(conv2(SiLU(BN(conv1(x)))))
out = out · (1 + γ) + β,   với (γ, β) = Linear(vector Elo)
y   = SiLU(out + x)
```

**Khởi tạo Linear của FiLM bằng 0**, nên ban đầu γ = 0 và β = 0, khối là residual thường. Mạng học bàn cờ trước,
rồi mới dần dùng Elo. Nếu không, tín hiệu Elo ngẫu nhiên lúc đầu làm hỏng phần học biểu diễn bàn cờ.

| Thông số | Giá trị |
| --- | --- |
| Tham số | 7,09 triệu (r10×128, elo_dim 64) |
| Value head | Đầu phụ dự đoán kết quả ván, trọng số loss 0,15. Giúp biểu diễn tốt hơn; không dùng khi phục vụ |

### 3.4 Huấn luyện (`ml/m2/train.py`, `config/m2-rtx5060ti-v2.yaml`)

| Thành phần | Giá trị |
| --- | --- |
| Loss | Cross-entropy trên nước người thật đi (label smoothing 0,02) + 0,15 × CE của value head |
| Optimizer | AdamW, lr 2e-3, weight decay 1e-4, grad clip 1,0 |
| Lịch lr | Warmup tuyến tính 1.500 bước, rồi cosine về 1e-5 |
| Batch, độ chính xác | 512, mixed precision (AMP) trên RTX 5060 Ti |
| Dừng sớm | Loss val không giảm sau 6 lần đánh giá (mỗi 1.000 bước) |
| Chọn checkpoint | Top-1 tốt nhất trên val, ở bước 9.000 |

**Không lưu tensor ra đĩa.** Shard Parquet lưu FEN (~80 byte mỗi mẫu thay vì ~5 KB tensor), và worker của
DataLoader mã hóa tại chỗ (~25 µs mỗi mẫu). Tiết kiệm hơn 50 GB đĩa, và dữ liệu vẫn đọc được bằng mắt.

### 3.5 Chỉ số đánh giá

| Chỉ số | Ý nghĩa |
| --- | --- |
| **Top-1** | % vị trí mà nước có xác suất cao nhất trùng nước người thật đi |
| **Top-3** | Nước người thật nằm trong 3 nước đầu |
| **NLL** (negative log-likelihood) | −log P(nước thật). Nhạy hơn top-1, vì xét cả phân phối chứ không chỉ nước đầu |
| **elo_sep** | Chênh log-likelihood giữa hỏi đúng dải và hỏi sai dải. Phải dương và tăng: dấu hiệu mạng đang dùng Elo |
| **Ma trận nội suy** | Hàng = người chơi dải Y, cột = hỏi mô hình ở dải X. Đường chéo phải tốt nhất |
| **Baseline** | Đoán đều trên các nước hợp lệ (5,75%), mô hình bỏ Elo, Stockfish depth 12 |

### 3.6 Kết quả M2 (tập test 148.183 vị trí)

| Chỉ số | Giá trị |
| --- | --- |
| Top-1 / Top-3 | **39,49% / 67,18%** |
| Top-1 khi bỏ Elo | 39,03% (Elo góp +0,46 điểm) |
| Stockfish depth 12, top-1 | 39,07% |
| Đường chéo ma trận thắng: theo top-1 / theo NLL | 1/10 / **6/10 dải** (lệch trung bình 0,40 dải) |
| MAE ước lượng Elo (80 nước, 300 ván) | 428 |

**So với Stockfish theo dải:**

| Dải | M2 | Stockfish d12 | Chênh lệch |
| --- | ---: | ---: | ---: |
| <1000 | 38,9% | 27,3% | **+11,5** |
| 1400–1599 | 41,3% | 30,3% | **+11,0** |
| 1800–1999 | 41,9% | 39,7% | +2,2 |
| 2200–2399 | 40,0% | 46,0% | −6,0 |
| 2600+ | 33,7% | 53,7% | −20,0 |

**Diễn giải (phải nói được):**

1. **Ở dải thấp, M2 hơn hẳn engine.** Người chơi yếu đi nước "kiểu người" mà engine không bao giờ chọn. Đây là bằng
   chứng trực tiếp cho lý do tồn tại của mô hình người.
2. **Ở dải cao, M2 kém engine.** Người chơi mạnh đi gần nước tốt nhất. Mạng 7M tham số không tìm kiếm trước, và chỉ
   có ~200k vị trí mỗi dải, nên chưa đủ mạnh về cờ để đoán các nước đó.
3. **Top-1 không đủ nhạy để thấy tác dụng của Elo**: chênh lệch giữa các cột chỉ 0,2–0,5 điểm, nhỏ hơn sai số.
   Theo NLL, đường chéo thắng 6/10 dải, và mỗi hàng có dạng đồi.
   - Người dưới 1000: NLL tăng đều từ 2,136 (hỏi ở dưới 1000) lên 2,29 (hỏi ở 2600+).
   - Người 2600+: ngược lại.
   - Vậy mô hình mô phỏng một người tốt nhất khi hỏi ở đúng Elo của họ. Maia cũng dùng NLL làm thước đo.
4. **Còn quá khớp:** loss val thấp nhất ở bước 7.000 (~2,1 epoch). 7M tham số so với 1,7M vị trí: cần thêm dữ liệu,
   chứ không phải chỉnh siêu tham số.

**So với Maia (~50%):** Maia dùng nhiều dữ liệu hơn nhiều bậc và chỉ dải 1100–1900. M2 phủ cả dải 2600+, vốn là
dải khó nhất (riêng dải này 33,7%), và chỉ dùng 1 mạng. Không so trực tiếp con số được, vì khác dữ liệu và khác
phạm vi Elo.

### 3.7 Ước lượng Elo của một ván (`backend/.../EloEstimator.java`)

**Ý tưởng Bayes:** Elo nào làm cho các nước người chơi đã đi "dễ xảy ra" nhất?

```text
log P(nước đi | Elo = e) = Σ_nước log p_M2(nước | thế cờ, e),   e ∈ lưới {900, 1100, …, 2700}
hậu nghiệm(e) ∝ exp(log-likelihood(e)) · N(e; 1500, 400)          (tiên nghiệm Gauss)
Elo ước lượng = kỳ vọng hậu nghiệm,  sai số = độ lệch chuẩn hậu nghiệm
```

- Hồ sơ người chơi cộng log-likelihood của nhiều ván, nên càng nhiều ván càng chính xác.
- MAE 428 điểm với 80 nước là lớn. Phải nói rõ đây là **ước lượng tham khảo, không phải rating**. Ván ngắn cho sai
  số lớn, và giao diện có hiện ±.

### 3.8 Phục vụ (ONNX trong Java)

- Xuất ONNX opset 18: FiLM dùng `chunk`, sinh node `Split` mà opset 17 không hỗ trợ. Bước xuất tự đối chiếu ONNX
  với PyTorch, lệch tối đa ~1e-5.
- Backend port `encoding.py` sang Java (`M2Encoding`). Kiểm tra khớp bằng hai bộ test:
  - `M2EncodingTest`: vector mã hóa khớp Python trên 69 thế cờ;
  - `HumanMoveModelReferenceTest`: đầu ra khớp ONNX Runtime Python tới 1e-4.
- Suy luận trên CPU, vài chục ms mỗi thế cờ. Mọi mức Elo được hỏi chạy trong **một batch**.

---

## 4. Mô hình phong cách kiện tướng (giai đoạn D)

### 4.1 Mục tiêu và giới hạn (nói trước khi bị hỏi)

- Mô hình học **cách chọn nước** của một người, tức xác suất "người này sẽ đi nước nào ở thế cờ này". Nó **không**
  sao chép khả năng tính toán sâu của họ.
- **Kỳ thủ:**
  - Lê Quang Liêm: ý nghĩa với người Việt;
  - Magnus Carlsen: số 1 thế giới;
  - Hikaru Nakamura: có kho ván online lớn nhất.
- Ban đầu chọn Daniil Dubov, sau đổi sang Nakamura vì Dubov không có tài khoản Lichess công khai đủ ván.

### 4.2 D1 — Thu thập dữ liệu (`ml/style/collect.py`)

**Nguồn dữ liệu:**

| Nguồn | Cách lấy |
| --- | --- |
| Chess.com | Published-Data API |
| Lichess | API `/api/games/user` |
| Lichess Broadcasts | Ván giải đấu trực tiếp, 2020–2026, có tag FIDE ID |

**Danh sách tài khoản** ghi trong `ml/config/players.yaml`, chỉ dùng tài khoản đã được công khai thừa nhận.

**Nhận diện đúng người:**
- Ưu tiên **FIDE ID**.
- Không có FIDE ID thì so tập tên đã bỏ dấu và bỏ danh hiệu, ví dụ "Le, Quang Liem" ≡ "Lê Quang Liêm".

**Làm sạch:**
- Loại cờ 960 và các biến thể.
- Giữ cả ván bị cắt cụt (dùng phần còn đọc được).
- Khử trùng lặp theo (người, màu quân, hash dãy nước đi).

| Kỳ thủ | Số ván | Chess.com | Lichess | Broadcast | Năm |
| --- | ---: | ---: | ---: | ---: | --- |
| Lê Quang Liêm | 6.863 | 3.693 | 2.757 | 413 | 2013–2026 |
| Magnus Carlsen | 22.218 | 9.639 | 11.595 | 984 | 2014–2026 |
| Hikaru Nakamura | 68.937 | 68.344 | 0 | 593 | 2014–2026 |

Phần lớn là **blitz online**: cờ chậm (rapid và classical) chiếm dưới 10% ở cả ba người.

### 4.3 D2 — Chia tập chống rò rỉ (`ml/style/split.py`)

- **Chia theo ván và theo thời gian, cho từng người:**
  - test = 10% ván **mới nhất**;
  - val = 5% ván ngay trước đó;
  - train = phần còn lại.

  Như vậy mô hình bị đánh giá trên "tương lai", giống cách dùng thật.
- **Chống rò rỉ chéo:** một ván Carlsen gặp Nakamura có thể nằm trong test của Nakamura nhưng lại ở train của
  Carlsen. Vì vậy mọi ván thuộc val/test của **bất kỳ ai** đều bị bỏ khỏi train của **mọi người**. Carlsen mất 36 ván
  vì quy tắc này.
- Bỏ bullet và cờ thư, như M2.

| Kỳ thủ | Train (ván / vị trí) | Val (ván) | Test (ván) | Test bắt đầu từ |
| --- | --- | ---: | ---: | --- |
| Liêm | 3.967 / 157k | 234 | 467 | 05/2026 |
| Carlsen | 7.385 / 301k | 436 | 873 | 01/2026 |
| Nakamura | 40.831 / 1,61M | 2.402 | 4.804 | 08/2025 |

Lượng dữ liệu lệch nhau **~10 lần**, và đây là yếu tố chi phối toàn bộ câu chuyện thực nghiệm bên dưới.

### 4.4 D3 — Fine-tune từ M2 nền

- Khởi tạo từ checkpoint M2 v2. **Đóng băng** stem, bộ mã hóa Elo và 4 khối residual đầu, còn 5,82M tham số được học.
- BatchNorm của phần đóng băng giữ chế độ eval, để thống kê không bị trôi theo dữ liệu nhỏ.
- **Đo mô hình nền ở bước 0** trên val của người đó, và dừng sớm tính cả mốc này. Nếu fine-tune không giúp gì thì
  nó dừng ngay, không bao giờ trả về mô hình tệ hơn nền.
- Khi phục vụ, Elo được đặt bằng trung vị Elo của chính kỳ thủ trong dữ liệu train: Liêm 2845, Carlsen 3200,
  Nakamura 3185.

### 4.5 D4 — Phương pháp đánh giá (`ml/style/evaluate.py`)

- **Ma trận chéo:** mỗi mô hình X chấm tập test của mỗi người Y.
  - Đường chéo, tức mô hình của chính Y, phải tốt nhất trong hàng.
  - Cột đối chứng: M2 nền, mô hình "GM chung", và Stockfish depth 12 (500 vị trí mỗi người).
- **Khoảng tin cậy 95% bằng bootstrap theo ván:**
  - lấy mẫu lại **các ván** (không phải các nước) 1.000 lần;
  - tính chênh top-1 giữa mô hình của chính người đó và mô hình kia;
  - lấy phân vị 2,5% và 97,5%.

  Lấy mẫu theo ván vì các nước trong một ván không độc lập. Lấy mẫu theo nước sẽ cho khoảng tin cậy hẹp sai.
- **Nhận diện kỳ thủ:**
  - bốc k ván (k = 1, 5, 10) của một người, cộng log-likelihood dưới từng mô hình, đoán là người có tổng cao nhất;
  - lặp 2.000 lần, báo độ chính xác trung bình theo người (macro), để Nakamura nhiều ván không quyết định con số chung.
- **Hiệu chỉnh độ lệch:** mô hình nhiều dữ liệu "tự tin" hơn trên mọi ván, nên bộ nhận diện thô gán gần hết ván cho
  Nakamura. Cách sửa là trừ đi `bias(M) × số nước`, trong đó bias(M) là log-likelihood trung bình mỗi nước của mô
  hình M đo trên tập **val**. Bias được đo trên val chứ không phải test, nên không rò rỉ.

### 4.6 Bốn vòng thí nghiệm — câu chuyện nên kể

**Vòng 1 — fine-tune một tầng (M2 nền → từng người).** Top-1 trên test (%):

| Ván của \ Mô hình | M2 nền | Liêm | Carlsen | Nakamura | Stockfish |
| --- | ---: | ---: | ---: | ---: | ---: |
| Liêm | 33,37 | 38,59 | 38,76 | **40,17** | 49,6 |
| Carlsen | 33,50 | 38,31 | 40,38 | **40,71** | 52,6 |
| Nakamura | 32,67 | 36,89 | 38,06 | **41,65** | 47,2 |

- Mọi mô hình vượt M2 nền 5–9 điểm, có ý nghĩa thống kê.
- **Nhưng mô hình Nakamura thắng ở mọi hàng.** Giả thuyết: không phải do phong cách, mà do Nakamura có gấp 10 lần
  dữ liệu, nên giỏi "blitz kiện tướng nói chung" hơn.

**Vòng 2 — hai tầng (M2 nền → "GM chung" gộp 3 người → từng người).** Ý tưởng là phần chung học ở tầng giữa, tầng
cuối chỉ còn học phần riêng.

- GM chung đạt 40–41%.
- Tầng cuối của Liêm và Carlsen gần như không thêm gì (+0,05 điểm, không ý nghĩa), và dừng sớm ở bước 600 và 1.200.
- Nakamura thêm +1,76 điểm.

**Vòng 3 — cùng 157k vị trí mỗi người, xuất phát từ GM chung.** Vòng này **lộ ra sai sót thiết kế:**

- GM chung được dựng từ tối đa 300k vị trí mỗi người, nên **đã chứa toàn bộ train của Liêm và gần hết của Carlsen**,
  nhưng chỉ 19% của Nakamura.
- Tầng cuối của Liêm và Carlsen vì thế chỉ học lại ván đã thấy.
- Điều này giải thích luôn vòng 2: "Liêm ≈ GM chung" là hệ quả của thiết kế, không phải bằng chứng là không có
  phong cách.

**Vòng 4 — đối chứng sạch: từ M2 nền, cùng 157k vị trí mỗi người, cùng siêu tham số với vòng 1.**

| Ván của \ Mô hình | M2 nền | Liêm | Carlsen | Nakamura |
| --- | ---: | ---: | ---: | ---: |
| Liêm | 33,37 | **38,57** | 38,13 | 37,70 |
| Carlsen | 33,50 | 38,46 | **39,54** | 38,29 |
| Nakamura | 32,67 | 36,95 | 37,49 | **38,40** |

Chênh lệch giữa mô hình của chính người đó và mô hình người khác (khoảng tin cậy 95%):

| Kỳ thủ | So với người thứ nhất | So với người thứ hai |
| --- | --- | --- |
| Liêm | Carlsen +0,44 [+0,03; +0,86] | Nakamura +0,88 [+0,43; +1,30] |
| Carlsen | Liêm +1,08 [+0,69; +1,48] | Nakamura +1,25 [+0,88; +1,64] |
| Nakamura | Liêm +1,45 [+1,28; +1,62] | Carlsen +0,90 [+0,74; +1,07] |

- **Cả 6 khoảng tin cậy đều nằm trọn bên phải 0.** Đây là kết luận chính: đo được phong cách cá nhân.
- **Nhận diện từ 10 ván: 78,9%** (đã hiệu chỉnh; thô là 77,1%): Liêm 72,8%, Carlsen 79,6%, Nakamura 84,2%.
- **Kiểm tra độ lặp lại:** Liêm ở vòng 4 có cùng dữ liệu và cấu hình với vòng 1, cho 38,57% so với 38,59%.
- Carlsen giảm từ 40,38 xuống 39,54, Nakamura từ 41,65 xuống 38,40 khi bị cắt dữ liệu. Đó đúng là phần mà lượng
  dữ liệu đóng góp.

**Nhận diện kỳ thủ (đã hiệu chỉnh, macro):**

| Số ván | Vòng 1 | Vòng 2 | Vòng 4 |
| --- | ---: | ---: | ---: |
| 1 | 51,6% | 49,1% | 48,8% |
| 5 | 71,5% | 67,3% | 67,5% |
| 10 | 82,8% | 77,5% | 78,9% |

### 4.7 Kết luận khoa học của giai đoạn D

1. Fine-tune từ mô hình người chung **tách được phong cách cá nhân** của kiện tướng. Chênh lệch nhỏ (~1 điểm top-1)
   nhưng có ý nghĩa thống kê, và đủ để nhận ra người chơi từ 10 ván với ~79%.
2. Phần lớn những gì mô hình học vẫn là "cờ kiện tướng nói chung" (+5–6 điểm so với M2 nền). Phần riêng mỗi người
   nhỏ, đúng như kỳ vọng ở trình độ 2800: người rất mạnh thường đồng ý với nhau.
3. **Khi so sánh mô hình cá nhân, phải cân bằng lượng dữ liệu.** Nếu không, lợi thế dữ liệu (tới +3 điểm) át phần
   phong cách. Đây là bài học phương pháp.
4. **Top-1 không đủ để đo "giống người".** Stockfish trùng nước kiện tướng 47–53%, cao hơn mọi mô hình, vì ở 2800+
   nước người chơi thường là nước tốt nhất. NLL và nhận diện kỳ thủ mới phản ánh phong cách.

### 4.8 D5–D7 — Đưa vào sản phẩm

**Mô hình chọn để phục vụ: vòng 2**, vì có top-1 cao nhất trên chính người đó (40,3 / 41,5 / 42,1%). Với bot đấu,
"đi giống kiện tướng" quan trọng hơn "khác biệt giữa các kiện tướng". Vòng 4 là bằng chứng khoa học. Đổi sang vòng 4
chỉ cần một lệnh xuất.

**Sổ khai cuộc từ ván thật:**
- Gồm 12 nửa nước đầu, những thế cờ người đó gặp ≥ 3 lần: Liêm 1.520, Carlsen 2.554, Nakamura 9.253 thế cờ.
- Lý do: mô hình không học 10 nửa nước đầu, nên ở khai cuộc dùng repertoire thật của họ.

**Bot rút nước theo xác suất** trong top-10, không luôn đi nước đầu: nếu không, bot đi máy móc và lặp lại.

**Các tính năng trên web:**

| Tính năng | Dùng gì |
| --- | --- |
| Đấu với kiện tướng (`/play`) | Sổ khai cuộc → mô hình phong cách, lấy mẫu |
| Tab "Kiện tướng" | Top-3 mỗi người + điểm Stockfish từng nước |
| Bảng "Góc nhìn phân tích" | Lời bình kiểu người thầy cho từng nước: đánh giá Stockfish, vì sao (đọc từ luật cờ), góc nhìn phong cách, gợi ý, nguyên tắc rút ra |
| Báo cáo theo góc nhìn kiện tướng | % nước trùng lựa chọn số 1, "khoảnh khắc nên học" (rời lựa chọn kiện tướng và Stockfish cũng chê), nước "rất chất" kiện tướng |
| Trùng lựa chọn của kiện tướng | % top-1 / top-3 mỗi bên với từng kiện tướng |
| Đoán nước kiện tướng (`/gm-puzzles`) | 450 thế cờ từ **ván test** (mô hình chưa thấy), có Stockfish xác nhận |

**Bộ lọc puzzle:**

| Điều kiện | Ngưỡng |
| --- | --- |
| Nước kiện tướng không phải sai lầm | Mất ≤ 50 cp so với nước tốt nhất |
| Thế cờ thật sự có lựa chọn | Nước tốt thứ hai cách nước tốt nhất ≤ 80 cp |
| Ván chưa ngã ngũ | Điểm trong khoảng ±3, không có chiếu hết |

- Giữ lại ~52% số thế cờ đã thử.
- 52% lời giải **khác** nước số 1 của Stockfish, tức là thực sự đo phong cách.

**D7 — ghi nhãn trung thực:**
- Mọi chỗ ghi "Mô phỏng phong cách dựa trên N ván công khai… Đây không phải chính kỳ thủ".
- Không dùng ảnh hay thương hiệu cá nhân.
- Lời bình viết ở **ngôi thứ ba** ("Carlsen hay chọn…"), không giả lời kỳ thủ nói.

### 4.9 Tái lập giai đoạn D (lệnh, chạy trong `ml/`)

```powershell
python scripts/collect_player_games.py chesscom|lichess|broadcast ...   # D1 tải
python scripts/collect_player_games.py build --report-dir ../docs/thesis/style/d1-data
python scripts/prepare_style_data.py --report-dir ../docs/thesis/style/d2-split   # D2
python -m m2.train --config config/style-liem.yaml          # vòng 1 (tương tự carlsen, hikaru)
python scripts/prepare_style_data.py --pool-only            # vòng 2
python -m m2.train --config config/style-pool.yaml
python -m m2.train --config config/style2-liem.yaml         # ...
python scripts/prepare_style_data.py --equal-only           # vòng 3–4: cùng 157k vị trí
python -m m2.train --config config/style4-liem.yaml         # ...
python scripts/evaluate_style.py --prefix style4 --no-stockfish --out-dir ../docs/thesis/style/d4-eval-v4
python scripts/export_style_models.py --prefix style2 --eval ../docs/thesis/style/d4-eval-v2/evaluation.json
python scripts/export_style_puzzles.py --count 150
```

Mỗi lần fine-tune mất 2–6 phút trên RTX 5060 Ti; mô hình GM chung mất ~5 phút.

---

## 5. Kiến trúc hệ thống — ML nằm ở đâu

```text
┌──────────── Python (ml/) — offline ─────────────┐        ┌──────── Backend Spring Boot ───────┐
│ Lichess DB / Chess.com / Broadcasts             │        │ Stockfish pool (UCI)               │
│   → lọc, chia tập (Parquet)                     │ ONNX   │ ONNX Runtime Java:                 │
│   → train PyTorch (M2, fine-tune phong cách)    │ ─────► │   HumanMoveModel (M2)              │
│   → đánh giá (docs/thesis)                      │ + meta │   StyleModelRegistry (3 kỳ thủ)    │
│   → export ONNX + sổ khai cuộc + puzzle         │ + book │ REST /api/human-moves, /api/styles │
└─────────────────────────────────────────────────┘        └───────────────┬────────────────────┘
                                                                           │ JSON
                                              ┌────────────────────────────▼───────────────────┐
                                              │ Frontend Next.js: phân tích, báo cáo, đấu bot, │
                                              │ puzzle; Stockfish WASM chạy ngay trong trình   │
                                              │ duyệt cho phân tích tương tác                  │
                                              └────────────────────────────────────────────────┘
```

**Vì sao ONNX trong Java, không dựng server Python riêng?**

- Một tiến trình, ít thành phần hơn.
- Suy luận trên CPU đủ nhanh: mô hình 7M tham số, vài chục ms mỗi thế cờ.
- Bảng nước đi trong `meta.json` cùng bộ test đối chiếu bảo đảm Java và Python cho kết quả giống nhau.

**Mã nguồn nên mở khi demo:**

| Nội dung | File |
| --- | --- |
| Kiến trúc FiLM | `ml/m2/model.py` |
| Mã hóa | `ml/m2/encoding.py` |
| Fine-tune | `ml/m2/train.py` (`init_from`, `freeze_blocks`) |
| Chia tập chống rò rỉ | `ml/style/split.py` |
| Đánh giá D4 | `ml/style/evaluate.py` (bootstrap, nhận diện kỳ thủ) |
| Phục vụ | `backend/.../humanmove/HumanMoveModel.java`, `humanmove/style/StyleMoveService.java` |
| Lời bình | `frontend/lib/coach.ts` |

---

## 6. Hạn chế và hướng phát triển (chủ động nói)

### Hạn chế

**M2:**
- Còn quá khớp: 7M tham số so với 1,7M vị trí.
- Yếu ở dải ≥ 2200 so với engine.
- Ước lượng Elo sai số lớn (MAE 428 với 80 nước).

**Phong cách:**
- Dữ liệu chủ yếu là blitz online, nên phong cách blitz có thể khác cờ tiêu chuẩn.
- Không chắc 100% chính kỳ thủ chơi trên tài khoản online, dù đã dùng tài khoản được thừa nhận công khai.
- Test là ván mới nhất, nên phong cách thay đổi theo năm cũng gây sai số.

**Phương pháp:** sai sót thiết kế ở vòng 3, khi dữ liệu GM chung trùng với train cá nhân. Đã phát hiện, giải thích
và thay bằng vòng 4.

**Lời bình:** phần "vì sao" dựa trên mẫu cờ một nước, không tính biến. Ý đồ sâu vẫn dựa vào Stockfish.

### Hướng phát triển

- **M2 v3:** ~1 triệu vị trí mỗi dải, có thể thêm mạng lớn hơn (15×192) khi đã đủ dữ liệu.
- **Một mô hình chung có embedding kỳ thủ** đưa vào FiLM cạnh Elo: dùng chung tri thức, nên ít dữ liệu vẫn học được
  phần riêng.
- **Điều kiện hóa theo nhịp độ** (blitz / rapid / classical).
- **Hiệu chỉnh ngưỡng** của các tính năng (bẫy, lỗi hệ thống) bằng dữ liệu người dùng thật.

---

## 7. Câu hỏi hội đồng hay hỏi — gợi ý trả lời

**H1. Mô hình của em khác gì Maia?**
Maia dùng 9 mạng rời rạc cho 9 dải 1100–1900. M2 là 1 mạng, nhận Elo làm đầu vào liên tục qua FiLM, nên hỏi được
ở mức bất kỳ và phủ tới 2600+. Em cũng mở rộng sang phong cách cá nhân của kiện tướng, kèm thí nghiệm đối chứng.

**H2. Top-1 39,5% có thấp không? Maia được ~50%.**
- Không so trực tiếp được: khác dữ liệu (Maia dùng hàng trăm triệu vị trí) và khác phạm vi (Maia không có dải 2200+,
  vốn là dải khó nhất, riêng dải 2600+ của M2 chỉ 33,7%).
- Với bài toán này, mốc so sánh đúng là các baseline: đoán đều 5,75%, Stockfish 39,07%. Ở các dải dưới 2000, M2 hơn
  Stockfish 2–11,5 điểm.

**H3. Elo chỉ góp +0,46 điểm top-1, vậy điều kiện hóa Elo có tác dụng không?**
- Có, nhưng top-1 không đủ nhạy để thấy: chênh lệch giữa các cột nhỏ hơn sai số.
- Theo NLL, cách đo xét cả phân phối, đường chéo thắng 6/10 dải và mỗi hàng có dạng đồi quanh Elo thật.
- Bằng chứng ứng dụng là ước lượng Elo hoạt động được.

**H4. Vì sao chia theo ván mà không chia ngẫu nhiên theo nước?**
Các vị trí trong một ván tương quan mạnh. Chia theo nước sẽ để mô hình thấy gần như cùng một thế cờ ở cả train lẫn
test, làm kết quả bị thổi phồng. Với kiện tướng, em còn chia theo **thời gian** và loại ván chung giữa các người
khỏi train.

**H5. FiLM là gì, vì sao chọn?**
- FiLM (Feature-wise Linear Modulation) nhân và cộng từng kênh đặc trưng với (γ, β) sinh ra từ biến điều kiện,
  ở đây là Elo.
- Chọn vì rẻ (chỉ một Linear mỗi khối), tác động lên đặc trưng đã trích xuất chứ không làm méo đầu vào, và cho phép
  nội suy liên tục.
- Khởi tạo bằng 0 để ban đầu mạng là ResNet thường.

**H6. Vì sao xoay bàn cờ? Vì sao 1858 nước?**
- Xoay để mạng chỉ học một góc nhìn "tôi / đối thủ", cần ít dữ liệu hơn một nửa.
- 1858 là không gian nước đi của Leela/Maia: đủ mọi nước hợp lệ, và giúp so sánh được với Maia.

**H7. Làm sao biết mô hình phong cách học được phong cách chứ không phải chỉ học "chơi giỏi hơn"?**
Đây là câu hỏi trung tâm của chương D. Em có 3 bằng chứng:
1. Ma trận chéo: mô hình của chính người đó phải thắng mô hình của **người khác cùng trình độ**, chứ không chỉ thắng
   M2 nền.
2. Thí nghiệm **cùng lượng dữ liệu** (vòng 4), để loại yếu tố "nhiều dữ liệu hơn". Ở đó cả 6 so sánh đều thắng có
   ý nghĩa.
3. Nhận diện kỳ thủ từ 10 ván đạt 78,9% so với 33% ngẫu nhiên.

**H8. Chênh lệch chỉ ~1 điểm, có đáng kể không?**
- Có ý nghĩa thống kê: khoảng tin cậy 95% bootstrap theo ván không chứa 0.
- Về thực tế: cộng dồn qua nhiều nước thì đủ để nhận ra người chơi (~79% từ 10 ván).
- Chênh lệch nhỏ là hợp lý: các kiện tướng 2800 đồng ý với nhau ở phần lớn thế cờ; khác biệt nằm ở những thế có
  nhiều nước ngang nhau.

**H9. Bootstrap theo ván là gì, vì sao không dùng kiểm định t?**
Lấy mẫu lại các ván (có hoàn lại) 1.000 lần, tính chênh lệch mỗi lần, lấy phân vị 2,5–97,5%. Theo ván vì các nước
trong một ván không độc lập: kiểm định trên từng nước sẽ coi ~30 nước một ván là 30 quan sát độc lập, nên cho khoảng
tin cậy hẹp sai. Bootstrap không cần giả định phân phối chuẩn.

**H10. Vì sao phải "hiệu chỉnh" khi nhận diện kỳ thủ?**
Mô hình nhiều dữ liệu (Nakamura) gán xác suất cao hơn cho **mọi** nước của **mọi** người. Bộ nhận diện thô vì thế
gán ~100% ván cho Nakamura. Em trừ độ lệch trung bình mỗi nước của từng mô hình, đo trên tập **val** (không đụng test)
nên không rò rỉ.

**H11. Em có tự nói về một sai sót trong thí nghiệm, đó là gì?**
- Ở vòng 3, dữ liệu "GM chung" đã chứa toàn bộ train của Liêm và gần hết của Carlsen, nên tầng fine-tune cuối của họ
  chỉ học lại ván cũ, còn Nakamura được thêm ván mới.
- Em phát hiện vì loss của Liêm và Carlsen không giảm nhưng Nakamura vẫn giảm, dù cùng lượng dữ liệu.
- Em sửa bằng vòng 4, xuất phát từ M2 nền. Ghi lại vì nó giải thích kết quả vòng 2, và cho thấy cách kiểm tra giả thuyết.

**H12. Vì sao web dùng vòng 2 mà kết luận lại dựa trên vòng 4?**
- Hai mục tiêu khác nhau. Vòng 4 là **thí nghiệm** để trả lời "có phong cách không" (phải cân bằng dữ liệu).
- Bot và lời bình cần **dự đoán đúng nhất** nước kiện tướng, và vòng 2 dùng toàn bộ dữ liệu nên chính xác hơn
  (40–42% so với 38–40%).

**H13. Stockfish trùng nước kiện tướng 47–53%, cao hơn mô hình. Vậy mô hình có ích gì?**
- Ở 2800+, nước người chơi thường chính là nước tốt nhất, nên engine trùng nhiều.
- Nhưng engine **không phân biệt được** Carlsen với Nakamura, và không mô phỏng được người 1200. Mô hình làm được
  cả hai.
- Với người học, giá trị nằm ở: nước này có tự nhiên với người chơi không, ai hay chọn nước này, bẫy ở đâu.

**H14. Dữ liệu có hợp pháp / đạo đức không?**
- Lichess database và Broadcasts là CC0. Chess.com Published-Data là API công khai. Chỉ dùng tài khoản được kỳ thủ
  thừa nhận công khai.
- Sản phẩm ghi rõ là mô phỏng, không dùng ảnh hay thương hiệu, lời bình không giả lời kỳ thủ (D7).

**H15. Bot kiện tướng có mạnh như kiện tướng thật không?**
Không. Mô hình chọn nước theo xác suất, không tìm kiếm trước, nên không tính toán như người chơi thật. Nó mô phỏng
**lựa chọn** (khai cuộc, kiểu nước ưa thích), không mô phỏng **sức mạnh**. Đây là giới hạn đã nêu từ đầu.

**H16. Ước lượng Elo hoạt động thế nào? Sai số 428 có quá lớn?**
- Hoạt động theo Bayes trên lưới Elo, với tiên nghiệm Gauss (mục 3.7).
- 428 với 80 nước là lớn. Vì vậy giao diện hiện ± và ghi "không phải rating chính thức".
- Hồ sơ người dùng cộng nhiều ván nên chính xác dần. Cải thiện chính là mô hình mạnh hơn (v3).

**H17. Vì sao fine-tune mà không train từ đầu cho từng kỳ thủ?**
157k vị trí (Liêm) là quá ít để học cờ từ đầu. Fine-tune tận dụng tri thức chung về cờ của M2. Đóng băng các khối
đầu (đặc trưng thấp như hình quân, đường tấn công) giúp chống quá khớp, và chỉ học lại các khối sau (đặc trưng chiến
lược và lựa chọn).

**H18. Làm sao bảo đảm Java và Python cho cùng kết quả?**
Có ba lớp kiểm tra:
1. Bảng nước đi lưu trong `meta.json`.
2. Bước xuất ONNX đối chiếu với PyTorch (lệch ~1e-5).
3. Test Java đối chiếu vector mã hóa (69 thế cờ) và đầu ra mô hình (1e-4) với Python.

**H19. Lời bình "như người thầy" có phải do AI ngôn ngữ (LLM) viết không?**
- Không. Lời bình dựng từ số liệu có kiểm chứng: nhãn Stockfish, xác suất của mô hình phong cách, sổ khai cuộc, và
  đặc điểm đọc trực tiếp từ luật cờ (phát triển quân, quân bị treo, Hậu ra sớm…).
- Nhờ vậy không có câu "bịa". Đổi lại, lời bình chưa giải thích được ý đồ nhiều nước.

**H20. Nếu có thêm thời gian em làm gì?**
M2 v3 nhiều dữ liệu hơn; một mô hình chung có embedding kỳ thủ; điều kiện hóa theo nhịp độ; thêm kỳ thủ có nhiều
ván cờ chậm (mục 6).

---

## 8. Thuật ngữ

| Thuật ngữ | Giải thích ngắn |
| --- | --- |
| Policy (chính sách) | Phân phối xác suất trên các nước đi |
| Top-k accuracy | Nước thật nằm trong k nước xác suất cao nhất |
| NLL / log-likelihood | Mức "ngạc nhiên" của mô hình với nước thật; thấp là tốt |
| FiLM | Điều biến từng kênh đặc trưng bằng (γ, β) sinh từ biến điều kiện |
| Residual block (ResNet) | Khối cộng đầu vào vào đầu ra, giúp huấn luyện mạng sâu |
| Fine-tune / đóng băng | Huấn luyện tiếp từ mô hình có sẵn; giữ nguyên trọng số một số lớp |
| Early stopping | Dừng khi chỉ số val không cải thiện sau N lần đánh giá |
| Label smoothing | Làm mềm nhãn để giảm quá tự tin |
| AMP | Huấn luyện độ chính xác hỗn hợp (fp16/fp32), nhanh hơn, ít VRAM hơn |
| Bootstrap | Ước lượng khoảng tin cậy bằng lấy mẫu lại có hoàn lại |
| Rò rỉ dữ liệu (leakage) | Thông tin tập test lọt vào train, làm kết quả ảo |
| ONNX | Định dạng mô hình trung lập, chạy được ngoài Python |
| cp (centipawn) | 1/100 tốt; đơn vị điểm của engine |
| Macro accuracy | Trung bình độ chính xác của từng lớp, không để lớp đông chi phối |

---

## 9. Số liệu cần thuộc (thẻ nhớ)

| | Số |
| --- | --- |
| M2: dữ liệu | 121.933 ván, 1,71M vị trí train, 10 dải Elo, ~200k vị trí mỗi dải |
| M2: mô hình | ResNet 10×128 + FiLM, 7,09M tham số, 20 mặt phẳng, 1858 nước |
| M2: kết quả | Top-1 39,5%, top-3 67,2%; Stockfish 39,1%; dưới 1000: M2 38,9% vs Stockfish 27,3% |
| M2: Elo | NLL đường chéo 6/10, lệch TB 0,4 dải; MAE ước lượng 428 (80 nước) |
| D: dữ liệu | Liêm 6.863 / Carlsen 22.218 / Nakamura 68.937 ván; train 157k / 301k / 1,61M vị trí |
| D: vòng 1 | +5…+9 điểm so với M2 nền; Nakamura thắng mọi hàng (do dữ liệu) |
| D: vòng 4 | Đường chéo 38,57 / 39,54 / 38,40; 6/6 so sánh có ý nghĩa (+0,44…+1,45) |
| D: nhận diện | 10 ván: 78,9% (ngẫu nhiên 33%) |
| D: Stockfish | Trùng nước kiện tướng 47–53% |
| Sản phẩm | 3 mô hình × 28,6 MB ONNX; sổ khai cuộc 1.520 / 2.554 / 9.253 thế cờ; 450 puzzle kiện tướng |

## 10. Tài liệu tham khảo

- McIlroy-Young, R., Sen, S., Kleinberg, J., Anderson, A. (2020). *Aligning Superhuman AI with Human Behavior:
  Chess as a Model System.* KDD.
- McIlroy-Young, R., Wang, R., Sen, S., Kleinberg, J., Anderson, A. (2022). *Learning Models of Individual
  Behavior in Chess.* KDD.
- Perez, E., Strub, F., de Vries, H., Dumoulin, V., Courville, A. (2018). *FiLM: Visual Reasoning with a General
  Conditioning Layer.* AAAI.
- He, K., Zhang, X., Ren, S., Sun, J. (2016). *Deep Residual Learning for Image Recognition.* CVPR.
- Efron, B., Tibshirani, R. (1993). *An Introduction to the Bootstrap.* Chapman & Hall.
- Lichess open database — https://database.lichess.org/ (CC0).
