"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { AlertTriangle, LoaderCircle, Star, Users } from "lucide-react";

import {
  fetchHumanMoves,
  formatHumanMoveScore,
  type HumanMoveLevel,
  type HumanMoveResponse,
  scoreForMover,
  type ScoredHumanMove,
  useHumanMoveLevels,
} from "@/lib/human-moves";

const SELECTION_KEY = "chess-analysis-human-levels";
const ENGINE_KEY = "chess-analysis-human-engine";
// 1200-1399 và 2200-2399: hai mức mà tiêu chí "xong" của C5 so sánh.
const DEFAULT_BUCKETS = [2, 7];
const MAX_LEVELS = 3;
const ENGINE_DEPTH = 12;
// Mỗi mức lấy top 4; hợp của các mức thường ra 5-8 nước.
const TOP_K = 4;
const MAX_ROWS = 8;
// Nước "bẫy": ít nhất 8% người ở mức thấp nhất đi, nhưng mất từ 2 tốt trở lên.
const TRAP_PROBABILITY = 0.08;
const TRAP_LOSS = 2;

// Kết quả theo (FEN, mức Elo, có Stockfish hay không): tua đi tua lại không phải hỏi lại backend.
const responseCache = new Map<string, HumanMoveResponse>();
const CACHE_LIMIT = 300;

function remember(key: string, data: HumanMoveResponse) {
  if (responseCache.size >= CACHE_LIMIT) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  responseCache.set(key, data);
}

function readStoredBuckets(): number[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SELECTION_KEY) ?? "null") as unknown;
    if (Array.isArray(parsed) && parsed.length && parsed.every((value) => Number.isInteger(value))) {
      return (parsed as number[]).slice(0, MAX_LEVELS);
    }
  } catch {
    // Bộ nhớ trình duyệt bị chặn hoặc hỏng: dùng mặc định.
  }
  return DEFAULT_BUCKETS;
}

type Row = {
  uci: string;
  san: string;
  /** Xác suất theo thứ tự các mức đang chọn. */
  probabilities: number[];
  engine: ScoredHumanMove;
  /** Mất bao nhiêu tốt so với nước tốt nhất trong bảng, nhìn từ bên đi; null khi chưa chấm. */
  loss: number | null;
};

function buildRows(data: HumanMoveResponse, moverIsWhite: boolean): Row[] {
  const [first] = data.predictions;
  if (!first) return [];
  const byLevel = data.predictions.map((prediction) => new Map(prediction.moves.map((move) => [move.uci, move])));
  const scores = first.moves
    .map((move) => scoreForMover(move, moverIsWhite))
    .filter((score): score is number => score !== null);
  const best = scores.length ? Math.max(...scores) : null;
  return first.moves.slice(0, MAX_ROWS).map((move) => {
    const score = scoreForMover(move, moverIsWhite);
    return {
      uci: move.uci,
      san: move.san,
      probabilities: byLevel.map((level) => level.get(move.uci)?.probability ?? 0),
      engine: move,
      loss: score === null || best === null ? null : best - score,
    };
  });
}

function percent(probability: number) {
  if (probability > 0 && probability < 0.01) return "<1%";
  return `${Math.round(probability * 100)}%`;
}

function lossTone(loss: number | null) {
  if (loss === null) return "bg-[#3a413e] text-[#c5cec7]";
  if (loss >= TRAP_LOSS) return "bg-[#ef6461]/18 text-[#ffaaa8]";
  if (loss >= 0.8) return "bg-[#d8b45f]/18 text-[#f0d994]";
  return "bg-[#f4f1e7] text-[#161916]";
}

function sanOf(fen: string, uci: string) {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
}

