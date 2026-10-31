"""Đánh giá M2 — sinh thẳng các bảng số liệu cho chương thực nghiệm.

    python -m m2.evaluate --checkpoint runs/m2-baseline/best.pt --data-dir data/m2

Bốn phần, tương ứng bốn bảng/biểu đồ trong báo cáo:

1. **Độ khớp nước đi theo dải Elo** — chỉ số chính. Đối chiếu với Maia (~50–52%)
   và với Stockfish (~33–40%). Nếu đạt trên 45% là kết quả tốt cho đồ án.
2. **Ma trận nội suy Elo** — hỏi mô hình ở mọi dải, chấm trên dữ liệu của từng
   dải. Đường chéo phải trội hơn hẳn. Đây là bằng chứng trực tiếp cho thấy việc
   điều kiện hóa Elo có tác dụng, và là hình ăn điểm nhất của chương này.
3. **Sai số ước lượng Elo** — MAE khi đoán trình độ từ N nước đi, theo N.
4. **Đối chứng với baseline** — mô hình đoán đều trên các nước hợp lệ, và mô
   hình bỏ qua Elo (hỏi ở 1500 cho mọi người). Không có hai mốc này thì con số
   ở phần 1 không nói lên điều gì.
"""

from __future__ import annotations

import argparse
import collections
import json
import logging
import os
from pathlib import Path

import chess
import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

from .dataset import ShardDataset, collate, list_shards
from .encoding import NUM_ELO_BUCKETS, bucket_center, bucket_label, elo_to_bucket
from .inference import Predictor
from .model import EloConditionedPolicyNet, ModelConfig

LOGGER = logging.getLogger("m2.evaluate")


def load_predictor(checkpoint: Path, device: str) -> tuple[Predictor, dict]:
    state = torch.load(checkpoint, map_location="cpu", weights_only=False)
    cfg = ModelConfig(**state["model_config"])
    model = EloConditionedPolicyNet(cfg)
    model.load_state_dict(state["model"])
    LOGGER.info(
        "Nạp %s · %s · %.2fM tham số · bước %s",
        checkpoint, cfg.name, model.parameter_count() / 1e6, state.get("step", "?"),
    )
    return Predictor(model, device), state


@torch.no_grad()
def accuracy_by_bucket(
    predictor: Predictor,
    data_dir: Path,
    split: str,
    max_rows: int,
    batch_size: int,
) -> dict:
    """Phần 1 và phần 4: độ khớp theo dải Elo, kèm hai baseline."""
    dataset = ShardDataset(data_dir, split, max_rows=max_rows, with_mask=True)
    loader = DataLoader(dataset, batch_size=batch_size, collate_fn=collate)
    device = predictor.device

    hits1 = collections.Counter()
    hits3 = collections.Counter()
    totals = collections.Counter()
    uniform_hits = collections.Counter()
    no_elo_hits = collections.Counter()
    loss_sum = collections.defaultdict(float)
    loss_batches = collections.Counter()

    neutral_bucket = elo_to_bucket(1500)
    for batch in loader:
        planes = batch["planes"].to(device)
        bucket = batch["elo_bucket"].to(device)
        elo_norm = batch["elo_norm"].to(device)
        target = batch["target"].to(device)
        mask = batch["legal_mask"].to(device)

        logits, _ = predictor.model(planes, bucket, elo_norm)
        logits = logits.masked_fill(~mask, float("-inf"))
        top3 = logits.topk(3, dim=-1).indices

        # Baseline A: đoán đều trên các nước hợp lệ → kỳ vọng 1/số nước hợp lệ.
        legal_counts = mask.sum(dim=-1).clamp(min=1)

        # Baseline B: bỏ qua Elo, luôn hỏi ở 1500.
        flat_bucket = torch.full_like(bucket, neutral_bucket)
        flat_norm = torch.zeros_like(elo_norm)
        no_elo_logits, _ = predictor.model(planes, flat_bucket, flat_norm)
        no_elo_top1 = no_elo_logits.masked_fill(~mask, float("-inf")).argmax(dim=-1)

        for i in range(target.numel()):
            b = int(bucket[i])
            totals[b] += 1
            hits1[b] += int(top3[i, 0] == target[i])
            hits3[b] += int((top3[i] == target[i]).any())
            uniform_hits[b] += 1.0 / float(legal_counts[i])
            no_elo_hits[b] += int(no_elo_top1[i] == target[i])

        for b in set(int(x) for x in bucket):
            selector = bucket == b
            if selector.any():
                loss_sum[b] += float(
                    F.cross_entropy(logits[selector], target[selector])
                )
                loss_batches[b] += 1

    rows = []
    for b in range(NUM_ELO_BUCKETS):
        n = totals[b]
        if n == 0:
            continue
        rows.append({
            "bucket": b,
            "label": bucket_label(b),
            "n": n,
            "top1": hits1[b] / n,
            "top3": hits3[b] / n,
            "baselineUniform": uniform_hits[b] / n,
            "baselineNoElo": no_elo_hits[b] / n,
            "crossEntropy": loss_sum[b] / max(loss_batches[b], 1),
        })

    overall_n = sum(totals.values())
    overall = {
        "n": overall_n,
        "top1": sum(hits1.values()) / max(overall_n, 1),
        "top3": sum(hits3.values()) / max(overall_n, 1),
        "baselineUniform": sum(uniform_hits.values()) / max(overall_n, 1),
        "baselineNoElo": sum(no_elo_hits.values()) / max(overall_n, 1),
    }
    return {"perBucket": rows, "overall": overall}


