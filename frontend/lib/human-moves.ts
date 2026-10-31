"use client";

import { useEffect, useState } from "react";

import { backendRequest } from "@/lib/backend-api";

// Mô hình M2 ("người ở Elo X thường đi nước nào") chạy trong backend: /api/human-moves.

export type HumanMoveLevel = { bucket: number; label: string; center: number };

export type HumanMoveLevels = {
  available: boolean;
  unavailableReason: string | null;
  levels: HumanMoveLevel[];
};

export type ScoredHumanMove = {
  uci: string;
  san: string;
  probability: number;
  /** Điểm Stockfish sau nước này, theo phía Trắng; null khi không chấm. */
  pawns: number | null;
  mate: number | null;
};

export type HumanMovePrediction = {
  elo: number;
  level: string;
  moves: ScoredHumanMove[];
};

export type HumanMoveResponse = {
  fen: string;
  predictions: HumanMovePrediction[];
  trainStep: number | null;
  engineNote: string | null;
};

export type SideEloEstimate = { elo: number; stdError: number; moves: number; level: string };

export type EloEstimateResponse = {
  white: SideEloEstimate | null;
  black: SideEloEstimate | null;
  trainStep: number | null;
};

export type PlayingProfile = {
  estimatedElo: number | null;
  eloStdError: number | null;
  gamesAnalyzed: number;
  movesAnalyzed: number;
  lastEstimatedAt: string | null;
};

/** Trang phân tích đọc khóa này khi mở, để "Phân tích ván này" ở trang đấu bot chuyển ván sang. */
export const IMPORT_PGN_KEY = "chess-analysis-import-pgn";

/** Backend nhận tối đa 240 nước cho một lần ước lượng (120 nước mỗi bên). */
export const ESTIMATE_MAX_MOVES = 240;

export function fetchHumanMoves(
  fen: string,
  elos: number[],
  options: { topK?: number; engineDepth?: number; compare?: boolean; signal?: AbortSignal } = {},
) {
  return backendRequest<HumanMoveResponse>("/api/human-moves", {
    method: "POST",
    body: JSON.stringify({
      fen,
      elos,
      topK: options.topK ?? 3,
      engineDepth: options.engineDepth ?? null,
      // true: mọi mức trả về cùng một tập nước, để so một nước qua các mức Elo.
      compare: options.compare ?? false,
    }),
    signal: options.signal,
  });
}

export function estimateGameElo(moves: Array<{ fen: string; uci: string }>, signal?: AbortSignal) {
  return backendRequest<EloEstimateResponse>("/api/human-moves/estimate", {
    method: "POST",
    body: JSON.stringify({ moves: moves.slice(0, ESTIMATE_MAX_MOVES) }),
    signal,
  });
}

let levelsPromise: Promise<HumanMoveLevels> | null = null;

/** Danh sách dải Elo; tải một lần cho cả phiên, lỗi thì lần sau thử lại. */
export function useHumanMoveLevels() {
  const [levels, setLevels] = useState<HumanMoveLevels | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    levelsPromise ??= backendRequest<HumanMoveLevels>("/api/human-moves/levels");
    levelsPromise
      .then((result) => {
        if (active) setLevels(result);
      })
      .catch((caught) => {
        levelsPromise = null;
        if (active) setError(caught instanceof Error ? caught.message : "Không tải được danh sách mức Elo.");
      });
    return () => {
      active = false;
    };
  }, []);

  return { error, levels };
}

/**
 * Chọn một nước theo đúng phân phối của mô hình, không luôn lấy top-1: bot "Elo X" phải mắc những lỗi
 * mà người Elo X hay mắc. `temperature` < 1 làm bot đi chắc tay hơn, > 1 làm bot đi bừa hơn.
 */
export function sampleMove(moves: ScoredHumanMove[], temperature = 1, random = Math.random) {
  if (!moves.length) return null;
  const weights = moves.map((move) => Math.pow(Math.max(move.probability, 1e-9), 1 / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let threshold = random() * total;
  for (let index = 0; index < moves.length; index += 1) {
    threshold -= weights[index];
    if (threshold <= 0) return moves[index];
  }
  return moves[moves.length - 1];
}

/** Điểm Stockfish nhìn từ phía bên vừa đi: dương là tốt cho họ. */
export function scoreForMover(move: ScoredHumanMove, moverIsWhite: boolean) {
  if (move.pawns === null) return null;
  return moverIsWhite ? move.pawns : -move.pawns;
}

export function formatHumanMoveScore(move: ScoredHumanMove) {
  if (move.pawns === null) return "—";
  if (move.mate !== null) return `${move.pawns > 0 ? "+" : "−"}M${Math.abs(move.mate)}`;
  return `${move.pawns >= 0 ? "+" : ""}${move.pawns.toFixed(2)}`;
}
