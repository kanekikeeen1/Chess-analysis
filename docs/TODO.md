# TODO — Lộ trình hoàn thiện Chess Analysis & Training

Làm **lần lượt từ trên xuống**: mỗi giai đoạn tạo nền cho giai đoạn sau. Mỗi mục có
**Xong khi** — chỉ đánh dấu `[x]` khi tiêu chí đó đạt.

Phạm vi: dự án là đồ án, **không đưa lên production**, nên CI/CD, DevOps, rate limit
và các bug nhỏ đã được bỏ khỏi lộ trình (xem cuối file).

---

## ✅ Đã xong

- [x] Chặn chèn lệnh UCI qua FEN (`FenRules`, `@ValidFen`), sửa `mate 0`, Docker non-root, Maven Wrapper.
- [x] Accuracy toàn ván kiểu Lichess; Theory phải được engine xác nhận; ngưỡng nhãn chỉ theo win% (5/10/15).
- [x] Depth theo giai đoạn ván (before/after cùng depth); job tự xếp hàng lại khi khởi động; poll `?from=k`.
- [x] Chuyển vinext → Next.js 16; dọn template; tách `analysis/page.tsx` (2.594 → 1.153 dòng).
- [x] Engine trình duyệt dùng WASM (nhanh hơn asm.js ~5,5 lần), tự lùi về asm.js khi lỗi.

---

## Giai đoạn A — Sửa phần luyện tập hiện có · ~2–3 ngày

> Làm trước vì các bài tàn cuộc đang có lỗi người dùng thấy được, và phần Training mới
> sẽ dùng lại cùng bàn cờ/luồng chấm nước.

- [x] **A1 Migration V12: sửa dữ liệu bài tàn cuộc** — `EndgameSeedDataTest` quét toàn bộ seed và tìm ra
  **5** FEN bất hợp lệ (không phải 2), thêm 1 thế song tượng cùng màu ô (không thể chiếu hết).
- [x] **A2 Bài tàn cuộc chạy trên server** (`exercise_sessions`, V13)
  - Server kiểm tra nước, chấm Stockfish, đi nước đáp, kiểm tra mục tiêu **sau nước đáp**, tự tính điểm.
  - Thay 3 thế "tượng sai màu" bằng pháo đài thật; 3 thế Philidor đúng cấu trúc.
  - Đã xóa `POST /attempts` (client tự nộp điểm) và `POST /analysis/evaluate-move` (tin cờ `checkmate` của client).
- [x] **A3 Backend tự dựng lại ván** bằng `chesslib` (`GameReplayService`): áp dụng cho `/jobs` và `/classify`;
  thí quân port sang Java (`MoveFacts`); lưu ván lấy accuracy từ job và chỉ chấp nhận job của chính người dùng.
  *Còn lại: ván phân tích tay (không có job) vẫn lưu accuracy client nhận từ `/classify`.*

## Giai đoạn B — Training cốt lõi · ~7–9 ngày

- [ ] **B1 Ngân hàng puzzle**: import Lichess Puzzle DB (CC0) — FEN, lời giải, rating, themes; bảng `puzzles`, `puzzle_themes` (V14).
  *Code xong (`puzzle/importer`, lọc chất lượng + lấy mẫu cân bằng theo rating + kiểm tra luật cờ). Còn: chạy import thật.*
- [x] **B1** Đã import 44.581 puzzle (12 dải rating), báo cáo ở `ml/data/puzzles/*.import-report.json`.
- [ ] **B2 Rating Glicko-2** cho người học; chọn puzzle gần rating người học.
  *Code xong (`puzzle/rating/Glicko2`, V16, `/api/puzzles/next|rating/me|themes`). Rating puzzle giữ nguyên
  giá trị Lichess (đã ổn định qua hàng trăm lượt chơi), chỉ rating người học được cập nhật. Còn: kiểm tra API thật.*
- [ ] **B3 Bàn giải puzzle**: kiểm tra từng nước theo lời giải (chấp nhận nước chiếu hết thay thế), gợi ý, hiển thị theme.
  *Code xong: phiên giải phía server (V17 `puzzle_sessions`), trang `/puzzles` (chọn theme, phong cấp, xem lời giải,
  rating ±). Lần đầu gặp puzzle mới tính rating. Còn: chạy thử trên trình duyệt.*
