"use client";

import { useEffect, useState } from "react";

import { backendRequest } from "@/lib/backend-api";
import { ESTIMATE_MAX_MOVES, type ScoredHumanMove } from "@/lib/human-moves";

// Mô hình theo phong cách kỳ thủ (giai đoạn D) chạy trong backend: /api/styles.

export type StyleSummary = {
  id: string;
  displayName: string;
  /** Elo dùng khi hỏi mô hình: trung vị Elo của kỳ thủ trong dữ liệu train. */
  elo: number;
  games: number;
  firstYear: number | null;
  lastYear: number | null;
  bySpeed: Record<string, number> | null;
  bySource: Record<string, number> | null;
  /** Tỉ lệ đoán trúng nước kỳ thủ thật đi trên các ván mới nhất (tập test). */
  testTop1: number | null;
  /** Cùng chỉ số của M2 nền, để thấy mô hình phong cách hơn bao nhiêu. */
  baseTop1: number | null;
  bookPositions: number;
};

export type StylesResponse = {
  available: boolean;
  unavailableReason: string | null;
  styles: StyleSummary[];
};

export type StyleMoveResponse = {
  fen: string;
  style: string;
  /** book: sổ khai cuộc lấy từ ván thật của kỳ thủ; model: mô hình phong cách. */
  source: "book" | "model";
  bookGames: number | null;
  moves: ScoredHumanMove[];
};

export function fetchStyleMoves(id: string, fen: string, options: { topK?: number; signal?: AbortSignal } = {}) {
  return backendRequest<StyleMoveResponse>(`/api/styles/${encodeURIComponent(id)}/moves`, {
    method: "POST",
    body: JSON.stringify({ fen, topK: options.topK ?? 10 }),
    signal: options.signal,
  });
}

let stylesPromise: Promise<StylesResponse> | null = null;

/** Danh sách kỳ thủ; tải một lần cho cả phiên, lỗi thì lần sau thử lại. */
export function useStyles() {
  const [styles, setStyles] = useState<StylesResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    stylesPromise ??= backendRequest<StylesResponse>("/api/styles");
    stylesPromise
      .then((result) => {
        if (active) setStyles(result);
      })
      .catch((caught) => {
        stylesPromise = null;
        if (active) setError(caught instanceof Error ? caught.message : "Không tải được danh sách kỳ thủ.");
      });
    return () => {
      active = false;
    };
  }, []);

  return { error, styles };
}

/** "Lê Quang Liêm" → "LL", "Magnus Carlsen" → "MC": thay cho ảnh, vì không dùng hình ảnh cá nhân (D7). */
export function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return `${words[0]?.[0] ?? ""}${words.length > 1 ? words[words.length - 1][0] : ""}`.toUpperCase();
}

/** Tên ngắn trong câu: họ với người phương Tây, tên với người Việt ("Lê Quang Liêm" → "Liêm"). */
export function shortName(name: string) {
  return name.trim().split(/\s+/).at(-1) ?? name;
}

/** Nhãn trung thực (D7): nói rõ đây là mô phỏng từ ván công khai. */
export function styleDisclaimer(style: StyleSummary) {
  const years = style.firstYear && style.lastYear ? ` (${style.firstYear}–${style.lastYear})` : "";
  return `Mô phỏng phong cách dựa trên ${style.games.toLocaleString("vi-VN")} ván công khai${years} của ${style.displayName}, `
    + "phần lớn là cờ nhanh online. Đây không phải chính kỳ thủ.";
}

/** Tỉ lệ ván blitz/bullet trong dữ liệu, để người dùng biết bot học từ nhịp độ nào. */
export function fastShare(style: StyleSummary) {
  const speeds = style.bySpeed ?? {};
  const total = Object.values(speeds).reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  return ((speeds.blitz ?? 0) + (speeds.bullet ?? 0)) / total;
}

export type StyleCompareResponse = {
  fen: string;
  styles: StyleMoveResponse[];
  /** Lý do không có điểm Stockfish (bận, thiếu STOCKFISH_PATH); null khi chấm được hoặc không yêu cầu. */
  engineNote: string | null;
};

/** Top nước của mọi kỳ thủ ở một thế cờ; `engineDepth` để Stockfish chấm điểm từng nước. */
export function compareStyles(fen: string, options: { topK?: number; engineDepth?: number; signal?: AbortSignal } = {}) {
  return backendRequest<StyleCompareResponse>("/api/styles/compare", {
    method: "POST",
    body: JSON.stringify({ fen, topK: options.topK ?? 3, engineDepth: options.engineDepth ?? null }),
    signal: options.signal,
  });
}

export type StyleMatch = {
  style: string;
  displayName: string;
  moves: number;
  /** Số nước trùng đúng lựa chọn số 1 của kỳ thủ. */
  top1: number;
  /** Số nước nằm trong 3 lựa chọn đầu của kỳ thủ. */
  top3: number;
  /** Số thế cờ có trong sổ khai cuộc của kỳ thủ (so với ván thật thay vì mô hình). */
  inBook: number;
};

