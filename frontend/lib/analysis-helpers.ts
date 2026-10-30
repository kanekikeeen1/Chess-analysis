import { Chess, type Square } from "chess.js";
import type { StockfishVariation } from "@/lib/use-stockfish";
import { estimateMaterialSacrifice, type MoveAssessmentKey } from "@/lib/move-classification";
import type { AnalysisMovePayload, GameDetail } from "@/lib/domain-types";
import type { SavedAnalysisReport } from "@/lib/saved-analysis";

export const STARTING_POSITION = new Chess().fen();
export const BEST_MOVE_SUGGESTION_KEYS = new Set<MoveAssessmentKey>([
  "excellent",
  "okay",
  "inaccuracy",
  "mistake",
  "blunder",
]);

export type InputType = "pgn" | "fen";
export type ReviewDepthMode = "deep" | "fast";
export type UiTheme = "dark" | "light";

export const REVIEW_DEPTH_RANGES = {
  fast: { label: "Nhanh", max: 14 as const, min: 10 as const },
  deep: { label: "Sâu", max: 20 as const, min: 16 as const },
};

export type AnalysisTimeline = {
  positions: string[];
  moves: string[];
  uciMoves: string[];
  capturedMoves: boolean[];
};

export type VariationTimeline = AnalysisTimeline & {
  startIndex: number;
};

export type ArchivedReview = {
  game: GameDetail;
  report: SavedAnalysisReport;
};


export function describePosition(game: Chess) {
  if (game.isCheckmate()) {
    return `Chiếu hết — ${game.turn() === "w" ? "Đen" : "Trắng"} thắng`;
  }
  if (game.isDraw()) return "Ván cờ hòa";
  if (game.inCheck()) return `${game.turn() === "w" ? "Trắng" : "Đen"} đang bị chiếu`;
  return `Lượt của ${game.turn() === "w" ? "Trắng" : "Đen"}`;
}

export function formatEvaluation(evaluation: StockfishVariation) {
  if (evaluation.mate !== null) {
    // Dấu lấy từ `pawns` vì `mate 0` (đã bị chiếu hết) không mang dấu.
    return `${evaluation.pawns > 0 ? "+" : "−"}M${Math.abs(evaluation.mate)}`;
  }
  return `${evaluation.pawns >= 0 ? "+" : ""}${evaluation.pawns.toFixed(2)}`;
}

export function variationToSan(fen: string, uciMoves: string[]) {
  const game = new Chess(fen);
  const sanMoves: string[] = [];

  for (const uci of uciMoves.slice(0, 9)) {
    try {
      const move = game.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: (uci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
      });
      sanMoves.push(move.san);
    } catch {
      break;
    }
  }

  return sanMoves;
}

export function canonicalMoveSan(san: string, afterFen: string) {
  try {
    if (new Chess(afterFen).isCheckmate()) {
      return `${san.replace(/[+#]+$/, "")}#`;
    }
  } catch {
    // FEN đã được chess.js xác thực trước khi hiển thị lịch sử.
  }

  return san;
}

export function analysisMovePayload({
  afterFen,
  beforeFen,
  san,
  theory,
  theoryName,
  uci,
}: {
  afterFen: string;
  beforeFen: string;
  san: string;
  theory: boolean;
  theoryName?: string;
  uci: string;
}): AnalysisMovePayload {
  const before = new Chess(beforeFen);
  const movingColor = before.turn();
  const opponent = movingColor === "w" ? "b" : "w";
  const legalMoveCount = before.moves().length;
  const movedPiece = before.get(uci.slice(0, 2) as Square);
  const played = before.move({
    from: uci.slice(0, 2) as Square,
    promotion: (uci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
    to: uci.slice(2, 4) as Square,
  });
  const after = new Chess(afterFen);
  const sacrificeCandidate = Boolean(
    movedPiece && movedPiece.type !== "p" && movedPiece.type !== "k" &&
    after.isAttacked(uci.slice(2, 4) as Square, opponent),
  );
  const sacrifice = estimateMaterialSacrifice(beforeFen, afterFen, uci);

  let abandonedPieceCandidate = false;
  const files = "abcdefgh";
  for (let row = 0; row < 8 && !abandonedPieceCandidate; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const square = `${files[column]}${8 - row}` as Square;
      const pieceBefore = new Chess(beforeFen).get(square);
      const pieceAfter = after.get(square);
      if (
        square !== played.from &&
        pieceBefore?.color === movingColor &&
        pieceBefore.type !== "p" &&
        pieceBefore.type !== "k" &&
        pieceAfter?.color === movingColor &&
        pieceAfter.type === pieceBefore.type &&
        new Chess(beforeFen).isAttacked(square, opponent) &&
        after.isAttacked(square, opponent)
      ) {
        abandonedPieceCandidate = true;
        break;
      }
    }
  }

  return {
    abandonedPieceCandidate,
    afterFen,
    beforeFen,
    capture: played.isCapture(),
    check: after.inCheck(),
    checkmate: after.isCheckmate(),
    legalMoveCount,
    promotion: played.isPromotion(),
    sacrificeCandidate,
    sacrificeKind: sacrifice.kind,
    sacrificeValue: sacrifice.amount,
    san,
    theory,
    theoryName: theoryName ?? null,
    uci,
  };
}