- [ ] **B4 "Học từ sai lầm"**: sinh puzzle từ `analyzed_moves` nhãn mistake/blunder (thế trước nước sai, lời giải = PV1).
  *Code xong: `/api/mistakes/*`, trang `/mistakes`, V18 (`mistake_reviews` + sửa `side_to_move` sai với ván bắt đầu
  từ FEN Đen đi). Đáp án đúng = PV1, PV2 kém ≤ 30 cp, hoặc nước Stockfish xếp best/excellent. Còn: chạy thử.*
- [ ] **B5 SRS** (SM-2 hoặc FSRS): lịch ôn lại thế cờ đã sai; trang "Ôn tập hôm nay".
  *Code xong: SM-2 (`review/Sm2`, có test theo đúng công thức gốc), V19 `review_cards`, `/api/reviews/summary`,
  trang `/review`. Thẻ tự sinh khi giải sai puzzle hoặc trả lời sai ở B4; ôn mở lại đúng trang `/puzzles`, `/mistakes`. Còn: chạy thử.*
- [ ] **B6 Opening drill tương tác**: người học tự đi dòng lý thuyết, sai thì chặn và giải thích.
- [ ] **B7 Dashboard học tập**: accuracy theo thời gian, lỗi theo giai đoạn (`phase`), theo theme, rating puzzle.
  Xong khi: người dùng có vòng lặp *chơi → phân tích → luyện đúng lỗi của mình → ôn lại*.

## Giai đoạn C — Mô hình "người ở Elo X sẽ đi nước nào" (M2) · ~6–8 ngày + thời gian GPU

> Pipeline đã có trong `ml/m2/` (mạng ResNet + FiLM điều kiện hóa Elo). Việc còn lại là mở
> rộng dải Elo lên mức kiện tướng, huấn luyện thật và đưa vào web.

- [x] **C1 Chốt các mức Elo hiển thị trên web** — đã áp dụng 10 dải trong `encoding.py`.
  Hiện tại `ELO_BUCKET_EDGES = (1100, 1300, 1500, 1700, 1900)` và dữ liệu bị cắt ở 2600.
  Đề xuất: **1000 · 1200 · 1400 · 1600 · 1800 · 2000 · 2200 · 2400 · 2600+ (kiện tướng)**.
  Bước 200 là mức người chơi cảm nhận được khác biệt; bước 1000 quá thô để luyện tập.
  Lưu ý: rating Lichess cao hơn FIDE ~200–300 điểm ở dải thấp, nên UI ghi rõ "Elo Lichess".
- [x] **C2 Dữ liệu cho cả dải cao** — 10 dải × 200k vị trí từ Lichess 09/2026 (34.531 ván).
  - Lichess DB: lấy nhiều tháng và **lấy mẫu cân bằng theo dải**, vì ván ≥ 2200 rất ít so với 1500.
  - Dải 2600+: thêm ván OTB của kiện tướng từ Lichess Broadcasts (CC0) và TWIC.
  - Thêm cờ `source` (online/OTB) và nhóm nhịp độ (blitz/rapid/classical) vào dữ liệu.
  - Sửa `encoding.py` (bucket mới), `data.py` (`max_elo`), test `test_encoding.py`.
  Xong khi: `dataset_card.json` có ≥ 200k vị trí cho **mỗi** dải.
  *Code xong: đọc thẳng URL Lichess (ổ C chỉ còn ~33 GB, không tải nổi file tháng ~30 GB), bỏ qua nước đi của ván
  bị loại ngay từ tiêu đề, `--per-bucket` để cân bằng 10 dải, config `m2-rtx5060ti.yaml`. Ván OTB và cờ `source`
  để sau khi xem dải 2600+ có đủ dữ liệu không. Còn: cài Python, chạy test, sinh dữ liệu thật.*
