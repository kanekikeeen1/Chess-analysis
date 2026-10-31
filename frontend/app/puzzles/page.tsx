"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  CheckCircle2, Eye, Flag, LoaderCircle, LockKeyhole, Puzzle, SkipForward, Target,
  TrendingDown, TrendingUp, XCircle,
} from "lucide-react";

import { useAuth } from "@/app/auth-provider";
import { backendRequest } from "@/lib/backend-api";
import type {
  PuzzleMoveResult, PuzzleRating, PuzzleSession, PuzzleTheme,
} from "@/lib/domain-types";

/** Tên tiếng Việt cho các theme thường gặp của Lichess; theme khác giữ tên gốc. */
const THEME_LABELS: Record<string, string> = {
  advantage: "Giành lợi thế", attraction: "Thu hút", backRankMate: "Chiếu hết hàng cuối",
  bishopEndgame: "Tàn cuộc tượng", capturingDefender: "Diệt quân phòng thủ", clearance: "Dọn đường",
  crushing: "Đòn quyết định", defensiveMove: "Nước phòng thủ", deflection: "Kéo lệch",
  discoveredAttack: "Tấn công mở", doubleCheck: "Chiếu đôi", endgame: "Tàn cuộc", equality: "Gỡ hòa",
  exposedKing: "Vua hở", fork: "Đòn đôi", hangingPiece: "Quân treo", interference: "Cản đường",
  intermezzo: "Nước chen", kingsideAttack: "Tấn công cánh vua", knightEndgame: "Tàn cuộc mã",
  long: "Dài", mate: "Chiếu hết", mateIn1: "Chiếu hết 1 nước", mateIn2: "Chiếu hết 2 nước",
  mateIn3: "Chiếu hết 3 nước", mateIn4: "Chiếu hết 4 nước", middlegame: "Trung cuộc", oneMove: "Một nước",
  opening: "Khai cuộc", pawnEndgame: "Tàn cuộc tốt", pin: "Ghim", promotion: "Phong cấp",
  queenEndgame: "Tàn cuộc hậu", queensideAttack: "Tấn công cánh hậu", quietMove: "Nước yên lặng",
  rookEndgame: "Tàn cuộc xe", sacrifice: "Thí quân", short: "Ngắn", skewer: "Xiên",
  smotheredMate: "Chiếu hết ngạt", trappedPiece: "Bẫy quân", veryLong: "Rất dài",
  xRayAttack: "Tấn công xuyên", zugzwang: "Zugzwang",
};
const GUEST_RATINGS = [800, 1000, 1200, 1400, 1500, 1600, 1800, 2000, 2200, 2400];
const PROMOTION_PIECES = [
  { piece: "q", label: "Hậu" }, { piece: "r", label: "Xe" },
  { piece: "b", label: "Tượng" }, { piece: "n", label: "Mã" },
] as const;

function themeLabel(theme: string) {
  return THEME_LABELS[theme] ?? theme;
}

