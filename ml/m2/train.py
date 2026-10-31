"""Vòng lặp huấn luyện M2.

Chạy:

    python -m m2.train --config config/m2.yaml

Hỗ trợ dừng và chạy tiếp: mỗi checkpoint lưu đủ trạng thái optimizer, scheduler
và scaler, nên ``--resume runs/<tên>/last.pt`` tiếp đúng chỗ đã dừng. Điều này
quan trọng với Colab/Kaggle vì phiên có thể bị ngắt giữa chừng.

Có ba con số cần theo dõi, in ra mỗi lần đánh giá:

* ``top1`` — độ khớp nước đi với người thật. Đây là chỉ số chính của M2.
  Maia đạt ~50–52%%; Stockfish chỉ ~33–40%% vì nó trả lời câu hỏi khác.
* ``top3`` — nước người chơi đi có nằm trong ba gợi ý đầu không.
* ``elo_sep`` — chênh lệch log-likelihood khi hỏi mô hình ở đúng dải Elo so với
  hỏi ở dải sai. Nếu số này không dương và không tăng, việc điều kiện hóa Elo
  chưa học được gì, và tính năng ước lượng Elo ở M2③ sẽ không hoạt động.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import logging
import math
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import yaml
from torch.utils.data import DataLoader

from .dataset import (
    ShardDataset,
    StreamingShardDataset,
    collate,
    count_rows,
)
from .encoding import NUM_ELO_BUCKETS, bucket_center, normalize_elo
from .model import EloConditionedPolicyNet, ModelConfig

LOGGER = logging.getLogger("m2.train")

# Elo chuẩn hóa ở tâm mỗi dải, dùng khi hỏi mạng ở một dải khác dải thật.
BUCKET_CENTER_NORM = torch.tensor(
    [normalize_elo(bucket_center(b)) for b in range(NUM_ELO_BUCKETS)], dtype=torch.float32
)


@dataclasses.dataclass
class TrainConfig:
    data_dir: str = "data/m2"
    run_dir: str = "runs/m2-baseline"

    batch_size: int = 512
    epochs: int = 4
    lr: float = 2e-3
    min_lr: float = 1e-5
    weight_decay: float = 1e-4
    warmup_steps: int = 2_000
    grad_clip: float = 1.0

    value_loss_weight: float = 0.15
    label_smoothing: float = 0.02

    num_workers: int = 6
    shuffle_buffer: int = 50_000
    prefetch_factor: int = 4

    eval_every: int = 2_000
    eval_batches: int = 60
    log_every: int = 100
    save_every: int = 5_000
    val_rows: int = 60_000

    amp: bool = True
    seed: int = 1337
    max_steps: int | None = None
    # Dừng khi loss validation không giảm sau chừng này lần đánh giá liên tiếp.
    early_stop_patience: int | None = None

    model: ModelConfig = dataclasses.field(default_factory=ModelConfig)


def load_config(path: Path | None) -> TrainConfig:
    if path is None:
        return TrainConfig()
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    model_raw = raw.pop("model", {}) or {}
    cfg = TrainConfig(**raw)
    cfg.model = ModelConfig(**model_raw)
    return cfg


def pick_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def lr_at(step: int, cfg: TrainConfig, total_steps: int) -> float:
    """Warmup tuyến tính rồi giảm theo cosine."""
    if step < cfg.warmup_steps:
        return cfg.lr * (step + 1) / cfg.warmup_steps
    progress = (step - cfg.warmup_steps) / max(1, total_steps - cfg.warmup_steps)
    progress = min(1.0, max(0.0, progress))
    return cfg.min_lr + 0.5 * (cfg.lr - cfg.min_lr) * (1 + math.cos(math.pi * progress))


@torch.no_grad()
def evaluate(
    model: EloConditionedPolicyNet,
    loader: DataLoader,
    device: torch.device,
    max_batches: int,
) -> dict[str, float]:
    """Đo top-1, top-3 và mức tách biệt theo Elo trên tập kiểm định."""
    model.eval()
    total = correct1 = correct3 = 0
    loss_sum = 0.0
    right_elo_ll = 0.0
    wrong_elo_ll = 0.0
    index = -1

    for index, batch in enumerate(loader):
        if index >= max_batches:
            break
        planes = batch["planes"].to(device, non_blocking=True)
        bucket = batch["elo_bucket"].to(device, non_blocking=True)
        elo_norm = batch["elo_norm"].to(device, non_blocking=True)
        target = batch["target"].to(device, non_blocking=True)

        mask = batch["legal_mask"].to(device) if "legal_mask" in batch else None
        logits, _ = model(planes, bucket, elo_norm)
        if mask is not None:
            logits = logits.masked_fill(~mask, float("-inf"))

        loss_sum += F.cross_entropy(logits, target).item()
        top3 = logits.topk(3, dim=-1).indices
        correct1 += (top3[:, 0] == target).sum().item()
        correct3 += (top3 == target.unsqueeze(-1)).any(dim=-1).sum().item()
        total += target.numel()

        # Hỏi lại cùng thế cờ nhưng ở một dải Elo khác. Nếu điều kiện hóa có
        # tác dụng, log-likelihood của nước người thật đi phải cao hơn khi hỏi
        # đúng dải của họ.
        # Phải che nước bất hợp lệ y hệt nhánh trên, nếu không phép so sánh
        # đo tác dụng của việc che chứ không đo điều kiện hóa Elo.
        # Elo liên tục phải khớp với dải đã đổi: bản trước truyền -elo_norm, tạo ra
        # cặp (dải, Elo) mâu thuẫn mà mạng chưa từng thấy, nên elo_sep đo độ "vỡ"
        # của mạng trên đầu vào lạ (tăng vọt tới hàng trăm) chứ không đo tác dụng
        # của Elo. Ma trận nội suy trong evaluate.py vốn đã dùng cặp khớp nhau.
        shifted = (bucket + NUM_ELO_BUCKETS // 2) % NUM_ELO_BUCKETS
        wrong_logits, _ = model(planes, shifted, BUCKET_CENTER_NORM.to(device)[shifted])
        if mask is not None:
            wrong_logits = wrong_logits.masked_fill(~mask, float("-inf"))
        right_elo_ll += -F.cross_entropy(logits, target, reduction="mean").item()
        wrong_elo_ll += -F.cross_entropy(wrong_logits, target, reduction="mean").item()

    batches = max(1, min(max_batches, index + 1))
    model.train()
    return {
        "loss": loss_sum / batches,
        "top1": correct1 / max(total, 1),
        "top3": correct3 / max(total, 1),
        "elo_sep": (right_elo_ll - wrong_elo_ll) / batches,
    }


def save_checkpoint(
    path: Path,
    model: EloConditionedPolicyNet,
    optimizer: torch.optim.Optimizer,
    scaler: torch.amp.GradScaler,
    step: int,
    epoch: int,
    cfg: TrainConfig,
    metrics: dict[str, float],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model": model.state_dict(),
            "model_config": dataclasses.asdict(cfg.model),
            "optimizer": optimizer.state_dict(),
            "scaler": scaler.state_dict(),
            "step": step,
            "epoch": epoch,
            "metrics": metrics,
            "train_config": {
                k: v for k, v in dataclasses.asdict(cfg).items() if k != "model"
            },
        },
        path,
    )


def train(cfg: TrainConfig, resume: Path | None = None) -> Path:
    torch.manual_seed(cfg.seed)
    device = pick_device()
    run_dir = Path(cfg.run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)

    data_dir = Path(cfg.data_dir)
    train_rows = count_rows(data_dir, "train")
    steps_per_epoch = max(1, train_rows // cfg.batch_size)
    total_steps = cfg.max_steps or steps_per_epoch * cfg.epochs

    LOGGER.info("Thiết bị: %s", device)
    LOGGER.info(
        "Tập huấn luyện: %d vị trí · %d bước/epoch · tổng %d bước",
        train_rows, steps_per_epoch, total_steps,
    )

    train_set = StreamingShardDataset(
        data_dir, "train", shuffle=True,
        shuffle_buffer=cfg.shuffle_buffer, seed=cfg.seed,
    )
    val_set = ShardDataset(data_dir, "val", max_rows=cfg.val_rows, with_mask=True)

    loader_kwargs = {"num_workers": cfg.num_workers, "collate_fn": collate,
                     "pin_memory": device.type == "cuda"}
    if cfg.num_workers > 0:
        loader_kwargs["persistent_workers"] = True
        loader_kwargs["prefetch_factor"] = cfg.prefetch_factor

    train_loader = DataLoader(train_set, batch_size=cfg.batch_size, **loader_kwargs)
    val_loader = DataLoader(val_set, batch_size=cfg.batch_size, shuffle=False,
                            num_workers=min(2, cfg.num_workers), collate_fn=collate)

    model = EloConditionedPolicyNet(cfg.model).to(device)
    LOGGER.info("Mô hình %s · %.2fM tham số",
                cfg.model.name, model.parameter_count() / 1e6)

    optimizer = torch.optim.AdamW(
        model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay
    )
    use_amp = cfg.amp and device.type == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    step = 0
    start_epoch = 0
    if resume and resume.exists():
        state = torch.load(resume, map_location=device, weights_only=False)
        model.load_state_dict(state["model"])
        optimizer.load_state_dict(state["optimizer"])
        scaler.load_state_dict(state["scaler"])
        step = state["step"]
        start_epoch = state["epoch"]
        LOGGER.info("Chạy tiếp từ %s (bước %d, epoch %d)", resume, step, start_epoch)

    history_path = run_dir / "history.jsonl"
    train_log_path = run_dir / "train_log.jsonl"
    best_top1 = 0.0
    best_val_loss = float("inf")
    evals_without_improvement = 0
    started = time.time()
    running_loss = 0.0
    running_n = 0

    for epoch in range(start_epoch, cfg.epochs):
        train_set.set_epoch(epoch)
        for batch in train_loader:
            lr = lr_at(step, cfg, total_steps)
            for group in optimizer.param_groups:
                group["lr"] = lr

            planes = batch["planes"].to(device, non_blocking=True)
            bucket = batch["elo_bucket"].to(device, non_blocking=True)
            elo_norm = batch["elo_norm"].to(device, non_blocking=True)
            target = batch["target"].to(device, non_blocking=True)
            value_target = batch["value_target"].to(device, non_blocking=True)

            with torch.autocast("cuda", enabled=use_amp):
                policy, value = model(planes, bucket, elo_norm)
                loss = F.cross_entropy(
                    policy, target, label_smoothing=cfg.label_smoothing
                )
                if value is not None and cfg.value_loss_weight > 0:
                    loss = loss + cfg.value_loss_weight * F.cross_entropy(
                        value, value_target
                    )

            optimizer.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            if cfg.grad_clip:
                scaler.unscale_(optimizer)
                nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
            scaler.step(optimizer)
            scaler.update()

            running_loss += loss.item()
            running_n += 1
            step += 1

            if step % cfg.log_every == 0:
                rate = step * cfg.batch_size / max(time.time() - started, 1e-9)
                train_loss = running_loss / max(running_n, 1)
                LOGGER.info(
                    "bước %6d/%d · loss %.4f · lr %.2e · %.0f mẫu/s",
                    step, total_steps, train_loss, lr, rate,
                )
                # Ghi ra file để vẽ đường loss train cạnh loss validation trong báo cáo.
                with train_log_path.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps({"step": step, "epoch": epoch, "loss": train_loss,
                                             "lr": lr, "samples_per_s": rate}) + "\n")
                running_loss = 0.0
                running_n = 0

            if step % cfg.eval_every == 0:
                metrics = evaluate(model, val_loader, device, cfg.eval_batches)
                metrics.update({"step": step, "epoch": epoch, "lr": lr})
                LOGGER.info(
                    "ĐÁNH GIÁ bước %d · top1 %.4f · top3 %.4f · elo_sep %+.4f · loss %.4f",
                    step, metrics["top1"], metrics["top3"],
                    metrics["elo_sep"], metrics["loss"],
                )
                with history_path.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(metrics) + "\n")

                if metrics["top1"] > best_top1:
                    best_top1 = metrics["top1"]
                    save_checkpoint(run_dir / "best.pt", model, optimizer,
                                    scaler, step, epoch, cfg, metrics)
                    LOGGER.info("→ checkpoint tốt nhất mới (top1 %.4f)", best_top1)

                if metrics["loss"] < best_val_loss:
                    best_val_loss = metrics["loss"]
                    evals_without_improvement = 0
                else:
                    evals_without_improvement += 1
                if cfg.early_stop_patience and evals_without_improvement >= cfg.early_stop_patience:
                    LOGGER.info("Loss validation không giảm sau %d lần đánh giá (thấp nhất %.4f), dừng sớm.",
                                evals_without_improvement, best_val_loss)
                    save_checkpoint(run_dir / "last.pt", model, optimizer,
                                    scaler, step, epoch, cfg, {"top1": best_top1})
                    return run_dir / "best.pt"

            if step % cfg.save_every == 0:
                save_checkpoint(run_dir / "last.pt", model, optimizer,
                                scaler, step, epoch, cfg, {"top1": best_top1})

            if cfg.max_steps and step >= cfg.max_steps:
                LOGGER.info("Đạt max_steps=%d, dừng.", cfg.max_steps)
                save_checkpoint(run_dir / "last.pt", model, optimizer,
                                scaler, step, epoch, cfg, {"top1": best_top1})
                return run_dir / "best.pt"

    save_checkpoint(run_dir / "last.pt", model, optimizer, scaler,
                    step, cfg.epochs, cfg, {"top1": best_top1})
    LOGGER.info("Xong. top1 tốt nhất = %.4f · checkpoint tại %s", best_top1, run_dir)
    return run_dir / "best.pt"


def main() -> None:
    parser = argparse.ArgumentParser(description="Huấn luyện mạng chính sách M2")
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument("--resume", type=Path, default=None)
    parser.add_argument("--data-dir", type=str, default=None)
    parser.add_argument("--run-dir", type=str, default=None)
    parser.add_argument("--max-steps", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=None)
    parser.add_argument("--num-workers", type=int, default=None)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    cfg = load_config(args.config)
    for field in ("data_dir", "run_dir", "max_steps", "batch_size", "num_workers"):
        value = getattr(args, field)
        if value is not None:
            setattr(cfg, field, value)

    train(cfg, resume=args.resume)


if __name__ == "__main__":
    main()