- [x] **C3 Huấn luyện và đánh giá M2 nền** — v2 (`m2-rtx5060ti-v2`): NLL thắng đường chéo 6/10,
  lệch TB 0,4 dải; M2 hơn Stockfish ở ≤1800, kém ở ≥2000. Báo cáo ở `docs/thesis/m2/m2-rtx5060ti-v2/`.
  Còn mở: v3 nhiều dữ liệu hơn để mạnh lên ở dải cao (cần cho D3).: smoke config → config GPU; báo cáo top-1/top-3 theo dải,
  ma trận nội suy Elo, so với baseline Stockfish top-1 và số liệu công bố của Maia.
  *Run 1 (`m2-rtx5060ti`): top-1 41,4%, top-3 69,1%; báo cáo ở `docs/thesis/m2/m2-rtx5060ti/`.
  Còn: quá khớp (ít ván, ~58 vị trí/ván) và Elo chỉ góp +0,27 điểm → giới hạn vị trí mỗi ván, đọc nhiều ván hơn,
  huấn luyện lại; thêm baseline Stockfish top-1.*
  Xong khi: Elo góp rõ rệt (ma trận nội suy thắng đường chéo ở đa số dải).
- [x] **C4 Xuất ONNX và phục vụ trong backend**: ONNX Runtime Java; port `encoding.py` sang Java và test
  khớp từng vector với Python; API `POST /api/human-moves {fen, elos[], topK}` → top-k nước và xác suất.
  *Xong: `humanmove/` (M2Encoding, HumanMoveModel, controller), `GET /api/human-moves/levels`;
  `M2EncodingTest` khớp Python trên 69 thế cờ, `HumanMoveModelReferenceTest` khớp ONNX Runtime Python tới 1e-4.
  Đang phục vụ mô hình v2 (bước 9000); khi có v3 chỉ cần xuất lại `ml/models/m2.onnx` rồi khởi động lại backend.*
- [ ] **C5 Đưa vào web**
  - Trang phân tích: chọn mức Elo → panel "Người Elo X thường đi", gồm top-3 nước + xác suất
    + đánh giá Stockfish của từng nước.
  - Báo cáo ván: ước lượng Elo của ván (`estimate_elo`) → lưu `user_playing_profiles`.
  - Training: **đấu với bot Elo X** (lấy mẫu từ policy theo xác suất, không luôn chọn top-1).
  Xong khi: chọn 1200 và 2200 trên cùng một thế cờ cho ra gợi ý khác nhau một cách hợp lý.
  *Code xong: panel "Người chơi thường đi" (chọn tối đa 3 dải, điểm Stockfish depth 12 qua `searchmoves`,
  bấm để đi thử); thẻ "Elo ước lượng của ván" (`POST /api/human-moves/estimate`); lưu ván kèm bên mình cầm →
  V20 lưu đường log-likelihood từng ván, hồ sơ = hậu nghiệm của tổng (`GET /api/profile/playing`, hiện ở Kho
  ván cờ); trang `/play` đấu bot (lấy mẫu trong top-10, có "Đi lại", chuyển ván sang trang phân tích).
  Vòng 2: cột phải trang phân tích chia 4 tab (Engine · Theo Elo · Báo cáo · Nạp ván); panel M2 thành bảng so sánh (hàng = nước, cột = mức Elo, `compare=true` trả cùng tập nước cho mọi mức), có câu tóm tắt, cảnh báo bẫy, nước thực sự đi trong ván; hỏi mô hình trước rồi Stockfish sau, cache theo FEN, chỉ gọi khi mở tab. Còn: chạy thử trên giao diện.*

## Giai đoạn D — Phong cách đại kiện tướng: Lê Quang Liêm, Magnus Carlsen, Hikaru Nakamura · ~8–12 ngày + GPU

> Ban đầu chọn Daniil Dubov, đổi sang Hikaru Nakamura (2026-11-01): Dubov không có tài khoản Lichess công khai
> (Lichess "Duhless" chỉ 9 ván, không danh hiệu). Nakamura có kho ván Chess.com lớn nhất trong ba người.

> **Mô hình học được gì và không học được gì**: mô hình học *cách chọn nước* của một người
> từ các ván họ đã chơi, tức xác suất "người này sẽ đi nước nào ở thế cờ này". Nó không
> sao chép khả năng tính toán của họ. Kỳ vọng thực tế: đoán trúng nước thật khoảng 45–55%
> (top-1), cao hơn mô hình chung vài điểm %. Đây là cách tiếp cận của nhóm Maia trong
> *Learning Models of Individual Behavior in Chess* (McIlroy-Young và cộng sự, KDD 2022).