@torch.no_grad()
def elo_interpolation_matrix(
    predictor: Predictor,
    data_dir: Path,
    split: str,
    max_rows: int,
    batch_size: int,
) -> dict:
    """Phần 2: chấm dữ liệu của mỗi dải bằng mọi dải Elo được hỏi.

    Ô (i, j) = độ khớp top-1 trên dữ liệu của người thuộc dải i, khi hỏi mô hình
    ở dải j. Nếu điều kiện hóa có tác dụng, giá trị lớn nhất mỗi hàng phải nằm
    trên hoặc sát đường chéo.
    """
    dataset = ShardDataset(data_dir, split, max_rows=max_rows, with_mask=True)
    loader = DataLoader(dataset, batch_size=batch_size, collate_fn=collate)
    device = predictor.device

    hits = np.zeros((NUM_ELO_BUCKETS, NUM_ELO_BUCKETS))
    # Log-likelihood của nước thật, cộng dồn theo (dải thật, dải hỏi). Top-1 chỉ đổi khi
    # nước xếp đầu đổi chỗ, nên chênh lệch giữa các cột (~0,2 điểm) chìm trong nhiễu
    # thống kê với vài nghìn vị trí mỗi hàng. NLL đo trên đúng cùng các vị trí cho mọi
    # cột, nhạy hơn nhiều và là thước đo chuẩn của bài toán mô phỏng người chơi.
    nll = np.zeros((NUM_ELO_BUCKETS, NUM_ELO_BUCKETS))
    totals = np.zeros(NUM_ELO_BUCKETS)

    for batch in loader:
        planes = batch["planes"].to(device)
        true_bucket = batch["elo_bucket"].to(device)
        target = batch["target"].to(device)
        mask = batch["legal_mask"].to(device)

        true_np = true_bucket.cpu().numpy()
        totals += np.bincount(true_np, minlength=NUM_ELO_BUCKETS)

        for i in range(NUM_ELO_BUCKETS):
            asked_bucket = torch.full_like(true_bucket, i)
            asked_norm = torch.full_like(
                batch["elo_norm"].to(device), (bucket_center(i) - 1500.0) / 400.0
            )
            logits, _ = predictor.model(planes, asked_bucket, asked_norm)
            masked = logits.float().masked_fill(~mask, float("-inf"))
            top1 = masked.argmax(dim=-1)
            correct = (top1 == target).cpu().numpy()
            losses = F.cross_entropy(masked, target, reduction="none").cpu().numpy()
            for j in range(NUM_ELO_BUCKETS):
                hits[j, i] += correct[true_np == j].sum()
                nll[j, i] += losses[true_np == j].sum()

    matrix = hits / np.maximum(totals[:, None], 1)
    nll_matrix = nll / np.maximum(totals[:, None], 1)
    return {
        "labels": [bucket_label(b) for b in range(NUM_ELO_BUCKETS)],
        "matrix": matrix.tolist(),
        "rowCounts": totals.tolist(),
        "diagonalWins": int(sum(matrix[j].argmax() == j for j in range(NUM_ELO_BUCKETS))),
        "nllMatrix": nll_matrix.tolist(),
        "nllDiagonalWins": int(sum(nll_matrix[j].argmin() == j for j in range(NUM_ELO_BUCKETS))),
        # Khoảng cách trung bình (theo số dải) từ cột tốt nhất tới đường chéo; 0 là hoàn hảo.
        "nllMeanOffset": float(np.mean([abs(int(nll_matrix[j].argmin()) - j) for j in range(NUM_ELO_BUCKETS)])),
    }


