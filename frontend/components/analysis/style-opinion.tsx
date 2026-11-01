"use client";

import { useEffect, useState } from "react";

import { percent } from "@/components/analysis/human-moves-panel";
import { formatHumanMoveScore, scoreForMover, type ScoredHumanMove } from "@/lib/human-moves";
import {
  fetchStyleOpinion,
  initials,
  shortName,
  type StyleOpinion,
  type StyleOpinionResponse,
  useStyles,
} from "@/lib/styles";

const ENGINE_DEPTH = 12;
// Chênh lệch (tốt) giữa nước kiện tướng chọn và nước đã đi để nhận xét "tốt hơn"/"ngang nhau".
const CLEARLY_BETTER = 0.3;
const ROUGHLY_EQUAL = 0.3;
const RARE = 0.05;

const responseCache = new Map<string, StyleOpinionResponse>();
const CACHE_LIMIT = 200;

function remember(key: string, data: StyleOpinionResponse) {
  if (responseCache.size >= CACHE_LIMIT) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  responseCache.set(key, data);
}

type Tag = { label: string; className: string };

export function tagOf(opinion: StyleOpinion): Tag {
  if (opinion.playedRank === 0) return { label: "Đúng chất", className: "bg-[#72cf86]/15 text-[#9fe0ac]" };
  if (opinion.source === "book" && !opinion.playedCount) {
    return { label: "Chưa từng chọn", className: "bg-[#ef6461]/15 text-[#ffaaa8]" };
  }
  if (opinion.playedRank < 3 || opinion.playedProbability >= 0.1) {
    return { label: "Có thể chọn", className: "bg-[#78a7ff]/15 text-[#a9c5ff]" };
  }
  if (opinion.playedProbability >= 0.02) return { label: "Hiếm khi chọn", className: "bg-[#d8b45f]/15 text-[#f0d994]" };
  return { label: "Gần như không chọn", className: "bg-[#ef6461]/15 text-[#ffaaa8]" };
}

/** Một câu nhận xét dựng từ số liệu: lựa chọn của kỳ thủ, rồi Stockfish so hai nước. Không giả lời kỳ thủ. */
function commentOf(opinion: StyleOpinion, played: ScoredHumanMove, moverIsWhite: boolean) {
  const name = shortName(opinion.displayName);
  const [top] = opinion.top;
  if (!top) return "";
  const parts: string[] = [];
  if (opinion.source === "book") {
    const games = opinion.bookGames ?? 0;
    if (opinion.playedRank === 0) {
      parts.push(`Đây là nước ${name} chọn nhiều nhất ở thế này: ${opinion.playedCount}/${games} ván.`);
    } else if (opinion.playedCount) {
      parts.push(`${name} đã đi ${played.san} ${opinion.playedCount}/${games} ván, nhưng hay chọn ${top.san} hơn (${percent(top.probability)}).`);
    } else {
      parts.push(`Trong ${games} lần gặp thế này, ${name} chưa từng đi ${played.san}; thường chọn ${top.san} (${percent(top.probability)}).`);
    }
  } else if (opinion.playedRank === 0) {
    parts.push(`Mô hình ${name} cũng chọn nước này đầu tiên (${percent(opinion.playedProbability)}).`);
  } else {
    parts.push(`Mô hình ${name}: ${percent(opinion.playedProbability)} khả năng chọn ${played.san}`
      + (opinion.playedRank < 20 ? ` (xếp thứ ${opinion.playedRank + 1})` : "")
      + `; nhiều khả năng đi ${top.san} (${percent(top.probability)}).`);
  }

  if (opinion.playedRank !== 0) {
    const topScore = scoreForMover(top, moverIsWhite);
    const playedScore = scoreForMover(played, moverIsWhite);
    if (topScore !== null && playedScore !== null) {
      const diff = topScore - playedScore;
      if (diff >= CLEARLY_BETTER) parts.push(`Stockfish: ${top.san} tốt hơn ${diff.toFixed(1)} tốt.`);
      else if (diff <= -ROUGHLY_EQUAL) parts.push(`Stockfish lại đánh giá nước của ván tốt hơn ${top.san} (${(-diff).toFixed(1)} tốt).`);
      else parts.push(`Stockfish đánh giá hai nước gần như ngang nhau.`);
    }
  }
  return parts.join(" ");
}

