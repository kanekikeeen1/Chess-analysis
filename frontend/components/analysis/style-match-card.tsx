"use client";

import { useEffect, useState } from "react";
import { Crown, LoaderCircle } from "lucide-react";

import { initials, matchStyles, shortName, type StyleMatch, type StyleMatchResponse } from "@/lib/styles";

/**
 * Báo cáo ván (D6): mỗi bên có bao nhiêu % nước trùng lựa chọn số 1 (và top-3) của từng kiện tướng. Dùng lại
 * cùng danh sách nước với thẻ ước lượng Elo.
 */
export function StyleMatchCard({
  moves,
  playerNames,
}: {
  moves: Array<{ fen: string; uci: string }>;
  playerNames: { black: string; white: string };
}) {
  const [result, setResult] = useState<StyleMatchResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const movesKey = moves.map((move) => move.uci).join(" ") + moves[0]?.fen;

  useEffect(() => {
    if (!moves.length) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    matchStyles(moves, controller.signal)
      .then(setResult)
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Không so được với kiện tướng.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- movesKey thay cho mảng moves
  }, [movesKey]);

  if (!moves.length) return null;

  return (
    <section className="border-b border-white/10 bg-[#202623] px-3 py-3">
      <div className="rounded-xl border border-white/8 bg-[#2b312e] p-3">
        <div className="mb-2 flex items-center gap-2">
          <Crown className="size-4 text-[#d8b45f]" />
          <h2 className="text-sm font-bold text-white">Trùng lựa chọn của kiện tướng</h2>
          {loading && <LoaderCircle className="size-3.5 animate-spin text-[#8e9991]" />}
        </div>
        {error ? (
          <p className="text-xs text-[#ffaaa8]">{error}</p>
        ) : !result ? (
          <p className="text-xs text-[#8e9991]">Đang so từng nước…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <SideColumn label={playerNames.white} piece="♔" matches={result.white} />
            <SideColumn label={playerNames.black} piece="♚" matches={result.black} />
          </div>
        )}
        <p className="mt-2 text-[10px] leading-4 text-[#758078]">
          % nước trùng đúng nước kỳ thủ có khả năng chọn nhất (trong ngoặc: nằm trong 3 lựa chọn đầu). Khai cuộc so
          với ván thật của họ, sau đó so với mô hình phong cách. Để tham khảo: mô hình đoán trúng nước của chính
          kiện tướng khoảng 40% số lần.
        </p>
      </div>
    </section>
  );
}

function SideColumn({ label, matches, piece }: { label: string; matches: StyleMatch[]; piece: string }) {
  const sorted = [...matches].sort((left, right) => right.top1 / right.moves - left.top1 / left.moves);
  return (
    <div className="min-w-0 rounded-lg bg-black/15 px-3 py-2">
      <p className="mb-1.5 truncate text-xs text-[#aeb8b1]">{piece} {label}</p>
      {!sorted.length ? (
        <p className="text-sm text-[#8e9991]">Không có nước</p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((match, index) => {
            const top1 = Math.round((match.top1 / match.moves) * 100);
            const top3 = Math.round((match.top3 / match.moves) * 100);
            return (
              <li key={match.style} className="flex items-center gap-2" title={`${match.displayName}: ${match.top1}/${match.moves} nước trùng top-1, ${match.top3}/${match.moves} trong top-3; ${match.inBook} nước trong sổ khai cuộc`}>
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#d8b45f]/15 text-[10px] font-bold text-[#f0d994]">
                  {initials(match.displayName)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-[#dfe5e0]">{shortName(match.displayName)}</span>
                <span className={`text-sm font-bold tabular-nums ${index === 0 ? "text-white" : "text-[#c5cec7]"}`}>{top1}%</span>
                <span className="w-9 text-right text-[10px] tabular-nums text-[#8e9991]">({top3}%)</span>
              </li>
            );
          })}
        </ul>
      )}
      {sorted.length > 1 && <p className="mt-2 text-[11px] leading-4 text-[#c5cec7]">{closestComment(sorted)}</p>}
    </div>
  );
}

/** Kết luận ngắn: gần phong cách ai nhất, hay khác biệt quá nhỏ để nói. Chênh dưới 3 điểm % coi như ngang nhau. */
function closestComment(sorted: StyleMatch[]) {
  const rate = (match: StyleMatch) => match.top1 / match.moves;
  const [first, second] = sorted;
  if (first.moves < 10) return "Ván quá ngắn để so phong cách.";
  if (rate(first) - rate(second) < 0.03) return "Mức trùng với các kiện tướng gần như ngang nhau.";
  return `Lựa chọn gần với ${shortName(first.displayName)} nhất.`;
}
