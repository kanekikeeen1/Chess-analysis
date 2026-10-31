"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  CalendarClock, CheckCircle2, Eye, LoaderCircle, LogIn, Repeat2, SkipForward, Target, XCircle,
} from "lucide-react";

import { useAuth } from "@/app/auth-provider";
import { backendRequest } from "@/lib/backend-api";
import type { GamePhase, MistakeAnswer, MistakeItem, MistakeSummary } from "@/lib/domain-types";
import { describeReview, queryParam } from "@/lib/review";

const PHASES: Array<{ value: GamePhase | ""; label: string }> = [
  { value: "", label: "Mọi giai đoạn" },
  { value: "OPENING", label: "Khai cuộc" },
  { value: "MIDDLEGAME", label: "Trung cuộc" },
  { value: "ENDGAME", label: "Tàn cuộc" },
];
const LABELS: Record<string, string> = { mistake: "Sai lầm", blunder: "Blunder" };
const PROMOTION_PIECES = [
  { piece: "q", label: "Hậu" }, { piece: "r", label: "Xe" },
  { piece: "b", label: "Tượng" }, { piece: "n", label: "Mã" },
] as const;

function sanOf(fen: string, uci: string | null) {
  if (!uci) return null;
  try {
    return new Chess(fen).move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: (uci[4] as "q" | "r" | "b" | "n" | undefined) ?? undefined,
    }).san;
  } catch {
    return uci;
  }
}

const arrow = (uci: string, color: string) => ({ startSquare: uci.slice(0, 2), endSquare: uci.slice(2, 4), color });