def elo_estimation_error(
    predictor: Predictor,
    data_dir: Path,
    split: str,
    move_counts: tuple[int, ...] = (10, 20, 40, 80),
    players: int = 60,
    max_rows: int = 200_000,
) -> dict:
    """Phần 3: MAE ước lượng Elo theo số nước đi được dùng.

    Gom các mẫu về từng ván để mô phỏng đúng tình huống thực: hệ thống chỉ có
    những nước của một người trong một số ván, và phải đoán trình độ.
    """
    import pyarrow.parquet as pq

    rows_by_game: dict[str, list[tuple[str, str, int]]] = collections.defaultdict(list)
    collected = 0
    for shard in list_shards(data_dir, split):
        table = pq.read_table(shard, columns=["fen", "move_uci", "elo", "game_key"])
        for fen, uci, elo, key in zip(
            table.column("fen").to_pylist(),
            table.column("move_uci").to_pylist(),
            table.column("elo").to_pylist(),
            table.column("game_key").to_pylist(),
        ):
            rows_by_game[key].append((fen, uci, elo))
            collected += 1
        if collected >= max_rows:
            break

    usable = [rows for rows in rows_by_game.values() if len(rows) >= max(move_counts)]
    usable = usable[:players]
    if not usable:
        LOGGER.warning("Không đủ ván dài để đo sai số ước lượng Elo.")
        return {"perMoveCount": [], "players": 0}

    results = []
    for count in move_counts:
        errors = []
        for rows in usable:
            sample = rows[:count]
            true_elo = float(np.mean([elo for _, _, elo in sample]))
            positions = [
                (chess.Board(fen), chess.Move.from_uci(uci))
                for fen, uci, _ in sample
            ]
            estimate = predictor.estimate_elo(positions)
            errors.append(abs(estimate.elo - true_elo))
        results.append({
            "moves": count,
            "mae": float(np.mean(errors)),
            "median": float(np.median(errors)),
            "p90": float(np.percentile(errors, 90)),
        })
        LOGGER.info("Ước lượng Elo với %d nước: MAE %.1f", count, results[-1]["mae"])

    return {"perMoveCount": results, "players": len(usable)}


