import { Chess, type Square } from "chess.js";

import type {
  BackendEngineVariation,
  BackendPositionEvaluation,
  GameDetail,
} from "@/lib/domain-types";

export type SavedAnalysisMove = {
  index?: number;
  san?: string;
  uci?: string;
  beforeFen?: string;
  afterFen?: string;
  capture?: boolean;
  assessment?: string;
  assessmentLabel?: string;
  detail?: string;
  loss?: number | null;
  accuracy?: number | null;
  evaluation?: number | null;
  depth?: number | null;
  mate?: number | null;
  bestMove?: string | null;
  variations?: BackendEngineVariation[];
};

export type SavedAnalysisReport = {
  engine?: string;
  initialEvaluation?: BackendPositionEvaluation | null;
  reviewMode?: "pgn" | "fen";
  moves: SavedAnalysisMove[];
};

export type ReplayTimeline = {
  positions: string[];
  moves: SavedAnalysisMove[];
};

export function parseSavedAnalysis(analysisJson: string): SavedAnalysisReport {
  try {
    const parsed = JSON.parse(analysisJson) as
      | {
          engine?: string;
          initialEvaluation?: BackendPositionEvaluation | null;
          reviewMode?: "pgn" | "fen";
          moves?: SavedAnalysisMove[];
        }
      | SavedAnalysisMove[];
    if (Array.isArray(parsed)) return { moves: parsed };
    return {
      engine: parsed.engine,
      initialEvaluation: parsed.initialEvaluation,
      reviewMode: parsed.reviewMode,
      moves: parsed.moves ?? [],
    };
  } catch {
    return { moves: [] };
  }
}

export function buildReplayTimeline(
  game: GameDetail,
  savedMoves: SavedAnalysisMove[],
): ReplayTimeline {
  if (savedMoves.length && savedMoves.every((move) => Boolean(move.afterFen))) {
    return {
      positions: [
        savedMoves[0].beforeFen ?? game.initialFen,
        ...savedMoves.map((move) => move.afterFen!),
      ],
      moves: savedMoves,
    };
  }

  if (game.pgn) {
    try {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      const history = chess.history({ verbose: true });
      if (history.length) {
        return {
          positions: [history[0].before, ...history.map((move) => move.after)],
          moves: history.map((move, index) => ({
            ...savedMoves[index],
            afterFen: move.after,
            beforeFen: move.before,
            capture: move.isCapture(),
            san: move.san,
            uci: `${move.from}${move.to}${move.promotion ?? ""}`,
          })),
        };
      }
    } catch {
      // Các báo cáo cũ vẫn có thể mở bằng FEN đầu/cuối.
    }
  }

  const positions = game.finalFen !== game.initialFen
    ? [game.initialFen, game.finalFen]
    : [game.initialFen];
  return { positions, moves: savedMoves.slice(0, Math.max(0, positions.length - 1)) };
}

export function savedMoveIsCapture(move: SavedAnalysisMove) {
  if (typeof move.capture === "boolean") return move.capture;
  if (!move.beforeFen || !move.uci || move.uci.length < 4) return false;
  try {
    const game = new Chess(move.beforeFen);
    return game.move({
      from: move.uci.slice(0, 2) as Square,
      promotion: (move.uci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
      to: move.uci.slice(2, 4) as Square,
    }).isCapture();
  } catch {
    return false;
  }
}
