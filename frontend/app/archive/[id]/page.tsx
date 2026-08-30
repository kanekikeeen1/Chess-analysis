"use client";

import { useEffect, useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Code2,
  LoaderCircle,
  Pause,
  Play,
  Trophy,
} from "lucide-react";
import { useParams } from "next/navigation";

import { useAuth } from "@/app/auth-provider";
import { backendRequest } from "@/lib/backend-api";
import type { GameDetail } from "@/lib/domain-types";
import { buildReplayTimeline, parseSavedAnalysis } from "@/lib/saved-analysis";

function ReplayButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-12 place-items-center rounded-xl bg-white/7 text-white transition hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4b7fe8] disabled:cursor-not-allowed disabled:opacity-25"
    >
      {children}
    </button>
  );
}

export default function ArchivedGamePage() {
  const params = useParams<{ id: string }>();
  const { isLoading: authLoading, user } = useAuth();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [error, setError] = useState("");
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      window.location.replace(`/login?returnTo=/archive/${params.id}?mode=replay`);
      return;
    }
    void backendRequest<GameDetail>(`/api/games/${params.id}`)
      .then((loadedGame) => {
        setGame(loadedGame);
        setReplayIndex(0);
        setIsPlaying(false);
      })
      .catch((caughtError) => setError(
        caughtError instanceof Error ? caughtError.message : "Không thể mở báo cáo.",
      ));
  }, [authLoading, params.id, user]);

  const savedMoves = useMemo(
    () => game?.analysisJson ? parseSavedAnalysis(game.analysisJson).moves : [],
    [game],
  );
  const replay = useMemo(
    () => game ? buildReplayTimeline(game, savedMoves) : { positions: [], moves: [] },
    [game, savedMoves],
  );
  const lastIndex = Math.max(0, replay.positions.length - 1);
  const currentFen = replay.positions[Math.min(replayIndex, lastIndex)] ?? game?.initialFen;
  const currentMove = replayIndex > 0 ? replay.moves[replayIndex - 1] : null;

  useEffect(() => {
    if (!isPlaying) return;
    if (replayIndex >= lastIndex) {
      setIsPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setReplayIndex((index) => Math.min(lastIndex, index + 1));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [isPlaying, lastIndex, replayIndex]);

  const lastMoveStyles = useMemo(() => {
    const uci = currentMove?.uci;
    if (!uci || uci.length < 4) return {};
    return {
      [uci.slice(0, 2)]: { backgroundColor: "rgba(216,180,95,.42)" },
      [uci.slice(2, 4)]: { backgroundColor: "rgba(216,180,95,.62)" },
    };
  }, [currentMove?.uci]);

  function goTo(index: number) {
    setIsPlaying(false);
    setReplayIndex(Math.max(0, Math.min(lastIndex, index)));
  }

  function togglePlayback() {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (replayIndex >= lastIndex) setReplayIndex(0);
    setIsPlaying(true);
  }

  if (authLoading || (!game && !error)) {
    return <main className="grid min-h-screen place-items-center"><LoaderCircle className="size-8 animate-spin text-[#d8b45f]" /></main>;
  }

  return (
    <main className="min-h-screen bg-[#111713] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <a href="/archive" className="inline-flex items-center gap-2 text-sm text-[#aeb8b1] hover:text-white"><ArrowLeft className="size-4" /> Quay lại kho ván cờ</a>
        {error || !game ? (
          <div className="mt-8 rounded-3xl border border-[#ef6461]/25 bg-[#ef6461]/10 p-6 text-[#ffaaa8]">{error || "Không tìm thấy ván cờ."}</div>
        ) : (
          <>
            <header className="mt-6 rounded-3xl border border-white/9 bg-[#1a211d] p-6">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#89958d]"><span className="rounded-md bg-[#d8b45f]/12 px-2 py-1 font-semibold text-[#e3c87f]">{game.sourceType}</span><span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> {new Date(game.createdAt).toLocaleString("vi-VN")}</span></div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">{game.title}</h1>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <span className="rounded-xl bg-white/6 px-3 py-2">Trắng <strong>{game.whiteAccuracy?.toFixed(1) ?? "—"}%</strong></span>
                <span className="rounded-xl bg-white/6 px-3 py-2">Đen <strong>{game.blackAccuracy?.toFixed(1) ?? "—"}%</strong></span>
                <span className="inline-flex items-center gap-1 rounded-xl bg-[#72cf86]/10 px-3 py-2 font-semibold text-[#8bd99a]"><Trophy className="size-4" /> {game.result}</span>
                <span className="rounded-xl bg-white/6 px-3 py-2">Depth {game.depth ?? "—"}</span>
              </div>
            </header>

            <section className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,680px)_1fr]">
              <div className="rounded-3xl border border-white/9 bg-[#202923] p-3 shadow-2xl shadow-black/25">
                {currentFen ? (
                  <Chessboard options={{
                    id: `archive-replay-${game.id}`,
                    position: currentFen,
                    squareStyles: lastMoveStyles,
                    boardStyle: { borderRadius: "12px", boxShadow: "0 20px 45px rgba(0,0,0,.25)" },
                    darkSquareStyle: { backgroundColor: "#68805f" },
                    lightSquareStyle: { backgroundColor: "#e9e1c7" },
                    animationDurationInMs: 260,
                    canDragPiece: () => false,
                    onPieceDrop: () => false,
                  }} />
                ) : null}
              </div>

              <div className="overflow-hidden rounded-3xl border border-white/9 bg-[#1a211d]">
                <div className="border-b border-white/8 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#72cf86]">Xem lại toàn bộ ván cờ</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{currentMove?.san ?? "Vị trí ban đầu"}</h2>
                      <p className="mt-1 text-sm text-[#8f9a92]">Nước {replayIndex}/{lastIndex}</p>
                    </div>
                    {currentMove && <span className="rounded-lg bg-[#d8b45f]/12 px-2.5 py-1 text-xs font-semibold text-[#e3c87f]">{currentMove.assessmentLabel ?? currentMove.assessment ?? "Đã phân tích"}</span>}
                  </div>
                  {currentMove && <p className="mt-3 text-sm text-[#96a098]">Eval {currentMove.evaluation == null ? "—" : Number(currentMove.evaluation).toFixed(2)} · Depth {currentMove.depth ?? game.depth ?? "—"}</p>}
                </div>

                <div className="grid grid-cols-5 gap-2 border-b border-white/8 p-3">
                  <ReplayButton label="Về đầu ván" onClick={() => goTo(0)} disabled={replayIndex === 0}><ChevronFirst className="size-6" /></ReplayButton>
                  <ReplayButton label="Nước trước" onClick={() => goTo(replayIndex - 1)} disabled={replayIndex === 0}><ChevronLeft className="size-6" /></ReplayButton>
                  <ReplayButton label={isPlaying ? "Tạm dừng" : "Tự động phát"} onClick={togglePlayback} disabled={lastIndex === 0}>{isPlaying ? <Pause className="size-6" /> : <Play className="size-6" />}</ReplayButton>
                  <ReplayButton label="Nước sau" onClick={() => goTo(replayIndex + 1)} disabled={replayIndex >= lastIndex}><ChevronRight className="size-6" /></ReplayButton>
                  <ReplayButton label="Tới cuối ván" onClick={() => goTo(lastIndex)} disabled={replayIndex >= lastIndex}><ChevronLast className="size-6" /></ReplayButton>
                </div>

                <div className="max-h-[390px] overflow-y-auto p-3 [scrollbar-color:#4a554e_transparent]">
                  {replay.moves.length ? (
                    <div className="grid grid-cols-2 gap-2">
                      {replay.moves.map((move, index) => (
                        <button
                          type="button"
                          key={`${move.index ?? index}-${move.san}`}
                          onClick={() => goTo(index + 1)}
                          aria-current={replayIndex === index + 1 ? "step" : undefined}
                          className={`rounded-xl border px-3 py-2.5 text-left transition ${replayIndex === index + 1 ? "border-[#4b7fe8] bg-[#4b7fe8] text-white" : "border-white/6 bg-[#121814] hover:border-white/16 hover:bg-white/6"}`}
                        >
                          <span className="font-semibold">{Math.floor(index / 2) + 1}{index % 2 === 0 ? "." : "…"} {move.san ?? "—"}</span>
                          <span className={`mt-1 block text-[11px] ${replayIndex === index + 1 ? "text-white/75" : "text-[#89958d]"}`}>{move.assessmentLabel ?? move.assessment ?? "Chưa có nhãn"}</span>
                        </button>
                      ))}
                    </div>
                  ) : <p className="rounded-xl bg-[#121814] p-4 text-sm leading-6 text-[#96a098]">Bản ghi FEN này không có lịch sử nước đi; bàn cờ đang hiển thị thế cờ đã lưu.</p>}
                </div>
              </div>
            </section>

            <div className="mt-5 grid gap-5 lg:grid-cols-[0.7fr_1.3fr]">
              <section className="rounded-3xl border border-white/9 bg-[#1a211d] p-5">
                <div className="flex items-center gap-2 text-[#d8b45f]"><BookOpen className="size-5" /><h2 className="font-semibold">Nhận diện khai cuộc</h2></div>
                <p className="mt-4 text-xs uppercase tracking-[0.14em] text-[#89958d]">{game.openingEco ?? "ECO —"}</p>
                <p className="mt-1 text-lg font-semibold">{game.openingName ?? "Chưa xác định"}</p>
              </section>

              <section className="rounded-3xl border border-white/9 bg-[#1a211d] p-5">
                <h2 className="font-semibold">Thông tin bản ghi</h2>
                <p className="mt-3 text-sm leading-6 text-[#96a098]">{game.moveCount} lượt cờ được tái dựng từ FEN trước/sau từng nước. Nhấn một nước trong danh sách hoặc dùng bộ điều khiển để xem toàn bộ diễn biến.</p>
              </section>
            </div>

            {game.pgn && (
              <details className="mt-5 rounded-3xl border border-white/9 bg-[#1a211d] p-5">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><Code2 className="size-5 text-[#78a7ff]" /> PGN gốc</summary>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-[#0f1411] p-4 text-xs leading-6 text-[#b9c2bb]">{game.pgn}</pre>
              </details>
            )}
          </>
        )}
      </div>
    </main>
  );
}