def stockfish_baseline(
    engine_path: str,
    data_dir: Path,
    split: str,
    per_bucket: int = 300,
    depth: int = 12,
) -> dict:
    """Baseline Stockfish: nước tốt nhất của engine khớp nước người thật bao nhiêu.

    Đây là mốc so sánh chuẩn trong bài Maia: engine mạnh không mô phỏng được người,
    và khoảng cách giữa M2 với dòng này cho thấy giá trị của việc học từ ván người.
    Lấy mẫu đều ``per_bucket`` vị trí mỗi dải vì engine chậm hơn mạng hàng nghìn lần.
    """
    import chess.engine
    import pyarrow.parquet as pq

    samples: dict[int, list[tuple[str, str]]] = collections.defaultdict(list)
    for shard in list_shards(data_dir, split):
        table = pq.read_table(shard, columns=["fen", "move_uci", "elo"])
        for fen, uci, elo in zip(table.column("fen").to_pylist(),
                                 table.column("move_uci").to_pylist(),
                                 table.column("elo").to_pylist()):
            bucket = elo_to_bucket(elo)
            if len(samples[bucket]) < per_bucket:
                samples[bucket].append((fen, uci))
        if all(len(samples[b]) >= per_bucket for b in range(NUM_ELO_BUCKETS)):
            break

    rows = []
    hits1_total = hits3_total = n_total = 0
    with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
        engine.configure({"Threads": 1, "Hash": 64})
        for b in range(NUM_ELO_BUCKETS):
            hits1 = hits3 = 0
            for fen, uci in samples[b]:
                infos = engine.analyse(chess.Board(fen), chess.engine.Limit(depth=depth), multipv=3)
                moves = [info["pv"][0].uci() for info in infos if info.get("pv")]
                hits1 += int(bool(moves) and moves[0] == uci)
                hits3 += int(uci in moves)
            n = len(samples[b])
            if n:
                rows.append({"bucket": b, "label": bucket_label(b), "n": n,
                             "top1": hits1 / n, "top3": hits3 / n})
                LOGGER.info("Stockfish depth %d · %s: top-1 %.2f%%", depth, bucket_label(b), 100 * hits1 / n)
            hits1_total += hits1
            hits3_total += hits3
            n_total += n

    return {
        "depth": depth,
        "perBucket": rows,
        "overall": {"n": n_total, "top1": hits1_total / max(n_total, 1), "top3": hits3_total / max(n_total, 1)},
    }


