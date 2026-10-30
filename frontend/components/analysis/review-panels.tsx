"use client";

import {
  Activity,
  BookOpen,
  Check,
  ChevronDown,
  Star,
  ThumbsUp,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { ActiveAnalysis, StockfishEvaluation } from "@/lib/use-stockfish";
import { MOVE_ASSESSMENT_META, MOVE_ASSESSMENT_ORDER, type MoveAssessment } from "@/lib/move-classification";
import type { OpeningMatch } from "@/lib/use-opening-book";
import { type InputType, formatEvaluation, variationToSan } from "@/lib/analysis-helpers";

export type MoveBadgeAssessment = Pick<
  MoveAssessment,
  "badgeClassName" | "key" | "label" | "symbol"
>;

export function MoveAssessmentBadge({
  assessment,
  className = "",
  size = "tiny",
}: {
  assessment: MoveBadgeAssessment;
  className?: string;
  size?: "tiny" | "small" | "board";
}) {
  const sizeClass = size === "board"
    ? "size-[clamp(24px,5vw,38px)] text-[clamp(11px,2vw,16px)]"
    : size === "small"
      ? "size-7 text-xs"
      : "size-5 text-[9px]";
  const iconClass = size === "tiny" ? "size-3" : size === "small" ? "size-4" : "size-[58%]";

  let glyph: React.ReactNode;
  if (assessment.key === "best") {
    glyph = <Star className={iconClass} fill="currentColor" strokeWidth={2.5} />;
  } else if (assessment.key === "excellent") {
    glyph = <ThumbsUp className={iconClass} fill="currentColor" strokeWidth={2.6} />;
  } else if (assessment.key === "okay") {
    glyph = <Check className={iconClass} strokeWidth={4} />;
  } else if (assessment.key === "theory") {
    glyph = <BookOpen className={iconClass} strokeWidth={2.8} />;
  } else {
    glyph = <span className="relative z-10 tracking-[-0.08em]">{assessment.symbol}</span>;
  }

  return (
    <span
      aria-label={assessment.label}
      title={assessment.label}
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/45 font-black leading-none shadow-[0_2px_5px_rgba(0,0,0,0.4)] ring-1 ring-black/15 ${sizeClass} ${assessment.badgeClassName} ${className}`}
    >
      <span className="pointer-events-none absolute inset-px rounded-full bg-gradient-to-b from-white/30 via-white/5 to-black/15" />
      <span className="relative z-10 grid size-full place-items-center">{glyph}</span>
    </span>
  );
}

export function GameReviewCard({
  accuracy,
  activeAnalysis,
  engineError,
  errorMessage,
  maxDepth,
  minDepth,
  moveCount,
  playerNames,
  positions,
  reviewComplete,
  reviewCompleted,
  reviewMode,
  reviewTotal,
}: {
  accuracy: {
    black: number | null;
    blackCount: number;
    white: number | null;
    whiteCount: number;
  };
  activeAnalysis: ActiveAnalysis | null;
  engineError: boolean;
  errorMessage: string;
  maxDepth: number;
  minDepth: number;
  moveCount: number;
  playerNames: { black: string; white: string };
  positions: string[];
  reviewComplete: boolean;
  reviewCompleted: number;
  reviewMode: InputType;
  reviewTotal: number;
}) {
  const progress = reviewTotal ? (reviewCompleted / reviewTotal) * 100 : 0;
  const activePositionIndex = activeAnalysis
    ? positions.findIndex((fen) => fen === activeAnalysis.fen) + 1
    : 0;
  const activeTime = activeAnalysis?.moveTimeMs
    ? `${(activeAnalysis.moveTimeMs / 1_000).toFixed(1)} giây`
    : "";

  const status = engineError
    ? errorMessage || "Không thể khởi động Stockfish ở backend"
    : reviewComplete
      ? `Hoàn tất ${reviewTotal}/${reviewTotal} vị trí`
      : activeAnalysis?.kind === "review"
        ? `Vị trí ${activePositionIndex}/${reviewTotal} · depth ${activeAnalysis.currentDepth || "…"} · ${activeTime}`
        : `Đang nhận diện khai cuộc và chuẩn bị ${reviewTotal || "các"} vị trí…`;

  return (
    <section className="border-b border-white/10 bg-[#202623] px-3 py-3" aria-label="Độ chính xác toàn ván">
      <div className="overflow-hidden rounded-xl border border-white/8 bg-[#2b312e]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-[#78a7ff]" />
            <h2 className="text-sm font-bold text-white">Game Review & độ chính xác</h2>
          </div>
          <span className="rounded-md bg-[#4b7fe8]/18 px-2 py-1 text-xs font-bold text-[#9fc0ff]">
            Backend · depth {minDepth}–{maxDepth}
          </span>
        </div>

        <div className="space-y-3 p-3">
          {!reviewComplete && (
            <div className="rounded-lg border border-[#4b7fe8]/20 bg-[#30363d] px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-semibold text-white">Đang phân tích toàn ván…</span>
                <span className="text-lg font-black tabular-nums text-white">
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress
                value={progress}
                className="h-2.5 bg-white/85 [&_[data-slot=progress-indicator]]:bg-[#2f80ed]"
              />
              <p className="mt-2 text-xs leading-5 text-[#c4cbc6]">
                ECO nhận diện nước lý thuyết ngay; backend vẫn đánh giá đủ mọi vị trí ở depth
                {` ${minDepth}–${maxDepth}`}. Icon và độ chính xác xuất hiện đồng loạt khi tiến trình đạt 100%.
              </p>
            </div>
          )}

          {reviewComplete && moveCount > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/8 bg-[#f0eee6] px-3 py-3 text-center text-[#1a1d1b]">
                <p className="truncate text-[11px] font-bold text-[#667068]" title={playerNames.white}>
                  {playerNames.white}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#899089]">Trắng</p>
                <p className="mt-1 text-2xl font-black tabular-nums">
                  {accuracy.white?.toFixed(1) ?? "—"}
                </p>
                <p className="text-[10px] text-[#737b75]">độ chính xác</p>
              </div>
              <div className="rounded-lg border border-white/8 bg-[#171b19] px-3 py-3 text-center text-white">
                <p className="truncate text-[11px] font-bold text-[#b7c0ba]" title={playerNames.black}>
                  {playerNames.black}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#707a73]">Đen</p>
                <p className="mt-1 text-2xl font-black tabular-nums">
                  {accuracy.black?.toFixed(1) ?? "—"}
                </p>
                <p className="text-[10px] text-[#7f8982]">độ chính xác</p>
              </div>
            </div>
          )}

          {reviewComplete && reviewMode === "fen" && (
            <div className="rounded-lg border border-white/8 bg-[#171b19] px-3 py-3 text-center text-xs leading-5 text-[#aeb8b1]">
              FEN chỉ chứa một thế cờ nên không có lịch sử nước đi để tính độ chính xác hai bên.
              Đánh giá thích ứng của vị trí đã hoàn tất.
            </div>
          )}

          <div aria-live="polite">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate text-[#aeb8b1]">{status}</span>
              <span className="shrink-0 font-bold tabular-nums text-[#d9dfda]">
                {Math.round(progress)}%
              </span>
            </div>
            <Progress
              value={progress}
              className="h-2 bg-white/10 [&_[data-slot=progress-indicator]]:bg-[#4b7fe8]"
            />
          </div>

          <p className="text-[10px] leading-4 text-[#7f8982]">
            Điểm được tính từ mức giảm xác suất thắng giữa hai thế cờ do Stockfish 18 đánh giá.
            Khai cuộc dùng depth {minDepth}; trung cuộc tăng thích ứng; tàn cuộc và FEN có thể đạt depth {maxDepth}.
            Thời gian phụ thuộc CPU và độ dài ván. Game Review chỉ chạy khi bạn nạp PGN/FEN.
          </p>
        </div>
      </div>
    </section>
  );
}

export function OpeningCard({
  bookError,
  currentIndex,
  inBook,
  isLoading,
  match,
  moves,
}: {
  bookError: boolean;
  currentIndex: number;
  inBook: boolean;
  isLoading: boolean;
  match: OpeningMatch | null;
  moves: string[];
}) {
  if (isLoading) {
    return (
      <div className="border-b border-white/10 bg-[#202623] px-3 py-3">
        <div className="animate-pulse rounded-xl border border-white/8 bg-[#2c322f] px-4 py-5 text-center text-sm text-[#879189]">
          Đang tải từ điển khai cuộc…
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="border-b border-white/10 bg-[#202623] px-3 py-3">
        <div className="rounded-xl border border-white/8 bg-[#2c322f] px-4 py-4 text-center">
          <BookOpen className="mx-auto mb-2 size-5 text-[#bd885d]" />
          <p className="text-sm font-semibold text-[#dfe3de]">
            {bookError ? "Chưa thể nhận diện khai cuộc" : "Chưa xác định khai cuộc"}
          </p>
          <p className="mt-1 text-xs text-[#879189]">
            {currentIndex === 0
              ? "Hãy đi vài nước hoặc dán một ván PGN."
              : "Chưa nhận diện được chuỗi nước hiện tại."}
          </p>
        </div>
      </div>
    );
  }

  const separators = [match.entry.name.indexOf(":"), match.entry.name.indexOf(",")]
    .filter((index) => index >= 0);
  const separator = separators.length ? Math.min(...separators) : -1;
  const family = separator >= 0
    ? match.entry.name.slice(0, separator)
    : match.entry.name;
  const variation = separator >= 0
    ? match.entry.name.slice(separator + 1).trim()
    : "";
  const lastBookMove = match.index > 0 ? moves[match.index - 1] : null;
  const moveNumber = match.index > 0
    ? `${Math.ceil(match.index / 2)}${match.index % 2 === 0 ? "…" : "."}`
    : "";
  const continuesOpening =
    inBook || (currentIndex <= 20 && currentIndex - match.index <= 6);

  return (
    <div className="border-b border-white/10 bg-[#202623] px-3 py-3">
      <div className="overflow-hidden rounded-xl border border-white/8 bg-[#2c322f] shadow-inner">
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#9aa49d]">
            <BookOpen className="size-4 text-[#bd885d]" />
            {continuesOpening ? "Khai cuộc hiện tại" : "Tổng kết khai cuộc"}
          </span>
          <span className="rounded-md bg-[#bd885d]/18 px-2 py-1 text-xs font-bold text-[#ddb18d]">
            ECO {match.entry.eco}
          </span>
        </div>

        <div className="px-4 py-3 text-center" title={match.entry.moves}>
          <h2 className="text-base font-bold text-white">{family}</h2>
          {variation && (
            <p className="mt-1 text-sm font-semibold leading-5 text-[#d7dcd7]">
              {variation}
            </p>
          )}
          <p className={`mt-2 text-xs font-medium ${continuesOpening ? "text-[#9ed36b]" : "text-[#c5a17f]"}`}>
            {inBook
              ? "Đang đi trong lý thuyết khai cuộc"
              : continuesOpening
                ? "Đã nhận diện khai cuộc · đang tiếp tục biến thể"
                : `Đã rời lý thuyết sau ${moveNumber} ${lastBookMove ?? ""}`}
          </p>
        </div>
      </div>
    </div>
  );
}


export function MoveAssessmentSummary({
  assessments,
}: {
  assessments: Array<MoveAssessment | null>;
}) {
  const counts = MOVE_ASSESSMENT_ORDER.reduce(
    (result, key) => {
      result[key] = { black: 0, white: 0 };
      return result;
    },
    {} as Record<(typeof MOVE_ASSESSMENT_ORDER)[number], { black: number; white: number }>,
  );

  assessments.forEach((assessment, moveIndex) => {
    if (!assessment) return;
    counts[assessment.key][moveIndex % 2 === 0 ? "white" : "black"] += 1;
  });

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-white/8 bg-[#282e2b]">
      <div className="grid grid-cols-[1fr_42px_42px] border-b border-white/8 px-2 py-1.5 text-[11px] font-semibold text-[#8e9991]">
        <span>Phân loại</span>
        <span className="text-center">Trắng</span>
        <span className="text-center">Đen</span>
      </div>
      {MOVE_ASSESSMENT_ORDER.map((key) => {
        const meta = MOVE_ASSESSMENT_META[key];
        return (
          <div
            key={key}
            className="grid grid-cols-[1fr_42px_42px] items-center px-2 py-1 text-xs even:bg-white/[0.025]"
          >
            <span className="flex items-center gap-2">
              <MoveAssessmentBadge assessment={{ ...meta, key }} />
              <span className="text-[#d8ddd8]">{meta.label}</span>
            </span>
            <span className="text-center font-semibold text-[#e9ece8]">
              {counts[key].white}
            </span>
            <span className="text-center font-semibold text-[#e9ece8]">
              {counts[key].black}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function EngineLines({
  evaluation,
  fen,
  targetDepth,
}: {
  evaluation?: StockfishEvaluation;
  fen: string;
  targetDepth?: number;
}) {
  const variations = [
    evaluation?.variations[0] ?? null,
    evaluation?.variations[1] ?? null,
  ];

  return (
    <div className="border-b border-white/10 bg-[#252b28] px-3 py-3">
      <p className="mb-2 text-xs font-medium text-[#8e9991]">
        Depth: {evaluation?.depth ?? "…"}{targetDepth ? `/${targetDepth}` : " · thích ứng"}
        {targetDepth && evaluation && evaluation.depth < targetDepth
          ? ` · đang nâng lên ${targetDepth}`
          : ""}
      </p>
      <div className="space-y-2">
        {variations.map((variation, index) => {
          const san = variation ? variationToSan(fen, variation.moves) : [];
          return (
            <div
              key={variation ? `${index}-${variation.moves.join("-")}` : `loading-${index}`}
              className="flex min-w-0 items-center gap-2 rounded-lg bg-[#313735] px-2.5 py-2"
            >
              <span className="shrink-0 rounded-md bg-[#f4f1e7] px-2 py-1 text-sm font-semibold text-[#161916]">
                {variation ? formatEvaluation(variation) : "…"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#f0f2ee]">
                {san.length ? san.join(" ") : `Stockfish đang xây dựng biến ${index + 1}…`}
              </span>
              <ChevronDown className="size-4 shrink-0 text-[#aeb8b1]" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
