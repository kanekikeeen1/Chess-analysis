"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { backendRequest } from "@/lib/backend-api";
import type { AnalysisMovePayload, ClassifyMovesResult } from "@/lib/domain-types";
import { assessmentFromKey, type MoveAssessment } from "@/lib/move-classification";
import type { StockfishEvaluation } from "@/lib/use-stockfish";

const DEBOUNCE_MS = 250;

export type LiveClassificationInput = {
  /** Đặc trưng từng nước, đúng payload mà backend đã dùng cho Game Review. */
  moves: AnalysisMovePayload[];
  /** Đánh giá của Stockfish WASM cho N+1 vị trí; `null` khi chưa phân tích xong. */
  evaluations: (StockfishEvaluation | undefined)[];
};

export type LiveClassificationResult = {
  assessments: (MoveAssessment | null)[];
  blackAccuracy: number | null;
  error: string;
  pending: boolean;
  whiteAccuracy: number | null;
};

const EMPTY: LiveClassificationResult = {
  assessments: [],
  blackAccuracy: null,
  error: "",
  pending: false,
  whiteAccuracy: null,
};

/**
 * Gán nhãn cho chế độ phân tích thủ công bằng cách hỏi backend.
 *
 * <p>Trước đây frontend giữ một bản sao đầy đủ của bộ luật ngưỡng, nên hai bên
 * có thể trả về nhãn khác nhau cho cùng một nước. Ở đây trình duyệt vẫn chạy
 * Stockfish WASM để có số liệu đánh giá, nhưng nhãn thì luôn do backend quyết
 * định — cùng đúng một bộ luật với Game Review, và sau này là cùng một mô hình.
 */
export function useLiveClassification({
  evaluations,
  moves,
}: LiveClassificationInput): LiveClassificationResult {
  const [result, setResult] = useState<LiveClassificationResult>(EMPTY);
  const requestIdRef = useRef(0);

  // Engine cục bộ phân tích dần từng vị trí, nên chỉ gửi phần đầu liên tục đã
  // có đủ đánh giá. Nhờ vậy nhãn vẫn hiện dần trong lúc phân tích, giống hành
  // vi cũ, thay vì im lặng cho tới khi xong cả ván.
  const payload = useMemo(() => {
    let ready = 0;
    while (ready < evaluations.length && evaluations[ready]) ready++;
    const usableMoves = Math.min(moves.length, Math.max(0, ready - 1));
    if (usableMoves === 0) return null;

    const evaluated = evaluations.slice(0, usableMoves + 1) as StockfishEvaluation[];
    return {
      moves: moves.slice(0, usableMoves),
      evaluations: evaluated.map((evaluation, index) => ({
        depth: evaluation.depth,
        fen: index === 0 ? moves[0].beforeFen : moves[index - 1].afterFen,
        mate: evaluation.mate,
        moves: evaluation.moves.slice(0, 64),
        pawns: evaluation.pawns,
        variations: evaluation.variations.slice(0, 8).map((variation) => ({
          depth: variation.depth,
          mate: variation.mate,
          moves: variation.moves.slice(0, 64),
          pawns: variation.pawns,
        })),
      })),
    };
  }, [evaluations, moves]);

  useEffect(() => {
    if (!payload) {
      setResult(EMPTY);
      return;
    }

    const requestId = ++requestIdRef.current;
    setResult((previous) => ({ ...previous, error: "", pending: true }));

    // Người dùng đi nhanh hơn engine phân tích; gộp các thay đổi liên tiếp lại
    // để không bắn một request cho mỗi nước vừa đi.
    const timer = window.setTimeout(() => {
      void backendRequest<ClassifyMovesResult>("/api/analysis/classify", {
        method: "POST",
        body: JSON.stringify(payload),
      })
        .then((response) => {
          if (requestId !== requestIdRef.current) return;
          setResult({
            assessments: response.moves.map((move) =>
              assessmentFromKey(move.assessmentKey, move.loss, move.detail)),
            blackAccuracy: response.blackAccuracy,
            error: "",
            pending: false,
            whiteAccuracy: response.whiteAccuracy,
          });
        })
        .catch((caughtError: unknown) => {
          if (requestId !== requestIdRef.current) return;
          setResult({
            ...EMPTY,
            error: caughtError instanceof Error
              ? caughtError.message
              : "Không thể gán nhãn nước đi.",
          });
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [payload]);

  return result;
}