def render_report(report: dict) -> str:
    """In kết quả ở dạng bảng có thể dán thẳng vào báo cáo."""
    lines: list[str] = []
    accuracy = report["accuracy"]

    lines.append("\n=== 1. Độ khớp nước đi theo dải Elo ===")
    lines.append(f"{'Dải':>12} {'n':>9} {'top-1':>8} {'top-3':>8} "
                 f"{'đều':>8} {'bỏ Elo':>8}")
    for row in accuracy["perBucket"]:
        lines.append(
            f"{row['label']:>12} {row['n']:>9,} {row['top1']:>7.2%} "
            f"{row['top3']:>7.2%} {row['baselineUniform']:>7.2%} "
            f"{row['baselineNoElo']:>7.2%}"
        )
    o = accuracy["overall"]
    lines.append(
        f"{'TỔNG':>12} {o['n']:>9,} {o['top1']:>7.2%} {o['top3']:>7.2%} "
        f"{o['baselineUniform']:>7.2%} {o['baselineNoElo']:>7.2%}"
    )
    gain = o["top1"] - o["baselineNoElo"]
    lines.append(
        f"\n  Điều kiện hóa Elo đóng góp {gain:+.2%} tuyệt đối so với bỏ qua Elo."
    )

    if report.get("interpolation"):
        matrix = report["interpolation"]
        lines.append("\n=== 2. Ma trận nội suy Elo (hàng = Elo thật, cột = Elo hỏi) ===")
        header = "".join(f"{label:>11}" for label in matrix["labels"])
        lines.append(f"{'':>12}{header}")
        for j, label in enumerate(matrix["labels"]):
            cells = "".join(f"{value:>10.2%} " for value in matrix["matrix"][j])
            lines.append(f"{label:>12}{cells}")
        lines.append(
            f"\n  Đường chéo thắng ở {matrix['diagonalWins']}/"
            f"{len(matrix['labels'])} hàng."
        )
        if matrix.get("nllMatrix"):
            lines.append("\n=== 2b. Ma trận nội suy theo NLL (thấp hơn = khớp hơn) ===")
            lines.append(f"{'':>12}{header}")
            for j, label in enumerate(matrix["labels"]):
                cells = "".join(f"{value:>10.4f} " for value in matrix["nllMatrix"][j])
                lines.append(f"{label:>12}{cells}")
            lines.append(
                f"\n  NLL thấp nhất nằm trên đường chéo ở {matrix['nllDiagonalWins']}/{len(matrix['labels'])} hàng;"
                f" lệch trung bình {matrix['nllMeanOffset']:.2f} dải."
            )

    if report.get("eloEstimation", {}).get("perMoveCount"):
        lines.append("\n=== 3. Sai số ước lượng Elo ===")
        lines.append(f"{'số nước':>10} {'MAE':>9} {'trung vị':>10} {'p90':>9}")
        for row in report["eloEstimation"]["perMoveCount"]:
            lines.append(
                f"{row['moves']:>10} {row['mae']:>9.1f} "
                f"{row['median']:>10.1f} {row['p90']:>9.1f}"
            )

    if report.get("stockfish"):
        sf = report["stockfish"]
        lines.append(f"\n=== 4. Baseline Stockfish (depth {sf['depth']}) ===")
        lines.append(f"{'Dải':>12} {'n':>6} {'top-1':>8} {'top-3':>8}")
        for row in sf["perBucket"]:
            lines.append(f"{row['label']:>12} {row['n']:>6} {row['top1']:>7.2%} {row['top3']:>7.2%}")
        o = sf["overall"]
        lines.append(f"{'TỔNG':>12} {o['n']:>6} {o['top1']:>7.2%} {o['top3']:>7.2%}")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Đánh giá mô hình M2")
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, default=Path("data/m2"))
    parser.add_argument("--split", type=str, default="test")
    parser.add_argument("--max-rows", type=int, default=200_000)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--device", type=str, default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--skip-interpolation", action="store_true")
    parser.add_argument("--skip-elo-estimation", action="store_true")
    parser.add_argument("--interpolation-rows", type=int, default=150_000,
                        help="Số vị trí cho ma trận nội suy (mỗi vị trí chạy mạng 10 lần)")
    parser.add_argument("--estimation-players", type=int, default=300,
                        help="Số ván dùng để đo sai số ước lượng Elo")
    parser.add_argument("--stockfish", type=str, default=os.environ.get("STOCKFISH_PATH"),
                        help="Đường dẫn Stockfish cho baseline (mặc định lấy STOCKFISH_PATH)")
    parser.add_argument("--stockfish-per-bucket", type=int, default=300)
    parser.add_argument("--stockfish-depth", type=int, default=12)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s",
                        datefmt="%H:%M:%S")

    predictor, state = load_predictor(args.checkpoint, args.device)

    report: dict = {
        "checkpoint": str(args.checkpoint),
        "split": args.split,
        "trainStep": state.get("step"),
        "modelConfig": state.get("model_config"),
        "accuracy": accuracy_by_bucket(
            predictor, args.data_dir, args.split, args.max_rows, args.batch_size
        ),
    }
    if not args.skip_interpolation:
        report["interpolation"] = elo_interpolation_matrix(
            predictor, args.data_dir, args.split,
            min(args.max_rows, args.interpolation_rows), args.batch_size,
        )
    if not args.skip_elo_estimation:
        report["eloEstimation"] = elo_estimation_error(
            predictor, args.data_dir, args.split, players=args.estimation_players
        )
    if args.stockfish and args.stockfish_per_bucket > 0:
        report["stockfish"] = stockfish_baseline(
            args.stockfish, args.data_dir, args.split, args.stockfish_per_bucket, args.stockfish_depth
        )
    else:
        LOGGER.warning("Bỏ qua baseline Stockfish: chưa đặt STOCKFISH_PATH hoặc --stockfish.")

    print(render_report(report))

    out = args.out or args.checkpoint.parent / "evaluation.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nBáo cáo JSON: {out}")


if __name__ == "__main__":
    main()