- [ ] **D1 Thu thập dữ liệu từng người**
  - Ván OTB: Lichess Broadcasts, TWIC, PGN Mentor (theo tên kỳ thủ).
  - Ván online công khai: Lichess API, Chess.com Published-Data API (tài khoản công khai của từng người).
  - Khử trùng lặp, chuẩn hóa tên ("Le, Quang Liem" / "Lê Quang Liêm"), chỉ giữ nước của đúng người đó.
  - Thống kê số ván và vị trí theo người × nhịp độ; ghi vào `dataset_card.json`.
  Xong khi: mỗi người có ≥ 3.000 ván (lý tưởng ≥ 10.000). Người nào thiếu thì ghi rõ trong báo cáo.
  *Code xong: `ml/style/collect.py`, `ml/scripts/collect_player_games.py` (chesscom · lichess · broadcast · scan · build), `ml/config/players.yaml` (tài khoản đã kiểm tra qua API), 6 test. Còn: chạy tải thật và build.*
- [x] **D2 Chia tập chống rò rỉ**: chia **theo ván và theo thời gian** (test = các ván mới nhất), không chia theo nước.
  *`scripts/prepare_style_data.py`: test = 10% ván mới nhất, val = 5% trước đó; bỏ khỏi train mọi ván thuộc val/test của bất kỳ ai (Carlsen mất 36 ván gặp Nakamura). Bỏ bullet như M2. Train: Liêm 157k · Carlsen 301k · Nakamura 1,61M vị trí (`docs/thesis/style/d2-split`).*
- [ ] **D3 Fine-tune từ M2 nền** (mức 2600+)
  *Code xong: `m2/train.py` thêm `init_from` + `freeze_blocks` (BatchNorm phần đóng băng giữ eval) + đo M2 nền  ở bước 0; `config/style-{liem,carlsen,hikaru}.yaml` (nền v2, đóng băng 4/10 khối, lr 3e-4). Còn: chạy train.*
  - Phương án chính: 3 mô hình fine-tune riêng; đóng băng các khối đầu; learning rate nhỏ; early stopping trên tập validation của chính người đó.
  - Cải tiến (nếu còn thời gian): 1 mô hình chung có **embedding kỳ thủ** đưa vào FiLM cạnh Elo, dùng chung tri thức nên ít dữ liệu vẫn học được.
  - Điều kiện hóa theo nhịp độ, vì blitz online của một người khác hẳn ván cổ điển của họ.
  *Vòng 1 (`style-*.yaml`, nền v2): val top1 Liêm 34,6→39,6 · Carlsen 33,0→39,9 · Nakamura 31,9→40,9 (%). Đo thử D4 trên 2k dòng: đường chéo Liêm THUA mô hình Nakamura (dữ liệu gấp 10) → thêm phương án hai tầng nền → GM chung (`style-pool.yaml`, mỗi người ≤ 300k vị trí) → từng người (`style2-*.yaml`). Đã train xong cả hai vòng: GM chung val top1 40,4%; tầng cuối Liêm/Carlsen quá khớp ngay (dừng ở bước 600/1.200), Nakamura +1,8 điểm. Còn: vòng 3 đối chứng cùng 157k vị trí/người (`style3-*.yaml`).*
- [x] **D4 Đánh giá (chương thực nghiệm chính)**
  - Top-1/top-3 trên tập test của từng người, so với: M2 nền ở 2600+, Stockfish top-1, và mô hình của 2 người còn lại.
  - **Ma trận 3×3**: mô hình X dự đoán ván của Y — đường chéo phải trội hơn.
  - **Nhận diện phong cách**: từ 1 / 5 / 10 ván, đoán đúng ai là người chơi bao nhiêu %.
  Xong khi: mỗi mô hình vượt M2 nền trên ván của chính người đó, và đường chéo ma trận trội có ý nghĩa.
  *Code xong: `scripts/evaluate_style.py` — top1/top3/NLL mọi mô hình × test mọi người, cột GM chung, Stockfish top-1 (500 vị trí/người), khoảng tin cậy 95% bootstrap theo ván cho đường chéo, nhận diện kỳ thủ từ 1/5/10 ván (thô và hiệu chỉnh theo val), 2 hình. Đã chạy vòng 1 và 2 (`docs/thesis/style/d4-eval-v1`, `d4-eval-v2`, nhận xét ở `NOTES.md`): mọi mô hình vượt M2 nền +5…+9 điểm (có ý nghĩa); đường chéo chỉ trội có ý nghĩa ở Nakamura, Liêm/Carlsen ngang GM chung; nhận diện từ 10 ván 82,8% (vòng 1) / 77,5% (vòng 2). Vòng 3 (từ GM chung) lộ lỗi thiết kế: GM chung đã chứa sẵn train của Liêm/Carlsen. Vòng 4 (từ M2 nền, mỗi người 157k vị trí): **cả 6 so sánh đường chéo dương và có ý nghĩa** (+0,4…+1,5 điểm), nhận diện từ 10 ván 78,9%. Tiêu chí D4 đạt.*
