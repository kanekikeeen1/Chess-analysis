# M2 — Mô hình hóa hành vi người chơi

Một mạng chính sách duy nhất, **điều kiện hóa theo Elo**, dự đoán nước đi mà
*con người* ở một trình độ cho trước sẽ chọn. Stockfish trả lời "nước nào tốt
nhất"; M2 trả lời "người ở trình độ này sẽ đi nước nào" — hai câu hỏi khác nhau,
và câu thứ hai mới là thứ người học cờ cần.

## Khác gì Maia

Maia (McIlroy-Young và cộng sự, KDD 2020) huấn luyện **chín mạng rời rạc**, mỗi
mạng cho một dải Elo. Muốn biết người 1450 chơi thế nào thì phải chọn mạng gần
nhất, và không có cách nào nội suy.

M2 dùng **một mạng duy nhất** nhận trình độ làm đầu vào, qua cơ chế FiLM
(Perez và cộng sự, AAAI 2018): mỗi khối residual được điều biến bởi một cặp hệ
số `(gamma, beta)` sinh ra từ vector Elo. Hệ quả kiểm chứng được:

- một checkpoint thay chín checkpoint;
- Elo là biến liên tục, hỏi được ở mức chưa từng có trong dữ liệu huấn luyện;
- đường cong "độ khớp theo Elo hỏi" phải đạt cực đại quanh Elo thật — chính
  tính chất này làm cho tính năng ước lượng trình độ hoạt động.

Ma trận nội suy trong `python -m m2.evaluate` là bằng chứng trực tiếp cho điều
này, và là hình nên đưa vào chương thực nghiệm.

## Cài đặt

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install torch --index-url https://download.pytorch.org/whl/cu130   # xem bảng dưới
python -c "import torch; print(torch.cuda.is_available())"
python -m pytest tests/ -q          # 20 test cho tầng mã hóa
```

**Shell fish**: dùng `source .venv/bin/activate.fish`, không phải `activate`.

**Chọn index torch** theo phiên bản CUDA mà `nvidia-smi` in ra:

| Driver | Index |
| --- | --- |
| CUDA 13.x | `https://download.pytorch.org/whl/cu130` |
| CUDA 12.6 | `https://download.pytorch.org/whl/cu126` |
| Không có GPU | `https://download.pytorch.org/whl/cpu` |

Trên Python 3.14, các index cũ `cu124` và `cu128` chưa có wheel và sẽ báo
`No matching distribution found` — đó là lỗi thiếu bản build, không phải lỗi máy.

Chọn cấu hình theo GPU:

| GPU | Cấu hình |
| --- | --- |
| T4 / P100 / ≥8 GB (Colab, Kaggle) | `config/m2.yaml` |
| RTX 3050 Mobile hoặc GPU 4–6 GB | `config/m2-rtx3050.yaml` |
| Chạy thử, không cần GPU | `config/m2-smoke.yaml` |

## Quy trình bốn bước

### 1. Chuẩn bị dữ liệu

```bash
wget https://database.lichess.org/standard/lichess_db_standard_rated_2024-01.pgn.zst

python scripts/prepare_m2_data.py \
    --source lichess_db_standard_rated_2024-01.pgn.zst \
    --out data/m2 \
    --max-positions 5000000 \
    --stats
```

Sinh ra shard Parquet chia `train` / `val` / `test`, kèm `dataset_card.json` ghi
lại nguồn và toàn bộ tiêu chí lọc — chương 3 của báo cáo lấy thẳng từ file này.

Tách tập **theo ván**, không theo nước đi. Hai vị trí trong cùng một ván có
tương quan rất mạnh; chia lẫn chúng sẽ thổi phồng kết quả kiểm định một cách vô
hình. Đây là loại lỗi hội đồng hay hỏi và rất khó chữa nếu phát hiện muộn.

Năm triệu vị trí là đủ cho quy mô đồ án. Một tháng dữ liệu Lichess có khoảng
100 triệu ván — không cần và không nên xử lý hết.

### 2. Huấn luyện

Luôn chạy thử cấu hình nhỏ trước, để không phát hiện lỗi sau ba giờ GPU:

