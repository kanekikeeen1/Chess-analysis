"""D4: đánh giá mô hình theo phong cách — phần thực nghiệm chính của giai đoạn D.

Ba câu hỏi:

1. **Độ khớp**: trên tập test (các ván mới nhất) của kỳ thủ Y, mô hình nào đoán trúng nước Y đi nhiều nhất?
   So M2 nền, mô hình của chính Y và mô hình của hai người còn lại (ma trận 3×3 khi bỏ cột M2 nền).
   Đường chéo phải trội: mô hình của Y thắng trên ván của Y.
2. **Stockfish top-1** trên một mẫu vị trí: engine mạnh hơn hẳn nhưng không mô phỏng được cách chọn nước.
3. **Nhận diện phong cách**: cho k ván (1 / 5 / 10) của một người chưa biết, cộng log-likelihood của mọi nước
   dưới từng mô hình phong cách rồi chọn mô hình cao nhất. Ngẫu nhiên đoán đúng 1/3.

Cột "pool" (nếu có) là mô hình GM chung, fine-tune trên ván gộp của cả ba người: mô hình của Y phải thắng cả
nó trên ván của Y thì mới là học được phong cách riêng chứ không chỉ "blitz kiện tướng nói chung".
Khoảng tin cậy 95% của chênh lệch top-1 (mô hình của Y trừ mô hình khác, trên ván của Y) lấy bằng bootstrap
theo **ván**, vì các nước trong cùng một ván không độc lập.

Mô hình học trên nhiều dữ liệu hơn (Nakamura gấp 10 lần Liêm) thường gán xác suất cao hơn cho *mọi* nước đi
mạnh, nên chọn theo log-likelihood thô bị kéo về phía nó. Bản "đã hiệu chỉnh" trừ đi log-likelihood trung
bình mỗi nước của từng mô hình, đo trên tập **val** của cả ba người (không dùng test), để mỗi mô hình bắt
đầu từ cùng một mốc.
"""

from __future__ import annotations

import collections
import logging
import random
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

from m2.dataset import ShardDataset, collate, list_shards
from m2.evaluate import load_predictor

LOGGER = logging.getLogger(__name__)


def read_column(root: Path, split: str, column: str, max_rows: int | None) -> list:
    """Một cột theo đúng thứ tự và giới hạn dòng mà ``ShardDataset`` dùng, để ghép được từng dòng."""
    tables, rows = [], 0
    for shard in list_shards(root, split):
        table = pq.read_table(shard, columns=[column])
        tables.append(table)
        rows += table.num_rows
        if max_rows and rows >= max_rows:
            break
    table = pa.concat_tables(tables)
    if max_rows and table.num_rows > max_rows:
        table = table.slice(0, max_rows)
    return table.column(column).to_pylist()


@torch.no_grad()
def score_rows(model: torch.nn.Module, dataset: ShardDataset, device: torch.device, batch_size: int) -> dict:
    """Log-xác suất của nước thật, và có nằm trong top-1/top-3 không, cho từng dòng."""
    loader = DataLoader(dataset, batch_size=batch_size, collate_fn=collate, num_workers=2)
    logps, hit1, hit3 = [], [], []
    for batch in loader:
        planes = batch["planes"].to(device)
        bucket = batch["elo_bucket"].to(device)
        elo_norm = batch["elo_norm"].to(device)
        target = batch["target"].to(device)
        mask = batch["legal_mask"].to(device)
        logits, _ = model(planes, bucket, elo_norm)
        logits = logits.float().masked_fill(~mask, float("-inf"))
        logp = F.log_softmax(logits, dim=-1).gather(1, target.unsqueeze(1)).squeeze(1)
        top3 = logits.topk(3, dim=-1).indices
        logps.append(logp.cpu().numpy())
        hit1.append((top3[:, 0] == target).cpu().numpy())
        hit3.append((top3 == target.unsqueeze(1)).any(dim=1).cpu().numpy())
    return {"logp": np.concatenate(logps), "hit1": np.concatenate(hit1), "hit3": np.concatenate(hit3)}