/** Đi một nước UCI trên FEN và trả vị trí mới cùng SAN; trả null nếu nước không hợp lệ. */
function play(fen: string, uci: string) {
  try {
    const game = new Chess(fen);
    const move = game.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: (uci[4] as "q" | "r" | "b" | "n" | undefined) ?? undefined,
    });
    return { fen: game.fen(), san: move.san };
  } catch {
    return null;
  }
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function PuzzlesPage() {
  const { user } = useAuth();
  const [session, setSession] = useState<PuzzleSession | null>(null);
  const [fen, setFen] = useState(new Chess().fen());
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [arrow, setArrow] = useState<{ from: string; to: string; color: string } | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [result, setResult] = useState<PuzzleMoveResult | null>(null);
  const [rating, setRating] = useState<PuzzleRating | null>(null);
  const [themes, setThemes] = useState<PuzzleTheme[]>([]);
  const [theme, setTheme] = useState("");
  const [guestRating, setGuestRating] = useState(1500);
  const [error, setError] = useState("");

  const playerColor = session?.puzzle.playerSide ?? "w";
  const finished = Boolean(session && session.status !== "ACTIVE");
  const game = useMemo(() => {
    try { return new Chess(fen); } catch { return new Chess(); }
  }, [fen]);

  useEffect(() => {
    void backendRequest<PuzzleTheme[]>("/api/puzzles/themes")
      .then((list) => setThemes(list.slice(0, 40)))
      .catch(() => setThemes([]));
  }, []);

  useEffect(() => {
    if (!user) {
      setRating(null);
      return;
    }
    void backendRequest<PuzzleRating>("/api/puzzles/rating/me").then(setRating).catch(() => setRating(null));
  }, [user]);

  async function start() {
    setError("");
    setResult(null);
    setArrow(null);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setBusy(true);
    setFeedback("Đang chọn puzzle phù hợp với trình độ…");
    try {
      const next = await backendRequest<PuzzleSession>("/api/puzzles/sessions", {
        method: "POST",
        body: JSON.stringify({ theme: theme || null, rating: user ? null : guestRating }),
      });
      setSession(next);
      // Diễn lại nước đối thủ vừa đi rồi mới tới lượt người giải, như Lichess.
      setFen(next.sourceFen);
      setLastMove(null);
      await wait(500);
      setFen(next.currentFen);
      setLastMove({ from: next.setupMove.slice(0, 2), to: next.setupMove.slice(2, 4) });
      setFeedback(`Bạn cầm ${next.puzzle.playerSide === "w" ? "Trắng" : "Đen"}. Tìm nước đi tốt nhất.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Không thể tải puzzle.");
      setFeedback("");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(uci: string) {
    if (!session) return;
    const local = play(fen, uci);
    if (!local) return;
    setBusy(true);
    setSelectedSquare(null);
    setFen(local.fen);
    setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    try {
      const response = await backendRequest<PuzzleMoveResult>(
        `/api/puzzles/sessions/${session.sessionId}/moves`,
        { method: "POST", body: JSON.stringify({ uci }) },
      );
      if (!response.correct) {
        // Server trả vị trí trước nước sai: hiện nước đúng bằng mũi tên xanh.
        await wait(350);
        setFen(response.session.currentFen);
        setLastMove(null);
        if (response.expectedMove) {
          setArrow({ from: response.expectedMove.slice(0, 2), to: response.expectedMove.slice(2, 4), color: "#72cf86" });
        }
        setFeedback(`Chưa đúng. Nước đúng là ${play(response.session.currentFen, response.expectedMove ?? "")?.san ?? response.expectedMove}.`);
      } else if (response.opponentReply) {
        setFeedback("Chính xác! Đối thủ đang đáp lại…");
        await wait(350);
        setFen(response.session.currentFen);
        setLastMove({ from: response.opponentReply.slice(0, 2), to: response.opponentReply.slice(2, 4) });
        setFeedback("Chính xác! Tìm nước tiếp theo.");
      } else {
        setFeedback("Chính xác! Bạn đã giải xong puzzle.");
      }
      setSession(response.session);
      if (response.session.status !== "ACTIVE") finish(response);
    } catch (caughtError) {
      setFen(session.currentFen);
      setFeedback(caughtError instanceof Error ? caughtError.message : "Không thể kiểm tra nước đi.");
    } finally {
      setBusy(false);
    }
  }

  function finish(response: PuzzleMoveResult) {
    setResult(response);
    const change = response.ratingChange;
    if (change) {
      setRating((previous) => previous && {
        ...previous,
        rating: change.after,
        deviation: change.deviation,
        provisional: change.provisional,
        attempts: previous.attempts + 1,
        solved: previous.solved + (response.session.status === "SOLVED" ? 1 : 0),
      });
    }
  }

  async function giveUp() {
    if (!session || finished) return;
    setBusy(true);
    try {
      const response = await backendRequest<PuzzleMoveResult>(
        `/api/puzzles/sessions/${session.sessionId}/give-up`, { method: "POST" },
      );
      setSession(response.session);
      if (response.expectedMove) {
        setArrow({ from: response.expectedMove.slice(0, 2), to: response.expectedMove.slice(2, 4), color: "#72cf86" });
      }
      setFeedback("Đã hiện nước đúng. Bấm “Xem lời giải” để xem toàn bộ.");
      finish(response);
    } catch (caughtError) {
      setFeedback(caughtError instanceof Error ? caughtError.message : "Không thể bỏ qua puzzle.");
    } finally {
      setBusy(false);
    }
  }

  /** Diễn lại phần lời giải còn lại từ vị trí hiện tại. */
  async function showSolution() {
    if (!result?.solution?.length) return;
    setBusy(true);
    setArrow(null);
    let current = result.session.currentFen;
    for (const uci of result.solution) {
      const next = play(current, uci);
      if (!next) break;
      current = next.fen;
      setFen(current);
      setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
      await wait(700);
    }
    setFeedback("Đó là toàn bộ lời giải.");
    setResult({ ...result, solution: [] });
    setBusy(false);
  }

  function attempt(from: Square, to: Square) {
    if (!session || busy || finished || game.turn() !== playerColor) return false;
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
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: "rgba(216,180,95,.35)" };
      styles[lastMove.to] = { backgroundColor: "rgba(216,180,95,.5)" };
    }
    if (selectedSquare) styles[selectedSquare] = { boxShadow: "inset 0 0 0 5px #d8b45f" };
    for (const square of legalTargets) {
      styles[square] = game.get(square)
        ? { boxShadow: "inset 0 0 0 6px rgba(216,180,95,.78)" }
        : { backgroundImage: "radial-gradient(circle,rgba(20,30,22,.35) 0 18%,transparent 20%)" };
    }
    return styles;
  }, [game, lastMove, legalTargets, selectedSquare]);

  const solved = session?.status === "SOLVED";
  const change = result?.ratingChange;

  return (
    <main className="min-h-screen bg-[#111713] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl border border-white/9 bg-[#1a211d] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Puzzle className="size-7 text-[#d8b45f]" />
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Puzzle chiến thuật</h1>
                <p className="mt-1 text-sm text-[#aeb8b1]">Độ khó tự điều chỉnh theo rating Glicko-2 của bạn.</p>
              </div>
            </div>
            {rating ? (
              <div className="rounded-2xl bg-[#101511] px-5 py-3 text-right">
                <div className="text-xs uppercase tracking-wide text-[#89958d]">Rating puzzle</div>
                <div className="text-2xl font-semibold text-[#f0ddad]">
                  {rating.rating}{rating.provisional ? "?" : ""}
                  {change && (
                    <span className={`ml-2 text-base ${change.delta >= 0 ? "text-[#72cf86]" : "text-[#ef6461]"}`}>
                      {change.delta >= 0 ? <TrendingUp className="inline size-4" /> : <TrendingDown className="inline size-4" />}
                      {change.delta >= 0 ? "+" : ""}{change.delta}
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#89958d]">{rating.solved}/{rating.attempts} bài giải đúng</div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-xs text-[#89958d]"><LockKeyhole className="size-4" /> Đăng nhập để có rating riêng và lưu tiến trình.</p>
            )}
          </div>
        </header>

        {error && <div className="mt-5 rounded-3xl border border-[#ef6461]/25 bg-[#ef6461]/10 p-5 text-[#ffaaa8]">{error}</div>}

        <section className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,620px)_1fr]">
          <div className="relative rounded-3xl border border-white/9 bg-[#202923] p-3 shadow-2xl shadow-black/25">
            <Chessboard options={{
              id: "puzzle-board",
              position: fen,
              boardOrientation: playerColor === "w" ? "white" : "black",
              squareStyles,
              arrows: arrow ? [{ startSquare: arrow.from, endSquare: arrow.to, color: arrow.color }] : [],
              boardStyle: { borderRadius: "12px" },
              darkSquareStyle: { backgroundColor: "#68805f" },
              lightSquareStyle: { backgroundColor: "#e9e1c7" },
              animationDurationInMs: 220,
              canDragPiece: ({ piece }: { piece: { pieceType: string } }) =>
                !busy && !finished && piece.pieceType[0]?.toLowerCase() === playerColor && game.turn() === playerColor,
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
            <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-6">
              <div className={`rounded-2xl border p-4 text-sm leading-6 ${solved ? "border-[#72cf86]/30 bg-[#72cf86]/10 text-[#a9e8b7]" : session?.status === "FAILED" ? "border-[#ef6461]/30 bg-[#ef6461]/10 text-[#ffaaa8]" : "border-white/8 bg-white/5 text-[#c7d0c9]"}`}>
                <div className="flex items-start gap-3">
                  {busy ? <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin" />
                    : solved ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                      : session?.status === "FAILED" ? <XCircle className="mt-0.5 size-5 shrink-0" />
                        : <Target className="mt-0.5 size-5 shrink-0" />}
                  <p>{feedback || "Đang tải…"}</p>
                </div>
                {change && (
                  <p className="mt-2 text-xs opacity-80">Rating {change.before} → {change.after} ({change.delta >= 0 ? "+" : ""}{change.delta})</p>
                )}
                {result && !change && user && !session?.rated && (
                  <p className="mt-2 text-xs opacity-80">Bạn đã gặp puzzle này trước đây nên lượt này không tính rating.</p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {finished ? (
                  <>
                    <button type="button" onClick={() => void start()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#4b7fe8] px-4 py-2.5 font-semibold text-white disabled:opacity-50"><SkipForward className="size-4" /> Puzzle tiếp theo</button>
                    {Boolean(result?.solution?.length) && (
                      <button type="button" onClick={() => void showSolution()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-semibold disabled:opacity-50"><Eye className="size-4" /> Xem lời giải</button>
                    )}
                  </>
                ) : (
                  <button type="button" onClick={() => void giveUp()} disabled={busy || !session} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-semibold disabled:opacity-50"><Flag className="size-4" /> Bỏ qua và xem đáp án</button>
                )}
              </div>
            </div>

            {session && (
              <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-6 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#89958d]">Độ khó</span>
                  <span className="font-semibold text-[#f0ddad]">{finished ? session.puzzle.rating : "Ẩn đến khi giải xong"}</span>
                </div>
                {finished && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {session.puzzle.themes.map((item) => (
                      <span key={item} className="rounded-lg bg-white/6 px-2 py-1 text-xs text-[#aeb8b1]">{themeLabel(item)}</span>
                    ))}
                  </div>
                )}
                {finished && session.puzzle.gameUrl && (
                  <a href={session.puzzle.gameUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-[#8fb4ff] hover:underline">Xem ván gốc trên Lichess</a>
                )}
              </div>
            )}

            <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-6 text-sm">
              <label className="block text-[#89958d]" htmlFor="puzzle-theme">Luyện theo chủ đề</label>
              <select id="puzzle-theme" value={theme} onChange={(event) => setTheme(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#101511] px-3 py-2.5">
                <option value="">Tất cả chủ đề</option>
                {themes.map((item) => (
                  <option key={item.theme} value={item.theme}>{themeLabel(item.theme)} ({item.puzzles})</option>
                ))}
              </select>
              {!user && (
                <>
                  <label className="mt-4 block text-[#89958d]" htmlFor="guest-rating">Độ khó (khách)</label>
                  <select id="guest-rating" value={guestRating} onChange={(event) => setGuestRating(Number(event.target.value))}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#101511] px-3 py-2.5">
                    {GUEST_RATINGS.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </>
              )}
              <p className="mt-3 text-xs text-[#89958d]">Áp dụng từ puzzle tiếp theo. Puzzle lấy từ Lichess Puzzle Database (CC0).</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