- [ ] **D5 Phục vụ**: xuất ONNX từng mô hình (hoặc 1 mô hình + id kỳ thủ); API `POST /api/human-moves {fen, style: "carlsen"}`.
  *Code xong: `scripts/export_style_models.py` (ONNX + sổ khai cuộc 12 nửa nước đầu từ ván thật + `styles.json`), backend `humanmove/style` (`GET /api/styles`, `POST /api/styles/{id}/moves`: sổ trước, mô hình sau), 2 test. Đã xuất vòng 2 vào `ml/models/styles` (ONNX lệch ≤ 1,4e-5 so với PyTorch; sổ khai cuộc Liêm 1.520 · Carlsen 2.554 · Nakamura 9.253 thế cờ).*
- [ ] **D6 Đưa vào web**
  - Trang phân tích: chọn "Phong cách: Liêm / Carlsen / Nakamura" → top-3 nước người đó có khả năng đi
    + xác suất + đánh giá Stockfish từng nước, để thấy nước "đúng phong cách" có tốt về mặt engine không.
  - Báo cáo ván: "% nước của bạn trùng lựa chọn của Carlsen / Liêm / Nakamura".
  - Training: **đấu với bot theo phong cách**; puzzle **"Tìm nước kiện tướng đã đi"** lấy từ ván thật
    của họ (lời giải = nước họ đã đi, Stockfish xác nhận không phải sai lầm).
  *Code xong phần đấu: `/play` mặc định chọn kiện tướng (thẻ chữ cái đầu, số ván, % đoán trúng trên test), bot rút nước theo xác suất, khai cuộc theo repertoire thật, "Phân tích ván này" như cũ. Trang phân tích có tab "Kiện tướng" (`POST /api/styles/compare`: top-3 mỗi người + điểm Stockfish, đánh dấu nước đã đi trong ván); báo cáo ván có thẻ "Trùng lựa chọn của kiện tướng" (`POST /api/styles/match`: % top-1/top-3 mỗi bên, khai cuộc so với sổ). Puzzle "Đoán nước kiện tướng" (`/gm-puzzles`): `scripts/export_style_puzzles.py` chọn thế cờ từ ván test (Stockfish depth 14: nước kỳ thủ mất ≤ 50 cp, nước tốt thứ hai cách nước tốt nhất ≤ 80 cp, |điểm| ≤ 3, không có chiếu hết), mỗi ván tối đa 1 thế; backend `GET /api/styles/puzzles/next`, `POST /api/styles/puzzles/{id}/check` chấm 3 mức (trùng · khác nhưng tốt · kém) kèm xác suất của mô hình phong cách. Tab Nạp ván chọn "Góc nhìn phân tích" (Chỉ Stockfish / + Liêm / Carlsen / Nakamura); báo cáo thêm thẻ "Báo cáo theo góc nhìn X" (`POST /api/styles/{id}/review`: tổng kết % trùng lựa chọn số 1, khoảnh khắc nên học = rời lựa chọn của kiện tướng và Stockfish cũng chê, nước "rất chất" kiện tướng; bấm để nhảy tới nước). Bảng "Góc nhìn phân tích" dưới đánh giá Stockfish của từng nước: chọn một kiện tướng để nhận lời bình kiểu người thầy (`lib/coach.ts`: đánh giá Stockfish + vì sao, đọc từ luật cờ: phát triển quân, trung tâm, quân bị treo, Hậu ra sớm… + phong cách + gợi ý + nguyên tắc; đọc to bằng Web Speech tiếng Việt), hoặc so cả 3 (`POST /api/styles/opinion`: nước đã đi đứng thứ mấy trong lựa chọn của mỗi người, theo sổ khai cuộc hoặc mô hình; nhận xét dựng từ số liệu + so sánh Stockfish, nút "Thử" nước kiện tướng chọn). Đã xuất 450 puzzle (150/người; giữ ~52% thế cờ đã thử; 52% lời giải khác nước số 1 của Stockfish). Còn: chạy thử trên trình duyệt.*