def per_game(logp: np.ndarray, keys: list[str]) -> dict[str, float]:
    totals: dict[str, float] = collections.defaultdict(float)
    for value, key in zip(logp, keys):
        totals[key] += float(value)
    return dict(totals)


def per_game_hits(hit1: np.ndarray, keys: list[str]) -> dict[str, tuple[int, int]]:
    totals: dict[str, list[int]] = collections.defaultdict(lambda: [0, 0])
    for hit, key in zip(hit1, keys):
        totals[key][0] += int(hit)
        totals[key][1] += 1
    return {key: (value[0], value[1]) for key, value in totals.items()}


def bootstrap_difference(
    own: dict[str, tuple[int, int]],
    other: dict[str, tuple[int, int]],
    rounds: int = 1000,
    seed: int = 1337,
) -> dict:
    """Chênh lệch top-1 (own − other) và khoảng tin cậy 95%, lấy mẫu lại theo ván."""
    games = sorted(own)
    own_hits = np.array([own[g][0] for g in games], dtype=np.float64)
    other_hits = np.array([other[g][0] for g in games], dtype=np.float64)
    counts = np.array([own[g][1] for g in games], dtype=np.float64)
    rng = np.random.default_rng(seed)
    diffs = []
    for _ in range(rounds):
        pick = rng.integers(0, len(games), len(games))
        diffs.append((own_hits[pick].sum() - other_hits[pick].sum()) / counts[pick].sum())
    low, high = np.percentile(diffs, [2.5, 97.5])
    return {"diff": float((own_hits.sum() - other_hits.sum()) / counts.sum()), "ci95": [float(low), float(high)],
            "significant": bool(low > 0 or high < 0)}


def identification(
    game_scores: dict[str, dict[str, dict[str, float]]],
    players: list[str],
    bias: dict[str, float] | None,
    game_moves: dict[str, dict[str, int]],
    ks: tuple[int, ...] = (1, 5, 10),
    trials: int = 2000,
    seed: int = 1337,
) -> dict:
    """Đoán kỳ thủ từ k ván: argmax tổng log-likelihood (trừ ``bias`` × số nước nếu hiệu chỉnh).

    ``game_scores[Y][M][game]`` là tổng log-likelihood ván ``game`` của Y dưới mô hình M. Mỗi lần thử bốc ngẫu
    nhiên k ván khác nhau của Y; với k = 1 thì dùng đúng mọi ván một lần.
    """
    rng = random.Random(seed)
    result: dict = {}
    for k in ks:
        confusion = {y: collections.Counter() for y in players}
        for truth in players:
            games = sorted(game_scores[truth][players[0]])
            if len(games) < k:
                continue
            groups = [[g] for g in games] if k == 1 else [rng.sample(games, k) for _ in range(trials)]
            for group in groups:
                moves = sum(game_moves[truth][g] for g in group)
                scores = {
                    model: sum(game_scores[truth][model][g] for g in group) - (bias[model] * moves if bias else 0.0)
                    for model in players
                }
                confusion[truth][max(scores, key=scores.get)] += 1
        per_player = {y: confusion[y][y] / max(1, sum(confusion[y].values())) for y in players}
        result[str(k)] = {
            "accuracy": per_player,
            # Trung bình theo người: không để Nakamura (nhiều ván test nhất) quyết định con số chung.
            "macroAccuracy": float(np.mean(list(per_player.values()))),
            "confusion": {y: dict(confusion[y]) for y in players},
        }
    return result


def stockfish_top1(engine_path: str, root: Path, rows: int, depth: int, seed: int = 1337) -> dict:
    import chess
    import chess.engine

    fens = read_column(root, "test", "fen", None)
    moves = read_column(root, "test", "move_uci", None)
    picks = random.Random(seed).sample(range(len(fens)), min(rows, len(fens)))
    hits1 = hits3 = 0
    with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
        engine.configure({"Threads": 1, "Hash": 64})
        for index in picks:
            infos = engine.analyse(chess.Board(fens[index]), chess.engine.Limit(depth=depth), multipv=3)
            best = [info["pv"][0].uci() for info in infos if info.get("pv")]
            hits1 += int(bool(best) and best[0] == moves[index])
            hits3 += int(moves[index] in best)
    n = len(picks)
    return {"n": n, "depth": depth, "top1": hits1 / max(n, 1), "top3": hits3 / max(n, 1)}


