"use client";

import { useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { MoveAssessment } from "@/lib/move-classification";
import { MoveAssessmentBadge, MoveAssessmentSummary } from "@/components/analysis/review-panels";

export function MoveHistory({
  assessments,
  currentIndex,
  moves,
  onReset,
  onSelect,
  showAssessmentSummary,
}: {
  assessments: Array<MoveAssessment | null>;
  currentIndex: number;
  moves: string[];
  onReset: () => void;
  onSelect: (index: number) => void;
  showAssessmentSummary: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const rows = Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => ({
    blackIndex: index * 2 + 1,
    number: index + 1,
    whiteIndex: index * 2,
  }));

  useEffect(() => {
    const currentMove = listRef.current?.querySelector<HTMLElement>(
      `[data-position-index="${currentIndex}"]`,
    );
    currentMove?.scrollIntoView({ block: "nearest" });
  }, [currentIndex]);

  function renderMove(moveIndex: number) {
    const move = moves[moveIndex];
    if (!move) return <span />;

    const positionIndex = moveIndex + 1;
    const assessment = assessments[moveIndex];
    const isCurrent = currentIndex === positionIndex;

    return (
      <button
        key={positionIndex}
        type="button"
        data-position-index={positionIndex}
        aria-current={isCurrent ? "step" : undefined}
        aria-label={`Đến nước ${positionIndex}: ${move}`}
        onClick={() => onSelect(positionIndex)}
        className={`flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#4b7fe8] ${
          isCurrent
            ? "bg-[#4b7fe8] text-white shadow-sm"
            : "text-[#eef1ec] hover:bg-white/8"
        }`}
      >
        {assessment && (
          <MoveAssessmentBadge assessment={assessment} />
        )}
        <span className="truncate">{move}</span>
      </button>
    );
  }

  return (
    <section className="border-b border-white/10 bg-[#1c211f] px-3 py-3" aria-label="Lịch sử nước đi">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-[#f1f3ef]">Lịch sử nước đi</h2>
          <p className="text-xs text-[#879189]">Bấm vào một nước để xem lại thế cờ</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-[#303633] px-2.5 py-2 text-xs font-semibold text-[#e8ebe6] transition hover:border-[#d8b45f]/55 hover:bg-[#3b423e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b45f]"
        >
          <RotateCcw className="size-3.5" />
          Làm mới ván
        </button>
      </div>

      {moves.length > 0 && showAssessmentSummary && (
        <MoveAssessmentSummary assessments={assessments} />
      )}

      <div
        ref={listRef}
        className="max-h-52 overflow-y-auto rounded-xl border border-white/8 bg-[#141816] p-2 [scrollbar-color:#4a554e_transparent]"
      >
        {rows.length ? (
          <div className="space-y-1">
            {rows.map((row) => (
              <div
                key={row.number}
                className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1"
              >
                <span className="text-right text-xs font-medium text-[#7f8982]">
                  {row.number}.
                </span>
                {renderMove(row.whiteIndex)}
                {renderMove(row.blackIndex)}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-2 py-5 text-center text-sm text-[#7f8982]">
            Chưa có nước đi — hãy chơi trên bàn cờ hoặc dán PGN.
          </p>
        )}
      </div>
    </section>
  );
}