```bash
python scripts/prepare_m2_data.py --source <pgn> --out data/m2-smoke --max-positions 60000
python -m m2.train --config config/m2-smoke.yaml     # ~100 bước, chạy được trên CPU
```

Rồi mới chạy thật:

```bash
python -m m2.train --config config/m2.yaml
python -m m2.train --config config/m2.yaml --resume runs/m2-baseline/last.pt   # chạy tiếp
```

Theo dõi VRAM bằng `watch -n2 nvidia-smi` trong terminal thứ hai ở vài trăm bước
đầu. Nếu OOM, hạ `batch_size` (256 rồi 128) — luôn hiệu quả hơn hạ `channels`.

Checkpoint lưu đủ trạng thái optimizer và scaler nên `--resume` tiếp đúng chỗ đã
dừng — cần thiết vì phiên Colab/Kaggle hay bị ngắt giữa chừng.

**Ba con số cần theo dõi** trong log:

| Chỉ số | Ý nghĩa | Mốc tham chiếu |
| --- | --- | --- |
| `top1` | độ khớp nước đi với người thật | Maia ~50–52%; Stockfish ~33–40% |
| `top3` | nước người chơi có nằm trong 3 gợi ý đầu | thường ~75–80% |
| `elo_sep` | chênh log-likelihood giữa hỏi đúng dải và hỏi sai dải | phải **dương và tăng dần** |

`elo_sep` là chỉ số cảnh báo sớm quan trọng nhất. Do FiLM được khởi tạo ở trạng
thái đồng nhất, nó bắt đầu từ ~0 và phải tăng lên trong vài nghìn bước đầu. Nếu
sau 10.000 bước nó vẫn quanh 0, việc điều kiện hóa Elo không học được gì —
dừng lại và kiểm tra phân bố Elo trong dữ liệu trước khi đốt thêm GPU.

Đạt trên 45% top-1 là kết quả tốt cho đồ án.

### 3. Đánh giá

```bash
python -m m2.evaluate --checkpoint runs/m2-baseline/best.pt --data-dir data/m2
```

In ra bốn bảng, dán thẳng được vào báo cáo:

1. **Độ khớp theo dải Elo** — chỉ số chính, kèm hai baseline: đoán đều trên các
   nước hợp lệ, và mô hình bỏ qua Elo. Không có hai mốc này thì con số top-1
   không nói lên điều gì.
2. **Ma trận nội suy Elo** — đường chéo phải trội hơn hẳn.
3. **Sai số ước lượng Elo** theo số nước đi được dùng.
4. Toàn bộ được ghi ra `evaluation.json` để vẽ biểu đồ.

### 4. Xuất ONNX

```bash
python -m m2.export_onnx --checkpoint runs/m2-baseline/best.pt --out models/m2.onnx
```

Sinh ra một file `.onnx` duy nhất kèm `m2.meta.json` chứa bảng 1858 nước đi.
**Bảng này bắt buộc phải đi cùng mô hình**: không có nó, tầng phục vụ không biết
logit thứ *i* ứng với nước nào, và một thay đổi nhỏ trong `encoding.py` sẽ âm
thầm làm sai toàn bộ kết quả mà không báo lỗi.

Bước xuất tự đối chiếu ONNX với PyTorch và ném lỗi nếu lệch quá 1e-3.

## Bốn tính năng sản phẩm

Tất cả nằm trong `m2/inference.py`, dùng chung một lớp `Predictor`:

```python
from m2.inference import Predictor
import chess

p = Predictor.from_checkpoint("runs/m2-baseline/best.pt", device="cpu")
board = chess.Board(fen)
```

| | Gọi | Trả lời câu hỏi |
| --- | --- | --- |
| ① | `p.human_moves_by_level(board, (1200, 1600, 2000))` | Người 1200/1600/2000 sẽ đi nước nào? |
| ② | `p.attribute_error(board, played, best_move, elo)` | Nước sai này là lỗi hệ thống của trình độ hay điểm yếu riêng? |
| ③ | `p.estimate_elo([(board, move), ...])` | Ván này chơi ở trình độ nào? |
| ④ | `p.position_difficulty(board, best_move, elo)` | Thế cờ này khó tới mức nào? |

