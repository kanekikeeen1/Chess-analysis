"""M2 — mô hình hóa hành vi người chơi cho Chess Analysis.

Một mạng chính sách duy nhất, điều kiện hóa theo Elo, dự đoán nước đi mà *con
người* ở một trình độ cho trước sẽ chọn — khác với Stockfish vốn trả lời nước
đi tốt nhất tuyệt đối.

Thứ tự sử dụng:

1. ``scripts/prepare_m2_data.py`` — Lichess PGN → shard Parquet
2. ``python -m m2.train`` — huấn luyện
3. ``python -m m2.evaluate`` — top-1/top-3 theo dải Elo, MAE ước lượng Elo
4. ``python -m m2.export_onnx`` — xuất ONNX cho tầng phục vụ
"""

from .encoding import (
    NUM_ELO_BUCKETS,
    NUM_MOVES,
    NUM_PLANES,
    bucket_center,
    bucket_label,
    elo_to_bucket,
    encode_board,
    index_to_move,
    legal_move_mask,
    move_to_index,
    normalize_elo,
)
from .model import EloConditionedPolicyNet, ModelConfig, build_model

__all__ = [
    "NUM_ELO_BUCKETS",
    "NUM_MOVES",
    "NUM_PLANES",
    "EloConditionedPolicyNet",
    "ModelConfig",
    "build_model",
    "bucket_center",
    "bucket_label",
    "elo_to_bucket",
    "encode_board",
    "index_to_move",
    "legal_move_mask",
    "move_to_index",
    "normalize_elo",
]

__version__ = "0.1.0"
