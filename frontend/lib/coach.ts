import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

import { scoreForMover, type ScoredHumanMove } from "@/lib/human-moves";
import type { MoveAssessment } from "@/lib/move-classification";
import { shortName, type StyleOpinion } from "@/lib/styles";

// Lời bình "như người thầy" cho trang phân tích (D6): ghép đánh giá Stockfish, lựa chọn của mô hình phong cách và vài
// đặc điểm cờ đọc được trực tiếp từ nước đi (phát triển quân, trung tâm, quân bị treo...). Mọi câu dựng từ số liệu và
// luật cờ, không phải lời của kỳ thủ.

const PIECE: Record<PieceSymbol, string> = { p: "Tốt", n: "Mã", b: "Tượng", r: "Xe", q: "Hậu", k: "Vua" };
const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const CENTER = new Set(["d4", "e4", "d5", "e5"]);

export type MoveFeatures = {
  /** Điểm cộng của nước đi, viết dạng cụm động từ: "phát triển Mã", "chiếm trung tâm". */
  positives: string[];
  negatives: string[];
  /** Mã của từng nhận xét tiêu cực, để chọn mẹo phù hợp. */
  flags: Set<"hanging" | "earlyQueen" | "kingWalk" | "shield" | "rim">;
};

/** Đọc vài đặc điểm dễ giải thích của nước `uci` đi từ `fen`. Chỉ là luật cờ thuần, không tính biến. */
export function describeMove(fen: string, uci: string): MoveFeatures | null {
  const game = new Chess(fen);
  let move;
  try {
    move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
  const mover: Color = move.color;
  const opponent: Color = mover === "w" ? "b" : "w";
  const moveNumber = Number(fen.split(" ")[5] ?? 1);
  const positives: string[] = [];
  const negatives: string[] = [];
  const flags: MoveFeatures["flags"] = new Set();
  const to = move.to as Square;

  if (game.isCheckmate()) positives.push("chiếu hết");
  else if (game.inCheck()) positives.push("chiếu Vua đối phương");
  if (move.isKingsideCastle() || move.isQueensideCastle()) positives.push("nhập thành, đưa Vua vào chỗ an toàn và mở đường cho Xe");
  if (move.captured) {
    positives.push(VALUE[move.captured] > VALUE[move.piece]
      ? `dùng ${PIECE[move.piece]} ăn ${PIECE[move.captured]}, đổi quân có lời`
      : `ăn ${PIECE[move.captured]}`);
  }
  if (move.promotion) positives.push(`phong cấp thành ${PIECE[move.promotion]}`);

  if (moveNumber <= 12) {
    const homeRank = mover === "w" ? "1" : "8";
    if ((move.piece === "n" || move.piece === "b") && move.from[1] === homeRank) positives.push(`phát triển ${PIECE[move.piece]}`);
    if (CENTER.has(to) && move.piece !== "q" && move.piece !== "k") positives.push("chiếm trung tâm");
    else if (move.piece === "p" && (move.from[0] === "c" || move.from[0] === "f") && Math.abs(Number(move.to[1]) - Number(move.from[1])) === 2) {
      positives.push("tranh trung tâm từ cánh");
    }
    if (move.piece === "q" && moveNumber <= 6 && !move.captured) {
      negatives.push("đưa Hậu ra quá sớm, dễ bị quân nhẹ đuổi làm mất nhịp");
      flags.add("earlyQueen");
    }
  }
  if (move.piece === "k" && !move.isKingsideCastle() && !move.isQueensideCastle() && moveNumber <= 20
    && game.findPiece({ type: "q", color: opponent }).length) {
    negatives.push("đi Vua khi Hậu còn trên bàn, mất quyền nhập thành");
    flags.add("kingWalk");
  }
  if (move.piece === "n" && (to[0] === "a" || to[0] === "h") && !move.captured) {
    negatives.push("đưa Mã ra biên, nơi Mã kiểm soát ít ô");
    flags.add("rim");
  }
  if (move.piece === "r") {
    const file = to[0];
    const pawnsOnFile = [1, 2, 3, 4, 5, 6, 7, 8].some((rank) => game.get(`${file}${rank}` as Square)?.type === "p");
    if (!pawnsOnFile) positives.push("đặt Xe lên cột mở");
  }
  const [king] = game.findPiece({ type: "k", color: mover });
  if (move.piece === "p" && !move.captured && king && "fgh".includes(move.from[0]) && "gh".includes(king[0])
    && moveNumber > 8) {
    negatives.push("đẩy tốt trước Vua đã nhập thành, làm yếu lớp che chắn");
    flags.add("shield");
  }

  // Quân vừa đi có bị treo không: bị tấn công mà không có quân nào bảo vệ, hoặc bị quân rẻ hơn tấn công.
  if (move.piece !== "k" && move.piece !== "p" && !game.isCheckmate()) {
    const attackers = game.attackers(to, opponent);
    const defenders = game.attackers(to, mover);
    const cheaper = attackers.some((square) => VALUE[game.get(square)!.type] < VALUE[move.piece]);
    if (attackers.length && (!defenders.length || cheaper)) {
      negatives.push(cheaper
        ? `để ${PIECE[move.piece]} ở ${to}, nơi quân rẻ hơn của đối phương có thể ăn`
        : `để ${PIECE[move.piece]} ở ${to} bị tấn công mà không có quân bảo vệ`);
      flags.add("hanging");
    }
  }

  // Đe dọa mới: quân vừa đi tấn công quân đắt hơn hoặc quân không được bảo vệ của đối phương.
  const targets: PieceSymbol[] = [];
  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== opponent || piece.type === "k") continue;
      if (!game.attackers(piece.square, mover).includes(to)) continue;
      if (VALUE[piece.type] > VALUE[move.piece] || !game.attackers(piece.square, opponent).length) targets.push(piece.type);
    }
  }
  if (targets.length >= 2) positives.push(`tấn công cùng lúc ${PIECE[targets[0]]} và ${PIECE[targets[1]]}`);
  else if (targets.length === 1 && !move.captured) positives.push(`tấn công ${PIECE[targets[0]]}`);

  return { flags, negatives: negatives.slice(0, 2), positives: positives.slice(0, 3) };
}

