"""Mạng chính sách có điều kiện Elo.

Điểm khác biệt so với Maia nằm ở đây. Maia huấn luyện chín mạng rời rạc, mỗi
mạng cho một dải Elo; muốn biết người 1450 chơi thế nào thì phải chọn lấy mạng
gần nhất và không có cách nào nội suy. M2 dùng **một mạng duy nhất** nhận trình
độ làm đầu vào, thông qua cơ chế FiLM (Feature-wise Linear Modulation, Perez và
cộng sự, AAAI 2018): mỗi khối residual được điều biến bởi một cặp hệ số
(gamma, beta) sinh ra từ vector Elo.

Hệ quả có thể kiểm chứng, và cũng là thứ nên đưa vào chương thực nghiệm:

* Một mạng thay chín mạng → tham số ít hơn nhiều lần, chỉ một checkpoint để
  triển khai.
* Elo là biến liên tục, nên hỏi được ở mức chưa từng có trong dữ liệu huấn
  luyện (ví dụ 1450) và mạng nội suy mượt giữa hai dải lân cận.
* Đường cong "độ khớp nước đi theo Elo hỏi" phải đơn điệu quanh Elo thật của
  người chơi — chính tính chất này làm cho việc ước lượng Elo ở M2③ hoạt động.

Trình độ được đưa vào ở hai dạng bổ trợ: chỉ số dải qua embedding (bắt các đặc
trưng riêng của từng nhóm) và giá trị liên tục đã chuẩn hóa (cho phép nội suy).
"""

from __future__ import annotations

import dataclasses

import torch
import torch.nn as nn
import torch.nn.functional as F

from .encoding import NUM_ELO_BUCKETS, NUM_MOVES, NUM_PLANES


@dataclasses.dataclass(slots=True)
class ModelConfig:
    channels: int = 128
    blocks: int = 10
    elo_dim: int = 64
    policy_channels: int = 32
    value_channels: int = 16
    value_head: bool = True
    dropout: float = 0.0

    @property
    def name(self) -> str:
        return f"m2-r{self.blocks}x{self.channels}"


class EloEncoder(nn.Module):
    """Sinh vector điều kiện từ (dải Elo, Elo liên tục đã chuẩn hóa)."""

    def __init__(self, dim: int):
        super().__init__()
        self.bucket = nn.Embedding(NUM_ELO_BUCKETS, dim)
        self.continuous = nn.Linear(1, dim)
        self.mix = nn.Sequential(
            nn.SiLU(),
            nn.Linear(dim, dim),
            nn.SiLU(),
        )

    def forward(self, bucket: torch.Tensor, elo_norm: torch.Tensor) -> torch.Tensor:
        z = self.bucket(bucket) + self.continuous(elo_norm.unsqueeze(-1))
        return self.mix(z)


class FiLMResidualBlock(nn.Module):
    """Khối residual chuẩn, có thêm điều biến (gamma, beta) theo trình độ.

    Điều biến được đặt sau chuẩn hóa của nhánh conv thứ hai và trước phép cộng
    residual, nên trình độ tác động lên *đặc trưng đã trích xuất* chứ không làm
    méo tín hiệu bàn cờ ở đầu vào.
    """

    def __init__(self, channels: int, elo_dim: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.norm1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.norm2 = nn.BatchNorm2d(channels)
        self.film = nn.Linear(elo_dim, channels * 2)

        # Khởi tạo để khối bắt đầu ở trạng thái gần như đồng nhất: gamma≈1,
        # beta≈0. Nếu không, tín hiệu Elo lúc đầu sẽ áp đảo và làm hỏng phần
        # học biểu diễn bàn cờ trong vài nghìn bước đầu.
        nn.init.zeros_(self.film.weight)
        nn.init.zeros_(self.film.bias)

    def forward(self, x: torch.Tensor, elo: torch.Tensor) -> torch.Tensor:
        residual = x
        out = F.silu(self.norm1(self.conv1(x)))
        out = self.norm2(self.conv2(out))

        gamma, beta = self.film(elo).chunk(2, dim=-1)
        gamma = (1.0 + gamma).unsqueeze(-1).unsqueeze(-1)
        beta = beta.unsqueeze(-1).unsqueeze(-1)
        out = out * gamma + beta

        return F.silu(out + residual)


class EloConditionedPolicyNet(nn.Module):
    """Dự đoán phân phối nước đi mà người ở trình độ đã cho sẽ chọn."""

    def __init__(self, cfg: ModelConfig | None = None):
        super().__init__()
        self.cfg = cfg or ModelConfig()
        c = self.cfg.channels

        self.stem = nn.Sequential(
            nn.Conv2d(NUM_PLANES, c, 3, padding=1, bias=False),
            nn.BatchNorm2d(c),
            nn.SiLU(),
        )
        self.elo_encoder = EloEncoder(self.cfg.elo_dim)
        self.blocks = nn.ModuleList(
            FiLMResidualBlock(c, self.cfg.elo_dim) for _ in range(self.cfg.blocks)
        )

        pc = self.cfg.policy_channels
        self.policy_conv = nn.Sequential(
            nn.Conv2d(c, pc, 1, bias=False),
            nn.BatchNorm2d(pc),
            nn.SiLU(),
        )
        self.policy_drop = nn.Dropout(self.cfg.dropout) if self.cfg.dropout else nn.Identity()
        self.policy_fc = nn.Linear(pc * 64, NUM_MOVES)

        if self.cfg.value_head:
            vc = self.cfg.value_channels
            self.value_conv = nn.Sequential(
                nn.Conv2d(c, vc, 1, bias=False),
                nn.BatchNorm2d(vc),
                nn.SiLU(),
            )
            self.value_fc = nn.Sequential(
                nn.Linear(vc * 64, 128),
                nn.SiLU(),
                nn.Linear(128, 3),  # thắng / hòa / thua theo phía bên đi
            )

    def forward(
        self,
        planes: torch.Tensor,
        elo_bucket: torch.Tensor,
        elo_norm: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor | None]:
        """Trả về (policy_logits, value_logits).

        ``policy_logits`` có kích thước (B, NUM_MOVES) và **chưa** che nước bất
        hợp lệ — việc che do phía suy luận làm, để lúc huấn luyện vẫn tính được
        cross-entropy trên toàn không gian.
        """
        elo = self.elo_encoder(elo_bucket, elo_norm)
        x = self.stem(planes)
        for block in self.blocks:
            x = block(x, elo)

        policy = self.policy_conv(x).flatten(1)
        policy = self.policy_fc(self.policy_drop(policy))

        value = None
        if self.cfg.value_head:
            value = self.value_fc(self.value_conv(x).flatten(1))
        return policy, value

    @torch.no_grad()
    def predict(
        self,
        planes: torch.Tensor,
        elo_bucket: torch.Tensor,
        elo_norm: torch.Tensor,
        legal_mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Xác suất nước đi đã che nước bất hợp lệ và chuẩn hóa lại."""
        policy, _ = self.forward(planes, elo_bucket, elo_norm)
        if legal_mask is not None:
            policy = policy.masked_fill(~legal_mask, float("-inf"))
        return torch.softmax(policy, dim=-1)

    def parameter_count(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


def build_model(cfg: ModelConfig | None = None) -> EloConditionedPolicyNet:
    return EloConditionedPolicyNet(cfg)
