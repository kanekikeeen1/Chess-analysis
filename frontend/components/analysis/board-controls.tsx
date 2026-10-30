"use client";

import type { StockfishEvaluation } from "@/lib/use-stockfish";

export function EvaluationBar({
  evaluation,
  isLoading,
  winner,
}: {
  evaluation?: StockfishEvaluation;
  isLoading: boolean;
  winner: "black" | "white" | null;
}) {
  const score = evaluation?.pawns ?? 0;
  const whiteHeight = winner
    ? winner === "white" ? 100 : 0
    : evaluation?.mate !== null && evaluation?.mate !== undefined
      ? score > 0
        ? 96
        : 4
      : Math.max(5, Math.min(95, 50 + score * 10));
  const label = winner
    ? winner === "white" ? "Trắng thắng" : "Đen thắng"
    : isLoading
      ? "…"
      : evaluation?.mate !== null && evaluation?.mate !== undefined
        ? `${score > 0 ? "+" : "−"}M${Math.abs(evaluation.mate)}`
        : `${score >= 0 ? "+" : ""}${score.toFixed(1)}`;

  return (
    <div
      className="relative h-full min-h-48 overflow-hidden rounded-lg bg-[#111412] shadow-inner"
      aria-label={`Lợi thế: ${label}`}
      title="Số dương nghiêng về Trắng, số âm nghiêng về Đen"
    >
      <div
        className="absolute inset-x-0 bottom-0 bg-[#f4f1e7] transition-[height] duration-500 ease-out"
        style={{ height: `${whiteHeight}%` }}
      />
      <span
        className={`absolute inset-x-0 z-10 text-center text-[11px] font-bold sm:text-xs ${
          winner === "black" || (!winner && score < 0)
            ? "top-2 text-white"
            : "bottom-2 text-[#161916]"
        }`}
      >
        {label}
      </span>
      <span className="absolute left-1/2 top-1/2 z-10 h-px w-2 -translate-x-1/2 bg-[#8c948e]/70" />
    </div>
  );
}

export function NavButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-12 place-items-center rounded-xl bg-[#2a302d] text-[#eff2ed] transition hover:bg-[#39413d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4b7fe8] disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:size-7"
    >
      {children}
    </button>
  );
}