**② là tính năng có tính mới rõ nhất của đồ án.** Đại lượng cốt lõi là
`peer_rate` — xác suất một người *cùng trình độ* cũng đi đúng nước đó. Cao nghĩa
là lỗi mang tính hệ thống của cả nhóm; thấp nghĩa là điểm yếu riêng, đáng đưa
vào giáo án luyện tập. Chưa nền tảng thương mại nào phân biệt được hai loại này.

M2 **không** tự đánh giá nước đi tốt hay xấu — đó vẫn là việc của Stockfish ở
backend. M2 chỉ trả lời phần engine không trả lời được.

Ngưỡng phân loại ở ② (`SYSTEMIC_PEER_RATE`, `PERSONAL_PEER_RATE`) hiện là giá
trị khởi điểm đặt tay. Khi có dữ liệu người dùng thật ở M3, hãy hiệu chỉnh theo
phân vị thực tế và ghi lại trong báo cáo — đúng cách M1 xử lý bộ ngưỡng cũ.

## Cấu trúc

```
ml/
├── config/
│   ├── m2.yaml            # GPU ≥8 GB (T4, P100)
│   ├── m2-rtx3050.yaml    # GPU 4–6 GB, tinh chỉnh cho laptop
│   └── m2-smoke.yaml      # chạy thử, ~100 bước, không cần GPU
├── m2/
│   ├── encoding.py        # bàn cờ → 20 mặt phẳng; nước đi ↔ chỉ số (1858)
│   ├── data.py            # Lichess PGN.zst → shard Parquet, lọc và chia tập
│   ├── dataset.py         # Dataset PyTorch, mã hóa tại chỗ trong worker
│   ├── model.py           # ResNet + FiLM điều kiện hóa Elo
│   ├── train.py           # vòng lặp huấn luyện, resume, checkpoint
│   ├── evaluate.py        # bảng số liệu cho chương thực nghiệm
│   ├── inference.py       # Predictor + bốn tính năng sản phẩm
│   └── export_onnx.py     # xuất ONNX kèm đối chiếu
├── scripts/
│   └── prepare_m2_data.py
└── tests/
    └── test_encoding.py   # 20 test cho tầng dễ sai nhất
```

## Ghi chú kỹ thuật

**Vì sao không lưu tensor ra đĩa.** Một mẫu ở dạng tensor chiếm ~5 KB; mười
triệu vị trí là hơn 50 GB. Ở dạng FEN chỉ khoảng 80 byte. Mã hóa được đẩy sang
worker của DataLoader, chạy song song với GPU (~25 µs/mẫu, không bao giờ là nút
thắt). Đổi lại, shard vẫn đọc được bằng mắt và mọi đặc trưng tính lại được mà
không phải sinh lại dữ liệu.

**Vì sao xoay bàn cờ về phía bên đi.** Mạng chỉ học một chiều: "quân của tôi" và
"quân của đối thủ". Không xoay thì mạng phải học lại toàn bộ chiến thuật cho cả
hai màu, tức là cần gấp đôi dữ liệu để đạt cùng chất lượng.

**Vì sao 1858 nước.** Đây là kích thước không gian nước đi của Leela Chess Zero,
cũng là thứ Maia dùng. Giữ nguyên để so sánh trực tiếp được với Maia trong
chương thực nghiệm. Phong Hậu dùng chung chỉ số với nước đi thường vì nó chiếm
~97% số lần phong cấp.

**opset ONNX tối thiểu là 18.** FiLM dùng `chunk(2, dim=-1)`, sinh ra node
`Split` với thuộc tính `num_outputs` mà opset 17 chưa hỗ trợ. Xuất ở opset 17
vẫn tạo ra file nhưng ONNX Runtime từ chối nạp — đó là lý do bước đối chiếu tồn
tại và không nên bỏ qua nó.

## Tài liệu tham khảo

- McIlroy-Young, R., Sen, S., Kleinberg, J., Anderson, A. (2020).
  *Aligning Superhuman AI with Human Behavior: Chess as a Model System.* KDD.
- Perez, E., Strub, F., de Vries, H., Dumoulin, V., Courville, A. (2018).
  *FiLM: Visual Reasoning with a General Conditioning Layer.* AAAI.
- Lichess open database — https://database.lichess.org/ (CC0).