/** "a, b và c". */
function joinVi(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} và ${items[items.length - 1]}`;
}

function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function percent(probability: number) {
  if (probability > 0 && probability < 0.01) return "dưới 1%";
  return `${Math.round(probability * 100)}%`;
}

export type CoachComment = {
  /** Một dòng ngắn: nước đi và nhận định chính. */
  headline: string;
  /** Các đoạn lời bình: đánh giá, vì sao, góc nhìn phong cách, gợi ý. */
  paragraphs: string[];
  /** Một nguyên tắc rút ra, nếu có. */
  tip: string | null;
  /** Nước kiện tướng gợi ý thay thế (khác nước đã đi). */
  suggestion: ScoredHumanMove | null;
};

/** Ghép lời bình cho nước `played` đi từ `fen`, theo góc nhìn của một kiện tướng. */
export function coachComment({
  assessment,
  fen,
  opinion,
  played,
}: {
  assessment: MoveAssessment | null;
  fen: string;
  opinion: StyleOpinion;
  played: ScoredHumanMove;
}): CoachComment {
  const name = shortName(opinion.displayName);
  const moverIsWhite = fen.split(" ")[1] === "w";
  const [top] = opinion.top;
  const features = describeMove(fen, played.uci);
  const paragraphs: string[] = [];

  // 1. Đánh giá theo Stockfish (phân loại của trang phân tích nếu có).
  const loss = assessment && assessment.loss > 0.01 ? ` (mất ${assessment.loss.toFixed(2)} điểm lợi thế)` : "";
  const verdicts: Record<string, string> = {
    theory: `${played.san} là nước lý thuyết.`,
    brilliant: `${played.san} là một nước xuất sắc!`,
    critical: `${played.san} là nước then chốt, đúng lúc.`,
    best: `${played.san} là nước tốt nhất.`,
    excellent: `${played.san} là nước rất tốt.`,
    okay: `${played.san} chơi được.`,
    forced: `${played.san} gần như là nước bắt buộc.`,
    inaccuracy: `${played.san} chưa chính xác${loss}.`,
    mistake: `${played.san} là một sai lầm${loss}.`,
    blunder: `${played.san} là sai lầm nghiêm trọng${loss}.`,
  };
  const headline = assessment ? verdicts[assessment.key] ?? `${played.san}.` : `${played.san}.`;

  // 2. Vì sao: đặc điểm đọc được từ nước đi.
  const why: string[] = [];
  if (features?.positives.length) why.push(`Nước này ${joinVi(features.positives)}.`);
  if (features?.negatives.length) why.push(`${features.positives.length ? "Nhưng nó" : "Nước này"} ${joinVi(features.negatives)}.`);
  if (why.length) paragraphs.push(why.join(" "));

  // 3. Góc nhìn phong cách: kiện tướng có hay chọn nước này không.
  if (opinion.source === "book") {
    const games = opinion.bookGames ?? 0;
    if (opinion.playedRank === 0) {
      paragraphs.push(`${name} đã gặp thế này ${games} lần và đây là nước ${name} chọn nhiều nhất (${opinion.playedCount} lần). Cứ theo đường quen thuộc, phát triển quân rồi mới tính sâu.`);
    } else if (opinion.playedCount) {
      paragraphs.push(`${name} cũng từng đi nước này (${opinion.playedCount}/${games} ván), nhưng thường chọn ${top?.san} hơn.`);
    } else {
      paragraphs.push(`Trong ${games} lần gặp thế này, ${name} chưa từng đi ${played.san}.`);
    }
  } else if (opinion.playedRank === 0) {
    paragraphs.push(`Đây cũng là lựa chọn số 1 của ${name} ở thế này (${percent(opinion.playedProbability)}).`);
  } else if (opinion.playedProbability >= 0.1) {
    paragraphs.push(`${name} cũng có thể đi như vậy (${percent(opinion.playedProbability)}), nhưng nghiêng về ${top?.san} hơn.`);
  } else {
    paragraphs.push(`Đây không phải kiểu nước ${name} hay chọn: chỉ ${percent(opinion.playedProbability)} khả năng.`);
  }

  // 4. Gợi ý: nước kiện tướng chọn, vì sao, và Stockfish nói gì.
  let suggestion: ScoredHumanMove | null = null;
  if (top && opinion.playedRank !== 0) {
    suggestion = top;
    const topFeatures = describeMove(fen, top.uci);
    const reason = topFeatures?.positives.length ? `, nước ${joinVi(topFeatures.positives)}` : "";
    let engine = "";
    const topScore = scoreForMover(top, moverIsWhite);
    const playedScore = scoreForMover(played, moverIsWhite);
    if (topScore !== null && playedScore !== null) {
      const diff = topScore - playedScore;
      if (diff >= 0.3) engine = ` Stockfish cũng đồng ý: ${top.san} tốt hơn ${diff.toFixed(1)} tốt.`;
      else if (diff <= -0.3) engine = ` Tuy vậy Stockfish đánh giá nước của ván tốt hơn ${(-diff).toFixed(1)} tốt: phong cách không phải lúc nào cũng là nước mạnh nhất.`;
      else engine = " Theo Stockfish hai nước gần như ngang nhau, khác biệt là ở cách chơi.";
    }
    paragraphs.push(`Gợi ý theo phong cách ${name}: ${top.san}${reason}.${engine}`);
  }

  // 5. Nguyên tắc rút ra.
  const flags = features?.flags ?? new Set();
  let tip: string | null = null;
  if (flags.has("hanging")) tip = "Trước mỗi nước, kiểm tra quân vừa đi có bị tấn công mà không ai bảo vệ không.";
  else if (flags.has("earlyQueen")) tip = "Ở khai cuộc, phát triển Mã và Tượng trước, đưa Hậu ra sau.";
  else if (flags.has("kingWalk")) tip = "Khi Hậu đối phương còn trên bàn, giữ Vua ở chỗ an toàn và nhập thành sớm.";
  else if (flags.has("shield")) tip = "Đừng đẩy tốt trước Vua nếu không có lý do rõ ràng: mỗi bước tốt là một lỗ hổng không lấp lại được.";
  else if (flags.has("rim")) tip = "Mã ở biên kiểm soát ít ô; Mã gần trung tâm mạnh hơn nhiều.";
  else if (assessment && ["mistake", "blunder"].includes(assessment.key)) {
    tip = "Khi chưa chắc, hãy so 2–3 nước ứng viên và nghĩ xem đối phương đáp lại thế nào trước khi đi.";
  }

  return { headline: sentenceCase(headline), paragraphs, suggestion, tip };
}
