"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { ArrowRight, CheckCircle2, Crown, Eye, LoaderCircle, ThumbsUp, XCircle } from "lucide-react";

import { percent } from "@/components/analysis/human-moves-panel";
import {
  checkStylePuzzle,
  fetchStylePuzzle,
  initials,
  shortName,
  type StylePuzzle,
  type StylePuzzleCheck,
  useStyles,
} from "@/lib/styles";

const DONE_KEY = "chess-analysis-gm-puzzles-done";
const SPEED_LABELS: Record<string, string> = { blitz: "Blitz", rapid: "Rapid", classical: "Cờ chậm", bullet: "Bullet" };

function readDone(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DONE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(-200) : [];
  } catch {
    return [];
  }
}

function writeDone(ids: string[]) {
  try {
    window.localStorage.setItem(DONE_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // Không lưu được thì lần sau có thể gặp lại puzzle cũ, không sao.
  }
}

function formatCp(cp: number | null) {
  if (cp === null) return "—";
  if (Math.abs(cp) >= 10_000) return cp > 0 ? "chiếu hết" : "bị chiếu hết";
  const pawns = cp / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function resultLabel(result: number | null) {
  if (result === 1) return "thắng";
  if (result === -1) return "thua";
  if (result === 0) return "hòa";
  return null;
}

/** Puzzle "Tìm nước kiện tướng đã đi" (D6): đoán nước kỳ thủ đã chọn trong một ván thật của họ. */
export default function GmPuzzlesPage() {
  const { error: stylesError, styles } = useStyles();
  const [filter, setFilter] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<StylePuzzle | null>(null);
  const [fen, setFen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [check, setCheck] = useState<StylePuzzleCheck | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [score, setScore] = useState({ match: 0, good: 0, total: 0 });

  const loadNext = useCallback(async (style: string | null) => {
    setLoading(true);
    setError("");
    setCheck(null);
    setShowAnswer(false);
    setSelected(null);
    setLastMove(null);
    try {
      const next = await fetchStylePuzzle(style, readDone());
      setPuzzle(next);
      setFen(next.fen);
    } catch (caught) {
      setPuzzle(null);
      setError(caught instanceof Error ? caught.message : "Không tải được puzzle.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNext(filter);
  }, [filter, loadNext]);

  const game = useMemo(() => (fen ? new Chess(fen) : null), [fen]);
  const answered = check !== null;

  async function attempt(from: Square, to: Square) {
    if (!puzzle || !game || answered || loading) return false;
    const piece = game.get(from);
    if (!piece || piece.color !== game.turn()) return false;
    let move;
    try {
      // Phong cấp: mặc định Hậu; kiện tướng gần như luôn phong Hậu.
      move = new Chess(game.fen()).move({ from, to, promotion: "q" });
    } catch {
      return false;
    }
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    setFen(move.after);
    setLastMove({ from: move.from, to: move.to });
    setSelected(null);
    setLoading(true);
    try {
      const result = await checkStylePuzzle(puzzle.id, uci);
      setCheck(result);
      writeDone([...readDone().filter((id) => id !== puzzle.id), puzzle.id]);
      setScore((current) => ({
        match: current.match + (result.verdict === "match" ? 1 : 0),
        good: current.good + (result.verdict === "good" ? 1 : 0),
        total: current.total + 1,
      }));
    } catch (caught) {
      setFen(puzzle.fen);
      setLastMove(null);
      setError(caught instanceof Error ? caught.message : "Không chấm được nước đi.");
    } finally {
      setLoading(false);
    }
    return true;
  }

  function revealAnswer() {
    if (!puzzle || !check) return;
    const replay = new Chess(puzzle.fen);
    const move = replay.move({ from: check.answerUci.slice(0, 2), to: check.answerUci.slice(2, 4), promotion: check.answerUci[4] });
    setFen(replay.fen());
    setLastMove({ from: move.from, to: move.to });
    setShowAnswer(true);
  }

  function handleSquareClick(square: Square) {
    if (!game || answered) return;
    if (selected) {
      if (selected !== square && game.moves({ square: selected, verbose: true }).some((move) => move.to === square)) {
        void attempt(selected, square);
        return;
      }
    }
    const piece = game.get(square);
    setSelected(piece && piece.color === game.turn() ? square : null);
  }

  const squareStyles = useMemo(() => {
    const result: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      const color = showAnswer ? "rgba(114,207,134,.5)" : "rgba(216,180,95,.5)";
      result[lastMove.from] = { backgroundColor: color };
      result[lastMove.to] = { backgroundColor: color };
    }
    if (selected && game) {
      result[selected] = { boxShadow: "inset 0 0 0 5px #d8b45f" };
      for (const move of game.moves({ square: selected, verbose: true })) {
        result[move.to] = game.get(move.to)
          ? { boxShadow: "inset 0 0 0 6px rgba(216,180,95,.78)" }
          : { backgroundImage: "radial-gradient(circle,rgba(20,30,22,.35) 0 18%,transparent 20%)" };
      }
    }
    return result;
  }, [game, lastMove, selected, showAnswer]);

  const name = puzzle ? shortName(puzzle.displayName) : "";
  const moverLabel = puzzle?.color === "white" ? "Trắng" : "Đen";

  return (
    <main className="min-h-screen bg-[#111713] px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl border border-white/9 bg-[#1a211d] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Crown className="size-7 text-[#d8b45f]" />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Đoán nước kiện tướng</h1>
              <p className="mt-1 text-sm text-[#aeb8b1]">
                Mỗi thế cờ lấy từ một ván thật gần đây của kỳ thủ. Hãy đoán nước họ đã đi. Mọi lời giải đều được Stockfish
                xác nhận không phải sai lầm, và thế cờ luôn có nhiều nước tốt ngang nhau: chọn nước nào là chuyện phong cách.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <FilterChip active={filter === null} label="Tất cả" onClick={() => setFilter(null)} />
            {(styles?.styles ?? []).map((style) => (
              <FilterChip key={style.id} active={filter === style.id} label={style.displayName} onClick={() => setFilter(style.id)} />
            ))}
          </div>
          {stylesError && <p className="mt-3 text-xs text-[#ffaaa8]">{stylesError}</p>}
        </header>

        <section className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,620px)_1fr]">
          <div className="rounded-3xl border border-white/9 bg-[#202923] p-3 shadow-2xl shadow-black/25">
            {fen ? (
              <Chessboard options={{
                id: "gm-puzzle-board",
                position: fen,
                boardOrientation: puzzle?.color === "black" ? "black" : "white",
                squareStyles,
                boardStyle: { borderRadius: "12px" },
                darkSquareStyle: { backgroundColor: "#68805f" },
                lightSquareStyle: { backgroundColor: "#e9e1c7" },
                animationDurationInMs: 220,
                canDragPiece: ({ piece }: { piece: { pieceType: string } }) =>
                  !answered && !loading && !!game && piece.pieceType[0]?.toLowerCase() === game.turn(),
                onSquareClick: ({ square }: { square: string }) => handleSquareClick(square as Square),
                onPieceDrag: () => setSelected(null),
                onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
                  if (!targetSquare || !game) return false;
                  const legal = game.moves({ square: sourceSquare as Square, verbose: true }).some((move) => move.to === targetSquare);
                  if (legal) void attempt(sourceSquare as Square, targetSquare as Square);
                  return legal;
                },
              }} />
            ) : (
              <div className="grid aspect-square place-items-center rounded-xl bg-black/20 text-sm text-[#8e9991]">
                {loading ? <LoaderCircle className="size-6 animate-spin" /> : error || "Chưa có puzzle."}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {puzzle && (
              <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#d8b45f]/15 text-sm font-bold text-[#f0d994]">
                    {initials(puzzle.displayName)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{puzzle.displayName} cầm {moverLabel}</p>
                    <p className="text-xs text-[#8e9991]">
                      {SPEED_LABELS[puzzle.speed] ?? puzzle.speed} · {puzzle.date.replaceAll(".", "/")} · nước {Math.floor(puzzle.ply / 2) + 1}
                      {puzzle.elo && puzzle.opponentElo ? ` · ${puzzle.elo} vs ${puzzle.opponentElo}` : ""}
                    </p>
                  </div>
                </div>
                {!answered && (
                  <p className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm text-[#c7d0c9]">
                    {loading ? "Đang chấm…" : `${moverLabel} đi. ${name} đã chọn nước nào?`}
                  </p>
                )}
                {check && <Feedback check={check} name={name} />}
                {error && <p className="mt-3 text-xs text-[#ffaaa8]">{error}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {check && !showAnswer && !check.correct && (
                    <button type="button" onClick={revealAnswer} className="flex items-center gap-1.5 rounded-xl bg-white/8 px-3 py-2 text-sm font-semibold hover:bg-white/15">
                      <Eye className="size-4" /> Xem nước của {name}
                    </button>
                  )}
                  <button type="button" disabled={loading} onClick={() => void loadNext(filter)} className="flex items-center gap-1.5 rounded-xl bg-[#4b7fe8] px-3 py-2 text-sm font-semibold text-white hover:bg-[#5b8cf0] disabled:opacity-50">
                    {answered ? "Puzzle tiếp" : "Bỏ qua"} <ArrowRight className="size-4" />
                  </button>
                </div>
              </div>
            )}

            {score.total > 0 && (
              <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-5 text-sm text-[#c7d0c9]">
                <p className="font-semibold text-white">Phiên này</p>
                <p className="mt-1">
                  Trùng nước kiện tướng <span className="font-bold text-white">{score.match}/{score.total}</span>
                  {" · "}khác nhưng vẫn tốt <span className="font-bold text-white">{score.good}</span>
                </p>
                <p className="mt-1 text-xs text-[#8e9991]">
                  Để so sánh: mô hình phong cách đoán trúng nước của chính kiện tướng khoảng 40% số lần.
                </p>
              </div>
            )}

            <p className="px-1 text-[11px] leading-5 text-[#758078]">
              Thế cờ lấy từ các ván mới nhất của kỳ thủ (tập test, mô hình chưa học). Đây là ván công khai, phần lớn là cờ
              nhanh online; puzzle không tính rating.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${active ? "border-[#d8b45f] bg-[#d8b45f]/15 text-white" : "border-white/10 text-[#aeb8b1] hover:bg-white/5"}`}
    >
      {label}
    </button>
  );
}

function Feedback({ check, name }: { check: StylePuzzleCheck; name: string }) {
  const tone = check.verdict === "match"
    ? { box: "border-[#72cf86]/30 bg-[#72cf86]/10", icon: <CheckCircle2 className="size-5 text-[#72cf86]" />, title: `Chính xác! ${name} đã đi ${check.answerSan}.` }
    : check.verdict === "good"
      ? { box: "border-[#78a7ff]/30 bg-[#78a7ff]/10", icon: <ThumbsUp className="size-5 text-[#78a7ff]" />, title: `Nước tốt, nhưng ${name} chọn khác.` }
      : { box: "border-[#ef6461]/30 bg-[#ef6461]/10", icon: <XCircle className="size-5 text-[#ef6461]" />, title: `Chưa đúng: ${name} không đi ${check.userSan}.` };
  const original = resultLabel(check.result);
  return (
    <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 text-[#dfe5e0] ${tone.box}`}>
      <p className="flex items-center gap-2 font-semibold text-white">{tone.icon}{tone.title}</p>
      {!check.correct && (
        <p>
          Bạn đi <b>{check.userSan}</b> (Stockfish {formatCp(check.userCp)})
          {check.userProbability !== null ? `, mô hình phong cách cho ${percent(check.userProbability)} khả năng ${name} chọn nước này` : ""}.
        </p>
      )}
      <p>
        {check.correct ? "Nước" : `${name} đã đi`} <b>{check.answerSan}</b> (Stockfish {formatCp(check.answerCp)})
        {check.answerProbability !== null ? `; mô hình phong cách đoán nước này với ${percent(check.answerProbability)}` : ""}.
        {original ? ` Ván đó ${name} ${original}.` : ""}
      </p>
      <p className="mt-1 text-xs text-[#aeb8b1]">
        Stockfish thích: {check.engine.map((line) => `${line.san} ${formatCp(line.cp)}`).join(" · ")}
      </p>
    </div>
  );
}
