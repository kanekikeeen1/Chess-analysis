import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

import type { StockfishEvaluation } from "@/lib/use-stockfish";

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

const PIECE_VALUES: Record<PieceSymbol, number> = {
  b: 3.25,
  k: 0,
  n: 3,
  p: 1,
  q: 9,
  r: 5,
};

function normalizeUci(move?: string) {
  return move?.trim().toLowerCase().slice(0, 5) ?? "";
}

function whiteWinPercent(pawns: number) {
  const centipawns = Math.max(-1000, Math.min(1000, pawns * 100));
  return 100 / (1 + Math.exp(-0.00368208 * centipawns));
}

export function calculateMoveAccuracy({
  after,
  before,
  beforeFen,
}: {
  after?: StockfishEvaluation;
  before?: StockfishEvaluation;
  beforeFen?: string;
}) {
  if (!before || !after || !beforeFen) return null;

  const whiteMoved = beforeFen.split(" ")[1] === "w";
  const beforeChance = whiteWinPercent(before.pawns);
  const afterChance = whiteWinPercent(after.pawns);
  const chanceLoss = Math.max(
    0,
    whiteMoved ? beforeChance - afterChance : afterChance - beforeChance,
  );
  const accuracy = 103.1668 * Math.exp(-0.04354 * chanceLoss) - 3.1669;
  return Math.max(0, Math.min(100, accuracy));
}

function materialFor(game: Chess, color: Color) {
  return game.board().flat().reduce((total, piece) => {
    return piece?.color === color ? total + PIECE_VALUES[piece.type] : total;
  }, 0);
}

function materialBalance(game: Chess, color: Color) {
  const opponent = color === "w" ? "b" : "w";
  return materialFor(game, color) - materialFor(game, opponent);
}

type SacrificeProfile = {
  amount: number;
  kind: "abandoned" | "moved" | null;
  outcomeMate: boolean;
  outcomeScore: number;
};

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

