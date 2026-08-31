"""Xuất checkpoint M2 sang ONNX cho tầng phục vụ.

    python -m m2.export_onnx --checkpoint runs/m2-baseline/best.pt --out models/m2.onnx

Xuất ONNX thay vì gọi thẳng PyTorch trong dịch vụ vì ba lý do đáng nêu trong
báo cáo: suy luận CPU nhanh hơn đáng kể qua ONNX Runtime, ảnh Docker không phải
kèm PyTorch (~2 GB), và đồ thị đã cố định nên không có rủi ro lệch phiên bản.

Đầu vào giữ nguyên ba tensor như lúc huấn luyện; việc che nước bất hợp lệ vẫn
do phía gọi làm, để đồ thị ONNX không phụ thuộc luật cờ.
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

import numpy as np
import torch

from .encoding import (
    ELO_BUCKET_EDGES,
    ELO_CENTER,
    ELO_SCALE,
    MOVE_UCIS,
    NUM_ELO_BUCKETS,
    NUM_MOVES,
    NUM_PLANES,
)
from .model import EloConditionedPolicyNet, ModelConfig

LOGGER = logging.getLogger("m2.export")


# opset 18 là mức tối thiểu: FiLM dùng ``chunk(2, dim=-1)``, sinh ra node Split
# với thuộc tính ``num_outputs`` mà opset 17 chưa có. Xuất ở 17 vẫn tạo ra file
# nhưng ONNX Runtime từ chối nạp — đó là lý do hàm _verify tồn tại.
DEFAULT_OPSET = 18


def export(
    checkpoint: Path,
    out: Path,
    opset: int = DEFAULT_OPSET,
    batch: int = 1,
    verify: bool = True,
) -> Path:
    state = torch.load(checkpoint, map_location="cpu", weights_only=False)
    cfg = ModelConfig(**state["model_config"])
    model = EloConditionedPolicyNet(cfg)
    model.load_state_dict(state["model"])
    model.eval()

    planes = torch.zeros(batch, NUM_PLANES, 8, 8)
    bucket = torch.zeros(batch, dtype=torch.long)
    elo_norm = torch.zeros(batch, dtype=torch.float32)

    # Trục batch động, khai báo theo kiểu của bộ xuất dynamo. Giữ 8x8 cố định:
    # bàn cờ không bao giờ đổi kích thước, và cố định nó cho đồ thị tối ưu hơn.
    batch_dim = torch.export.Dim("batch")
    dynamic_shapes = {
        "planes": {0: batch_dim},
        "elo_bucket": {0: batch_dim},
        "elo_norm": {0: batch_dim},
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        (planes, bucket, elo_norm),
        str(out),
        input_names=["planes", "elo_bucket", "elo_norm"],
        output_names=["policy_logits", "value_logits"],
        dynamic_shapes=dynamic_shapes,
        opset_version=opset,
        # Gói trọng số vào một file duy nhất. Mặc định bộ xuất tách ra file
        # .onnx.data đi kèm, rất dễ quên khi triển khai và làm hỏng dịch vụ.
        external_data=False,
        do_constant_folding=True,
        dynamo=True,
    )
    LOGGER.info("Đã ghi %s (%.1f MB)", out, out.stat().st_size / 1e6)

    stray = out.with_suffix(out.suffix + ".data")
    if stray.exists():
        stray.unlink()
        LOGGER.info("Đã xóa file trọng số rời %s", stray)

    # Bảng chỉ số nước đi phải đi kèm mô hình. Không có nó, phía phục vụ không
    # biết logit thứ i ứng với nước nào, và một thay đổi nhỏ trong encoding.py
    # sẽ âm thầm làm sai toàn bộ kết quả.
    sidecar = out.with_suffix(".meta.json")
    sidecar.write_text(json.dumps({
        "numMoves": NUM_MOVES,
        "numPlanes": NUM_PLANES,
        "numEloBuckets": NUM_ELO_BUCKETS,
        "eloBucketEdges": list(ELO_BUCKET_EDGES),
        "eloCenter": ELO_CENTER,
        "eloScale": ELO_SCALE,
        "modelConfig": state["model_config"],
        "trainStep": state.get("step"),
        "metrics": state.get("metrics", {}),
        "moveUcis": list(MOVE_UCIS),
    }, ensure_ascii=False), encoding="utf-8")
    LOGGER.info("Đã ghi metadata %s", sidecar)

    if verify:
        _verify(model, out, planes, bucket, elo_norm)
    return out


def _verify(
    model: EloConditionedPolicyNet,
    onnx_path: Path,
    planes: torch.Tensor,
    bucket: torch.Tensor,
    elo_norm: torch.Tensor,
) -> None:
    """Đối chiếu đầu ra ONNX với PyTorch trên đầu vào ngẫu nhiên."""
    try:
        import onnxruntime
    except ImportError:
        LOGGER.warning("Chưa cài onnxruntime, bỏ qua bước đối chiếu.")
        return

    torch.manual_seed(0)
    planes = torch.rand_like(planes).round()
    bucket = torch.randint(0, NUM_ELO_BUCKETS, bucket.shape)
    elo_norm = torch.randn_like(elo_norm)

    with torch.no_grad():
        expected, _ = model(planes, bucket, elo_norm)

    session = onnxruntime.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    actual = session.run(None, {
        "planes": planes.numpy(),
        "elo_bucket": bucket.numpy().astype(np.int64),
        "elo_norm": elo_norm.numpy(),
    })[0]

    delta = float(np.abs(expected.numpy() - actual).max())
    if delta > 1e-3:
        raise RuntimeError(f"ONNX lệch PyTorch quá nhiều: {delta:.2e}")
    LOGGER.info("Đối chiếu ONNX ↔ PyTorch OK (lệch tối đa %.2e)", delta)


def main() -> None:
    parser = argparse.ArgumentParser(description="Xuất mô hình M2 sang ONNX")
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("models/m2.onnx"))
    parser.add_argument("--opset", type=int, default=DEFAULT_OPSET)
    parser.add_argument("--no-verify", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s",
                        datefmt="%H:%M:%S")
    export(args.checkpoint, args.out, opset=args.opset, verify=not args.no_verify)


if __name__ == "__main__":
    main()
