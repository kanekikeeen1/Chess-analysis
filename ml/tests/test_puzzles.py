import chess
import chess.engine

from style.puzzles import PuzzleConfig, judge

# Sau 1.e4 e5 2.Nf3 Nc6: Trắng có nhiều nước tốt ngang nhau.
FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"


def info(uci: str, cp: int | None, mate: int | None = None) -> dict:
    score = chess.engine.Mate(mate) if mate is not None else chess.engine.Cp(cp)
    return {"pv": [chess.Move.from_uci(uci)], "score": chess.engine.PovScore(score, chess.WHITE)}


def test_keeps_a_real_choice_and_rejects_mistakes_forced_and_decided_positions():
    board = chess.Board(FEN)
    cfg = PuzzleConfig()
    lines = [info("f1b5", 40), info("f1c4", 30), info("d2d4", 25)]

    kept = judge(board, chess.Move.from_uci("f1c4"), lines, 30, cfg)
    assert kept and not kept["matchesEngine"] and kept["engine"][0]["san"] == "Bb5"

    # Mất 60 cp so với nước tốt nhất: coi là sai lầm, không phải phong cách.
    assert judge(board, chess.Move.from_uci("a2a3"), lines, -20, cfg) is None
    # Nước thứ hai kém hẳn: chỉ có một nước, không có gì để đoán.
    assert judge(board, chess.Move.from_uci("f1b5"), [info("f1b5", 40), info("f1c4", -100)], 40, cfg) is None
    # Ván đã ngã ngũ, hoặc có chiếu hết trong tầm nhìn.
    assert judge(board, chess.Move.from_uci("f1b5"), [info("f1b5", 500), info("f1c4", 480)], 500, cfg) is None
    assert judge(board, chess.Move.from_uci("f1b5"), [info("f1b5", None, mate=3), info("f1c4", 50)], 50, cfg) is None