/** Nhận xét chung khi các kiện tướng đồng thuận, hoặc khi họ và Stockfish nhìn khác nhau. */
function consensusOf(data: StyleOpinionResponse, moverIsWhite: boolean) {
  const opinions = data.styles.filter((opinion) => opinion.top.length);
  if (opinions.length < 2) return null;
  const played = data.played;
  const scores = [played, ...opinions.flatMap((opinion) => opinion.top)]
    .map((move) => scoreForMover(move, moverIsWhite))
    .filter((score): score is number => score !== null);
  const playedScore = scoreForMover(played, moverIsWhite);
  const loss = playedScore !== null && scores.length ? Math.max(...scores) - playedScore : null;
  const names = (list: StyleOpinion[]) => list.map((opinion) => shortName(opinion.displayName)).join(", ");

  if (opinions.every((opinion) => opinion.playedRank === 0)) {
    return `Cả ${opinions.length} kiện tướng đều chọn ${played.san}.`;
  }
  const fans = opinions.filter((opinion) => opinion.playedProbability >= 0.2);
  if (fans.length && loss !== null && loss >= 1) {
    return `Nước tự nhiên (${names(fans)} cũng hay đi) nhưng Stockfish cho là mất ${loss.toFixed(1)} tốt: kiểu bẫy mà người chơi mạnh cũng dễ mắc.`;
  }
  if (opinions.every((opinion) => opinion.playedProbability < RARE)) {
    if (loss !== null && loss <= ROUGHLY_EQUAL) {
      return `Không kiện tướng nào hay đi ${played.san}, nhưng Stockfish thấy nó vẫn tốt: một nước khó thấy, hoặc rất "máy".`;
    }
    if (loss !== null && loss >= 1) return `Cả Stockfish lẫn các kiện tướng đều không chọn ${played.san}.`;
    return `Không kiện tướng nào hay đi ${played.san} ở thế này.`;
  }
  const firsts = new Set(opinions.map((opinion) => opinion.top[0].san));
  if (firsts.size === 1) return `Cả ${opinions.length} kiện tướng đều nghiêng về ${opinions[0].top[0].san}.`;
  return null;
}

/** Góc nhìn của các kiện tướng về nước `uci` đi từ `fen`: mô hình trước, điểm Stockfish sau; có cache theo nước. */
export function useStyleOpinion(fen: string, uci: string) {
  const { styles } = useStyles();
  const [result, setResult] = useState<{ key: string; data: StyleOpinionResponse } | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "model" | "engine">("idle");
  const key = `${fen}|${uci}`;

  useEffect(() => {
    if (!styles?.available) return;
    const modelKey = `${key}|m`;
    const engineKey = `${key}|e`;
    const cached = responseCache.get(engineKey) ?? responseCache.get(modelKey);
    if (cached) setResult({ data: cached, key });
    if (responseCache.has(engineKey)) {
      setPhase("idle");
      setError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setError("");
      try {
        if (!responseCache.has(modelKey)) {
          setPhase("model");
          const data = await fetchStyleOpinion(fen, uci, { signal: controller.signal });
          remember(modelKey, data);
          setResult({ data, key });
        }
        setPhase("engine");
        const data = await fetchStyleOpinion(fen, uci, { engineDepth: ENGINE_DEPTH, signal: controller.signal });
        if (!data.engineNote) remember(engineKey, data);
        setResult({ data, key });
        setPhase("idle");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setPhase("idle");
        setError(caught instanceof Error ? caught.message : "Không lấy được góc nhìn kiện tướng.");
      }
    }, cached ? 0 : 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key gồm fen và uci
  }, [key, styles?.available]);

  return {
    available: styles?.available ?? false,
    data: result?.key === key ? result.data : null,
    error,
    phase,
    styles: styles?.styles ?? [],
  };
}

/** So sánh nhanh cả ba kiện tướng: nhãn, một câu nhận xét và nút thử nước họ chọn. */
export function OpinionList({
  data,
  fen,
  onTryMove,
}: {
  data: StyleOpinionResponse;
  fen: string;
  onTryMove: (uci: string, description: string) => void;
}) {
  const moverIsWhite = fen.split(" ")[1] === "w";
  const consensus = consensusOf(data, moverIsWhite);
  return (
    <div className="space-y-2">
      {consensus && <p className="text-xs font-semibold leading-5 text-[#f0d994]">{consensus}</p>}
      {data.styles.map((opinion) => {
        const tag = tagOf(opinion);
        const [top] = opinion.top;
        return (
          <div key={opinion.style} className="flex gap-2">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#d8b45f]/15 text-[10px] font-bold text-[#f0d994]">
              {initials(opinion.displayName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-white">{shortName(opinion.displayName)}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tag.className}`}>{tag.label}</span>
                {top && opinion.playedRank !== 0 && (
                  <button
                    type="button"
                    onClick={() => onTryMove(top.uci, `nước ${shortName(opinion.displayName)} hay chọn`)}
                    className="rounded bg-white/6 px-1.5 py-0.5 text-[10px] text-[#dfe5e0] hover:bg-white/12"
                    title={`Quay lại và đi thử ${top.san}`}
                  >
                    Thử {top.san}{top.pawns !== null ? ` (${formatHumanMoveScore(top)})` : ""}
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-5 text-[#c5cec7]">{commentOf(opinion, data.played, moverIsWhite)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