export type StyleMatchResponse = { white: StyleMatch[]; black: StyleMatch[] };

/** Báo cáo ván: % nước của mỗi bên trùng lựa chọn của từng kiện tướng. Cùng giới hạn số nước như ước lượng Elo. */
export function matchStyles(moves: Array<{ fen: string; uci: string }>, signal?: AbortSignal) {
  return backendRequest<StyleMatchResponse>("/api/styles/match", {
    method: "POST",
    body: JSON.stringify({ moves: moves.slice(0, ESTIMATE_MAX_MOVES) }),
    signal,
  });
}

export type StylePuzzle = {
  id: string;
  style: string;
  displayName: string;
  fen: string;
  ply: number;
  date: string;
  speed: string;
  /** Kỳ thủ cầm quân gì trong ván gốc, cũng là bên đi ở `fen`. */
  color: "white" | "black";
  elo: number | null;
  opponentElo: number | null;
  poolSize: number;
};

export type StylePuzzleCheck = {
  correct: boolean;
  /** match: trùng nước kỳ thủ · good: khác nhưng Stockfish đánh giá ngang · weak: kém hơn · unknown: không chấm được. */
  verdict: "match" | "good" | "weak" | "unknown";
  answerUci: string;
  answerSan: string;
  userSan: string;
  /** Điểm centipawn nhìn từ bên đi. */
  userCp: number | null;
  answerCp: number;
  bestCp: number;
  answerProbability: number | null;
  userProbability: number | null;
  /** Kết quả ván gốc nhìn từ kỳ thủ: 1 thắng, 0 hòa, -1 thua. */
  result: number | null;
  engine: Array<{ uci: string; san: string; cp: number }>;
};

export function fetchStylePuzzle(style: string | null, exclude: string[], signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (style) query.set("style", style);
  if (exclude.length) query.set("exclude", exclude.slice(-200).join(","));
  return backendRequest<StylePuzzle>(`/api/styles/puzzles/next?${query}`, { signal });
}

export function checkStylePuzzle(id: string, uci: string) {
  return backendRequest<StylePuzzleCheck>(`/api/styles/puzzles/${encodeURIComponent(id)}/check`, {
    method: "POST",
    body: JSON.stringify({ uci }),
  });
}

export type StyleOpinion = {
  style: string;
  displayName: string;
  /** book: theo ván thật của kỳ thủ ở đúng thế cờ này; model: theo mô hình phong cách. */
  source: "book" | "model";
  bookGames: number | null;
  /** Số lần kỳ thủ đi đúng nước này (chỉ khi source = book). */
  playedCount: number | null;
  playedProbability: number;
  /** 0 = lựa chọn số 1 của kỳ thủ. */
  playedRank: number;
  top: ScoredHumanMove[];
};

export type StyleOpinionResponse = {
  fen: string;
  played: ScoredHumanMove;
  styles: StyleOpinion[];
  engineNote: string | null;
};

/** Góc nhìn của từng kiện tướng về nước `uci` đi từ `fen`. */
export function fetchStyleOpinion(fen: string, uci: string, options: { engineDepth?: number; signal?: AbortSignal } = {}) {
  return backendRequest<StyleOpinionResponse>("/api/styles/opinion", {
    method: "POST",
    body: JSON.stringify({ fen, uci, engineDepth: options.engineDepth ?? null }),
    signal: options.signal,
  });
}

export type StyleReviewResponse = {
  style: string;
  displayName: string;
  /** Phần tử thứ i ứng với nước thứ i của ván; mỗi phần tử có tối đa 2 nước kỳ thủ chọn, không có điểm Stockfish. */
  moves: StyleOpinion[];
};

/** Cả ván theo góc nhìn kỳ thủ `id`. */
export function fetchStyleReview(id: string, moves: Array<{ fen: string; uci: string }>, signal?: AbortSignal) {
  return backendRequest<StyleReviewResponse>(`/api/styles/${encodeURIComponent(id)}/review`, {
    method: "POST",
    body: JSON.stringify({ moves: moves.slice(0, ESTIMATE_MAX_MOVES) }),
    signal,
  });
}

/** Góc nhìn đã chọn ở tab Nạp ván; bảng "Góc nhìn phân tích" cũng mở theo lựa chọn này. */
export const PERSPECTIVE_KEY = "chess-analysis-coach-perspective";
/** Giá trị của PERSPECTIVE_KEY khi người dùng chỉ muốn Stockfish. */
export const STOCKFISH_ONLY = "stockfish";

export function readPerspective() {
  try {
    return window.localStorage.getItem(PERSPECTIVE_KEY);
  } catch {
    return null;
  }
}

export function storePerspective(value: string) {
  try {
    window.localStorage.setItem(PERSPECTIVE_KEY, value);
  } catch {
    // Không lưu được thì lần sau dùng mặc định.
  }
}
