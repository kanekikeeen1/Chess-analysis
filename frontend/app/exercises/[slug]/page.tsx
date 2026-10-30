"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  ArrowLeft, BookOpenCheck, CheckCircle2, ChevronLeft, ChevronRight,
  Lightbulb, LoaderCircle, LockKeyhole, RefreshCw, RotateCcw, Target,
} from "lucide-react";
import { useParams } from "next/navigation";

import { useAuth } from "@/app/auth-provider";
import { backendRequest } from "@/lib/backend-api";
import type { ExerciseLesson, ExerciseMoveResult, ExerciseSession } from "@/lib/domain-types";
import {
  MOVE_ASSESSMENT_META,
  type MoveAssessmentKey,
} from "@/lib/move-classification";

const ACCEPTED_KEYS = new Set(["best", "excellent", "okay"]);
const ASSESSMENT_LABELS: Record<string, string> = {
  best: "Nước đi tốt nhất", excellent: "Xuất sắc", okay: "Ổn",
  inaccuracy: "Không chính xác", mistake: "Sai lầm", blunder: "Blunder",
};

function AssessmentBadge({ assessmentKey, board = false }: { assessmentKey: string; board?: boolean }) {
  const meta = MOVE_ASSESSMENT_META[assessmentKey as MoveAssessmentKey];
  if (!meta) return null;
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-black shadow-md ${meta.badgeClassName} ${board ? "size-7 text-xs" : "size-9 text-sm"}`}
      title={meta.label}
      aria-label={meta.label}
    >
      {meta.symbol}
    </span>
  );
}

function applyUci(game: Chess, uci: string) {
  return game.move({
    from: uci.slice(0, 2) as Square,
    promotion: (uci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
    to: uci.slice(2, 4) as Square,
  });
}

function uciToSan(fen: string, uci: string | null) {
  if (!uci) return null;
  try { return applyUci(new Chess(fen), uci).san; } catch { return uci; }
}

function openingTimeline(line: string) {
  try {
    const game = new Chess();
    game.loadPgn(line);
    const history = game.history({ verbose: true });
    return {
      moves: history.map((move) => move.san),
      positions: history.length
        ? [history[0].before, ...history.map((move) => move.after)]
        : [new Chess().fen()],
    };
  } catch {
    return { moves: [] as string[], positions: [new Chess().fen()] };
  }
}

export default function ExerciseDetailPage() {
  const params = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [lesson, setLesson] = useState<ExerciseLesson | null>(null);
  const [error, setError] = useState("");
  // Server giữ trạng thái bài tàn cuộc: kiểm tra nước, đi nước đáp, xác định mục tiêu
  // và chấm điểm. Trang này chỉ hiển thị phiên mà server trả về.
  const [session, setSession] = useState<ExerciseSession | null>(null);
  const [fen, setFen] = useState("");
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [assessmentKey, setAssessmentKey] = useState("");
  const [lastMoveSan, setLastMoveSan] = useState("");
  const [lastMoveTarget, setLastMoveTarget] = useState<Square | null>(null);
  const [suggestedMove, setSuggestedMove] = useState<string | null>(null);
  const [openingIndex, setOpeningIndex] = useState(0);

  const playerColor = session?.playerSide ?? "w";
  const completed = session?.status === "COMPLETED";
  const finished = Boolean(session && session.status !== "ACTIVE");

  useEffect(() => {
    void backendRequest<ExerciseLesson>(`/api/exercises/${params.slug}`)
      .then(setLesson)
      .catch((caughtError) => setError(
        caughtError instanceof Error ? caughtError.message : "Không thể tải bài học.",
      ));
  }, [params.slug]);

  const opening = useMemo(
    () => openingTimeline(lesson?.category === "OPENING" ? lesson.solutionLine : ""),
    [lesson],
  );

  /** Bắt đầu phiên mới: thế ngẫu nhiên, hoặc chơi lại đúng thế `positionId`. */
  async function startSession(positionId?: number) {
    setError("");
    setFeedback(positionId ? "Đang đặt lại thế cờ…" : "Đang chọn một thế cờ ngẫu nhiên…");
    setSuggestedMove(null);
    setAssessmentKey("");
    setLastMoveSan("");
    setLastMoveTarget(null);
    setSelectedSquare(null);
    try {
      const next = await backendRequest<ExerciseSession>(`/api/exercises/${params.slug}/sessions`, {
        method: "POST",
        body: JSON.stringify({ positionId: positionId ?? null }),
      });
      setSession(next);
      setFen(next.currentFen);
      setFeedback(`Bạn cầm ${next.playerSide === "w" ? "Trắng" : "Đen"}. Hãy tìm nước đi tốt nhất.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Không thể tạo thế cờ.");
    }
  }

  useEffect(() => {
    if (lesson?.category === "ENDGAME") void startSession();
    if (lesson?.category === "OPENING") setOpeningIndex(opening.positions.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id]);

  const game = useMemo(() => {
    try { return new Chess(fen || undefined); } catch { return new Chess(); }
  }, [fen]);
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

  async function attemptMove(from: Square, to: Square) {
    if (!session || isEvaluating || finished || game.turn() !== playerColor) return false;
    let move;
    try {
      // chess.js chỉ dùng để biết nước có hợp lệ và hiển thị SAN; server kiểm tra lại.
      move = new Chess(fen).move({ from, to, promotion: "q" });
    } catch {
      setFeedback("Nước đi không hợp lệ.");
      return false;
    }
    setLastMoveSan(move.san);
    setLastMoveTarget(move.to);
    setSelectedSquare(null);
    setIsEvaluating(true);
    setFeedback("Stockfish depth 20 đang kiểm tra nước đi…");
    try {
      const result = await backendRequest<ExerciseMoveResult>(
        `/api/exercises/sessions/${session.sessionId}/moves`,
        { method: "POST", body: JSON.stringify({ uci: `${move.from}${move.to}${move.promotion ?? ""}` }) },
      );
      setAssessmentKey(result.assessmentKey);

      if (!result.accepted) {
        setSession(result.session);
        setSuggestedMove(result.bestMove);
        setFeedback(`${ASSESSMENT_LABELS[result.assessmentKey] ?? result.assessmentKey}: ${result.detail}`);
        return true;
      }

      setSuggestedMove(null);
      if (result.opponentReply) {
        // Hiện nước của người học trước rồi mới tới nước đáp, như một ván thật.
        setFen(move.after);
        setFeedback(`${ASSESSMENT_LABELS[result.assessmentKey] ?? "Đúng"}. Stockfish đang đáp lại…`);
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
      setFen(result.session.currentFen);
      setSession(result.session);
      setFeedback(result.message
        ?? `${ASSESSMENT_LABELS[result.assessmentKey] ?? "Đúng"}. Đến lượt bạn.`);
      return true;
    } catch (caughtError) {
      setFeedback(caughtError instanceof Error ? caughtError.message : "Không thể kiểm tra nước đi.");
      return false;
    } finally {
      setIsEvaluating(false);
    }
  }


  function handleSquareClick(square: string) {
    const clicked = square as Square;
    if (selectedSquare && legalTargets.includes(clicked)) {
      void attemptMove(selectedSquare, clicked);
      return;
    }
    const piece = game.get(clicked);
    setSelectedSquare(piece?.color === playerColor && game.turn() === playerColor ? clicked : null);
  }

  function playSuggestion() {
    if (!suggestedMove) return;
    void attemptMove(suggestedMove.slice(0, 2) as Square, suggestedMove.slice(2, 4) as Square);
  }

  if (!lesson && !error) {
    return <main className="grid min-h-screen place-items-center"><LoaderCircle className="size-8 animate-spin text-[#d8b45f]" /></main>;
  }

  const displayFen = lesson?.category === "OPENING"
    ? opening.positions[openingIndex] ?? opening.positions[0]
    : fen || lesson?.startingFen || new Chess().fen();
  const goalLabel = session?.goalType === "CHECKMATE" ? "Chiếu hết vua đối phương"
    : session?.goalType === "PROMOTE" ? "Phong cấp tốt thành hậu"
      : session?.goalType === "WIN_ROOK" ? "Thắng xe đối phương và giữ được hậu"
        : "Giữ được kết quả hòa (trụ 10 nước không sai hoặc đạt thế hòa)";

  return (
    <main className="min-h-screen bg-[#111713] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <a href="/exercises" className="inline-flex items-center gap-2 text-sm text-[#aeb8b1] hover:text-white"><ArrowLeft className="size-4" /> Danh sách bài tập</a>
        {error || !lesson ? (
          <div className="mt-8 rounded-3xl border border-[#ef6461]/25 bg-[#ef6461]/10 p-6 text-[#ffaaa8]">{error}</div>
        ) : (
          <>
            <header className="mt-6 rounded-3xl border border-white/9 bg-[#1a211d] p-6 sm:p-8">
              <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-[#d8b45f]/12 px-2.5 py-1 font-semibold text-[#e3c87f]">{lesson.category === "OPENING" ? "Khai cuộc" : "Tàn cuộc"}</span><span className="rounded-lg bg-white/6 px-2.5 py-1 text-[#aeb8b1]">{lesson.groupName}</span><span className="rounded-lg bg-white/6 px-2.5 py-1 text-[#aeb8b1]">{lesson.difficulty}</span></div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">{lesson.title}</h1>
              <p className="mt-3 leading-7 text-[#aeb8b1]">{lesson.description}</p>
            </header>

            <section className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,620px)_1fr]">
              <div className="rounded-3xl border border-white/9 bg-[#202923] p-3 shadow-2xl shadow-black/25">
                <Chessboard options={{
                  id: `exercise-${lesson.slug}`,
                  position: displayFen,
                  squareStyles,
                  boardStyle: { borderRadius: "12px" },
                  darkSquareStyle: { backgroundColor: "#68805f" },
                  lightSquareStyle: { backgroundColor: "#e9e1c7" },
                  animationDurationInMs: 220,
                  squareRenderer: ({ square, children }: { square: string; children?: React.ReactNode }) => (
                    <div className="relative size-full" style={squareStyles[square]}>
                      {children}
                      {assessmentKey && square === lastMoveTarget && (
                        <span className="pointer-events-none absolute -top-2 right-0 z-30">
                          <AssessmentBadge assessmentKey={assessmentKey} board />
                        </span>
                      )}
                    </div>
                  ),
                  canDragPiece: ({ piece }: { piece: { pieceType: string } }) =>
                    lesson.category === "ENDGAME" && !isEvaluating && !finished &&
                    piece.pieceType[0]?.toLowerCase() === playerColor && game.turn() === playerColor,
                  onSquareClick: ({ square }: { square: string }) => lesson.category === "ENDGAME" && handleSquareClick(square),
                  onPieceDrag: () => setSelectedSquare(null),
                  onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
                    if (lesson.category !== "ENDGAME" || !targetSquare) return false;
                    void attemptMove(sourceSquare as Square, targetSquare as Square);
                    return true;
                  },
                }} />
              </div>

              <div className="space-y-4">
                {lesson.category === "OPENING" ? (
                  <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-6">
                    <div className="flex items-center gap-2"><BookOpenCheck className="size-5 text-[#72cf86]" /><h2 className="font-semibold">Thế cờ nhận diện khai cuộc</h2></div>
                    <p className="mt-3 text-sm leading-6 text-[#96a098]">Bàn cờ đang hiển thị vị trí sau nước {openingIndex}/{opening.moves.length}. Dùng hai nút dưới để xem cách thế cờ được hình thành.</p>
                    <div className="mt-4 rounded-2xl bg-[#101511] p-4 font-mono text-sm leading-7 text-[#f0ddad]">{lesson.solutionLine}</div>
                    <div className="mt-4 grid grid-cols-[48px_1fr_48px] items-center gap-3">
                      <button type="button" aria-label="Nước trước" onClick={() => setOpeningIndex((value) => Math.max(0, value - 1))} disabled={openingIndex === 0} className="grid size-12 place-items-center rounded-xl bg-white/7 disabled:opacity-30"><ChevronLeft /></button>
                      <div className="text-center text-sm text-[#aeb8b1]">{openingIndex ? `Nước vừa đi: ${opening.moves[openingIndex - 1]}` : "Vị trí ban đầu"}</div>
                      <button type="button" aria-label="Nước sau" onClick={() => setOpeningIndex((value) => Math.min(opening.positions.length - 1, value + 1))} disabled={openingIndex >= opening.positions.length - 1} className="grid size-12 place-items-center rounded-xl bg-white/7 disabled:opacity-30"><ChevronRight /></button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-6">
                    <div className="flex items-center gap-2"><Target className="size-5 text-[#72cf86]" /><h2 className="font-semibold">Thực chiến với Stockfish</h2></div>
                    <p className="mt-3 text-sm leading-6 text-[#96a098]">Mục tiêu: <strong className="text-white">{goalLabel}</strong>. Mỗi nước của bạn được backend Stockfish kiểm tra ở depth 20 để ưu tiên đường chiếu hết nhanh.</p>
                    <div className={`mt-4 rounded-2xl border p-4 text-sm leading-6 ${completed ? "border-[#72cf86]/30 bg-[#72cf86]/10 text-[#a9e8b7]" : session?.status === "FAILED" ? "border-[#ef6461]/30 bg-[#ef6461]/10 text-[#ffaaa8]" : assessmentKey && !ACCEPTED_KEYS.has(assessmentKey) ? "border-[#ef8b3c]/30 bg-[#ef8b3c]/10 text-[#ffc493]" : "border-white/8 bg-white/5 text-[#c7d0c9]"}`}>
                      <div className="flex items-start gap-3">
                        {isEvaluating
                          ? <LoaderCircle className="mt-1 size-5 shrink-0 animate-spin" />
                          : assessmentKey
                            ? <AssessmentBadge assessmentKey={assessmentKey} />
                            : suggestedMove
                              ? <Lightbulb className="mt-0.5 size-4 shrink-0" />
                              : completed
                                ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                                : <Target className="mt-0.5 size-4 shrink-0" />}
                        <div>
                          {assessmentKey && lastMoveSan && <p className="font-bold text-white">{lastMoveSan} — {ASSESSMENT_LABELS[assessmentKey] ?? assessmentKey}</p>}
                          <p className={assessmentKey && lastMoveSan ? "mt-1" : ""}>{feedback || "Đang chuẩn bị thế cờ…"}</p>
                        </div>
                      </div>
                      {suggestedMove && <button type="button" onClick={playSuggestion} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#72cf86] px-4 py-2.5 font-semibold text-[#112016]"><Lightbulb className="size-4" /> Chơi nước tốt nhất: {uciToSan(fen, suggestedMove)}</button>}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void startSession()} disabled={isEvaluating} className="inline-flex items-center gap-2 rounded-xl bg-[#4b7fe8] px-4 py-2.5 font-semibold text-white disabled:opacity-50"><RefreshCw className="size-4" /> Thế cờ ngẫu nhiên khác</button>
                      <button type="button" onClick={() => { if (session) void startSession(session.positionId); }} disabled={isEvaluating || !session} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-semibold disabled:opacity-50"><RotateCcw className="size-4" /> Chơi lại</button>
                    </div>
                    {!user && <p className="mt-4 flex items-center gap-2 text-xs text-[#89958d]"><LockKeyhole className="size-4" /> Bạn vẫn luyện bình thường; đăng nhập để lưu điểm và tiến trình.</p>}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
