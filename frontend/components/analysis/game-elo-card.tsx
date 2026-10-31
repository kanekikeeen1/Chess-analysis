"use client";

import { useEffect, useState } from "react";
import { Gauge, LoaderCircle } from "lucide-react";

import { estimateGameElo, type EloEstimateResponse, type SideEloEstimate } from "@/lib/human-moves";

/**
 * Elo của từng bên ước lượng bằng M2 từ chính các nước trong ván: mức Elo nào làm mô hình đoán trúng
 * cách chọn nước của họ nhiều nhất. Không phải rating chính thức, và ván ngắn thì sai số lớn.
 */
export function GameEloCard({
  moves,
  playerNames,
}: {
  moves: Array<{ fen: string; uci: string }>;
  playerNames: { black: string; white: string };
}) {
  const [estimate, setEstimate] = useState<EloEstimateResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const movesKey = moves.map((move) => move.uci).join(" ") + moves[0]?.fen;

  useEffect(() => {
    if (!moves.length) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    estimateGameElo(moves, controller.signal)
      .then(setEstimate)
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Không ước lượng được Elo.");
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
          <Gauge className="size-4 text-[#78a7ff]" />
          <h2 className="text-sm font-bold text-white">Elo ước lượng của ván</h2>
          {loading && <LoaderCircle className="size-3.5 animate-spin text-[#8e9991]" />}
        </div>
        {error ? (
          <p className="text-xs text-[#ffaaa8]">{error}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <SideRow label={playerNames.white} piece="♔" estimate={estimate?.white ?? null} pending={!estimate} />
            <SideRow label={playerNames.black} piece="♚" estimate={estimate?.black ?? null} pending={!estimate} />
          </div>
        )}
        <p className="mt-2 text-[10px] leading-4 text-[#758078]">
          Mô hình M2 tìm mức Elo có cách chọn nước giống từng bên nhất. Đây không phải rating chính thức;
          ván ngắn cho sai số (±) lớn.
        </p>
      </div>
    </section>
  );
}

function SideRow({
  estimate,
  label,
  pending,
  piece,
}: {
  estimate: SideEloEstimate | null;
  label: string;
  pending: boolean;
  piece: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-black/15 px-3 py-2">
      <p className="truncate text-xs text-[#aeb8b1]">{piece} {label}</p>
      {estimate ? (
        <>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
            {estimate.elo}
            <span className="ml-1 text-xs font-medium text-[#8e9991]">±{estimate.stdError}</span>
          </p>
          <p className="text-[10px] text-[#8e9991]">{estimate.moves} nước · dải {estimate.level}</p>
        </>
      ) : (
        <p className="mt-0.5 text-sm text-[#8e9991]">{pending ? "Đang tính…" : "Không có nước"}</p>
      )}
    </div>
  );
}
