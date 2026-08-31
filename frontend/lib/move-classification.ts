import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

export type MoveAssessmentKey =
  | "brilliant"
  | "critical"
  | "forced"
  | "best"
  | "excellent"
  | "okay"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "theory";

export type MoveAssessment = {
  badgeClassName: string;
  className: string;
  detail: string;
  key: MoveAssessmentKey;
  label: string;
  loss: number;
  symbol: string;
};

export const MOVE_ASSESSMENT_ORDER: MoveAssessmentKey[] = [
  "brilliant",
  "critical",
  "forced",
  "best",
  "excellent",
  "okay",
  "inaccuracy",
  "mistake",
  "blunder",
  "theory",
];

export const MOVE_ASSESSMENT_META: Record<
  MoveAssessmentKey,
  Pick<MoveAssessment, "badgeClassName" | "className" | "label" | "symbol">
> = {
  brilliant: {
    badgeClassName: "bg-[#21b8c7] text-white",
    className: "bg-[#21b8c7]/14 text-[#63e2eb]",
    label: "Thiên tài",
    symbol: "!!",
  },
  critical: {
    badgeClassName: "bg-[#5c82a4] text-white",
    className: "bg-[#5c82a4]/16 text-[#9cc3e4]",
    label: "Then chốt",
    symbol: "!",
  },
  forced: {
    badgeClassName: "bg-[#73808c] text-white",
    className: "bg-[#73808c]/16 text-[#b7c2cc]",
    label: "Ép buộc",
    symbol: "→",
  },
  best: {
    badgeClassName: "bg-[#75ad43] text-white",
    className: "bg-[#75ad43]/16 text-[#a9dc75]",
    label: "Nước đi tốt nhất",
    symbol: "★",
  },
  excellent: {
    badgeClassName: "bg-[#79a94f] text-white",
    className: "bg-[#79a94f]/16 text-[#b3dd8f]",
    label: "Xuất sắc",
    symbol: "👍",
  },
  okay: {
    badgeClassName: "bg-[#7e9a70] text-white",
    className: "bg-[#7e9a70]/16 text-[#b8cfad]",
    label: "Ổn",
    symbol: "✓",
  },
  inaccuracy: {
    badgeClassName: "bg-[#e9b51c] text-[#29220e]",
    className: "bg-[#e9b51c]/15 text-[#f2cc59]",
    label: "Không chính xác",
    symbol: "?!",
  },
  mistake: {
    badgeClassName: "bg-[#ef8b3c] text-white",
    className: "bg-[#ef8b3c]/15 text-[#f5ad76]",
    label: "Sai lầm",
    symbol: "?",
  },
  blunder: {
    badgeClassName: "bg-[#e8483f] text-white",
    className: "bg-[#e8483f]/15 text-[#ff9a94]",
    label: "Blunder",
    symbol: "??",
  },
  theory: {
    badgeClassName: "bg-[#bd885d] text-white",
    className: "bg-[#bd885d]/16 text-[#ddb18d]",
    label: "Lý thuyết",
    symbol: "📖",
  },
};

/**
 * Bảng giá trị quân dùng cho phần ước lượng thí quân bên dưới. Phần còn lại của
 * tệp này là trích xuất đặc trưng, không phải gán nhãn: kết quả được gửi lên
 * backend trong `AnalysisMovePayload`, và backend — nơi duy nhất còn giữ luật
 * gán nhãn — mới quyết định nước đó có phải "Thiên tài" hay không.
 */
const PIECE_VALUES: Record<PieceSymbol, number> = {
  b: 3.25,
  k: 0,
  n: 3,
  p: 1,
  q: 9,
  r: 5,
};

function materialFor(game: Chess, color: Color) {
  return game.board().flat().reduce((total, piece) => {
    return piece?.color === color ? total + PIECE_VALUES[piece.type] : total;
  }, 0);
}

function materialBalance(game: Chess, color: Color) {
  const opponent = color === "w" ? "b" : "w";
  return materialFor(game, color) - materialFor(game, opponent);
}

export type MaterialSacrificeEstimate = {
  amount: number;
  kind: "ABANDONED" | "MOVED" | "NONE";
};

function applyVerboseMove(game: Chess, move: { from: string; promotion?: string; to: string }) {
  return game.move({
    from: move.from as Square,
    promotion: (move.promotion as "q" | "r" | "b" | "n" | undefined) ?? "q",
    to: move.to as Square,
  });
}

/**
 * Confirms that an offered non-pawn piece produces a real net material
 * investment after the opponent captures it and the mover gets one immediate
 * reply. A defended piece that is merely attacked therefore does not count as
 * a sacrifice.
 */
export function estimateMaterialSacrifice(
  beforeFen: string,
  afterFen: string,
  playedUci: string,
): MaterialSacrificeEstimate {
  const empty: MaterialSacrificeEstimate = { amount: 0, kind: "NONE" };
  try {
    const beforeGame = new Chess(beforeFen);
    const afterGame = new Chess(afterFen);
    const movingColor = beforeGame.turn();
    const opponent = movingColor === "w" ? "b" : "w";
    const movedFrom = playedUci.slice(0, 2) as Square;
    const movedTarget = playedUci.slice(2, 4) as Square;
    const balanceBefore = materialBalance(beforeGame, movingColor);
    let bestEstimate = empty;

    for (const capture of afterGame.moves({ verbose: true }).filter((move) => move.isCapture())) {
      const captureSquare = capture.to as Square;
      const offeredPiece = afterGame.get(captureSquare);
      if (!offeredPiece || offeredPiece.color !== movingColor || offeredPiece.type === "p" || offeredPiece.type === "k") {
        continue;
      }

      let kind: MaterialSacrificeEstimate["kind"] = "NONE";
      if (captureSquare === movedTarget) {
        kind = "MOVED";
      } else {
        const originalPiece = beforeGame.get(captureSquare);
        const wasAlreadyAttacked = beforeGame.isAttacked(captureSquare, opponent);
        if (
          captureSquare !== movedFrom &&
          wasAlreadyAttacked &&
          originalPiece?.color === movingColor &&
          originalPiece.type === offeredPiece.type
        ) {
          kind = "ABANDONED";
        }
      }
      if (kind === "NONE") continue;

      const accepted = new Chess(afterFen);
      applyVerboseMove(accepted, capture);
      let bestReplyBalance = materialBalance(accepted, movingColor);
      for (const reply of accepted.moves({ verbose: true })) {
        const replyGame = new Chess(accepted.fen());
        applyVerboseMove(replyGame, reply);
        bestReplyBalance = Math.max(bestReplyBalance, materialBalance(replyGame, movingColor));
      }

      const amount = Math.max(0, balanceBefore - bestReplyBalance);
      if (amount > bestEstimate.amount) bestEstimate = { amount, kind };
    }
    return bestEstimate.amount >= 0.75 ? bestEstimate : empty;
  } catch {
    return empty;
  }
}

/**
 * Dựng một {@link MoveAssessment} từ nhãn do backend trả về.
 *
 * Frontend không còn tự suy ra nhãn: nó chỉ ánh xạ nhãn sang màu sắc, ký hiệu
 * và nhãn tiếng Việt để hiển thị.
 */
export function assessmentFromKey(
  key: string,
  loss: number,
  detail?: string | null,
): MoveAssessment | null {
  const meta = MOVE_ASSESSMENT_META[key as MoveAssessmentKey];
  if (!meta) return null;
  return { ...meta, detail: detail ?? meta.label, key: key as MoveAssessmentKey, loss };
}