def evaluate_all(
    checkpoints: dict[str, Path],
    data_root: Path,
    players: list[str],
    device: str,
    batch_size: int = 1024,
    max_test_rows: int | None = None,
    max_val_rows: int = 20_000,
    stockfish: str | None = None,
    stockfish_rows: int = 500,
    stockfish_depth: int = 12,
) -> dict:
    """``checkpoints`` gồm "base" (M2 nền), tùy chọn "pool" (GM chung), và một mô hình cho mỗi kỳ thủ."""
    torch_device = torch.device(device)
    test_sets = {y: ShardDataset(data_root / y, "test", max_rows=max_test_rows, with_mask=True) for y in players}
    val_sets = {y: ShardDataset(data_root / y, "val", max_rows=max_val_rows, with_mask=True) for y in players}
    test_keys = {y: read_column(data_root / y, "test", "game_key", max_test_rows) for y in players}

    accuracy: dict[str, dict[str, dict]] = {y: {} for y in players}
    game_scores: dict[str, dict[str, dict[str, float]]] = {y: {} for y in players}
    game_hits: dict[str, dict[str, dict[str, tuple[int, int]]]] = {y: {} for y in players}
    val_mean_logp: dict[str, dict[str, float]] = {}
    for name, checkpoint in checkpoints.items():
        predictor, state = load_predictor(checkpoint, device)
        model = predictor.model.to(torch_device).eval()
        val_mean_logp[name] = {}
        for y in players:
            scored = score_rows(model, test_sets[y], torch_device, batch_size)
            accuracy[y][name] = {
                "n": int(scored["logp"].size),
                "top1": float(scored["hit1"].mean()),
                "top3": float(scored["hit3"].mean()),
                "nll": float(-scored["logp"].mean()),
            }
            LOGGER.info("mô hình %-8s · test của %-8s · top1 %.4f · top3 %.4f · NLL %.4f", name, y,
                        accuracy[y][name]["top1"], accuracy[y][name]["top3"], accuracy[y][name]["nll"])
            game_hits[y][name] = per_game_hits(scored["hit1"], test_keys[y])
            if name in players:
                game_scores[y][name] = per_game(scored["logp"], test_keys[y])
                val_mean_logp[name][y] = float(score_rows(model, val_sets[y], torch_device, batch_size)["logp"].mean())

    game_moves = {y: dict(collections.Counter(test_keys[y])) for y in players}
    # Mốc của mỗi mô hình: log-likelihood trung bình mỗi nước, lấy trung bình đều trên val của ba người.
    bias = {m: float(np.mean(list(val_mean_logp[m].values()))) for m in players}
    report = {
        "players": players,
        "checkpoints": {name: str(path) for name, path in checkpoints.items()},
        "accuracy": accuracy,
        "diagonalWins": {y: max(players, key=lambda m: accuracy[y][m]["top1"]) == y for y in players},
        # Mô hình của Y so với từng mô hình khác, trên ván của Y.
        "diagonalVsOthers": {
            y: {m: bootstrap_difference(game_hits[y][y], game_hits[y][m]) for m in checkpoints if m != y}
            for y in players
        },
        "testGames": {y: len(game_moves[y]) for y in players},
        "identification": {
            "raw": identification(game_scores, players, None, game_moves),
            "calibrated": identification(game_scores, players, bias, game_moves),
            "bias": bias,
        },
    }
    if stockfish:
        report["stockfish"] = {}
        for y in players:
            report["stockfish"][y] = stockfish_top1(stockfish, data_root / y, stockfish_rows, stockfish_depth)
            LOGGER.info("Stockfish depth %d · test của %s · top1 %.4f", stockfish_depth, y,
                        report["stockfish"][y]["top1"])
    return report
