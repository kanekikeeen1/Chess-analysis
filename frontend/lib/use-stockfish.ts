"use client";

import { useEffect, useRef, useState } from "react";

export type StockfishVariation = {
  depth: number;
  mate: number | null;
  moves: string[];
  pawns: number;
};

export type StockfishEvaluation = StockfishVariation & {
  source: "engine";
  variations: StockfishVariation[];
};

type AnalysisKind = "background" | "interactive" | "review";

type AnalysisTask = {
  cancelled: boolean;
  fen: string;
  kind: AnalysisKind;
  moveTimeMs?: number;
  reviewSessionId?: number;
  targetDepth: number;
};

export type ActiveAnalysis = {
  currentDepth: number;
  fen: string;
  kind: AnalysisKind;
  moveTimeMs?: number;
  targetDepth: number;
};

export type StockfishReviewPlan = {
  sessionId: number;
  skipped: number;
  tasks: Array<{ fen: string; moveTimeMs: number }>;
  total: number;
};

// The ASM worker is a little larger than the WASM loader, but it is completely
// self-contained. On authenticated deployments the secondary WASM request can
// be blocked before Stockfish emits `uciok`, leaving the UI at 0.0 forever.
// This build avoids that extra request while keeping Stockfish 18 off the UI
// thread and working consistently across Chrome, Edge, Firefox and Safari.
const ENGINE_PATH = "/stockfish/stockfish-18-asm.js";

export const INTERACTIVE_DEPTH = 16;
const BACKGROUND_DEPTH = 16;

function hasEngineDepth(evaluation: StockfishEvaluation | undefined, targetDepth: number) {
  return Boolean(evaluation && evaluation.depth >= targetDepth);
}

function scoreFromInfo(line: string, fen: string): StockfishVariation | null {
  const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
  const depthMatch = line.match(/\bdepth (\d+)/);
  const pvMatch = line.match(/\bpv (.+)$/);
  if (!scoreMatch) return null;

  const rawScore = Number(scoreMatch[2]);
  const whiteToMove = fen.split(" ")[1] === "w";
  const whiteScore = whiteToMove ? rawScore : -rawScore;

  return scoreMatch[1] === "mate"
    ? {
        depth: Number(depthMatch?.[1] ?? 0),
        mate: whiteScore,
        moves: pvMatch?.[1].trim().split(/\s+/) ?? [],
        pawns: whiteScore >= 0 ? 100 : -100,
      }
    : {
        depth: Number(depthMatch?.[1] ?? 0),
        mate: null,
        moves: pvMatch?.[1].trim().split(/\s+/) ?? [],
        pawns: whiteScore / 100,
      };
}

function unique(values: string[]) {
  return values.filter((value, index, list) => list.indexOf(value) === index);
}

