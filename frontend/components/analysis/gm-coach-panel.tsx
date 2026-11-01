"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Crown, LoaderCircle, Square, Volume2, VolumeX } from "lucide-react";

import { OpinionList, tagOf, useStyleOpinion } from "@/components/analysis/style-opinion";
import { percent } from "@/components/analysis/human-moves-panel";
import { coachComment } from "@/lib/coach";
import { formatHumanMoveScore } from "@/lib/human-moves";
import type { MoveAssessment } from "@/lib/move-classification";
import { initials, shortName } from "@/lib/styles";

const PERSPECTIVE_KEY = "chess-analysis-coach-perspective";
const VOICE_KEY = "chess-analysis-coach-voice";
const ALL = "all";

function readStored(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Không lưu được thì lần sau dùng mặc định.
  }
}

/** Đọc to bằng giọng tiếng Việt của trình duyệt, nếu có; trình duyệt không hỗ trợ thì im lặng. */
function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "vi-VN";
    const voice = synth.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith("vi"));
    if (voice) utterance.voice = voice;
    utterance.rate = 1.02;
    synth.speak(utterance);
  } catch {
    // Không có Web Speech API.
  }
}

function stopSpeaking() {
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Không có Web Speech API.
  }
}

/**
 * "Góc nhìn phân tích" (D6): chọn một kiện tướng, nhận lời bình kiểu người thầy cho nước vừa đi (đánh giá, vì sao, góc
 * nhìn phong cách, gợi ý và một nguyên tắc), hoặc so cả ba. Lời bình dựng từ Stockfish, mô hình phong cách và luật
 * cờ, viết ở ngôi thứ ba: đây là mô phỏng, không phải kỳ thủ đang nói.
 */
