"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Crown, Cpu, LoaderCircle } from "lucide-react";

import { tagOf } from "@/components/analysis/style-opinion";
import type { MoveAssessment } from "@/lib/move-classification";
import {
  fetchStyleReview,
  initials,
  shortName,
  STOCKFISH_ONLY,
  type StyleOpinion,
  type StyleReviewResponse,
  useStyles,
} from "@/lib/styles";

const MAX_MOMENTS = 6;
const MAX_SIGNATURE = 3;
const BAD = new Set(["inaccuracy", "mistake", "blunder"]);
const GOOD = new Set(["brilliant", "critical", "best", "excellent"]);

/** Tab Nạp ván: phân tích chỉ bằng Stockfish, hay thêm góc nhìn của một kiện tướng. */
export function PerspectivePicker({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const { styles } = useStyles();
  if (!styles?.available) return null;
  const options = [
    { id: STOCKFISH_ONLY, label: "Chỉ Stockfish", hint: "Đánh giá engine" },
    ...styles.styles.map((style) => ({ id: style.id, label: shortName(style.displayName), hint: "+ Stockfish" })),
  ];
  return (
    <div className="rounded-xl border border-white/10 bg-[#2b312e] p-2">
      <p className="mb-1.5 px-1 text-xs font-semibold text-[#c3ccc5]">Góc nhìn phân tích</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Góc nhìn phân tích">
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4b7fe8] ${selected ? "bg-[#d8b45f] text-[#2a2110] shadow-md" : "bg-white/5 text-[#c3ccc5] hover:bg-white/10"}`}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold ${selected ? "bg-[#2a2110]/15" : "bg-[#d8b45f]/15 text-[#f0d994]"}`}>
                {option.id === STOCKFISH_ONLY ? <Cpu className="size-3.5" /> : initials(styles.styles.find((style) => style.id === option.id)?.displayName ?? "")}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold">{option.label}</span>
                <span className={`block text-[10px] ${selected ? "text-[#4a3d1c]" : "text-[#89958d]"}`}>{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function sanOf(fen: string, uci: string) {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
}

function moveLabel(fen: string, uci: string) {
  const [, turn, , , , fullmove] = fen.split(" ");
  return `${fullmove ?? "?"}${turn === "w" ? "." : "..."} ${sanOf(fen, uci)}`;
}

type SideStats = { moves: number; top1: number; likely: number; rare: number; rareAndBad: number };

function emptyStats(): SideStats {
  return { likely: 0, moves: 0, rare: 0, rareAndBad: 0, top1: 0 };
}

/** Lời tổng kết kiểu người thầy cho một bên, dựng từ thống kê. */
function summarize(name: string, side: string, stats: SideStats) {
  if (!stats.moves) return null;
  const rate = stats.top1 / stats.moves;
  const closeness = rate >= 0.45 ? "rất gần phong cách" : rate >= 0.3 ? "khá gần phong cách" : "khác khá nhiều so với cách chơi";
  const parts = [`${side}: ${stats.top1}/${stats.moves} nước trùng lựa chọn số 1 của ${name} (${Math.round(rate * 100)}%), ${closeness} ${name}.`];
  if (stats.rare) {
    parts.push(stats.rareAndBad
      ? `Có ${stats.rare} nước ${name} gần như không bao giờ đi, trong đó ${stats.rareAndBad} nước Stockfish cũng chê: đó là chỗ nên xem lại trước.`
      : `Có ${stats.rare} nước ${name} gần như không bao giờ đi, nhưng Stockfish không chê: lối chơi riêng của bạn.`);
  }
  return parts.join(" ");
}

/**
 * Báo cáo ván theo góc nhìn một kiện tướng (D6): thống kê mỗi bên trùng lựa chọn của kiện tướng bao nhiêu, những
 * khoảnh khắc nên học (bạn rời lựa chọn của họ và Stockfish cũng chê) và những nước "rất chất" kiện tướng đó.
 * Kết hợp nhãn Stockfish có sẵn của lần review, không chấm lại.
 */
export function GmReviewCard({
  assessments,
  moves,
  onSelect,
  playerNames,
  styleId,
  userSide,
}: {
  assessments: Array<MoveAssessment | null>;
  moves: Array<{ fen: string; uci: string }>;
  /** Đi tới vị trí ngay sau nước thứ `index` (đếm từ 1). */
  onSelect: (positionIndex: number) => void;
  playerNames: { black: string; white: string };
  styleId: string;
  userSide: "w" | "b" | "";
}) {
  const { styles } = useStyles();
  const [result, setResult] = useState<{ key: string; data: StyleReviewResponse } | null>(null);
  const [error, setError] = useState("");
  const known = styles?.styles.some((style) => style.id === styleId) ?? false;
  const key = `${styleId}|${moves[0]?.fen}|${moves.map((move) => move.uci).join(" ")}`;

  useEffect(() => {
    if (!moves.length || !known) return;
    const controller = new AbortController();
    setError("");
    fetchStyleReview(styleId, moves, controller.signal)
      .then((data) => setResult({ data, key }))
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Không phân tích được theo góc nhìn kiện tướng.");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key thay cho mảng moves
  }, [key, known]);

  const data = result?.key === key ? result.data : null;
  const name = data ? shortName(data.displayName) : "";

  const analysis = useMemo(() => {
    if (!data) return null;
    const stats = { b: emptyStats(), w: emptyStats() };
    const moments: Array<{ index: number; opinion: StyleOpinion; assessment: MoveAssessment | null; weight: number }> = [];
    const signature: Array<{ index: number; opinion: StyleOpinion }> = [];
    data.moves.forEach((opinion, index) => {
      const move = moves[index];
      if (!move) return;
      const side = move.fen.split(" ")[1] === "w" ? "w" : "b";
      if (userSide && side !== userSide) return;
      const assessment = assessments[index] ?? null;
      const entry = stats[side];
      entry.moves += 1;
      if (opinion.playedRank === 0) entry.top1 += 1;
      else if (opinion.playedRank < 3 || opinion.playedProbability >= 0.1) entry.likely += 1;
      const rare = opinion.playedRank !== 0 && opinion.playedProbability < 0.05;
      if (rare) entry.rare += 1;
      const bad = assessment ? BAD.has(assessment.key) : false;
      if (rare && bad) entry.rareAndBad += 1;

      const [top] = opinion.top;
      if (opinion.playedRank !== 0 && top && (bad || (rare && top.probability >= 0.3))) {
        moments.push({ assessment, index, opinion, weight: (assessment?.loss ?? 0) * 10 + top.probability });
      }
      if (opinion.playedRank === 0 && opinion.source === "model" && assessment && GOOD.has(assessment.key)
        && opinion.playedProbability < 0.5) {
        signature.push({ index, opinion });
      }
    });
    moments.sort((left, right) => right.weight - left.weight);
    signature.sort((left, right) => left.opinion.playedProbability - right.opinion.playedProbability);
    return { moments: moments.slice(0, MAX_MOMENTS), signature: signature.slice(0, MAX_SIGNATURE), stats };
  }, [assessments, data, moves, userSide]);

  if (!moves.length || !known) return null;

  return (
    <section className="border-b border-white/10 bg-[#202623] px-3 py-3">
      <div className="rounded-xl border border-[#d8b45f]/25 bg-[#2b312e] p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#e6c46f] to-[#b8862f] text-xs font-bold text-[#2a2110]">
            {data ? initials(data.displayName) : <LoaderCircle className="size-4 animate-spin" />}
            <Crown className="absolute -right-1.5 -top-1.5 size-4 rounded-full bg-[#2b312e] p-0.5 text-[#f0d994]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white">Báo cáo theo góc nhìn {name || "kiện tướng"}</h2>
            <p className="text-[10px] text-[#8e9991]">
              {userSide ? `Nước của ${userSide === "w" ? playerNames.white : playerNames.black}` : "Cả hai bên"} · kết hợp nhãn Stockfish
            </p>
          </div>
        </div>

        {error ? (
          <p className="text-xs text-[#ffaaa8]">{error}</p>
        ) : !analysis ? (
          <p className="text-xs text-[#8e9991]">Đang so từng nước với lựa chọn của kiện tướng…</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-[#f4efe1] px-3 py-2.5 text-[13px] leading-5 text-[#2f3531]">
              {(["w", "b"] as const).map((side) => {
                const text = summarize(name, side === "w" ? playerNames.white : playerNames.black, analysis.stats[side]);
                return text ? <p key={side} className="mt-1 first:mt-0">{text}</p> : null;
              })}
            </div>

            {analysis.moments.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-white">Khoảnh khắc nên học</p>
                <ul className="space-y-1">
                  {analysis.moments.map(({ assessment, index, opinion }) => (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => onSelect(index + 1)}
                        className="w-full rounded-md bg-black/15 px-2 py-1.5 text-left text-xs leading-5 text-[#dfe5e0] transition hover:bg-white/8"
                      >
                        <span className="font-semibold text-white">{moveLabel(moves[index].fen, moves[index].uci)}</span>
                        {assessment && BAD.has(assessment.key) && (
                          <span className="ml-1.5 text-[#ffaaa8]">{assessment.label}{assessment.loss > 0.01 ? ` (−${assessment.loss.toFixed(2)})` : ""}</span>
                        )}
                        <span className={`ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold ${tagOf(opinion).className}`}>{tagOf(opinion).label}</span>
                        <span className="block text-[#c5cec7]">
                          {name} sẽ đi <b className="text-[#f0d994]">{opinion.top[0].san}</b>
                          {opinion.source === "book" ? ` (đã đi ${Math.round(opinion.top[0].probability * 100)}% số ván)` : ` (${Math.round(opinion.top[0].probability * 100)}%)`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.signature.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-white">Nước rất &quot;{name}&quot;</p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.signature.map(({ index }) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => onSelect(index + 1)}
                      className="rounded-md bg-[#72cf86]/12 px-2 py-1 text-xs font-semibold text-[#9fe0ac] hover:bg-[#72cf86]/20"
                      title={`Nước tốt theo Stockfish và cũng là lựa chọn số 1 của ${name}, dù không phải nước hiển nhiên`}
                    >
                      {moveLabel(moves[index].fen, moves[index].uci)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] leading-4 text-[#758078]">
              Bấm một nước để xem lời bình chi tiết ở bảng &quot;Góc nhìn phân tích&quot;. Dựng từ mô hình học trên ván công khai
              của {data?.displayName}; không phải nhận xét của chính kỳ thủ.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
