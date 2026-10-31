"""Kiểm thử pipeline dữ liệu: lọc theo tiêu đề, cân bằng theo dải Elo, đọc .zst."""

from __future__ import annotations

from pathlib import Path

import pyarrow.parquet as pq
import zstandard

from m2.data import FilterConfig, build_dataset, iter_games, reshuffle_split
from m2.encoding import elo_to_bucket

# 24 nửa nước, đủ dài để vượt min_game_plies = 20.
MOVES = ("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 "
         "7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 1-0")


def game(index: int, white_elo: int, black_elo: int, time_control: str = "300+0",
         white: str | None = None, black: str | None = None) -> str:
    white, black = white or f"w{index}", black or f"b{index}"
    return (f'[Event "Rated Blitz game"]\n[Site "https://lichess.org/g{index:06d}"]\n'
            f'[White "{white}"]\n[Black "{black}"]\n[Result "1-0"]\n'
            f'[WhiteElo "{white_elo}"]\n[BlackElo "{black_elo}"]\n'
            f'[TimeControl "{time_control}"]\n[Termination "Normal"]\n\n{MOVES}\n\n')


def write_pgn(path: Path, games: list[str], compress: bool) -> Path:
    data = "".join(games).encode("utf-8")
    if compress:
        path.write_bytes(zstandard.ZstdCompressor().compress(data))
    else:
        path.write_bytes(data)
    return path


def read_elos(out: Path) -> list[int]:
    elos: list[int] = []
    for shard in sorted(out.rglob("*.parquet")):
        elos.extend(pq.read_table(shard).column("elo").to_pylist())
    return elos


def test_header_filter_skips_movetext_of_rejected_games(tmp_path):
    source = write_pgn(tmp_path / "g.pgn", [game(1, 1500, 1520), game(2, 1500, 1500, "60+0")], compress=False)
    games = list(iter_games(source, wanted=lambda headers: headers["TimeControl"] != "60+0"))
    assert len(games) == 2, "ván bị loại vẫn được đếm"
    assert len(list(games[0].mainline_moves())) == 24
    assert list(games[1].mainline_moves()) == [], "ván bị loại không phải phân tích nước đi"


def test_per_bucket_limit_balances_elo_bands(tmp_path):
    # 6 ván ở dải 1400–1599, 2 ván ở dải 2600+.
    games = [game(i, 1500, 1500) for i in range(6)] + [game(10 + i, 2650, 2700) for i in range(2)]
    source = write_pgn(tmp_path / "g.pgn.zst", games, compress=True)

    result = build_dataset([source], tmp_path / "out", FilterConfig(), max_per_bucket=30)

    middle, master = elo_to_bucket(1500), elo_to_bucket(2650)
    assert result.per_bucket[middle] == 30, "dải đông người bị cắt ở giới hạn"
    assert result.per_bucket[master] == 28, "dải hiếm giữ toàn bộ (2 ván × 14 vị trí)"
    assert result.games_seen == 8
    elos = read_elos(tmp_path / "out")
    assert len(elos) == 58
    assert max(elos) == 2700


def test_stops_once_every_bucket_is_full(tmp_path):
    games = [game(i, 1500, 1500) for i in range(20)]
    source = write_pgn(tmp_path / "g.pgn", games, compress=False)
    result = build_dataset([source], tmp_path / "out", FilterConfig(min_elo=1400, max_elo=1599),
                           max_per_bucket=None, max_positions=40)
    assert result.stop_reason.startswith("đạt giới hạn")
    assert result.games_seen < 20


def test_reshuffle_mixes_elo_bands_across_small_shards(tmp_path):
    # Ghi theo thứ tự: toàn bộ dải giữa trước, toàn bộ dải 2600+ sau.
    games = [game(i, 1500, 1500) for i in range(10)] + [game(100 + i, 2650, 2700) for i in range(10)]
    source = write_pgn(tmp_path / "g.pgn", games, compress=False)
    out = tmp_path / "out"
    build_dataset([source], out, FilterConfig(), val_ratio=0, test_ratio=0)
    before = read_elos(out)

    rows = reshuffle_split(out, "train", rows_per_shard=70, seed=1)

    assert rows == len(before) == 280
    shards = sorted((out / "train").glob("*.parquet"))
    assert len(shards) == 4
    assert sorted(read_elos(out)) == sorted(before), "trộn không làm mất hay nhân đôi dòng"
    first_shard = pq.read_table(shards[0]).column("elo").to_pylist()
    assert min(first_shard) < 2000 < max(first_shard), "shard đầu chứa cả hai dải sau khi trộn"
    assert not (out / ".train-shuffled").exists()


def test_master_level_games_are_no_longer_dropped(tmp_path):
    source = write_pgn(tmp_path / "g.pgn", [game(1, 2750, 2800)], compress=False)
    result = build_dataset([source], tmp_path / "out", FilterConfig())
    assert result.games_kept == 1


def test_positions_per_side_samples_train_games_only(tmp_path):
    source = write_pgn(tmp_path / "g.pgn", [game(i, 1500, 1500) for i in range(5)], compress=False)
    cfg = FilterConfig(positions_per_side=3)
    result = build_dataset([source], tmp_path / "out", cfg, val_ratio=0, test_ratio=0)
    assert result.splits == {"train": 5 * 6}, "mỗi ván train chỉ giữ 3 vị trí mỗi bên"

    rows = pq.read_table(next((tmp_path / "out" / "train").glob("*.parquet"))).to_pylist()
    first_game = [r for r in rows if r["game_key"] == rows[0]["game_key"]]
    assert sorted(r["fen"].split()[1] for r in first_game) == ["b"] * 3 + ["w"] * 3
    assert [r["ply"] for r in first_game] == sorted(r["ply"] for r in first_game)

    whole = build_dataset([source], tmp_path / "out-test", cfg, val_ratio=0, test_ratio=1)
    assert whole.splits == {"test": 5 * 14}, "tập test giữ nguyên cả ván"


def test_max_positions_per_player_limits_heavy_accounts(tmp_path):
    games = [game(i, 2650, 2650, white="grinder", black=f"guest{i}") for i in range(6)]
    source = write_pgn(tmp_path / "g.pgn", games, compress=False)
    result = build_dataset([source], tmp_path / "out", FilterConfig(max_positions_per_player=10))
    # "grinder" dừng ở 10 vị trí; mỗi đối thủ là một người khác nên giữ đủ 7.
    assert sum(result.per_bucket) == 10 + 6 * 7
    assert result.players == 7