export function GmCoachPanel({
  assessment,
  fen,
  onTryMove,
  uci,
}: {
  assessment: MoveAssessment | null;
  /** Thế cờ trước nước được bình. */
  fen: string;
  onTryMove: (uci: string, description: string) => void;
  uci: string;
}) {
  const { available, data, error, phase, styles } = useStyleOpinion(fen, uci);
  const [perspective, setPerspective] = useState<string>("");
  const [voice, setVoice] = useState(false);
  const [details, setDetails] = useState(false);

  useEffect(() => {
    setPerspective(readStored(PERSPECTIVE_KEY) ?? "");
    setVoice(readStored(VOICE_KEY) === "on");
    return stopSpeaking;
  }, []);

  // Mặc định chọn kiện tướng đầu tiên khi danh sách tải xong mà lựa chọn đã lưu không còn.
  useEffect(() => {
    if (styles.length && perspective !== ALL && !styles.some((style) => style.id === perspective)) setPerspective(styles[0].id);
  }, [perspective, styles]);

  const opinion = data?.styles.find((candidate) => candidate.style === perspective) ?? null;
  const comment = useMemo(
    () => (opinion && data ? coachComment({ assessment, fen, opinion, played: data.played }) : null),
    [assessment, data, fen, opinion],
  );
  const spoken = comment ? [comment.headline, ...comment.paragraphs, comment.tip ?? ""].join(" ") : "";

  useEffect(() => {
    // Chỉ đọc khi đã có điểm Stockfish, để không đọc hai lần cho cùng một nước.
    if (voice && spoken && phase === "idle") speak(spoken);
  }, [phase, spoken, voice]);

  if (!available) return null;

  function choose(value: string) {
    setPerspective(value);
    store(PERSPECTIVE_KEY, value);
  }

  function toggleVoice() {
    const next = !voice;
    setVoice(next);
    store(VOICE_KEY, next ? "on" : "off");
    if (next && spoken) speak(spoken);
    else stopSpeaking();
  }

  const selected = styles.find((style) => style.id === perspective);
  const name = selected ? shortName(selected.displayName) : "";

  return (
    <section className="border-b border-white/10 bg-[#171c1a] px-3 py-3" aria-label="Góc nhìn kiện tướng">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
          Góc nhìn phân tích
          {phase !== "idle" && <LoaderCircle className="size-3.5 animate-spin text-[#8e9991]" />}
        </h3>
        <div className="relative">
          <select
            value={perspective}
            onChange={(event) => choose(event.target.value)}
            className="appearance-none rounded-lg border border-white/15 bg-[#202623] py-1.5 pl-3 pr-8 text-sm text-white focus-visible:outline-2 focus-visible:outline-[#4b7fe8]"
            aria-label="Chọn góc nhìn kiện tướng"
          >
            <option value={ALL}>Cả 3 kiện tướng</option>
            {styles.map((style) => <option key={style.id} value={style.id}>{style.displayName}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-[#aeb8b1]" />
        </div>
      </div>

      {error ? (
        <p className="text-xs text-[#ffaaa8]">{error}</p>
      ) : !data ? (
        <p className="text-xs text-[#8e9991]">Đang hỏi các mô hình…</p>
      ) : perspective === ALL || !opinion || !comment ? (
        <OpinionList data={data} fen={fen} onTryMove={onTryMove} />
      ) : (
        <>
          <div className="flex items-start gap-3">
            <div className="flex w-16 shrink-0 flex-col items-center text-center">
              <span className="relative grid size-14 place-items-center rounded-xl bg-gradient-to-br from-[#e6c46f] to-[#b8862f] text-lg font-bold text-[#2a2110] shadow-lg shadow-black/30">
                {initials(opinion.displayName)}
                <Crown className="absolute -right-1.5 -top-1.5 size-5 rounded-full bg-[#171c1a] p-0.5 text-[#f0d994]" />
              </span>
              <span className="mt-1 text-xs font-semibold text-white">{name}</span>
              <span className="text-[9px] text-[#8e9991]">Mô phỏng AI</span>
            </div>
            <div className="relative min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-[#f4efe1] px-3.5 py-3 text-[#1d211f] shadow-lg shadow-black/25">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#7a6a3f]">Góc nhìn {name}</p>
              <p className="mt-1 text-sm font-semibold leading-5">{comment.headline}</p>
              {comment.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-1.5 text-[13px] leading-5 text-[#2f3531]">{paragraph}</p>
              ))}
              {comment.tip && (
                <p className="mt-2 border-t border-black/10 pt-2 text-xs leading-5 text-[#5b513a]">
                  <span className="font-semibold">Ghi nhớ: </span>{comment.tip}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tagOf(opinion).className}`}>{tagOf(opinion).label}</span>
            <span className="text-xs text-[#aeb8b1]">
              {data.played.san}{assessment ? ` · ${assessment.label}` : ""}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {comment.suggestion && (
              <button
                type="button"
                onClick={() => onTryMove(comment.suggestion!.uci, `nước ${name} hay chọn`)}
                className="rounded-lg bg-[#d8b45f] px-3 py-1.5 text-xs font-semibold text-[#2a2110] hover:bg-[#e6c46f]"
              >
                Thử {comment.suggestion.san}
              </button>
            )}
            <button
              type="button"
              onClick={toggleVoice}
              aria-pressed={voice}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${voice ? "bg-[#d8b45f]/20 text-[#f0d994]" : "bg-white/8 text-[#dfe5e0] hover:bg-white/12"}`}
            >
              {voice ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              Tự động đọc: {voice ? "bật" : "tắt"}
            </button>
            <button type="button" onClick={stopSpeaking} className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-[#dfe5e0] hover:bg-white/12">
              <Square className="size-3" /> Dừng
            </button>
          </div>

          <button
            type="button"
            onClick={() => setDetails((value) => !value)}
            className="mt-3 text-xs text-[#aeb8b1] hover:text-white"
            aria-expanded={details}
          >
            {details ? "▾" : "▸"} Chi tiết: {name} sẽ chọn gì
          </button>
          {details && (
            <ul className="mt-1.5 space-y-1">
              {opinion.top.map((move) => (
                <li key={move.uci} className="flex items-center gap-2 text-xs text-[#dfe5e0]">
                  <span className="w-12 font-semibold text-white">{move.san}</span>
                  <span className="relative h-4 flex-1 overflow-hidden rounded bg-white/5">
                    <span className="absolute inset-y-0 left-0 bg-[#d8b45f]/30" style={{ width: `${Math.min(100, move.probability * 100)}%` }} />
                    <span className="relative px-1.5 tabular-nums">{percent(move.probability)}</span>
                  </span>
                  <span className="w-14 text-right tabular-nums text-[#aeb8b1]">{move.pawns !== null ? formatHumanMoveScore(move) : "—"}</span>
                </li>
              ))}
              <li className="text-[10px] text-[#758078]">
                {opinion.source === "book" ? `Theo ${opinion.bookGames} ván thật của ${name} ở thế này.` : `Theo mô hình phong cách ${name}.`}
                {" "}Cột phải: điểm Stockfish sau nước đi (phía Trắng).
              </li>
            </ul>
          )}
        </>
      )}

      {data?.engineNote && <p className="mt-2 text-[11px] text-[#d8b45f]">{data.engineNote}</p>}
      <p className="mt-2 text-[10px] leading-4 text-[#758078]">
        Giọng và lời bình được dựng tự động từ Stockfish và mô hình học trên ván công khai của kỳ thủ; không phải
        {name ? ` ${name}` : " kỳ thủ"} thật đang nói.
      </p>
    </section>
  );
}
