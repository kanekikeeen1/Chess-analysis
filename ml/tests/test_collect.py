"""Kiểm thử D1: nhận diện kỳ thủ, nhịp độ, tách PGN thô, lọc và khử trùng lặp."""

from __future__ import annotations

import json
from pathlib import Path

import chess
import chess.pgn

from style.collect import (
    build,
    classify_speed,
    identify,
    load_players,
    name_tokens,
    read_headers,
    split_games,
)

CONFIG = Path(__file__).resolve().parent.parent / "config" / "players.yaml"
MOVES = ("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 "
         "7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5")
OTHER_MOVES = ("1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 "
               "7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 12. Qa4 c5")


def pgn(white: str, black: str, moves: str = MOVES, result: str = "1-0", **tags: str) -> str:
    headers = {"Event": "Test", "Date": "2024.05.01", "White": white, "Black": black, "Result": result, **tags}
    head = "".join(f'[{key} "{value}"]\n' for key, value in headers.items())
    return f"{head}\n{moves} {result}\n\n"


def test_name_tokens_ignore_order_accents_titles_and_punctuation():
    assert name_tokens("Lê Quang Liêm") == name_tokens("Le, Quang Liem") == name_tokens("GM Liem Le Quang")
    assert name_tokens("Carlsen, Magnus (NOR)") == {"carlsen", "magnus"}


def test_identify_by_name_set_does_not_match_relatives_or_partial_names():
    players = load_players(CONFIG)
    assert identify({"White": "Carlsen, Magnus", "Black": "Nakamura, Hikaru"}, players) == [
        ("carlsen", chess.WHITE), ("hikaru", chess.BLACK)]
    # Bố của Magnus và một người họ Lê khác không được nhận nhầm.
    assert identify({"White": "Carlsen, Henrik", "Black": "Le, Quang Long"}, players) == []


def test_identify_prefers_fide_id_over_name():
    players = load_players(CONFIG)
    assert identify({"White": "Liem, L.Q.", "WhiteFideId": "12401137", "Black": "x"}, players) == [
        ("liem", chess.WHITE)]
    # Trùng tên nhưng FIDE ID khác: là người khác.
    assert identify({"White": "Carlsen, Magnus", "WhiteFideId": "999", "Black": "x"}, players) == []


def test_classify_speed():
    assert classify_speed({"TimeControl": "60+0"}, "lichess") == "bullet"
    assert classify_speed({"TimeControl": "180+2"}, "chesscom") == "blitz"
    assert classify_speed({"TimeControl": "600+5"}, "lichess") == "rapid"
    assert classify_speed({"TimeControl": "1/86400"}, "chesscom") == "correspondence"
    assert classify_speed({"TimeControl": "40/5400+30:1800+30"}, "broadcast") == "classical"
    assert classify_speed({"Event": "World Blitz Championship"}, "broadcast") == "blitz"
    assert classify_speed({"Event": "Norway Chess"}, "otb") == "classical"


def test_split_games_and_headers():
    text = pgn("a", "b") + pgn("c", "d", result="0-1")
    games = list(split_games(text.splitlines(keepends=True)))
    assert [read_headers(game)["White"] for game in games] == ["a", "c"]


def test_build_filters_dedupes_and_tags(tmp_path: Path):
    players = load_players(CONFIG)
    raw = tmp_path / "raw"
    (raw / "chesscom" / "Hikaru").mkdir(parents=True)
    (raw / "chesscom" / "Hikaru" / "2024-05.pgn").write_text(
        pgn("Hikaru", "someone", TimeControl="180+0")
        + pgn("someone", "Hikaru", OTHER_MOVES, result="0-1", TimeControl="60+0")
        + pgn("Hikaru", "x", TimeControl="180+0", Variant="Chess960")
        + pgn("Hikaru", "x", "1. e4 e5 2. Nf3", TimeControl="180+0"),
        encoding="utf-8")
    (raw / "broadcast").mkdir(parents=True)
    # Cùng một ván OTB có ở cả broadcast lẫn file TWIC, ghi tên khác nhau: chỉ giữ một.
    (raw / "broadcast" / "2024-05.pgn").write_text(pgn("Carlsen, Magnus", "Nakamura, Hikaru"), encoding="utf-8")
    (raw / "otb").mkdir(parents=True)
    (raw / "otb" / "twic1540.pgn").write_text(pgn("Magnus Carlsen", "Hikaru Nakamura"), encoding="utf-8")

    # Ván 960 không ghi nhãn bị loại theo tên giải; ván có nước lỗi ở cuối (bàn DGT) giữ phần trước đó.
    (raw / "broadcast" / "2021-09.pgn").write_text(
        pgn("Nakamura, Hikaru", "So, Wesley", OTHER_MOVES, Event="Champions Showdown Chess 9LX")
        + pgn("Nakamura, Hikaru", "Caruana, Fabiano", MOVES + " 13. Ke8"),
        encoding="utf-8")

    card = build(raw, tmp_path / "out", players, target_games=2)
    hikaru, carlsen = card["players"]["hikaru"], card["players"]["carlsen"]
    # Ván lỗi cuối trùng nước với ván broadcast 2024-05 (cùng 24 nửa nước, cùng màu Trắng) nên bị khử trùng.
    assert hikaru["games"] == 3
    assert hikaru["by_speed"] == {"bullet": 1, "blitz": 1, "classical": 1}
    assert hikaru["by_color"] == {"white": 1, "black": 2}
    assert hikaru["rejected"] == {"variant": 2, "too_short": 1}
    assert hikaru["duplicates_removed"] == 2
    assert carlsen["games"] == 1 and carlsen["duplicates_removed"] == 1
    assert hikaru["meets_target"] and not carlsen["meets_target"]
    json.dumps(card)

    with (tmp_path / "out" / "hikaru" / "games.pgn").open(encoding="utf-8") as stream:
        first = chess.pgn.read_game(stream)
    assert first.headers["StylePlayer"] == "hikaru"
    assert first.headers["StyleColor"] in {"white", "black"}
    assert first.headers["StyleSource"].split(":")[0] in {"chesscom", "broadcast", "otb"}
    assert len(list(first.mainline_moves())) == 24
