"""Kiểm thử D2: chia theo thời gian, chống rò rỉ giữa kỳ thủ, chỉ lấy nước của chính kỳ thủ."""

from __future__ import annotations

from pathlib import Path

import chess
import pyarrow.parquet as pq

from m2.dataset import COLUMNS
from style.split import SplitConfig, build_equal_budget, build_pool, prepare

# Hai khai cuộc dài khác nhau; thêm một nước cuối khác nhau để mỗi ván có chuỗi nước riêng.
LINES = [
    "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6",
    "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6",
]
# Mọi nước cuối (và nước trả lời a5 / h5 của Đen) đều hợp lệ ở cả hai khai cuộc.
ENDINGS = ["12. a3", "12. a4", "12. g3", "12. g4", "12. h4", "12. Nh4", "12. Qd2", "12. Qd3", "12. Qc2", "12. Qe2"]


def game(player: str, color: str, date: str, index: int, speed: str = "blitz", opponent: str = "x",
         reply: str = "a5") -> str:
    white, black = (player, opponent) if color == "white" else (opponent, player)
    moves = f"{LINES[index % 2]} {ENDINGS[index // 2 % len(ENDINGS)]} {reply}"
    return (f'[Event "t"]\n[Date "{date}"]\n[White "{white}"]\n[Black "{black}"]\n[Result "1-0"]\n'
            f'[WhiteElo "2800"]\n[BlackElo "2750"]\n[StylePlayer "{player}"]\n[StyleColor "{color}"]\n'
            f'[StyleSpeed "{speed}"]\n[StyleSource "chesscom:{player}"]\n\n{moves} 1-0\n\n')


def write(root: Path, player: str, games: list[str]) -> None:
    (root / player).mkdir(parents=True, exist_ok=True)
    (root / player / "games.pgn").write_text("".join(games), encoding="utf-8")


def test_split_is_by_time_removes_shared_heldout_games_and_keeps_only_own_moves(tmp_path: Path):
    games = tmp_path / "players"
    # 20 ván của "a", ngày tăng dần; ván cuối cùng của "a" cũng là ván 0 (cũ nhất) của "b".
    write(games, "a", [game("a", "white", f"2024.01.{day + 1:02d}", day) for day in range(20)]
          + [game("a", "white", "2024.01.30", 0, speed="bullet")])
    write(games, "b", [game("b", "black", "2023.01.01", 19)]
          + [game("b", "black", f"2025.02.{day + 1:02d}", day, reply="h5") for day in range(1, 19)])

    cfg = SplitConfig(val_ratio=0.1, test_ratio=0.1, rows_per_shard=1000)
    card = prepare(games, tmp_path / "style", ["a", "b"], cfg)

    a, b = card["players"]["a"], card["players"]["b"]
    assert a["excluded_by_speed"] == 1
    assert (a["train"]["games"], a["val"]["games"], a["test"]["games"]) == (16, 2, 2)
    assert a["test"]["first_date"] == "2024.01.19" and a["train"]["last_date"] < a["val"]["first_date"]
    # Ván cũ nhất của b trùng với test của a nên bị bỏ khỏi train của b.
    assert b["removed_from_train_shared_with_heldout"] == 1

    table = pq.read_table(tmp_path / "style" / "a" / "train")
    assert set(COLUMNS) <= set(table.column_names)
    fens = table.column("fen").to_pylist()
    # Chỉ nước của Trắng (a cầm Trắng), và đã bỏ 10 nửa nước đầu.
    assert all(fen.split()[1] == "w" for fen in fens)
    assert min(table.column("ply").to_pylist()) >= 10
    assert set(table.column("elo").to_pylist()) == {2800}
    board = chess.Board(fens[0])
    assert chess.Move.from_uci(table.column("move_uci").to_pylist()[0]) in board.legal_moves

    # Dữ liệu GM chung: mỗi người góp tối đa max_train_per_player vị trí, không có test.
    pool = build_pool(tmp_path / "style", ["a", "b"], max_train_per_player=50, rows_per_shard=1000)
    train_rows = pq.read_table(tmp_path / "style" / "pool" / "train").num_rows
    assert pool["players"]["a"]["train"] == 50 and train_rows == 50 + pool["players"]["b"]["train"]
    assert not (tmp_path / "style" / "pool" / "test").exists()

    # Đối chứng cùng lượng dữ liệu: mọi người cắt về số vị trí train của người ít nhất, val giữ nguyên.
    equal = build_equal_budget(tmp_path / "style", ["a", "b"], rows_per_shard=1000)
    smallest = min(a["train"]["positions"], b["train"]["positions"])
    assert equal["budget"] == smallest
    for player in ("a", "b"):
        assert pq.read_table(tmp_path / "style" / "equal" / player / "train").num_rows == smallest
        assert (pq.read_table(tmp_path / "style" / "equal" / player / "val").num_rows
                == pq.read_table(tmp_path / "style" / player / "val").num_rows)
