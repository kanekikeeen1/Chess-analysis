"use client";

import { useEffect, useState } from "react";
import { BookOpen, Crown, LoaderCircle, Star } from "lucide-react";

import { lossTone, percent } from "@/components/analysis/human-moves-panel";
import { formatHumanMoveScore, scoreForMover, type ScoredHumanMove } from "@/lib/human-moves";
import {
  compareStyles,
  initials,
  shortName,
  type StyleCompareResponse,
  type StyleMoveResponse,
  type StyleSummary,
  useStyles,
} from "@/lib/styles";

const ENGINE_DEPTH = 12;
const TOP_K = 3;

// Kết quả theo (FEN, có Stockfish hay không): tua đi tua lại không phải hỏi lại backend.
const responseCache = new Map<string, StyleCompareResponse>();
const CACHE_LIMIT = 200;

function remember(key: string, data: StyleCompareResponse) {
  if (responseCache.size >= CACHE_LIMIT) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  responseCache.set(key, data);
}

/**
 * "Kiện tướng X sẽ đi gì ở đây": top-3 nước của từng mô hình phong cách (hoặc sổ khai cuộc từ ván thật),
 * kèm điểm Stockfish để thấy nước "đúng phong cách" có tốt về mặt engine không (D6).
 */
export function StyleMovesPanel({
  fen,
  gameOver,
  onPlayMove,
  playedUci,
}: {
  fen: string;
  gameOver: boolean;
  onPlayMove: (uci: string) => void;
  playedUci?: string | null;
}) {
  const { error: stylesError, styles } = useStyles();
  const [result, setResult] = useState<{ fen: string; data: StyleCompareResponse } | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "model" | "engine">("idle");

  useEffect(() => {
    if (!styles?.available || gameOver) {
      setResult(null);
      setPhase("idle");
      return;
    }
    const modelKey = `${fen}|m`;
    const engineKey = `${fen}|e`;
    const cached = responseCache.get(engineKey) ?? responseCache.get(modelKey);
    if (cached) setResult({ data: cached, fen });
    if (responseCache.has(engineKey)) {
      setPhase("idle");
      setError("");
      return;
    }

    const controller = new AbortController();
    // Hai bước như bảng "Theo Elo": mô hình hiện ngay, Stockfish chấm điểm sau.
    const timer = window.setTimeout(async () => {
      setError("");
      try {
        if (!responseCache.has(modelKey)) {
          setPhase("model");
          const data = await compareStyles(fen, { signal: controller.signal, topK: TOP_K });
          remember(modelKey, data);
          setResult({ data, fen });
        }
        setPhase("engine");
        const data = await compareStyles(fen, { engineDepth: ENGINE_DEPTH, signal: controller.signal, topK: TOP_K });
        if (!data.engineNote) remember(engineKey, data);
        setResult({ data, fen });
        setPhase("idle");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setPhase("idle");
        setError(caught instanceof Error ? caught.message : "Không lấy được nước của kiện tướng.");
      }
    }, cached ? 0 : 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fen, gameOver, styles?.available]);

  const moverIsWhite = fen.split(" ")[1] === "w";
  const shown = result?.fen === fen ? result.data : null;
  const summaries = new Map((styles?.styles ?? []).map((style) => [style.id, style]));
  // Nước tốt nhất theo Stockfish trong hợp các nước đang hiện, để tính mỗi nước mất bao nhiêu.
  const scores = (shown?.styles ?? [])
    .flatMap((style) => style.moves)
    .map((move) => scoreForMover(move, moverIsWhite))
    .filter((score): score is number => score !== null);
  const best = scores.length ? Math.max(...scores) : null;

  return (
    <section className="bg-[#202623] px-3 py-3" aria-label="Kiện tướng sẽ đi gì">
      <div className="mb-1 flex items-center gap-2">
        <Crown className="size-4 text-[#d8b45f]" />
        <h2 className="text-sm font-bold text-white">Kiện tướng sẽ đi gì?</h2>
        {phase !== "idle" && <LoaderCircle className="size-3.5 animate-spin text-[#8e9991]" />}
      </div>
      <p className="mb-3 text-[11px] leading-4 text-[#8e9991]">
        Ba nước mỗi kỳ thủ có khả năng chọn nhất, theo mô hình học từ ván công khai của họ. Ở khai cuộc, nếu họ đã
        gặp thế cờ này, lấy luôn tần suất trong ván thật.
      </p>

      {stylesError && <p className="text-xs text-[#ffaaa8]">{stylesError}</p>}
      {styles && !styles.available && (
        <p className="rounded-lg bg-white/5 px-3 py-2 text-xs leading-5 text-[#aab6ae]">
          Backend chưa nạp mô hình kỳ thủ. {styles.unavailableReason}
        </p>
      )}

      {styles?.available && (
        gameOver ? (
          <p className="text-xs text-[#8e9991]">Ván đã kết thúc, không còn nước để gợi ý.</p>
        ) : error ? (
          <p className="rounded-lg bg-[#ef6461]/12 px-3 py-2 text-xs text-[#ffaaa8]">{error}</p>
        ) : !shown ? (
          <p className="rounded-lg bg-[#2b312e] px-3 py-6 text-center text-xs text-[#8e9991]">Đang hỏi mô hình…</p>
        ) : (
          <div className="space-y-2">
            {shown.styles.map((style) => (
              <StyleCard
                key={style.style}
                best={best}
                engineLoading={phase === "engine"}
                moverIsWhite={moverIsWhite}
                onPlayMove={onPlayMove}
                playedUci={playedUci ?? null}
                result={style}
                summary={summaries.get(style.style)}
              />
            ))}
            <Agreement styles={shown.styles} summaries={summaries} />
            {shown.engineNote && <p className="text-[11px] text-[#d8b45f]">{shown.engineNote}</p>}
            <p className="text-[10px] leading-4 text-[#758078]">
              Bấm một nước để đi thử. Điểm Stockfish sau nước đi theo phía Trắng (depth {ENGINE_DEPTH}); ★ là nước
              tốt nhất trong các nước đang hiện. Đây là mô phỏng phong cách, không phải chính kỳ thủ.
            </p>
          </div>
        )
      )}
    </section>
  );
}

function StyleCard({
  best,
  engineLoading,
  moverIsWhite,
  onPlayMove,
  playedUci,
  result,
  summary,
}: {
  best: number | null;
  engineLoading: boolean;
  moverIsWhite: boolean;
  onPlayMove: (uci: string) => void;
  playedUci: string | null;
  result: StyleMoveResponse;
  summary: StyleSummary | undefined;
}) {
  const name = summary?.displayName ?? result.style;
  return (
    <div className="rounded-xl border border-white/8 bg-[#2b312e] p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#d8b45f]/15 text-[11px] font-bold text-[#f0d994]">
          {initials(name)}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{name}</p>
        {result.source === "book" ? (
          <span className="flex shrink-0 items-center gap-1 rounded bg-[#72cf86]/12 px-1.5 py-0.5 text-[10px] text-[#9fe0ac]" title="Tần suất trong ván thật của kỳ thủ">
            <BookOpen className="size-3" /> đã gặp {result.bookGames} lần
          </span>
        ) : (
          <span className="shrink-0 rounded bg-white/6 px-1.5 py-0.5 text-[10px] text-[#aeb8b1]">mô hình</span>
        )}
      </div>
      <div className="space-y-1">
        {result.moves.map((move) => (
          <MoveRow
            key={move.uci}
            best={best}
            engineLoading={engineLoading}
            move={move}
            moverIsWhite={moverIsWhite}
            onPlayMove={onPlayMove}
            played={move.uci === playedUci}
          />
        ))}
      </div>
    </div>
  );
}

function MoveRow({
  best,
  engineLoading,
  move,
  moverIsWhite,
  onPlayMove,
  played,
}: {
  best: number | null;
  engineLoading: boolean;
  move: ScoredHumanMove;
  moverIsWhite: boolean;
  onPlayMove: (uci: string) => void;
  played: boolean;
}) {
  const score = scoreForMover(move, moverIsWhite);
  const loss = score === null || best === null ? null : best - score;
  return (
    <button
      type="button"
      onClick={() => onPlayMove(move.uci)}
      title={`Đi thử ${move.san}`}
      className={`grid w-full grid-cols-[52px_minmax(0,1fr)_58px] items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-[#4b7fe8] ${played ? "bg-[#d8b45f]/10" : ""}`}
    >
      <span className="flex items-center gap-1 text-sm font-semibold text-white">
        {move.san}
        {loss !== null && loss <= 0.001 && <Star className="size-3 fill-[#72cf86] text-[#72cf86]" aria-label="tốt nhất" />}
      </span>
      <span className="relative h-5 overflow-hidden rounded bg-white/5">
        <span className="absolute inset-y-0 left-0 bg-[#d8b45f]/30" style={{ width: `${Math.min(100, move.probability * 100)}%` }} />
        <span className="relative flex h-full items-center px-2 text-xs tabular-nums text-[#e3e8e4]">
          {percent(move.probability)}
          {played && <span className="ml-auto text-[10px] text-[#f0d994]">đã đi trong ván</span>}
        </span>
      </span>
      <span className={`rounded px-1 py-0.5 text-center text-[11px] font-semibold tabular-nums ${loss !== null ? lossTone(loss) : "bg-[#3a413e] text-[#7f8982]"}`}>
        {move.pawns !== null ? formatHumanMoveScore(move) : engineLoading ? "…" : "—"}
      </span>
    </button>
  );
}

/** Một dòng tóm tắt: các kiện tướng cùng chọn một nước, hay mỗi người một hướng. */
function Agreement({ styles, summaries }: { styles: StyleMoveResponse[]; summaries: Map<string, StyleSummary> }) {
  const firsts = styles.filter((style) => style.moves.length).map((style) => ({
    name: shortName(summaries.get(style.style)?.displayName ?? style.style),
    san: style.moves[0].san,
  }));
  if (firsts.length < 2) return null;
  const distinct = new Set(firsts.map((first) => first.san));
  return (
    <p className="rounded-lg bg-black/15 px-3 py-2 text-xs leading-5 text-[#c5cec7]">
      {distinct.size === 1
        ? <>Cả {firsts.length} kiện tướng đều nghiêng về <span className="font-bold text-white">{firsts[0].san}</span>.</>
        : <>Lựa chọn số 1 khác nhau: {firsts.map((first) => `${first.name} ${first.san}`).join(" · ")}.</>}
    </p>
  );
}