- [ ] **D7 Ghi nhãn trung thực**: hiển thị "Mô phỏng phong cách dựa trên N ván công khai của …", không
  dùng ảnh hay thương hiệu cá nhân, ghi nguồn dữ liệu và giấy phép trong báo cáo.
  *Đã áp dụng trên `/play`: câu "Mô phỏng phong cách dựa trên N ván công khai (năm–năm) của …, phần lớn là cờ nhanh online. Đây không phải chính kỳ thủ.", không dùng ảnh.*

## Giai đoạn E — Mô hình bổ trợ (làm nếu còn thời gian) · ~6–8 ngày

- [ ] **E1 Phân loại theme lỗi chiến thuật**: huấn luyện trên themes của Lichess puzzle (fork, pin,
  hanging piece, mate-in-N…) → ghi `analyzed_moves.error_theme` cho nước sai của người dùng.
- [ ] **E2 Luyện tập thích nghi (BKT)**: cập nhật `user_skill_profiles.mastery` theo theme; chọn bài
  theo mastery thấp + rating Glicko + lịch SRS.

## Giai đoạn F — Tài liệu đồ án & bảo vệ (song song, chốt cuối) · ~5–7 ngày

- [ ] **F1 Đồng bộ tuyên bố với code**: xóa/sửa mọi nhắc tới M1/M3 chưa có thật trong comment, migration, README.
- [ ] **F2 Sơ đồ**: component, deployment, ERD đầy đủ, state machine job, sequence cho review/puzzle/tàn cuộc/gợi ý theo phong cách.
- [ ] **F3 Chương thuật toán**: win%, accuracy, luật nhãn, depth thích nghi, cache, Glicko-2, SRS, M2 (FiLM), fine-tune theo kỳ thủ.
- [ ] **F4 Chương thực nghiệm**: WASM vs asm.js (đã đo: 623 ms vs 3.454 ms ở depth 16), độ khớp nhãn, M2 theo dải Elo, ma trận 3×3 và nhận diện phong cách (D4).
- [ ] **F5 Demo**: dữ liệu mẫu, kịch bản 10 phút, bản dự phòng chạy offline (mô hình ONNX đóng gói sẵn).

---

### Thứ tự phụ thuộc
```
A ──► B ──────────────► (B4 cần A3)
C1 ► C2 ► C3 ► C4 ► C5
              └──► D1 ► D2 ► D3 ► D4 ► D5 ► D6
F chạy song song, chốt sau cùng
```
D1 (thu thập dữ liệu kiện tướng) có thể làm **song song** với C2–C3 trong lúc GPU đang huấn luyện.

### Tổng ước lượng
| Giai đoạn | Thời gian |
|---|---|
| A. Sửa luyện tập hiện có | 2–3 ngày |
| B. Training cốt lõi | 7–9 ngày |
| C. M2 theo Elo | 6–8 ngày + GPU |
| D. Phong cách kiện tướng | 8–12 ngày + GPU |
| E. Mô hình bổ trợ | 6–8 ngày (tùy chọn) |
| F. Tài liệu & bảo vệ | 5–7 ngày |

Nếu thiếu thời gian, cắt theo thứ tự: E → D3 phương án cải tiến → B6 → D6 phần bot. **Không cắt A, C và D4**
(D4 là phần thực nghiệm làm nên giá trị khoa học của tính năng phong cách kiện tướng).

### Đã bỏ khỏi lộ trình (theo quyết định: không lên production)
CI/CD, Testcontainers, Playwright, docker-compose đầy đủ, monitoring, ghim phiên bản Stockfish,
rate limit / Spring Security filter, bug nhỏ (transaction `indexMoves`, test `AnalysisClassifierTest`),
API hủy job / dọn dữ liệu cũ / SSE, phân trang kho ván, kiểm tra responsive.
