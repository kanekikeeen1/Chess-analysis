"""Suy luận M2 và bốn tính năng sản phẩm dựng trên nó.

Module này là ranh giới giữa mạng nơ-ron và phần còn lại của hệ thống. Cả
:mod:`m2.evaluate` lẫn tầng phục vụ đều gọi qua đây, nên chỉ có một chỗ duy
nhất định nghĩa ý nghĩa của các con số.

Bốn tính năng, đánh số theo lộ trình:

① :meth:`Predictor.human_moves` — người ở trình độ R sẽ đi nước nào
② :meth:`Predictor.attribute_error` — sai lầm hệ thống của trình độ, hay điểm
  yếu riêng của người này
③ :meth:`Predictor.estimate_elo` — ước lượng trình độ từ chuỗi nước đã đi
④ :meth:`Predictor.position_difficulty` — thế cờ này khó tới mức nào
"""

from __future__ import annotations

import dataclasses
import math
from pathlib import Path

import chess
import numpy as np
import torch

from .encoding import (
    bucket_center,
    bucket_label,
    elo_to_bucket,
    encode_board,
    index_to_move,
    legal_move_mask,
    move_to_index,
    normalize_elo,
    NUM_ELO_BUCKETS,
)
from .model import EloConditionedPolicyNet, ModelConfig


@dataclasses.dataclass(slots=True)
class MoveProbability:
    uci: str
    san: str
    probability: float

    def as_dict(self) -> dict:
        return {"uci": self.uci, "san": self.san, "probability": round(self.probability, 5)}


@dataclasses.dataclass(slots=True)
class EloEstimate:
    elo: float
    std_error: float
    moves_used: int
    posterior: dict[int, float]

    def as_dict(self) -> dict:
        return {
            "elo": round(self.elo, 1),
            "stdError": round(self.std_error, 1),
            "movesUsed": self.moves_used,
            "posterior": {str(k): round(v, 5) for k, v in self.posterior.items()},
        }


@dataclasses.dataclass(slots=True)
class ErrorAttribution:
    """Kết quả của tính năng ②.

    ``peer_rate`` là đại lượng cốt lõi: xác suất mà một người *cùng trình độ*
    cũng đi đúng nước này. Cao nghĩa là lỗi mang tính hệ thống của cả nhóm; thấp
    nghĩa là nước đi này bất thường ngay cả so với bạn bè cùng mức, tức là điểm
    yếu riêng đáng để đưa vào giáo án luyện tập.
    """

    peer_rate: float
    best_move_findability: float
    personal_deviation: float
    verdict: str
    explanation: str

    def as_dict(self) -> dict:
        return {
            "peerRate": round(self.peer_rate, 5),
            "bestMoveFindability": round(self.best_move_findability, 5),
            "personalDeviation": round(self.personal_deviation, 5),
            "verdict": self.verdict,
            "explanation": self.explanation,
        }


# Ngưỡng phân loại ② — đặt ở một chỗ duy nhất và có thể hiệu chỉnh lại bằng dữ
# liệu thật ở M3. Đây là ngưỡng khởi điểm, không phải hằng số thiêng liêng: khi
# có đủ dữ liệu người dùng, hãy chỉnh theo phân vị thực tế và ghi lại trong báo
# cáo, đúng như cách M1 xử lý bộ ngưỡng cũ.
SYSTEMIC_PEER_RATE = 0.25
PERSONAL_PEER_RATE = 0.05