function sacrificeProfile(
  beforeFen: string,
  afterFen: string,
  playedUci: string,
  after: StockfishEvaluation,
): SacrificeProfile {
  const offered = estimateMaterialSacrifice(beforeFen, afterFen, playedUci);

  try {
    const beforeGame = new Chess(beforeFen);
    const movingColor = beforeGame.turn();
    const balanceBefore = materialBalance(beforeGame, movingColor);
    const movedTarget = playedUci.slice(2, 4) as Square;
    const movedFrom = playedUci.slice(0, 2) as Square;
    let bestProfile: SacrificeProfile = {
      amount: offered.amount,
      kind: offered.kind === "ABANDONED" ? "abandoned" : offered.kind === "MOVED" ? "moved" : null,
      outcomeMate: after.mate !== null && (movingColor === "w" ? after.mate > 0 : after.mate < 0),
      outcomeScore: movingColor === "w" ? after.pawns : -after.pawns,
    };

    // Inspect both Stockfish replies. This covers a sound sacrifice accepted by
    // best play and a poisoned piece that the opponent is better off refusing.
    for (const variation of after.variations.slice(0, 2)) {
      const firstReply = normalizeUci(variation.moves[0]);
      if (firstReply.length < 4) continue;

      try {
        const lineGame = new Chess(afterFen);
        const captureSquare = firstReply.slice(2, 4) as Square;
        const capturedPiece = lineGame.get(captureSquare);
        const reply = lineGame.move({
          from: firstReply.slice(0, 2) as Square,
          promotion: (firstReply[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
          to: captureSquare,
        });

        if (
          !reply.isCapture() ||
          !capturedPiece ||
          capturedPiece.color !== movingColor ||
          capturedPiece.type === "p"
        ) continue;

        let kind: SacrificeProfile["kind"] = null;
        if (captureSquare === movedTarget) {
          kind = "moved";
        } else {
          const pieceBeforeMove = beforeGame.get(captureSquare);
          const leftExistingPieceBehind =
            captureSquare !== movedFrom &&
            pieceBeforeMove?.color === movingColor &&
            pieceBeforeMove.type === capturedPiece.type;
          if (leftExistingPieceBehind) kind = "abandoned";
        }
        if (!kind) continue;

        // Let the mover answer once. A normal trade followed by an immediate
        // recapture restores the balance and therefore is not a sacrifice.
        const response = normalizeUci(variation.moves[1]);
        if (response.length >= 4) {
          lineGame.move({
            from: response.slice(0, 2) as Square,
            promotion: (response[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
            to: response.slice(2, 4) as Square,
          });
        }

        const amount = Math.max(
          0,
          balanceBefore - materialBalance(lineGame, movingColor),
        );
        // The captured unit must be a real piece, while the net investment may
        // be an exchange sacrifice (for example a rook for a minor piece/pawn).
        if (amount < 0.75) continue;

        const outcomeScore = movingColor === "w" ? variation.pawns : -variation.pawns;
        const outcomeMate = variation.mate !== null &&
          (movingColor === "w" ? variation.mate > 0 : variation.mate < 0);
        const isStrongerCandidate =
          (outcomeMate && !bestProfile.outcomeMate) ||
          (outcomeMate === bestProfile.outcomeMate &&
            outcomeScore > bestProfile.outcomeScore) ||
          (outcomeMate === bestProfile.outcomeMate &&
            outcomeScore === bestProfile.outcomeScore &&
            amount > bestProfile.amount);

        if (isStrongerCandidate) {
          bestProfile = { amount, kind, outcomeMate, outcomeScore };
        }
      } catch {
        continue;
      }
    }

    return bestProfile;
  } catch {
    return {
      amount: offered.amount,
      kind: offered.kind === "ABANDONED" ? "abandoned" : offered.kind === "MOVED" ? "moved" : null,
      outcomeMate: false,
      outcomeScore: -100,
    };
  }
}

function makeAssessment(
  key: MoveAssessmentKey,
  loss: number,
  detail: string,
): MoveAssessment {
  return { ...MOVE_ASSESSMENT_META[key], detail, key, loss };
}

export function classifyMove({
  after,
  before,
  index,
  isTheory = false,
  playedUci,
  positions,
  theoryName,
}: {
  after?: StockfishEvaluation;
  before?: StockfishEvaluation;
  index: number;
  isTheory?: boolean;
  playedUci?: string;
  positions: string[];
  theoryName?: string;
}): MoveAssessment | null {
  const beforeFen = positions[index - 1];
  const afterFen = positions[index];
  if (!beforeFen || !afterFen || !playedUci) return null;
  try {
    const afterGame = new Chess(afterFen);
    if (afterGame.isCheckmate()) {
      return makeAssessment("best", 0, "Nước chiếu hết ván đấu");
    }

    const beforeGame = new Chess(beforeFen);
    if (beforeGame.moves().length === 1) {
      return makeAssessment(
        "forced",
        0,
        "Nước hợp lệ duy nhất trong vị trí này",
      );
    }
  } catch {
    // FEN đã được chess.js xác thực trước khi tới bước phân loại.
  }
  if (isTheory) {
    return makeAssessment(
      "theory",
      0,
      theoryName ? `Khai cuộc: ${theoryName}` : "Nước lý thuyết khai cuộc",
    );
  }
  if (!before || !after) return null;

  const whiteMoved = beforeFen.split(" ")[1] === "w";
  const rawLoss = Math.max(
    0,
    whiteMoved ? before.pawns - after.pawns : after.pawns - before.pawns,
  );
  const beforeChance = whiteWinPercent(before.pawns);
  const afterChance = whiteWinPercent(after.pawns);
  const chanceLoss = Math.max(
    0,
    whiteMoved ? beforeChance - afterChance : afterChance - beforeChance,
  );
  const moverScoreBefore = whiteMoved ? before.pawns : -before.pawns;
  const moverScoreAfter = whiteMoved ? after.pawns : -after.pawns;

  const normalizedPlayed = normalizeUci(playedUci);
  const bestMove = normalizeUci(before.variations[0]?.moves[0]);
  const isBest = Boolean(bestMove) && normalizedPlayed === bestMove;

  const bestLine = before.variations[0];
  const secondLine = before.variations[1];
  const secondBestGap = bestLine && secondLine
    ? Math.max(
        0,
        whiteMoved
          ? bestLine.pawns - secondLine.pawns
          : secondLine.pawns - bestLine.pawns,
      )
    : 0;

  let legalMoveCount = 99;
  let wasInCheck = false;
  let isForcingMove = true;
  try {
    const beforeGame = new Chess(beforeFen);
    legalMoveCount = beforeGame.moves().length;
    wasInCheck = beforeGame.inCheck();
    const playedMove = beforeGame.move({
      from: normalizedPlayed.slice(0, 2) as Square,
      promotion: (normalizedPlayed[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
      to: normalizedPlayed.slice(2, 4) as Square,
    });
    isForcingMove = playedMove.isCapture() || playedMove.isPromotion() || /[+#]$/.test(playedMove.san);
  } catch {
    // FEN đã được chess.js xác thực trước khi tới bước phân loại.
  }

  const sacrifice = sacrificeProfile(beforeFen, afterFen, normalizedPlayed, after);
  const secondMoverScore = secondLine
    ? whiteMoved ? secondLine.pawns : -secondLine.pawns
    : null;
  const moverHasMateAfter = after.mate !== null && (whiteMoved ? after.mate > 0 : after.mate < 0);
  const secondMoveAlsoMates = secondLine?.mate !== null && secondLine?.mate !== undefined &&
    (whiteMoved ? secondLine.mate > 0 : secondLine.mate < 0);
  const brilliantUniqueAdvantage = secondMoverScore !== null && secondBestGap >= 0.8;
  const criticalUniqueAdvantage = secondMoverScore !== null &&
    secondBestGap >= 0.9 &&
    moverScoreBefore >= 0.5 &&
    moverScoreAfter >= 0.35 &&
    (secondMoverScore <= 0.35 ||
      (moverScoreAfter >= 1.5 && secondMoverScore <= moverScoreAfter * 0.4));
  const sacrificeKeepsAdvantage = sacrifice.outcomeScore >= moverScoreBefore - 0.35 &&
    sacrifice.outcomeScore >= -0.5;
  const sacrificeCreatesClearAdvantage = sacrifice.outcomeScore >= 0.75;
  const captureIsPoisoned =
    sacrifice.outcomeScore >= 2 && sacrifice.outcomeScore >= moverScoreAfter + 0.75;
  const uniqueMate = moverHasMateAfter && !secondMoveAlsoMates;
  const directSacrificeQualifies =
    sacrificeCreatesClearAdvantage ||
    (brilliantUniqueAdvantage && sacrificeKeepsAdvantage) ||
    (uniqueMate && sacrifice.outcomeMate);
  const abandonedPieceQualifies =
    sacrifice.kind === "abandoned" &&
    (sacrificeKeepsAdvantage || captureIsPoisoned || sacrifice.outcomeMate);
  const realPieceSacrifice = sacrifice.amount >= 0.75;
  const soundAfterSacrifice = chanceLoss <= 2.5 && rawLoss <= 0.35 &&
    moverScoreAfter >= -0.5 && moverScoreAfter >= moverScoreBefore - 0.35;
  const competitivePosition = moverScoreBefore >= -3 && moverScoreBefore <= 5;
  const clearTacticalBenefit = moverHasMateAfter || sacrifice.outcomeMate ||
    moverScoreAfter >= 0.75 || brilliantUniqueAdvantage;
  const brilliant = isBest && realPieceSacrifice && soundAfterSacrifice &&
    competitivePosition && clearTacticalBenefit &&
    (directSacrificeQualifies || abandonedPieceQualifies);
  if (brilliant) {
    const detail = sacrifice.kind === "abandoned"
      ? sacrifice.outcomeMate
        ? "Bỏ mặc quân đang bị tấn công để mở đòn chiếu hết"
        : captureIsPoisoned
          ? "Bỏ quân làm mồi; nếu đối thủ ăn, lợi thế tăng mạnh"
          : "Bỏ quân đang bị tấn công để tiếp tục phản công mà không mất thế trận"
      : uniqueMate
        ? "Nước hy sinh duy nhất dẫn tới chiếu hết"
        : brilliantUniqueAdvantage
          ? "Nước thí quân tốt và là lựa chọn vượt trội để giữ thế trận"
          : "Nước thí quân tốt tạo lợi ích chiến thuật rõ ràng";

    return makeAssessment(
      "brilliant",
      rawLoss,
      detail,
    );
  }

  const moderatelyHardToFind =
    !wasInCheck &&
    legalMoveCount >= 6 &&
    (!isForcingMove || (legalMoveCount >= 10 && secondBestGap >= 1.4));
  const critical =
    isBest &&
    !moverHasMateAfter &&
    moderatelyHardToFind &&
    criticalUniqueAdvantage;
  if (critical) {
    return makeAssessment(
      "critical",
      rawLoss,
      "Lựa chọn không hiển nhiên và gần như duy nhất giữ được lợi thế",
    );
  }

  if (isBest) {
    return makeAssessment("best", rawLoss, "Nước đi chính xác nhất trong vị trí");
  }
  if (chanceLoss < 2 || rawLoss <= 0.25) {
    return makeAssessment("excellent", rawLoss, "Rất sát với nước tốt nhất");
  }
  if (chanceLoss < 5 || rawLoss <= 0.7) {
    return makeAssessment("okay", rawLoss, "Nước đi chấp nhận được");
  }
  if (chanceLoss < 10 || rawLoss <= 1.5) {
    return makeAssessment("inaccuracy", rawLoss, "Bỏ lỡ một lựa chọn chính xác hơn");
  }
  if (chanceLoss < 20 || rawLoss <= 3) {
    return makeAssessment("mistake", rawLoss, "Làm tình hình xấu đi rõ rệt");
  }
  return makeAssessment("blunder", rawLoss, "Làm thay đổi lớn cục diện ván đấu");
}