export function HumanMovesPanel({
  fen,
  gameOver,
  onPlayMove,
  playedUci,
}: {
  fen: string;
  gameOver: boolean;
  onPlayMove: (uci: string) => void;
  /** Nước ván đấu thực sự đi tiếp từ thế cờ này, nếu có: để so với điều mô hình dự đoán. */
  playedUci?: string | null;
}) {
  const { error: levelsError, levels } = useHumanMoveLevels();
  const [selected, setSelected] = useState<number[]>(DEFAULT_BUCKETS);
  const [withEngine, setWithEngine] = useState(true);
  const [loaded, setLoaded] = useState(false);
  // Giữ kèm FEN đã hỏi: kết quả của thế cờ trước không được hiện ở thế cờ mới.
  const [result, setResult] = useState<{ fen: string; data: HumanMoveResponse } | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "model" | "engine">("idle");

  useEffect(() => {
    setSelected(readStoredBuckets());
    try {
      setWithEngine(window.localStorage.getItem(ENGINE_KEY) !== "off");
    } catch {
      // Giữ mặc định.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(SELECTION_KEY, JSON.stringify(selected));
      window.localStorage.setItem(ENGINE_KEY, withEngine ? "on" : "off");
    } catch {
      // Không lưu được lựa chọn thì thôi, lần sau dùng mặc định.
    }
  }, [loaded, selected, withEngine]);

  const chosenLevels = useMemo(
    () => (levels?.levels ?? []).filter((level) => selected.includes(level.bucket)),
    [levels, selected],
  );
  const elos = useMemo(() => chosenLevels.map((level) => level.center), [chosenLevels]);
  const elosKey = elos.join(",");

  useEffect(() => {
    if (!loaded || !levels?.available || gameOver || !elos.length) {
      setResult(null);
      setPhase("idle");
      return;
    }
    const modelKey = `${fen}|${elosKey}|m`;
    const engineKey = `${fen}|${elosKey}|e`;
    const cached = (withEngine && responseCache.get(engineKey)) || responseCache.get(modelKey);
    if (cached) setResult({ data: cached, fen });
    if (cached && (!withEngine || responseCache.has(engineKey))) {
      setPhase("idle");
      setError("");
      return;
    }

    const controller = new AbortController();
    const options = { compare: true, signal: controller.signal, topK: TOP_K };
    // Hai bước: mô hình trả lời trong vài chục ms nên hiện ngay, Stockfish chấm điểm sau.
    // Chờ một nhịp trước khi hỏi để tua nhanh qua nhiều nước không bắn ra hàng loạt request.
    const timer = window.setTimeout(async () => {
      setError("");
      try {
        if (!responseCache.has(modelKey)) {
          setPhase("model");
          const data = await fetchHumanMoves(fen, elos, options);
          remember(modelKey, data);
          setResult({ data, fen });
        }
        if (withEngine) {
          setPhase("engine");
          const data = await fetchHumanMoves(fen, elos, { ...options, engineDepth: ENGINE_DEPTH });
          // Lỗi engine (bận, thiếu STOCKFISH_PATH) không lưu vào cache, để lần sau còn thử lại.
          if (!data.engineNote) remember(engineKey, data);
          setResult({ data, fen });
        }
        setPhase("idle");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setPhase("idle");
        setError(caught instanceof Error ? caught.message : "Không lấy được gợi ý của mô hình.");
      }
    }, cached ? 0 : 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- elosKey thay cho mảng elos
  }, [fen, elosKey, gameOver, levels?.available, loaded, withEngine]);

  function toggleLevel(bucket: number) {
    setSelected((current) => {
      if (current.includes(bucket)) {
        return current.length > 1 ? current.filter((value) => value !== bucket) : current;
      }
      const next = [...current, bucket].sort((left, right) => left - right);
      return next.length > MAX_LEVELS ? next.slice(next.length - MAX_LEVELS) : next;
    });
  }

  const moverIsWhite = fen.split(" ")[1] === "w";
  const shownResult = result?.fen === fen ? result.data : null;
  const rows = useMemo(
    () => (shownResult ? buildRows(shownResult, moverIsWhite) : []),
    [moverIsWhite, shownResult],
  );
  const scored = withEngine && rows.some((row) => row.loss !== null);

  return (
    <section className="bg-[#202623] px-3 py-3" aria-label="Người chơi ở từng mức Elo thường đi">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-[#78a7ff]" />
          <h2 className="text-sm font-bold text-white">Người ở mức Elo X sẽ đi gì?</h2>
          {phase !== "idle" && <LoaderCircle className="size-3.5 animate-spin text-[#8e9991]" />}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[#aeb8b1]">
          <input
            type="checkbox"
            checked={withEngine}
            onChange={(event) => setWithEngine(event.target.checked)}
            className="accent-[#4b7fe8]"
          />
          Stockfish
        </label>
      </div>
      <p className="mb-3 text-[11px] leading-4 text-[#8e9991]">
        Cho 100 người ở mỗi mức gặp đúng thế cờ này: mỗi ô là số người (%) chọn nước đó, theo mô hình M2 học
        từ ván Lichess.
      </p>

      {levelsError && <p className="text-xs text-[#ffaaa8]">{levelsError}</p>}
      {levels && !levels.available && (
        <p className="rounded-lg bg-white/5 px-3 py-2 text-xs leading-5 text-[#aab6ae]">
          Backend chưa nạp mô hình M2. {levels.unavailableReason}
        </p>
      )}

      {levels?.available && (
        <>
          <LevelPicker levels={levels.levels} selected={selected} onToggle={toggleLevel} />

          {gameOver ? (
            <p className="text-xs text-[#8e9991]">Ván đã kết thúc, không còn nước để gợi ý.</p>
          ) : error ? (
            <p className="rounded-lg bg-[#ef6461]/12 px-3 py-2 text-xs text-[#ffaaa8]">{error}</p>
          ) : !rows.length ? (
            <p className="rounded-lg bg-[#2b312e] px-3 py-6 text-center text-xs text-[#8e9991]">Đang hỏi mô hình…</p>
          ) : (
            <div className="space-y-3">
              <Summary levels={chosenLevels} rows={rows} scored={scored} />
              <MoveTable
                levels={chosenLevels}
                onPlayMove={onPlayMove}
                playedUci={playedUci ?? null}
                rows={rows}
                scored={scored}
                engineLoading={withEngine && phase === "engine"}
              />
              {playedUci && (
                <PlayedMoveNote fen={fen} levels={chosenLevels} playedUci={playedUci} rows={rows} />
              )}
              {shownResult?.engineNote && withEngine && (
                <p className="text-[11px] text-[#d8b45f]">{shownResult.engineNote}</p>
              )}
              <p className="text-[10px] leading-4 text-[#758078]">
                Bấm một hàng để đi thử nước đó. Cột Stockfish: điểm sau nước đi theo phía Trắng (depth {ENGINE_DEPTH});
                ★ là nước tốt nhất trong bảng, đỏ là mất từ {TRAP_LOSS} tốt trở lên.
                {shownResult?.trainStep ? ` Mô hình M2 bước ${shownResult.trainStep}.` : ""}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function LevelPicker({
  levels,
  onToggle,
  selected,
}: {
  levels: HumanMoveLevel[];
  onToggle: (bucket: number) => void;
  selected: number[];
}) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#758078]">
        So sánh tối đa {MAX_LEVELS} mức Elo
      </p>
      <div className="grid grid-cols-5 gap-1" role="group" aria-label={`Chọn tối đa ${MAX_LEVELS} mức Elo`}>
        {levels.map((level) => {
          const active = selected.includes(level.bucket);
          return (
            <button
              key={level.bucket}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(level.bucket)}
              className={`rounded-md px-1 py-1 text-[11px] font-semibold tabular-nums transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#4b7fe8] ${active ? "bg-[#4b7fe8] text-white" : "bg-white/6 text-[#aeb8b1] hover:bg-white/12"}`}
            >
              {level.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Một câu cho mỗi mức: nước phổ biến nhất, và cảnh báo nếu người mức thấp hay đi một nước hỏng. */
function Summary({ levels, rows, scored }: { levels: HumanMoveLevel[]; rows: Row[]; scored: boolean }) {
  const lowest = 0;
  const trap = scored
    ? rows
        .filter((row) => (row.loss ?? 0) >= TRAP_LOSS && row.probabilities[lowest] >= TRAP_PROBABILITY)
        .sort((left, right) => right.probabilities[lowest] - left.probabilities[lowest])[0]
    : undefined;

  return (
    <div className="space-y-1.5 rounded-lg bg-[#2b312e] px-3 py-2.5">
      {levels.map((level, index) => {
        const top = rows.reduce((best, row) => (row.probabilities[index] > best.probabilities[index] ? row : best), rows[0]);
        return (
          <p key={level.bucket} className="text-xs leading-5 text-[#c5cec7]">
            <span className="inline-block w-[74px] font-semibold tabular-nums text-[#8e9991]">{level.label}</span>
            phần lớn đi <span className="font-bold text-white">{top.san}</span>{" "}
            <span className="tabular-nums text-[#aeb8b1]">({percent(top.probabilities[index])})</span>
            {scored && top.loss !== null && top.loss < 0.3 && <span className="text-[#72cf86]"> · đúng nước tốt</span>}
            {scored && top.loss !== null && top.loss >= TRAP_LOSS && <span className="text-[#ffaaa8]"> · nước hỏng</span>}
          </p>
        );
      })}
      {trap && (
        <p className="flex gap-1.5 border-t border-white/8 pt-1.5 text-xs leading-5 text-[#ffaaa8]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Bẫy: {percent(trap.probabilities[lowest])} người {levels[lowest].label} đi{" "}
            <span className="font-bold">{trap.san}</span>, nhưng nước này mất{" "}
            {trap.engine.mate !== null ? "thế (bị chiếu hết)" : `${trap.loss?.toFixed(1)} tốt`}.
          </span>
        </p>
      )}
    </div>
  );
}

function MoveTable({
  engineLoading,
  levels,
  onPlayMove,
  playedUci,
  rows,
  scored,
}: {
  engineLoading: boolean;
  levels: HumanMoveLevel[];
  onPlayMove: (uci: string) => void;
  playedUci: string | null;
  rows: Row[];
  scored: boolean;
}) {
  const columns = `52px repeat(${levels.length}, minmax(0, 1fr)) 58px`;
  const bestUci = scored
    ? rows.reduce((best, row) => ((row.loss ?? Infinity) < (best.loss ?? Infinity) ? row : best), rows[0]).uci
    : null;
  const topByLevel = levels.map((_, index) =>
    rows.reduce((best, row) => (row.probabilities[index] > best.probabilities[index] ? row : best), rows[0]).uci,
  );

  return (
    <div className="overflow-hidden rounded-lg border border-white/8" role="table" aria-label="Xác suất từng nước theo mức Elo">
      <div
        role="row"
        className="grid items-end gap-1.5 bg-[#171c1a] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#8e9991]"
        style={{ gridTemplateColumns: columns }}
      >
        <span role="columnheader">Nước</span>
        {levels.map((level) => (
          <span key={level.bucket} role="columnheader" className="text-center tabular-nums normal-case">
            {level.label}
          </span>
        ))}
        <span role="columnheader" className="text-center">Stockfish</span>
      </div>
      {rows.map((row) => {
        const played = row.uci === playedUci;
        return (
          <button
            key={row.uci}
            type="button"
            role="row"
            onClick={() => onPlayMove(row.uci)}
            title={`Đi thử ${row.san}`}
            className={`grid w-full items-center gap-1.5 border-t border-white/6 px-2 py-1.5 text-left transition hover:bg-white/6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#4b7fe8] ${played ? "bg-[#d8b45f]/10" : "bg-[#2b312e]"}`}
            style={{ gridTemplateColumns: columns }}
          >
            <span role="cell" className="flex items-center gap-1 text-sm font-semibold text-white">
              {row.san}
              {row.uci === bestUci && <Star className="size-3 fill-[#72cf86] text-[#72cf86]" aria-label="tốt nhất" />}
            </span>
            {row.probabilities.map((probability, index) => (
              <span key={levels[index].bucket} role="cell" className="relative h-6 overflow-hidden rounded bg-white/5">
                <span
                  className="absolute inset-y-0 left-0 bg-[#78a7ff]/35"
                  style={{ width: `${Math.min(100, probability * 100)}%` }}
                />
                <span
                  className={`relative flex h-full items-center justify-center text-xs tabular-nums ${topByLevel[index] === row.uci ? "font-bold text-white" : "text-[#c5cec7]"}`}
                >
                  {percent(probability)}
                </span>
              </span>
            ))}
            <span
              role="cell"
              className={`rounded px-1 py-0.5 text-center text-[11px] font-semibold tabular-nums ${scored ? lossTone(row.loss) : "bg-[#3a413e] text-[#7f8982]"}`}
            >
              {scored ? formatHumanMoveScore(row.engine) : engineLoading ? "…" : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlayedMoveNote({
  fen,
  levels,
  playedUci,
  rows,
}: {
  fen: string;
  levels: HumanMoveLevel[];
  playedUci: string;
  rows: Row[];
}) {
  const row = rows.find((candidate) => candidate.uci === playedUci);
  const san = row?.san ?? sanOf(fen, playedUci);
  return (
    <p className="rounded-lg border border-[#d8b45f]/25 bg-[#d8b45f]/8 px-3 py-2 text-xs leading-5 text-[#e6d7a8]">
      Trong ván đã đi <span className="font-bold text-white">{san}</span>:{" "}
      {row
        ? levels.map((level, index) => `${percent(row.probabilities[index])} người ${level.label}`).join(" · ")
        : "nước hiếm, không nằm trong các nước phổ biến của mức nào đang chọn."}
    </p>
  );
}