export function useStockfish(
  positions: string[],
  currentIndex: number,
  reviewPlan: StockfishReviewPlan | null,
  reviewRequested: boolean,
) {
  const [evaluations, setEvaluations] = useState<Record<string, StockfishEvaluation>>({});
  const [liveResult, setLiveResult] = useState<{
    evaluation: StockfishEvaluation;
    fen: string;
  } | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<ActiveAnalysis | null>(null);
  const [engineError, setEngineError] = useState(false);
  const [engineReady, setEngineReady] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const activeTaskRef = useRef<AnalysisTask | null>(null);
  const pendingCurrentFenRef = useRef<string | null>(null);
  const backgroundQueueRef = useRef<string[]>([]);
  const reviewQueueRef = useRef<Array<{
    fen: string;
    moveTimeMs: number;
    sessionId: number;
  }>>([]);
  const reviewPlanRef = useRef<StockfishReviewPlan | null>(reviewPlan);
  const reviewRequestedRef = useRef(reviewRequested);
  const reviewSessionRef = useRef<number | null>(null);
  const reviewCompletedRef = useRef(0);
  const [reviewCompleted, setReviewCompleted] = useState(0);
  const [reviewTotal, setReviewTotal] = useState(0);
  const currentFenRef = useRef(positions[currentIndex] ?? positions[0]);
  const validPositionsRef = useRef(new Set(positions));
  const latestVariationsRef = useRef<Map<number, StockfishVariation>>(new Map());
  const evaluationRef = useRef<Record<string, StockfishEvaluation>>({});
  const runNextRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let worker: Worker;
    let startupTimer: number | undefined;

    try {
      worker = new Worker(ENGINE_PATH);
      workerRef.current = worker;
      startupTimer = window.setTimeout(() => {
        if (readyRef.current) return;
        setEngineError(true);
        worker.terminate();
        workerRef.current = null;
      }, 15_000);
    } catch {
      setEngineError(true);
      return;
    }

    function nextTask(): Omit<AnalysisTask, "cancelled"> | null {
      while (reviewQueueRef.current.length) {
        const item = reviewQueueRef.current.shift();
        if (item && validPositionsRef.current.has(item.fen)) {
          return {
            fen: item.fen,
            kind: "review",
            moveTimeMs: item.moveTimeMs,
            reviewSessionId: item.sessionId,
            targetDepth: 0,
          };
        }
      }

      // While a PGN/FEN is being prepared, do not let a depth-16 foreground
      // search delay the first review task and leave the progress bar at 0%.
      if (reviewRequestedRef.current && !reviewPlanRef.current) return null;

      const currentFen = pendingCurrentFenRef.current;
      pendingCurrentFenRef.current = null;

      if (
        currentFen &&
        validPositionsRef.current.has(currentFen) &&
        !hasEngineDepth(evaluationRef.current[currentFen], INTERACTIVE_DEPTH)
      ) {
        return {
          fen: currentFen,
          kind: "interactive",
          targetDepth: INTERACTIVE_DEPTH,
        };
      }

      while (backgroundQueueRef.current.length) {
        const fen = backgroundQueueRef.current.shift();
        if (
          fen &&
          validPositionsRef.current.has(fen) &&
          !hasEngineDepth(evaluationRef.current[fen], BACKGROUND_DEPTH)
        ) {
          return { fen, kind: "background", targetDepth: BACKGROUND_DEPTH };
        }
      }

      return null;
    }

    function runNext() {
      if (!readyRef.current || activeTaskRef.current || !workerRef.current) return;

      const task = nextTask();
      if (!task) {
        setActiveAnalysis(null);
        return;
      }

      activeTaskRef.current = { cancelled: false, ...task };
      latestVariationsRef.current = new Map();
      setActiveAnalysis({
        currentDepth: 0,
        fen: task.fen,
        kind: task.kind,
        moveTimeMs: task.moveTimeMs,
        targetDepth: task.targetDepth,
      });
      workerRef.current.postMessage(`position fen ${task.fen}`);
      workerRef.current.postMessage(
        task.kind === "review"
          ? `go movetime ${task.moveTimeMs ?? 500}`
          : `go depth ${task.targetDepth}`,
      );
    }

    function collectEvaluation(): StockfishEvaluation | null {
      const variations = [...latestVariationsRef.current.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, variation]) => variation);
      const primary = variations[0];
      return primary ? { ...primary, source: "engine", variations } : null;
    }

    runNextRef.current = runNext;

    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string") return;
      const line = event.data.trim();

      if (line === "uciok") {
        // A smaller hash starts much more reliably on phones and constrained
        // browser tabs; 128 MB could make the worker stall before its first PV.
        worker.postMessage("setoption name Hash value 32");
        worker.postMessage("setoption name MultiPV value 2");
        worker.postMessage("isready");
        return;
      }

      if (line === "readyok") {
        if (startupTimer) window.clearTimeout(startupTimer);
        readyRef.current = true;
        setEngineReady(true);
        runNext();
        return;
      }

      if (line.startsWith("info ") && line.includes(" score ")) {
        const task = activeTaskRef.current;
        if (!task || task.cancelled) return;

        const variation = scoreFromInfo(line, task.fen);
        if (!variation) return;

        const multipv = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
        latestVariationsRef.current.set(multipv, variation);
        setActiveAnalysis({
          currentDepth: variation.depth,
          fen: task.fen,
          kind: task.kind,
          moveTimeMs: task.moveTimeMs,
          targetDepth: task.targetDepth,
        });

        const liveEvaluation = collectEvaluation();
        if (task.fen === currentFenRef.current && liveEvaluation) {
          setLiveResult({ evaluation: liveEvaluation, fen: task.fen });
        }
        return;
      }

      if (line.startsWith("bestmove")) {
        const task = activeTaskRef.current;
        const evaluation = collectEvaluation();

        if (
          task &&
          !task.cancelled &&
          evaluation &&
          validPositionsRef.current.has(task.fen)
        ) {
          const existing = evaluationRef.current[task.fen];
          const storedEvaluation = existing && existing.depth > evaluation.depth
            ? existing
            : evaluation;
          evaluationRef.current = {
            ...evaluationRef.current,
            [task.fen]: storedEvaluation,
          };
          setEvaluations(evaluationRef.current);

          if (task.fen === currentFenRef.current) {
            setLiveResult({ evaluation: storedEvaluation, fen: task.fen });
          }
        }

        if (
          task?.kind === "review" &&
          !task.cancelled &&
          task.reviewSessionId === reviewSessionRef.current
        ) {
          const nextCompleted = Math.min(
            reviewCompletedRef.current + 1,
            reviewPlanRef.current?.total ?? reviewCompletedRef.current + 1,
          );
          reviewCompletedRef.current = nextCompleted;
          setReviewCompleted(nextCompleted);
        }

        activeTaskRef.current = null;
        latestVariationsRef.current = new Map();
        setActiveAnalysis(null);

        if (
          reviewQueueRef.current.length === 0 &&
          !hasEngineDepth(evaluationRef.current[currentFenRef.current], INTERACTIVE_DEPTH)
        ) {
          pendingCurrentFenRef.current = currentFenRef.current;
        }
        runNext();
      }
    };

    worker.onerror = () => {
      if (startupTimer) window.clearTimeout(startupTimer);
      setEngineError(true);
      activeTaskRef.current = null;
      pendingCurrentFenRef.current = null;
      backgroundQueueRef.current = [];
      reviewQueueRef.current = [];
      setActiveAnalysis(null);
    };

    worker.postMessage("uci");

    return () => {
      if (startupTimer) window.clearTimeout(startupTimer);
      worker.postMessage("quit");
      worker.terminate();
      workerRef.current = null;
      readyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const currentFen = positions[currentIndex] ?? positions[0];
    if (!currentFen) return;

    const uniquePositions = unique(positions);
    const validPositions = new Set(uniquePositions);
    validPositionsRef.current = validPositions;
    reviewPlanRef.current = reviewPlan;
    reviewRequestedRef.current = reviewRequested;
    currentFenRef.current = currentFen;
    setLiveResult(null);

    const incomingSession = reviewPlan?.sessionId ?? null;
    const reviewSessionChanged = incomingSession !== reviewSessionRef.current;

    if (reviewSessionChanged) {
      reviewSessionRef.current = incomingSession;
      reviewQueueRef.current = reviewPlan
        ? reviewPlan.tasks.map((task) => ({
            ...task,
            sessionId: reviewPlan.sessionId,
          }))
        : [];
      reviewCompletedRef.current = reviewPlan?.skipped ?? 0;
      setReviewCompleted(reviewPlan?.skipped ?? 0);
      setReviewTotal(reviewPlan?.total ?? 0);
    }

    const reviewIsRunning = reviewQueueRef.current.length > 0;
    pendingCurrentFenRef.current = reviewIsRunning || (reviewRequested && !reviewPlan)
      ? null
      : hasEngineDepth(evaluationRef.current[currentFen], INTERACTIVE_DEPTH)
        ? null
        : currentFen;

    backgroundQueueRef.current = reviewRequested
      ? []
      : uniquePositions.filter(
          (fen) =>
            fen !== currentFen &&
            !hasEngineDepth(evaluationRef.current[fen], BACKGROUND_DEPTH),
        );

    const activeTask = activeTaskRef.current;
    const reviewTargetChanged = activeTask?.kind === "review" &&
      activeTask.reviewSessionId !== incomingSession;
    const taskPositionRemoved = activeTask && !validPositions.has(activeTask.fen);
    const currentNeedsPriority =
      activeTask &&
      !reviewRequested &&
      activeTask.fen !== currentFen &&
      !hasEngineDepth(evaluationRef.current[currentFen], INTERACTIVE_DEPTH);
    const reviewNeedsPriority = activeTask &&
      reviewQueueRef.current.length > 0 &&
      activeTask.kind !== "review";

    if (
      activeTask &&
      (reviewTargetChanged || taskPositionRemoved || currentNeedsPriority || reviewNeedsPriority)
    ) {
      activeTask.cancelled = true;
      workerRef.current?.postMessage("stop");
      return;
    }

    runNextRef.current();
  }, [currentIndex, positions, reviewPlan, reviewRequested]);

  const currentFen = positions[currentIndex];
  const cachedEvaluation = currentFen ? evaluations[currentFen] : undefined;
  const liveEvaluation = liveResult?.fen === currentFen ? liveResult.evaluation : undefined;
  const currentEvaluation = liveEvaluation &&
    (!cachedEvaluation || liveEvaluation.depth >= cachedEvaluation.depth)
    ? liveEvaluation
    : cachedEvaluation;
  const uniquePositions = unique(positions);
  const completed = uniquePositions.filter(
    (fen) => hasEngineDepth(evaluations[fen], INTERACTIVE_DEPTH),
  ).length;

  return {
    activeAnalysis,
    completed,
    currentEvaluation,
    engineError,
    engineReady,
    evaluationByFen: evaluations,
    reviewCompleted,
    reviewTotal,
    total: uniquePositions.length,
  };
}