class Predictor:
    """Nạp checkpoint M2 và trả lời các câu hỏi ở mức sản phẩm."""

    def __init__(
        self,
        model: EloConditionedPolicyNet,
        device: torch.device | str = "cpu",
    ):
        self.device = torch.device(device)
        self.model = model.to(self.device).eval()

    @classmethod
    def from_checkpoint(
        cls,
        path: Path | str,
        device: torch.device | str = "cpu",
    ) -> "Predictor":
        state = torch.load(path, map_location="cpu", weights_only=False)
        cfg = ModelConfig(**state["model_config"])
        model = EloConditionedPolicyNet(cfg)
        model.load_state_dict(state["model"])
        return cls(model, device)

    # --- lõi ------------------------------------------------------------

    @torch.no_grad()
    def policy(self, board: chess.Board, elo: float) -> np.ndarray:
        """Phân phối xác suất trên các nước hợp lệ của ``board``."""
        return self.policy_batch([board], [elo])[0]

    @torch.no_grad()
    def policy_batch(
        self, boards: list[chess.Board], elos: list[float]
    ) -> list[np.ndarray]:
        """Phiên bản theo lô — dùng khi chấm cả ván, nhanh hơn nhiều lần."""
        if not boards:
            return []
        planes = torch.from_numpy(
            np.stack([encode_board(b) for b in boards])
        ).to(self.device)
        buckets = torch.tensor(
            [elo_to_bucket(e) for e in elos], dtype=torch.long, device=self.device
        )
        elo_norm = torch.tensor(
            [normalize_elo(e) for e in elos], dtype=torch.float32, device=self.device
        )
        masks = torch.from_numpy(
            np.stack([legal_move_mask(b) for b in boards])
        ).to(self.device)

        probabilities = self.model.predict(planes, buckets, elo_norm, masks)
        return [row.cpu().numpy() for row in probabilities]

    def move_probability(self, board: chess.Board, move: chess.Move, elo: float) -> float:
        """P(người ở trình độ ``elo`` đi đúng nước ``move`` tại thế này)."""
        return float(self.policy(board, elo)[move_to_index(move, board.turn)])

    # --- ① nước đi của con người ---------------------------------------

    def human_moves(
        self, board: chess.Board, elo: float, top_k: int = 3
    ) -> list[MoveProbability]:
        probabilities = self.policy(board, elo)
        order = np.argsort(-probabilities)[: top_k * 3]

        results: list[MoveProbability] = []
        for index in order:
            move = index_to_move(int(index), board)
            if move is None:
                continue
            results.append(
                MoveProbability(move.uci(), board.san(move), float(probabilities[index]))
            )
            if len(results) >= top_k:
                break
        return results

    def human_moves_by_level(
        self,
        board: chess.Board,
        elos: tuple[float, ...] = (1200, 1600, 2000),
        top_k: int = 3,
    ) -> dict[str, list[MoveProbability]]:
        """Bảng so sánh nhiều trình độ cạnh nhau — đây là màn demo chính."""
        return {str(int(elo)): self.human_moves(board, elo, top_k) for elo in elos}

    # --- ② sai lầm dự đoán được -----------------------------------------

    def attribute_error(
        self,
        board: chess.Board,
        played: chess.Move,
        best_move: chess.Move,
        elo: float,
    ) -> ErrorAttribution:
        """Quy trách nhiệm cho một nước sai: lỗi của trình độ hay của cá nhân.

        ``best_move`` lấy từ Stockfish ở backend. M2 không tự đánh giá nước đi
        tốt hay xấu — đó vẫn là việc của engine. M2 chỉ trả lời câu hỏi engine
        không trả lời được: nước sai đó có *bình thường* ở trình độ này không.
        """
        probabilities = self.policy(board, elo)
        peer_rate = float(probabilities[move_to_index(played, board.turn)])
        findability = float(probabilities[move_to_index(best_move, board.turn)])

        # Bao nhiêu nước đi có xác suất cao hơn nước người này đã chọn — cách
        # đọc trực quan hơn xác suất trần, vì nó không phụ thuộc số nước hợp lệ.
        rank = int((probabilities > peer_rate).sum())
        personal_deviation = 1.0 - peer_rate

        if peer_rate >= SYSTEMIC_PEER_RATE:
            verdict = "systemic"
            explanation = (
                f"{peer_rate * 100:.0f}% người ở trình độ {int(elo)} cũng đi nước này. "
                f"Đây là lỗi phổ biến của cả nhóm, không phải điểm yếu riêng của bạn."
            )
        elif peer_rate <= PERSONAL_PEER_RATE:
            verdict = "personal"
            explanation = (
                f"Chỉ {peer_rate * 100:.1f}% người cùng trình độ đi nước này "
                f"(đứng sau {rank} nước khác). Đây là điểm yếu riêng, nên đưa vào luyện tập."
            )
        else:
            verdict = "mixed"
            explanation = (
                f"{peer_rate * 100:.0f}% người cùng trình độ đi nước này — nằm giữa "
                f"lỗi hệ thống và điểm yếu riêng."
            )

        if findability < 0.10:
            explanation += (
                f" Nước tốt nhất rất khó thấy ở trình độ này "
                f"(chỉ {findability * 100:.1f}% tìm ra)."
            )

        return ErrorAttribution(
            peer_rate=peer_rate,
            best_move_findability=findability,
            personal_deviation=personal_deviation,
            verdict=verdict,
            explanation=explanation,
        )

    # --- ③ ước lượng Elo -------------------------------------------------

    def estimate_elo(
        self,
        positions: list[tuple[chess.Board, chess.Move]],
        grid: tuple[float, ...] | None = None,
        prior_std: float = 400.0,
    ) -> EloEstimate:
        """Ước lượng trình độ từ những nước người dùng đã thực sự đi.

        Với mỗi mức Elo trên lưới, tính tổng log-likelihood của toàn bộ nước đã
        đi. Chuẩn hóa thành hậu nghiệm (kèm tiên nghiệm Gauss quanh 1500 để
        tránh văng ra biên khi số nước ít), rồi lấy kỳ vọng và độ lệch chuẩn.
        Độ lệch chuẩn chính là ``elo_std_error`` trong bảng
        ``user_playing_profiles``, và nó phải thu hẹp lại khi có thêm ván.
        """
        if not positions:
            return EloEstimate(float("nan"), float("nan"), 0, {})

        grid = grid or tuple(range(800, 2450, 50))
        boards = [board for board, _ in positions]
        moves = [move for _, move in positions]
        indices = [move_to_index(m, b.turn) for b, m in zip(boards, moves)]

        log_likelihood = np.zeros(len(grid), dtype=np.float64)
        for g, elo in enumerate(grid):
            probabilities = self.policy_batch(boards, [elo] * len(boards))
            total = 0.0
            for probs, index in zip(probabilities, indices):
                total += math.log(max(float(probs[index]), 1e-12))
            log_likelihood[g] = total

        prior = -0.5 * ((np.array(grid) - 1500.0) / prior_std) ** 2
        posterior = log_likelihood + prior
        posterior -= posterior.max()
        weights = np.exp(posterior)
        weights /= weights.sum()

        grid_array = np.array(grid, dtype=np.float64)
        mean = float((weights * grid_array).sum())
        variance = float((weights * (grid_array - mean) ** 2).sum())

        return EloEstimate(
            elo=mean,
            std_error=math.sqrt(max(variance, 0.0)),
            moves_used=len(positions),
            posterior={int(e): float(w) for e, w in zip(grid, weights)},
        )

    # --- ④ độ khó thế cờ -------------------------------------------------

    def position_difficulty(
        self,
        board: chess.Board,
        best_move: chess.Move,
        elo: float = 1500,
    ) -> dict[str, float]:
        """Thang độ khó khách quan, dùng để xếp hạng bài tập ở M3.

        Hai thành phần: entropy của phân phối nước đi người chơi (thế cờ càng
        gây phân vân thì entropy càng cao) và xác suất tìm ra nước tốt nhất
        (càng thấp càng khó). Kết hợp lại thành một điểm trong [0, 1].
        """
        probabilities = self.policy(board, elo)
        support = probabilities[probabilities > 0]
        entropy = float(-(support * np.log(support)).sum())

        legal_count = board.legal_moves.count()
        max_entropy = math.log(max(legal_count, 2))
        normalized_entropy = entropy / max_entropy if max_entropy > 0 else 0.0

        findability = float(probabilities[move_to_index(best_move, board.turn)])
        difficulty = 0.5 * normalized_entropy + 0.5 * (1.0 - findability)

        return {
            "difficulty": round(difficulty, 5),
            "entropy": round(entropy, 5),
            "normalizedEntropy": round(normalized_entropy, 5),
            "bestMoveFindability": round(findability, 5),
            "legalMoves": legal_count,
            # Thang cùng đơn vị với `theta` trong bảng user_skill_profiles, để
            # M3 ghép độ khó bài với năng lực người dùng.
            "difficultyElo": round(800 + difficulty * 1600, 1),
        }

    # --- tiện ích ---------------------------------------------------------

    def level_labels(self) -> list[dict]:
        """Danh sách dải Elo mà mô hình được huấn luyện, cho giao diện."""
        return [
            {"bucket": b, "label": bucket_label(b), "center": bucket_center(b)}
            for b in range(NUM_ELO_BUCKETS)
        ]
