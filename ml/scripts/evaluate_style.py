#!/usr/bin/env python3
"""D4: đánh giá M2 nền và các mô hình phong cách trên tập test của từng kỳ thủ.

    python scripts/evaluate_style.py --out-dir ../docs/thesis/style/d4-eval

Mặc định: M2 nền ``runs/m2-rtx5060ti-v2/best.pt``, mô hình phong cách ``runs/<prefix>-<id>/best.pt``, dữ liệu
``data/style/<id>/{val,test}``. Phương án hai tầng (nền → GM chung → từng kỳ thủ):

    python scripts/evaluate_style.py --prefix style2 --pool runs/style-pool/best.pt --out-dir ../docs/thesis/style/d4-eval-v2
 Có ``STOCKFISH_PATH`` thì đo thêm Stockfish top-1 trên 500 vị trí mỗi người.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import torch  # noqa: E402

from style.collect import load_players  # noqa: E402
from style.evaluate import evaluate_all  # noqa: E402


def model_order(report: dict) -> list[str]:
    return ["base", *(["pool"] if "pool" in report["checkpoints"] else []), *report["players"]]


def write_tables(report: dict, out_dir: Path, names: dict[str, str]) -> None:
    players = report["players"]
    models = model_order(report)
    with (out_dir / "accuracy_matrix.csv").open("w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        writer.writerow(["test_of", *[f"top1_{m}" for m in models], *[f"top3_{m}" for m in models],
                         *[f"nll_{m}" for m in models], "stockfish_top1", "n"])
        for y in players:
            row = report["accuracy"][y]
            writer.writerow([y, *[f"{row[m]['top1']:.4f}" for m in models], *[f"{row[m]['top3']:.4f}" for m in models],
                             *[f"{row[m]['nll']:.4f}" for m in models],
                             f"{report['stockfish'][y]['top1']:.4f}" if "stockfish" in report else "",
                             row["base"]["n"]])
    with (out_dir / "identification.csv").open("w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        writer.writerow(["variant", "k", *players, "macro"])
        for variant in ("raw", "calibrated"):
            for k, entry in report["identification"][variant].items():
                writer.writerow([variant, k, *[f"{entry['accuracy'][y]:.4f}" for y in players],
                                 f"{entry['macroAccuracy']:.4f}"])
    with (out_dir / "diagonal_significance.csv").open("w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        writer.writerow(["test_of", "versus", "top1_diff", "ci95_low", "ci95_high", "significant"])
        for y, others in report["diagonalVsOthers"].items():
            for m, entry in others.items():
                writer.writerow([y, m, f"{entry['diff']:.4f}", f"{entry['ci95'][0]:.4f}", f"{entry['ci95'][1]:.4f}",
                                 entry["significant"]])


def write_figures(report: dict, out_dir: Path, names: dict[str, str]) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    players = report["players"]
    models = model_order(report)
    labels = {"base": "M2 nền", "pool": "GM chung", **names}

    # Hình 1: top-1 của từng mô hình (cột) trên test của từng kỳ thủ (hàng). Một sắc độ, đậm = cao hơn.
    matrix = np.array([[report["accuracy"][y][m]["top1"] * 100 for m in models] for y in players])
    fig, ax = plt.subplots(figsize=(1.6 * len(models) + 1.8, 3.4), dpi=160)
    image = ax.imshow(matrix, cmap="Blues", vmin=matrix.min() - 2, vmax=matrix.max() + 1)
    ax.set_xticks(range(len(models)), [labels[m] for m in models])
    ax.set_yticks(range(len(players)), [f"Ván của {names[y]}" for y in players])
    for i, y in enumerate(players):
        best = int(np.argmax(matrix[i]))
        for j in range(len(models)):
            ax.text(j, i, f"{matrix[i, j]:.1f}%", ha="center", va="center", fontsize=9,
                    fontweight="bold" if j == best else "normal",
                    color="white" if matrix[i, j] > (matrix.min() + matrix.max()) / 2 else "#1b2430")
    ax.set_title("Top-1 trên tập test (đậm: mô hình tốt nhất của hàng)", fontsize=10)
    ax.tick_params(length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    fig.colorbar(image, ax=ax, fraction=0.035, pad=0.02, label="top-1 (%)")
    fig.tight_layout()
    fig.savefig(out_dir / "01_accuracy_matrix.png")
    plt.close(fig)

    # Hình 2: nhận diện phong cách theo số ván, bản đã hiệu chỉnh, so với đoán ngẫu nhiên.
    calibrated = report["identification"]["calibrated"]
    ks = list(calibrated)
    fig, ax = plt.subplots(figsize=(6.4, 3.4), dpi=160)
    width = 0.8 / len(players)
    colors = ["#2a78d6", "#d97a1f", "#3f9e4c"]
    for index, y in enumerate(players):
        values = [calibrated[k]["accuracy"][y] * 100 for k in ks]
        ax.bar(np.arange(len(ks)) + (index - (len(players) - 1) / 2) * width, values, width * 0.92,
               color=colors[index % len(colors)], label=names[y])
    ax.axhline(100 / len(players), color="#6b7280", linestyle="--", linewidth=1)
    ax.text(-0.45, 100 / len(players) - 5, "đoán ngẫu nhiên", ha="left", fontsize=8, color="#6b7280")
    ax.set_xticks(range(len(ks)), [f"{k} ván" for k in ks])
    ax.set_ylim(0, 100)
    ax.set_ylabel("đoán đúng kỳ thủ (%)")
    ax.set_title("Nhận diện kỳ thủ từ k ván (log-likelihood đã hiệu chỉnh)", fontsize=10)
    ax.legend(frameon=False, fontsize=8, ncol=len(players), loc="upper left")
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", color="#e5e7eb", linewidth=0.8)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(out_dir / "02_style_identification.png")
    plt.close(fig)


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--players", type=Path, default=Path("config/players.yaml"))
    parser.add_argument("--base", type=Path, default=Path("runs/m2-rtx5060ti-v2/best.pt"))
    parser.add_argument("--runs", type=Path, default=Path("runs"), help="Chứa <prefix>-<id>/best.pt")
    parser.add_argument("--prefix", default="style", help="style (fine-tune một tầng) hoặc style2 (hai tầng)")
    parser.add_argument("--pool", type=Path, help="Checkpoint GM chung, thêm làm một cột đối chứng")
    parser.add_argument("--data", type=Path, default=Path("data/style"))
    parser.add_argument("--out-dir", type=Path, default=Path("runs/style-eval"))
    parser.add_argument("--max-test-rows", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=1024)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--stockfish", default=os.environ.get("STOCKFISH_PATH"))
    # PowerShell 5.1 bỏ mất đối số rỗng (--stockfish ""), nên cần một cờ riêng để tắt cột Stockfish.
    parser.add_argument("--no-stockfish", action="store_true", help="Bỏ cột Stockfish dù STOCKFISH_PATH đã đặt")
    parser.add_argument("--stockfish-rows", type=int, default=500)
    parser.add_argument("--stockfish-depth", type=int, default=12)
    args = parser.parse_args()
    if args.no_stockfish:
        args.stockfish = None

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")

    players = load_players(args.players)
    ids = list(players)
    checkpoints = {"base": args.base, **({"pool": args.pool} if args.pool else {}),
                   **{y: args.runs / f"{args.prefix}-{y}" / "best.pt" for y in ids}}
    missing = [str(path) for path in checkpoints.values() if not path.exists()]
    if missing:
        parser.error(f"Thiếu checkpoint: {', '.join(missing)}")

    report = evaluate_all(checkpoints, args.data, ids, args.device, batch_size=args.batch_size,
                          max_test_rows=args.max_test_rows, stockfish=args.stockfish,
                          stockfish_rows=args.stockfish_rows, stockfish_depth=args.stockfish_depth)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    # Tên ngắn cho hình: họ (phương Tây) hoặc tên (Việt Nam), "Lê Quang Liêm" → "Liêm".
    names = {y: players[y].display_name.split()[-1] for y in ids}
    write_tables(report, args.out_dir, names)
    write_figures(report, args.out_dir, names)

    print("\nTop-1 trên test (hàng: ván của ai · cột: mô hình)")
    models = model_order(report)
    print(f"{'':>10}" + "".join(f"{m:>10}" for m in models) + ("  stockfish" if "stockfish" in report else ""))
    for y in ids:
        row = report["accuracy"][y]
        line = f"{y:>10}" + "".join(f"{row[m]['top1'] * 100:>9.2f}%" for m in models)
        if "stockfish" in report:
            line += f"{report['stockfish'][y]['top1'] * 100:>10.2f}%"
        print(line + ("  ← đường chéo thắng" if report["diagonalWins"][y] else "  ← đường chéo THUA"))
    print("\nMô hình của chính kỳ thủ trừ từng mô hình khác (top-1, khoảng tin cậy 95% theo ván):")
    for y, others in report["diagonalVsOthers"].items():
        parts = " · ".join(f"vs {m} {e['diff'] * 100:+.2f} [{e['ci95'][0] * 100:+.2f}, {e['ci95'][1] * 100:+.2f}]"
                           + ("" if e["significant"] else " (không ý nghĩa)") for m, e in others.items())
        print(f"  {y}: {parts}")
    for variant in ("raw", "calibrated"):
        print(f"\nNhận diện kỳ thủ ({'thô' if variant == 'raw' else 'đã hiệu chỉnh'}):")
        for k, entry in report["identification"][variant].items():
            parts = " · ".join(f"{y} {entry['accuracy'][y] * 100:.1f}%" for y in ids)
            print(f"  {k:>2} ván: {parts} · trung bình {entry['macroAccuracy'] * 100:.1f}%")
    print(f"\nĐã ghi {args.out_dir}")


if __name__ == "__main__":
    main()