export default function MistakesPage() {
  const { isLoading: authLoading, user } = useAuth();
  const [summary, setSummary] = useState<MistakeSummary | null>(null);
  const [item, setItem] = useState<MistakeItem | null>(null);
  const [answer, setAnswer] = useState<MistakeAnswer | null>(null);
  const [fen, setFen] = useState(new Chess().fen());
  const [phase, setPhase] = useState<GamePhase | "">("");
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fromReview, setFromReview] = useState(false);

  const game = useMemo(() => {
    try { return new Chess(fen); } catch { return new Chess(); }
  }, [fen]);
  const playerColor = item?.playerSide ?? "w";
  const answered = Boolean(answer);

  async function loadSummary() {
    try { setSummary(await backendRequest<MistakeSummary>("/api/mistakes/summary")); } catch { setSummary(null); }
  }

  function next(selectedPhase = phase) {
    return load(`/api/mistakes/next${selectedPhase ? `?phase=${selectedPhase}` : ""}`);
  }

  async function load(path: string) {
    setBusy(true);
    setAnswer(null);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setMessage("");
    try {
      const loaded = await backendRequest<MistakeItem>(path);
      setItem(loaded);
      setFen(loaded.fen);
    } catch (caughtError) {
      setItem(null);
      setMessage(caughtError instanceof Error ? caughtError.message : "Không thể tải sai lầm.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (authLoading || !user) return;
    void loadSummary();
    // ?id=…: mở đúng sai lầm đó (ôn tập theo lịch), ngược lại lấy sai lầm nên luyện tiếp theo.
    const reviewId = Number(queryParam("id"));
    setFromReview(queryParam("from") === "review");
    void (reviewId ? load(`/api/mistakes/${reviewId}`) : next());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  async function submit(uci: string) {
    if (!item) return;
    setBusy(true);
    setSelectedSquare(null);
    try {
      const result = await backendRequest<MistakeAnswer>(`/api/mistakes/${item.id}/answer`, {
        method: "POST", body: JSON.stringify({ uci }),
      });
      setAnswer(result);
      void loadSummary();
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Không thể chấm nước đi.");
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    if (!item) return;
    setBusy(true);
    try {
      setAnswer(await backendRequest<MistakeAnswer>(`/api/mistakes/${item.id}/reveal`, { method: "POST" }));
      void loadSummary();
    } finally {
      setBusy(false);
    }
  }

  function attempt(from: Square, to: Square) {
    if (!item || busy || answered || game.turn() !== playerColor) return false;
    const candidates = game.moves({ square: from, verbose: true }).filter((move) => move.to === to);
    if (!candidates.length) return false;
    if (candidates.some((move) => move.promotion)) {
      setPendingPromotion({ from, to });
      return true;
    }
    void submit(`${from}${to}`);
    return true;
  }

  function handleSquareClick(square: string) {
    const clicked = square as Square;
    if (selectedSquare && attempt(selectedSquare, clicked)) return;
    const piece = game.get(clicked);
    setSelectedSquare(piece?.color === playerColor && game.turn() === playerColor ? clicked : null);
  }

  const legalTargets = useMemo(() => selectedSquare
    ? game.moves({ square: selectedSquare, verbose: true }).map((move) => move.to)
    : [], [game, selectedSquare]);
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (selectedSquare) styles[selectedSquare] = { boxShadow: "inset 0 0 0 5px #d8b45f" };
    for (const square of legalTargets) {
      styles[square] = game.get(square)
        ? { boxShadow: "inset 0 0 0 6px rgba(216,180,95,.78)" }
        : { backgroundImage: "radial-gradient(circle,rgba(20,30,22,.35) 0 18%,transparent 20%)" };
    }
    return styles;
  }, [game, legalTargets, selectedSquare]);

  // Sau khi trả lời: mũi tên đỏ là nước sai trong ván gốc, xanh là nước tốt nhất,
  // vàng là nước bạn vừa đi (nếu khác hai nước kia).
  const arrows = answer && item ? [
    arrow(item.playedUci, "#ef6461"),
    arrow(answer.bestMove, "#72cf86"),
    ...(answer.answeredUci && answer.answeredUci !== answer.bestMove && answer.answeredUci !== item.playedUci
      ? [arrow(answer.answeredUci, answer.correct ? "#72cf86" : "#d8b45f")] : []),
  ] : [];

  if (!authLoading && !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#111713] px-5">
        <div className="max-w-md rounded-3xl border border-white/9 bg-[#1a211d] p-8 text-center">
          <Repeat2 className="mx-auto size-8 text-[#d8b45f]" />
          <h1 className="mt-4 text-2xl font-semibold">Học từ sai lầm</h1>
          <p className="mt-3 text-sm leading-6 text-[#aeb8b1]">Luyện lại các nước sai trong chính ván của bạn. Cần đăng nhập vì đây là dữ liệu riêng của từng người.</p>
          <a href="/login?returnTo=%2Fmistakes" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#4b7fe8] px-4 py-2.5 font-semibold text-white"><LogIn className="size-4" /> Đăng nhập</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#111713] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl border border-white/9 bg-[#1a211d] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Repeat2 className="size-7 text-[#d8b45f]" />
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Học từ sai lầm</h1>
                <p className="mt-1 text-sm text-[#aeb8b1]">Tìm nước tốt hơn ở đúng những thế cờ bạn đã đi sai.</p>
              </div>
            </div>
            {summary && summary.total > 0 && (
              <div className="rounded-2xl bg-[#101511] px-5 py-3 text-right">
                <div className="text-xs uppercase tracking-wide text-[#89958d]">Đã sửa được</div>
                <div className="text-2xl font-semibold text-[#f0ddad]">{summary.fixed}/{summary.total}</div>
              </div>
            )}
          </div>
          {summary && summary.groups.length > 0 && (
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {PHASES.slice(1).map(({ value, label }) => {
                const groups = summary.groups.filter((group) => group.phase === value);
                const total = groups.reduce((sum, group) => sum + group.total, 0);
                const blunders = groups.filter((group) => group.label === "blunder").reduce((sum, group) => sum + group.total, 0);
                return (
                  <div key={value} className="rounded-2xl bg-white/5 px-4 py-3 text-sm">
                    <div className="text-[#89958d]">{label}</div>
                    <div className="mt-1 font-semibold">{total} sai lầm <span className="text-xs font-normal text-[#ef8b8b]">({blunders} blunder)</span></div>
                  </div>
                );
              })}
            </div>
          )}
        </header>

        <section className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,620px)_1fr]">
          <div className="relative rounded-3xl border border-white/9 bg-[#202923] p-3 shadow-2xl shadow-black/25">
            <Chessboard options={{
              id: "mistake-board",
              position: fen,
              boardOrientation: playerColor === "w" ? "white" : "black",
              squareStyles,
              arrows,
              boardStyle: { borderRadius: "12px" },
              darkSquareStyle: { backgroundColor: "#68805f" },
              lightSquareStyle: { backgroundColor: "#e9e1c7" },
              animationDurationInMs: 220,
              canDragPiece: ({ piece }: { piece: { pieceType: string } }) =>
                Boolean(item) && !busy && !answered && piece.pieceType[0]?.toLowerCase() === playerColor,
              onSquareClick: ({ square }: { square: string }) => handleSquareClick(square),
              onPieceDrag: () => setSelectedSquare(null),
              onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) =>
                targetSquare ? attempt(sourceSquare as Square, targetSquare as Square) : false,
            }} />
            {pendingPromotion && (
              <div className="absolute inset-x-6 top-1/2 z-40 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#1a211d] p-4 shadow-2xl">
                <p className="mb-3 text-center text-sm font-semibold">Phong cấp thành</p>
                <div className="grid grid-cols-4 gap-2">
                  {PROMOTION_PIECES.map(({ piece, label }) => (
                    <button key={piece} type="button" className="rounded-xl bg-white/8 px-3 py-2.5 font-semibold hover:bg-white/15"
                      onClick={() => {
                        const { from, to } = pendingPromotion;
                        setPendingPromotion(null);
                        void submit(`${from}${to}${piece}`);
                      }}>{label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-6 text-sm leading-6">
              {busy && !item ? (
                <p className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Đang tải…</p>
              ) : item ? (
                <>
                  <p className="text-[#89958d]">{item.gameTitle} · nước {item.moveNumber} · {PHASES.find((entry) => entry.value === item.phase)?.label}</p>
                  <p className="mt-2">
                    Trong ván, bạn ({item.playerSide === "w" ? "Trắng" : "Đen"}) đã đi <strong className="text-white">{item.playedSan}</strong>{" "}
                    <span className="rounded-md bg-[#ef6461]/15 px-1.5 py-0.5 text-xs font-semibold text-[#ff9a94]">{LABELS[item.label] ?? item.label}</span>
                    {item.winPercentLoss != null && <> — mất {Math.round(item.winPercentLoss)}% cơ hội thắng.</>}
                  </p>
                  <p className="mt-2 text-[#c7d0c9]">Hãy tìm nước tốt hơn.</p>

                  {answer && (
                    <div className={`mt-4 rounded-2xl border p-4 ${answer.correct ? "border-[#72cf86]/30 bg-[#72cf86]/10 text-[#a9e8b7]" : "border-[#ef6461]/30 bg-[#ef6461]/10 text-[#ffaaa8]"}`}>
                      <p className="flex items-center gap-2 font-semibold">
                        {answer.correct ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                        {answer.correct ? "Chính xác!" : answer.answeredUci ? "Chưa đúng." : "Đáp án"}
                      </p>
                      <p className="mt-1">{answer.detail}</p>
                      <p className="mt-1">Nước tốt nhất: <strong>{sanOf(item.fen, answer.bestMove)}</strong>
                        {answer.answeredUci && !answer.correct && <> · bạn vừa đi {sanOf(item.fen, answer.answeredUci)}</>}
                      </p>
                      {answer.review && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs opacity-80"><CalendarClock className="size-3.5" /> {describeReview(answer.review)}</p>
                      )}
                    </div>
                  )}
                  {message && <p className="mt-3 text-[#ffaaa8]">{message}</p>}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {answered && fromReview && (
                      <a href="/review" className="inline-flex items-center gap-2 rounded-xl bg-[#72cf86] px-4 py-2.5 font-semibold text-[#112016]"><CalendarClock className="size-4" /> Thẻ ôn tiếp theo</a>
                    )}
                    {answered ? (
                      <button type="button" onClick={() => void next()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#4b7fe8] px-4 py-2.5 font-semibold text-white disabled:opacity-50"><SkipForward className="size-4" /> Sai lầm tiếp theo</button>
                    ) : (
                      <button type="button" onClick={() => void reveal()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-semibold disabled:opacity-50"><Eye className="size-4" /> Xem đáp án</button>
                    )}
                    {busy && <LoaderCircle className="size-5 animate-spin self-center text-[#d8b45f]" />}
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-3 text-[#c7d0c9]">
                  <Target className="mt-0.5 size-5 shrink-0 text-[#d8b45f]" />
                  <p>{message || "Chưa có sai lầm nào."} Mở trang <a href="/analysis" className="text-[#8fb4ff] hover:underline">Phân tích</a>, chạy Game Review cho một ván rồi bấm Lưu.</p>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-6 text-sm">
              <label className="block text-[#89958d]" htmlFor="mistake-phase">Luyện theo giai đoạn</label>
              <select id="mistake-phase" value={phase}
                onChange={(event) => {
                  const value = event.target.value as GamePhase | "";
                  setPhase(value);
                  void next(value);
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#101511] px-3 py-2.5">
                {PHASES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
              <p className="mt-3 text-xs text-[#89958d]">Sai lầm chưa sửa được và lâu chưa ôn được ưu tiên trước. Nếu tên kỳ thủ trong ván trùng tên tài khoản, chỉ nước của bên bạn được tính.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
