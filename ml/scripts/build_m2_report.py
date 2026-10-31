#!/usr/bin/env python3
"""Gom kết quả một lần huấn luyện M2 thành thư mục báo cáo cho đồ án.

    python scripts/build_m2_report.py --run runs/m2-rtx5060ti --data data/m2

Mặc định ghi vào ``docs/thesis/m2/<tên run>/`` ở gốc repo (được đưa vào git, khác với
``runs/`` và ``data/``):

    data/      dataset_card.json, evaluation.json, history.jsonl, train_log.jsonl, train_config.json
    tables/    các bảng CSV (mở bằng Excel, dán vào Word)
    figures/   biểu đồ PNG 200 dpi cho bản in
    README.md  tóm tắt số liệu, danh sách file, lệnh tái lập

File ``NOTES.md`` (nhận xét viết tay) nếu đã có thì không bị ghi đè.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

REPO = Path(__file__).resolve().parents[2]

# Bảng màu: 3 màu đầu của bảng categorical chuẩn (đã kiểm bằng validate_palette.js,
# đạt cả với người mù màu), nền và chữ cho bản in nền sáng.
SURFACE = "#fcfcfb"
TEXT = "#0b0b0b"
TEXT_SECONDARY = "#52514e"
GRID = "#e4e3df"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
SEQUENTIAL = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "text.color": TEXT, "axes.labelcolor": TEXT, "axes.edgecolor": GRID,
    "xtick.color": TEXT_SECONDARY, "ytick.color": TEXT_SECONDARY,
    "axes.spines.top": False, "axes.spines.right": False, "axes.spines.left": False,
    "axes.grid": True, "axes.grid.axis": "y", "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.axisbelow": True, "font.family": "DejaVu Sans", "font.size": 10,
    "axes.titlesize": 12, "axes.titleweight": "bold", "legend.frameon": False,
    "lines.linewidth": 2, "lines.markersize": 5,
})


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def console_train_loss(path: Path) -> list[dict]:
    """Trích loss train từ log console (cho các run trước khi có train_log.jsonl)."""
    pattern = re.compile(r"bước\s+(\d+)/\d+ · loss ([\d.]+) · lr ([\d.e+-]+)")
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = pattern.search(line)
        if match:
            rows.append({"step": int(match[1]), "loss": float(match[2]), "lr": float(match[3])})
    return rows


def write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:  # BOM để Excel đọc đúng tiếng Việt
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)


def save(fig, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def percent_axis(ax) -> None:
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))


def plot_loss(train: list[dict], history: list[dict], path: Path) -> None:
    fig, ax = plt.subplots(figsize=(7.5, 4))
    if train:
        ax.plot([r["step"] for r in train], [r["loss"] for r in train], color=BLUE, label="Train (trung bình 100 bước)")
    ax.plot([r["step"] for r in history], [r["loss"] for r in history], color=ORANGE, marker="o", label="Validation")
    best = min(history, key=lambda r: r["loss"])
    ax.annotate(f"thấp nhất {best['loss']:.3f}\n(bước {best['step']:,})", (best["step"], best["loss"]),
                xytext=(0, -38), textcoords="offset points", ha="center", color=TEXT_SECONDARY, fontsize=9,
                arrowprops={"arrowstyle": "-", "color": TEXT_SECONDARY, "lw": 0.8})
    ax.set_title("Loss theo bước huấn luyện")
    ax.set_xlabel("Bước")
    ax.set_ylabel("Cross-entropy")
    ax.set_ylim(bottom=min(1.2, min(r["loss"] for r in history) - 0.2), top=min(4.0, ax.get_ylim()[1]))
    ax.legend(loc="upper right")
    save(fig, path)


def plot_validation_accuracy(history: list[dict], path: Path) -> None:
    fig, ax = plt.subplots(figsize=(7.5, 4))
    steps = [r["step"] for r in history]
    ax.plot(steps, [r["top3"] for r in history], color=BLUE, marker="o", label="Top-3")
    ax.plot(steps, [r["top1"] for r in history], color=ORANGE, marker="o", label="Top-1")
    for key, color in (("top3", BLUE), ("top1", ORANGE)):
        ax.annotate(f"{history[-1][key]:.1%}", (steps[-1], history[-1][key]), xytext=(6, 0),
                    textcoords="offset points", va="center", color=TEXT, fontsize=9)
    ax.set_title("Độ khớp nước đi trên tập validation")
    ax.set_xlabel("Bước")
    ax.set_ylim(0, 1)
    percent_axis(ax)
    ax.legend(loc="lower right")
    save(fig, path)


def plot_accuracy_by_elo(per_bucket: list[dict], path: Path, stockfish: dict | None = None) -> None:
    labels = [r["label"] for r in per_bucket]
    x = range(len(labels))
    width = 0.27
    fig, ax = plt.subplots(figsize=(9, 4.2))
    series = (("top1", "M2 (có Elo)", BLUE, None), ("baselineNoElo", "M2 bỏ qua Elo", ORANGE, None),
              ("baselineUniform", "Đoán đều mọi nước hợp lệ", AQUA, "//"))
    for offset, (key, name, color, hatch) in zip((-width, 0, width), series):
        ax.bar([i + offset for i in x], [r[key] for r in per_bucket], width, color=color, label=name,
               edgecolor=SURFACE, linewidth=1.5, hatch=hatch)
    top = max(r["top1"] for r in per_bucket)
    if stockfish:
        # Vạch ngang màu mực: mốc so sánh, không phải một chuỗi dữ liệu cùng loại với các cột.
        engine = {r["label"]: r["top1"] for r in stockfish["perBucket"]}
        points = [(i, engine[label]) for i, label in zip(x, labels) if label in engine]
        ax.scatter([i for i, _ in points], [v for _, v in points], marker="_", s=900, linewidths=2.2,
                   color=TEXT, zorder=3, label=f"Stockfish depth {stockfish['depth']}")
        top = max([top, *[v for _, v in points]])
    ax.set_xticks(list(x), labels, rotation=30, ha="right")
    ax.set_title("Top-1 theo dải Elo (tập test)")
    ax.set_xlabel("Dải Elo Lichess của người đi nước")
    ax.set_ylim(0, top * 1.38)
    percent_axis(ax)
    ax.legend(loc="upper center", ncol=4 if stockfish else 3, fontsize=8.5, markerscale=0.6)
    save(fig, path)


def plot_elo_contribution(per_bucket: list[dict], path: Path) -> None:
    labels = [r["label"] for r in per_bucket]
    deltas = [(r["top1"] - r["baselineNoElo"]) * 100 for r in per_bucket]
    fig, ax = plt.subplots(figsize=(9, 3.6))
    ax.bar(labels, deltas, color=[BLUE if d >= 0 else ORANGE for d in deltas], width=0.6,
           edgecolor=SURFACE, linewidth=1.5)
    ax.axhline(0, color=TEXT_SECONDARY, linewidth=0.8)
    for index, delta in enumerate(deltas):
        ax.annotate(f"{delta:+.2f}", (index, delta), xytext=(0, 4 if delta >= 0 else -12),
                    textcoords="offset points", ha="center", fontsize=8.5, color=TEXT)
    span = max(deltas) - min(min(deltas), 0)
    ax.set_ylim(min(min(deltas), 0) - span * 0.15, max(deltas) + span * 0.12)
    ax.set_title("Đóng góp của điều kiện hóa Elo: top-1 (có Elo) − top-1 (bỏ Elo)")
    ax.set_ylabel("Điểm phần trăm")
    ax.tick_params(axis="x", rotation=30)
    save(fig, path)


def plot_interpolation(interpolation: dict, path: Path, nll: bool = False) -> None:
    labels = interpolation["labels"]
    matrix = interpolation["nllMatrix" if nll else "matrix"]
    size = len(labels)
    # Với NLL, thấp hơn là tốt hơn: đảo thang màu để ô tốt vẫn là ô đậm.
    cmap = LinearSegmentedColormap.from_list("blue", SEQUENTIAL[::-1] if nll else SEQUENTIAL)
    values = [v for row in matrix for v in row]
    fig, ax = plt.subplots(figsize=(9, 7.4))
    ax.grid(False)
    image = ax.imshow(matrix, cmap=cmap, vmin=min(values), vmax=max(values))
    for i, row in enumerate(matrix):
        best = (min if nll else max)(range(size), key=lambda j: row[j])
        for j, value in enumerate(row):
            dark = (value - min(values)) / max(max(values) - min(values), 1e-9) > 0.55
            dark = not dark if nll else dark
            ax.text(j, i, f"{value:.3f}" if nll else f"{value * 100:.1f}", ha="center", va="center", fontsize=7.5,
                    color="#ffffff" if dark else TEXT, fontweight="bold" if j == best else "normal")
        # Khung đậm: cột hỏi cho kết quả tốt nhất ở hàng này. Nằm trên đường chéo nghĩa là
        # mô hình khớp người chơi nhất khi được hỏi đúng dải Elo của họ.
        ax.add_patch(Rectangle((best - 0.5, i - 0.5), 1, 1, fill=False, edgecolor=TEXT, linewidth=1.8))
    ax.set_xticks(range(size), labels, rotation=45, ha="right")
    ax.set_yticks(range(size), labels)
    ax.set_xlabel("Elo được hỏi")
    ax.set_ylabel("Elo thật của người chơi")
    if nll:
        ax.set_title(f"Ma trận nội suy Elo (NLL, thấp hơn = khớp hơn) · đường chéo thắng "
                     f"{interpolation['nllDiagonalWins']}/{size} hàng")
    else:
        ax.set_title(f"Ma trận nội suy Elo (top-1, %) · đường chéo thắng {interpolation['diagonalWins']}/{size} hàng")
    colorbar = fig.colorbar(image, ax=ax, fraction=0.046, pad=0.04)
    if not nll:
        colorbar.ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
    colorbar.outline.set_visible(False)
    save(fig, path)


def plot_elo_estimation(estimation: dict, path: Path) -> None:
    rows = estimation["perMoveCount"]
    moves = [r["moves"] for r in rows]
    fig, ax = plt.subplots(figsize=(7.5, 4))
    ax.plot(moves, [r["p90"] for r in rows], color=AQUA, marker="o", linestyle="--", label="Phân vị 90")
    ax.plot(moves, [r["mae"] for r in rows], color=BLUE, marker="o", label="MAE")
    ax.plot(moves, [r["median"] for r in rows], color=ORANGE, marker="o", label="Trung vị")
    ax.set_xscale("log", base=2)
    ax.set_xticks(moves, [str(m) for m in moves])
    ax.set_ylim(0, max(r["p90"] for r in rows) * 1.3)
    ax.set_title(f"Sai số ước lượng Elo theo số nước quan sát ({estimation['players']} người chơi)")
    ax.set_xlabel("Số nước dùng để ước lượng")
    ax.set_ylabel("Sai số tuyệt đối (điểm Elo)")
    ax.legend(loc="upper center", ncol=3)
    save(fig, path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", type=Path, required=True, help="Thư mục run, ví dụ runs/m2-rtx5060ti")
    parser.add_argument("--data", type=Path, default=Path("data/m2"), help="Thư mục dữ liệu (lấy dataset_card.json)")
    parser.add_argument("--out", type=Path, default=None, help="Mặc định docs/thesis/m2/<tên run>")
    parser.add_argument("--console-log", type=Path, default=None,
                        help="Log console của run cũ (chưa có train_log.jsonl) để lấy loss train")
    args = parser.parse_args()
    # Terminal Windows cũ dùng cp1252, không in được tiếng Việt; đừng để việc in làm dừng script.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    evaluation_path = args.run / "evaluation.json"
    if not evaluation_path.exists():
        sys.exit(f"Chưa có {evaluation_path}: hãy chạy python -m m2.evaluate trước.")
    out = args.out or REPO / "docs" / "thesis" / "m2" / args.run.name
    (out / "data").mkdir(parents=True, exist_ok=True)

    evaluation = json.loads(evaluation_path.read_text(encoding="utf-8"))
    history = read_jsonl(args.run / "history.jsonl")
    train_log = read_jsonl(args.run / "train_log.jsonl")
    if not train_log and args.console_log:
        train_log = console_train_loss(args.console_log)

    for name in ("evaluation.json", "history.jsonl", "train_log.jsonl"):
        if (args.run / name).exists():
            shutil.copy2(args.run / name, out / "data" / name)
    card_path = args.data / "dataset_card.json"
    card = json.loads(card_path.read_text(encoding="utf-8")) if card_path.exists() else None
    if card:
        shutil.copy2(card_path, out / "data" / "dataset_card.json")

    train_config = None
    checkpoint = args.run / "best.pt"
    if checkpoint.exists():
        import torch

        state = torch.load(checkpoint, map_location="cpu", weights_only=False)
        train_config = {"train_config": state.get("train_config"), "model_config": state.get("model_config"),
                        "best_step": state.get("step"), "best_metrics": state.get("metrics")}
        (out / "data" / "train_config.json").write_text(
            json.dumps(train_config, indent=2, ensure_ascii=False), encoding="utf-8")

    per_bucket = evaluation["accuracy"]["perBucket"]
    overall = evaluation["accuracy"]["overall"]
    interpolation = evaluation["interpolation"]
    estimation = evaluation["eloEstimation"]
    stockfish = evaluation.get("stockfish")

    tables = out / "tables"
    write_csv(tables / "accuracy_by_elo.csv",
              ["Dải Elo", "Số vị trí", "Top-1", "Top-3", "Đoán đều", "Bỏ qua Elo", "Đóng góp Elo (điểm %)"],
              [[r["label"], r["n"], round(r["top1"], 4), round(r["top3"], 4), round(r["baselineUniform"], 4),
                round(r["baselineNoElo"], 4), round((r["top1"] - r["baselineNoElo"]) * 100, 2)] for r in per_bucket]
              + [["TỔNG", overall["n"], round(overall["top1"], 4), round(overall["top3"], 4),
                  round(overall["baselineUniform"], 4), round(overall["baselineNoElo"], 4),
                  round((overall["top1"] - overall["baselineNoElo"]) * 100, 2)]])
    if interpolation.get("nllMatrix"):
        write_csv(tables / "interpolation_nll.csv", ["Elo thật \\ Elo hỏi", *interpolation["labels"]],
                  [[label, *[round(v, 4) for v in row]]
                   for label, row in zip(interpolation["labels"], interpolation["nllMatrix"])])
    if stockfish:
        write_csv(tables / "stockfish_baseline.csv", ["Dải Elo", "Số vị trí", "Top-1", "Top-3"],
                  [[r["label"], r["n"], round(r["top1"], 4), round(r["top3"], 4)] for r in stockfish["perBucket"]]
                  + [["TỔNG", stockfish["overall"]["n"], round(stockfish["overall"]["top1"], 4),
                      round(stockfish["overall"]["top3"], 4)]])
    write_csv(tables / "interpolation_matrix.csv", ["Elo thật \\ Elo hỏi", *interpolation["labels"]],
              [[label, *[round(v, 4) for v in row]] for label, row in zip(interpolation["labels"], interpolation["matrix"])])
    write_csv(tables / "elo_estimation.csv", ["Số nước", "MAE", "Trung vị", "P90"],
              [[r["moves"], round(r["mae"], 1), round(r["median"], 1), round(r["p90"], 1)] for r in estimation["perMoveCount"]])
    write_csv(tables / "validation_history.csv", ["Bước", "Epoch", "Loss", "Top-1", "Top-3", "elo_sep", "LR"],
              [[r["step"], r["epoch"], round(r["loss"], 4), round(r["top1"], 4), round(r["top3"], 4),
                round(r["elo_sep"], 4), r["lr"]] for r in history])
    if train_log:
        write_csv(tables / "train_loss.csv", ["Bước", "Loss train", "LR"],
                  [[r["step"], round(r["loss"], 4), r["lr"]] for r in train_log])
    if card:
        players = card.get("players_per_elo_bucket", {})
        write_csv(tables / "dataset_by_elo.csv", ["Dải Elo", "Số vị trí", "Số người chơi"],
                  [[label, count, players.get(label, "")]
                   for label, count in card.get("positions_per_elo_bucket", {}).items()])

    figures = out / "figures"
    if history:
        plot_loss(train_log, history, figures / "01_loss.png")
        plot_validation_accuracy(history, figures / "02_validation_accuracy.png")
    plot_accuracy_by_elo(per_bucket, figures / "03_accuracy_by_elo.png", stockfish)
    plot_elo_contribution(per_bucket, figures / "04_elo_contribution.png")
    plot_interpolation(interpolation, figures / "05_interpolation_matrix.png")
    plot_elo_estimation(estimation, figures / "06_elo_estimation.png")
    if interpolation.get("nllMatrix"):
        plot_interpolation(interpolation, figures / "07_interpolation_nll.png", nll=True)

    best_val = min(history, key=lambda r: r["loss"]) if history else None
    lines = [
        f"# Kết quả M2 — `{args.run.name}`",
        "",
        "Sinh tự động bởi `ml/scripts/build_m2_report.py`; đừng sửa tay (chạy lại sẽ ghi đè).",
        "Nhận xét viết tay để trong `NOTES.md` cùng thư mục.",
        "",
        "## Số liệu chính (tập test)",
        "",
        "| Chỉ số | Giá trị |",
        "| --- | --- |",
        f"| Top-1 | {overall['top1']:.2%} |",
        f"| Top-3 | {overall['top3']:.2%} |",
        f"| Top-1 khi bỏ qua Elo | {overall['baselineNoElo']:.2%} |",
        f"| Đóng góp của Elo | {(overall['top1'] - overall['baselineNoElo']) * 100:+.2f} điểm % |",
        f"| Đoán đều mọi nước hợp lệ | {overall['baselineUniform']:.2%} |",
        *([f"| Stockfish depth {stockfish['depth']} top-1 ({stockfish['overall']['n']:,} vị trí) | "
           f"{stockfish['overall']['top1']:.2%} |"] if stockfish else []),
        f"| Đường chéo ma trận nội suy thắng | {interpolation['diagonalWins']}/{len(interpolation['labels'])} hàng |",
        *([f"| Đường chéo thắng theo NLL | {interpolation['nllDiagonalWins']}/{len(interpolation['labels'])} hàng "
           f"(lệch TB {interpolation['nllMeanOffset']:.2f} dải) |"] if interpolation.get("nllMatrix") else []),
        f"| MAE ước lượng Elo (80 nước, {estimation['players']} người) | {estimation['perMoveCount'][-1]['mae']:.0f} |",
        f"| Số vị trí test | {overall['n']:,} |",
    ]
    if best_val:
        lines.append(f"| Loss validation thấp nhất | {best_val['loss']:.4f} (bước {best_val['step']:,}) |")
    if card:
        lines += ["", "## Dữ liệu", "",
                  f"- Nguồn: {', '.join(card['source_files'])} ({card['source_license']})",
                  f"- {card['games_seen']:,} ván đã đọc, {card['games_kept']:,} ván được dùng"
                  + (f", {card['players']:,} người chơi" if card.get("players") else "")
                  + f" · dừng vì: {card['stop_reason']}",
                  *([f"- Lấy mẫu train: tối đa {card['filters']['positions_per_side']} vị trí mỗi bên/ván, "
                     f"{card['filters'].get('max_positions_per_player') or 'không giới hạn'} vị trí mỗi người"]
                    if card["filters"].get("positions_per_side") else []),
                  f"- Split: {', '.join(f'{k} {v:,}' for k, v in card['splits'].items())} vị trí (chia theo ván)"]
    if train_config:
        model_config = train_config["model_config"] or {}
        lines += ["", "## Mô hình", "",
                  f"- ResNet {model_config.get('blocks')} khối × {model_config.get('channels')} kênh, FiLM theo Elo "
                  f"(elo_dim {model_config.get('elo_dim')}); checkpoint tốt nhất ở bước {train_config['best_step']:,}"]
    lines += ["", "## Hình", ""]
    for figure in sorted(figures.glob("*.png")):
        lines += [f"![{figure.stem}](figures/{figure.name})", ""]
    lines += ["## File", "",
              "- `data/`: dữ liệu gốc (JSON) — đủ để vẽ lại mọi hình",
              "- `tables/`: bảng CSV (UTF-8 có BOM, mở thẳng bằng Excel)",
              "- `figures/`: PNG 200 dpi", "",
              "## Tái lập", "", "```powershell", "cd ml",
              f"python scripts/build_m2_report.py --run runs/{args.run.name} --data {args.data.as_posix()}", "```", ""]
    if train_log and not (args.run / "train_log.jsonl").exists():
        lines.insert(4, "Loss train của run này được trích từ log console (run chạy trước khi có `train_log.jsonl`).")
    (out / "README.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"Đã ghi báo cáo vào {out}")
    for path in sorted(out.rglob("*")):
        if path.is_file():
            print(f"  {path.relative_to(out)}")


if __name__ == "__main__":
    main()
