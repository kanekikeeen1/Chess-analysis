"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import {
  Chessboard,
  defaultPieces,
  type PieceRenderObject,
} from "react-chessboard";
import {
  Activity,
  Archive,
  BookOpen,
  Check,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  GitBranch,
  History,
  LogIn,
  LogOut,
  LoaderCircle,
  Moon,
  Plus,
  RotateCcw,
  ScanSearch,
  Save,
  Settings,
  Star,
  Sun,
  ThumbsUp,
  Upload,
  UserRound,
} from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ActiveAnalysis,
  INTERACTIVE_DEPTH,
  type StockfishEvaluation,
  type StockfishVariation,
  useStockfish,
} from "@/lib/use-stockfish";
import {
  estimateMaterialSacrifice,
  MOVE_ASSESSMENT_META,
  MOVE_ASSESSMENT_ORDER,
  type MoveAssessment,
  type MoveAssessmentKey,
} from "@/lib/move-classification";
import { useLiveClassification } from "@/lib/use-live-classification";
import { type OpeningEntry, type OpeningMatch, useOpeningBook } from "@/lib/use-opening-book";
import {
  getAvatarImageUrl,
  type AuthUser,
  useAuth,
} from "@/app/auth-provider";
import { backendRequest } from "@/lib/backend-api";
import { useBackendReview } from "@/lib/use-backend-review";
import type {
  AnalysisMovePayload,
  CreateAnalysisJobPayload,
  GameDetail,
} from "@/lib/domain-types";
import {
  buildReplayTimeline,
  parseSavedAnalysis,
  savedMoveIsCapture,
  type SavedAnalysisReport,
} from "@/lib/saved-analysis";

const STARTING_POSITION = new Chess().fen();
const BEST_MOVE_SUGGESTION_KEYS = new Set<MoveAssessmentKey>([
  "excellent",
  "okay",
  "inaccuracy",
  "mistake",
  "blunder",
]);

type InputType = "pgn" | "fen";
type ReviewDepthMode = "deep" | "fast";
type UiTheme = "dark" | "light";

const REVIEW_DEPTH_RANGES = {
  fast: { label: "Nhanh", max: 14 as const, min: 10 as const },
  deep: { label: "Sâu", max: 20 as const, min: 16 as const },
};

type AnalysisTimeline = {
  positions: string[];
  moves: string[];
  uciMoves: string[];
  capturedMoves: boolean[];
};

type VariationTimeline = AnalysisTimeline & {
  startIndex: number;
};

type ArchivedReview = {
  game: GameDetail;
  report: SavedAnalysisReport;
};

type BoardThemeId =
  | "forest"
  | "classic"
  | "walnut"
  | "ocean"
  | "ice"
  | "emerald"
  | "sand"
  | "slate"
  | "violet"
  | "charcoal"
  | "terracotta"
  | "meadow"
  | "marble"
  | "rose"
  | "midnight";

type PieceThemeId = "staunton" | "geometric" | "modern" | "royal" | "ivory" | "gold";

type BoardTheme = {
  id: BoardThemeId;
  name: string;
  light: string;
  dark: string;
};

type PieceTheme = {
  id: PieceThemeId;
  name: string;
  mode: "default" | "geometric" | "unicode";
  fontFamily?: string;
  filter?: string;
  scale?: string;
};

const BOARD_THEMES: BoardTheme[] = [
  { id: "forest", name: "Rừng", light: "#e9e1c7", dark: "#68805f" },
  { id: "classic", name: "Cổ điển", light: "#f0d9b5", dark: "#b58863" },
  { id: "walnut", name: "Gỗ óc chó", light: "#d8bd91", dark: "#7c5237" },
  { id: "ocean", name: "Đại dương", light: "#d7e4ee", dark: "#607d9b" },
  { id: "ice", name: "Băng", light: "#e7f2f5", dark: "#9cbcc8" },
  { id: "emerald", name: "Ngọc lục bảo", light: "#dfe8df", dark: "#3f765f" },
  { id: "sand", name: "Cát", light: "#f2dfbd", dark: "#c39063" },
  { id: "slate", name: "Đá phiến", light: "#d8dee7", dark: "#68788e" },
  { id: "violet", name: "Tím", light: "#e4ddf2", dark: "#806aa2" },
  { id: "charcoal", name: "Than chì", light: "#c3c5c4", dark: "#555a59" },
  { id: "terracotta", name: "Đất nung", light: "#f2d6bd", dark: "#b86f4d" },
  { id: "meadow", name: "Đồng cỏ", light: "#e8ebcf", dark: "#76a04f" },
  { id: "marble", name: "Cẩm thạch", light: "#ececea", dark: "#a3a5a3" },
  { id: "rose", name: "Hoa hồng", light: "#f5dde4", dark: "#b87082" },
  { id: "midnight", name: "Nửa đêm", light: "#c9d2dc", dark: "#34495f" },
];

const PIECE_THEMES: PieceTheme[] = [
  { id: "staunton", name: "Staunton", mode: "default" },
  { id: "geometric", name: "Hình học", mode: "geometric" },
  {
    id: "modern",
    name: "Hiện đại",
    mode: "unicode",
    fontFamily: '"DejaVu Sans", "Segoe UI Symbol", sans-serif',
  },
  {
    id: "royal",
    name: "Hoàng gia",
    mode: "unicode",
    fontFamily: 'Georgia, "DejaVu Serif", "Times New Roman", serif',
  },
  {
    id: "ivory",
    name: "Ngà",
    mode: "default",
    filter: "sepia(0.3) saturate(0.72) brightness(1.08)",
    scale: "scale(0.94)",
  },
  {
    id: "gold",
    name: "Vàng",
    mode: "default",
    filter: "sepia(0.7) saturate(1.7) hue-rotate(354deg)",
    scale: "scaleY(1.04) scaleX(0.96)",
  },
];

type AvatarPreset = {
  id: string;
  name: string;
  symbol?: string;
  className: string;
};

const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: "default",
    name: "Mặc định",
    className: "bg-gradient-to-br from-[#59635c] to-[#2f3732] text-[#eef2ee]",
  },
  {
    id: "knight-blue",
    name: "Mã xanh",
    symbol: "♞",
    className: "bg-gradient-to-br from-[#6ca8ff] to-[#3158b8] text-white",
  },
  {
    id: "queen-purple",
    name: "Hậu tím",
    symbol: "♛",
    className: "bg-gradient-to-br from-[#b887ff] to-[#6841a9] text-white",
  },
  {
    id: "rook-red",
    name: "Xe đỏ",
    symbol: "♜",
    className: "bg-gradient-to-br from-[#ff8a7f] to-[#b8423b] text-white",
  },
  {
    id: "bishop-gold",
    name: "Tượng vàng",
    symbol: "♝",
    className: "bg-gradient-to-br from-[#f5d16f] to-[#b67b1f] text-[#292014]",
  },
  {
    id: "pawn-green",
    name: "Tốt xanh",
    symbol: "♟",
    className: "bg-gradient-to-br from-[#83d693] to-[#347548] text-white",
  },
];

const UNICODE_PIECES: Record<string, string> = {
  wK: "♔",
  wQ: "♕",
  wR: "♖",
  wB: "♗",
  wN: "♘",
  wP: "♙",
  bK: "♚",
  bQ: "♛",
  bR: "♜",
  bB: "♝",
  bN: "♞",
  bP: "♟",
};

const PIECE_TYPES = ["K", "Q", "R", "B", "N", "P"] as const;

function GeometricPiece({ color, type }: { color: "w" | "b"; type: string }) {
  const fill = color === "w" ? "#f7f2df" : "#1a201c";
  const stroke = color === "w" ? "#202720" : "#080b09";
  const common = { fill, stroke, strokeWidth: 4, strokeLinejoin: "round" as const };

  return (
    <svg viewBox="0 0 100 100" className="size-full p-[6%] drop-shadow-md" aria-hidden="true">
      {type === "P" && (
        <>
          <circle cx="50" cy="28" r="15" {...common} />
          <path d="M36 47h28l8 27H28zM23 75h54v10H23z" {...common} />
        </>
      )}
      {type === "R" && (
        <path d="M24 18h12v10h10V18h10v10h10V18h12v25l-9 8 7 28H24l7-28-7-8zM20 79h60v10H20z" {...common} />
      )}
      {type === "N" && (
        <path d="M27 79c1-20 8-34 24-42L40 27l8-15 10 17c14 8 21 22 19 38l-17-9-7 21h25v10H21V79zM57 38l7 4" {...common} />
      )}
      {type === "B" && (
        <>
          <path d="M50 13c12 9 19 19 18 31-1 9-7 15-13 20H45c-7-6-13-12-13-21 0-11 7-21 18-30zM27 67h46l6 18H21z" {...common} />
          <path d="M55 25 43 46" fill="none" stroke={stroke} strokeWidth="4" />
        </>
      )}
      {type === "Q" && (
        <>
          <path d="m22 30 14 18 14-25 14 25 14-18-8 43H30zM24 74h52v12H24z" {...common} />
          <circle cx="20" cy="25" r="6" {...common} />
          <circle cx="50" cy="17" r="6" {...common} />
          <circle cx="80" cy="25" r="6" {...common} />
        </>
      )}
      {type === "K" && (
        <>
          <path d="M45 9h10v12h11v10H55v12H45V31H34V21h11z" {...common} />
          <path d="M33 44h34l7 31H26zM21 76h58v11H21z" {...common} />
        </>
      )}
    </svg>
  );
}

function createPieceSet(theme: PieceTheme): PieceRenderObject {
  if (theme.mode === "geometric") {
    return Object.fromEntries(
      ["w", "b"].flatMap((color) =>
        PIECE_TYPES.map((type) => [
          `${color}${type}`,
          () => <GeometricPiece color={color as "w" | "b"} type={type} />,
        ]),
      ),
    );
  }

  if (theme.mode === "unicode") {
    return Object.fromEntries(
      Object.entries(UNICODE_PIECES).map(([piece, symbol]) => [
        piece,
        () => (
          <span
            className="grid size-full select-none place-items-center leading-none drop-shadow-md"
            style={{
              color: piece[0] === "w" ? "#f7f3e4" : "#111713",
              fontFamily: theme.fontFamily,
              fontSize: "clamp(30px, 8.5vw, 74px)",
              WebkitTextStroke: piece[0] === "w" ? "1.2px #1b211c" : "0.7px #050805",
            }}
          >
            {symbol}
          </span>
        ),
      ]),
    );
  }

  if (!theme.filter && !theme.scale) return defaultPieces;

  return Object.fromEntries(
    Object.entries(defaultPieces).map(([piece, Piece]) => [
      piece,
      (props?: Parameters<typeof Piece>[0]) => (
        <span
          className="grid size-full place-items-center"
          style={{ filter: theme.filter, transform: theme.scale }}
        >
          <Piece {...props} />
        </span>
      ),
    ]),
  );
}

function describePosition(game: Chess) {
  if (game.isCheckmate()) {
    return `Chiếu hết — ${game.turn() === "w" ? "Đen" : "Trắng"} thắng`;
  }
  if (game.isDraw()) return "Ván cờ hòa";
  if (game.inCheck()) return `${game.turn() === "w" ? "Trắng" : "Đen"} đang bị chiếu`;
  return `Lượt của ${game.turn() === "w" ? "Trắng" : "Đen"}`;
}

function formatEvaluation(evaluation: StockfishVariation) {
  if (evaluation.mate !== null) {
    return `${evaluation.mate > 0 ? "+" : "−"}M${Math.abs(evaluation.mate)}`;
  }
  return `${evaluation.pawns >= 0 ? "+" : ""}${evaluation.pawns.toFixed(2)}`;
}

function variationToSan(fen: string, uciMoves: string[]) {
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

function canonicalMoveSan(san: string, afterFen: string) {
  try {
    if (new Chess(afterFen).isCheckmate()) {
      return `${san.replace(/[+#]+$/, "")}#`;
    }
  } catch {
    // FEN đã được chess.js xác thực trước khi hiển thị lịch sử.
  }

  return san;
}

function analysisMovePayload({
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

export default function AnalysisPage() {
  const { isLoading: authLoading, user } = useAuth();
  const [positions, setPositions] = useState<string[]>([STARTING_POSITION]);
  const [moves, setMoves] = useState<string[]>([]);
  const [uciMoves, setUciMoves] = useState<string[]>([]);
  const [capturedMoves, setCapturedMoves] = useState<boolean[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [message, setMessage] = useState("Trắng đi trước");
  const [inputType, setInputType] = useState<InputType>("pgn");
  const [gameText, setGameText] = useState("");
  const [loadedSourceText, setLoadedSourceText] = useState("");
  const [inputError, setInputError] = useState("");
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [reviewMode, setReviewMode] = useState<InputType | null>(null);
  const [reviewDepthMode, setReviewDepthMode] = useState<ReviewDepthMode>("deep");
  const [reviewSessionId, setReviewSessionId] = useState(0);
  const [reviewTimeline, setReviewTimeline] = useState<AnalysisTimeline | null>(null);
  const [variationTimeline, setVariationTimeline] = useState<VariationTimeline | null>(null);
  const [viewingVariation, setViewingVariation] = useState(false);
  const [archivedReview, setArchivedReview] = useState<ArchivedReview | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [playerNames, setPlayerNames] = useState({ black: "Đen", white: "Trắng" });
  const [gameResult, setGameResult] = useState("*");
  const [isSavingAnalysis, setIsSavingAnalysis] = useState(false);
  const [savedGameId, setSavedGameId] = useState<number | null>(null);
  const [saveFeedback, setSaveFeedback] = useState("");
  const [boardThemeId, setBoardThemeId] = useState<BoardThemeId>("forest");
  const [pieceThemeId, setPieceThemeId] = useState<PieceThemeId>("staunton");
  const [uiTheme, setUiTheme] = useState<UiTheme>("dark");
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moveSoundRef = useRef<HTMLAudioElement | null>(null);
  const captureSoundRef = useRef<HTMLAudioElement | null>(null);
  const loadedArchiveIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    const archiveId = new URLSearchParams(window.location.search).get("archive");
    if (!archiveId || loadedArchiveIdRef.current === archiveId) return;
    if (!user) {
      window.location.replace(`/login?returnTo=${encodeURIComponent(`/analysis?archive=${archiveId}`)}`);
      return;
    }

    loadedArchiveIdRef.current = archiveId;
    setArchiveLoading(true);
    setInputError("");
    void backendRequest<GameDetail>(`/api/games/${archiveId}`)
      .then((loadedGame) => {
        const report = parseSavedAnalysis(loadedGame.analysisJson);
        const replay = buildReplayTimeline(loadedGame, report.moves);
        const nextMoves = replay.moves.map((move) => move.san ?? "—");
        const nextUciMoves = replay.moves.map((move) => move.uci ?? "");
        const nextCapturedMoves = replay.moves.map(savedMoveIsCapture);
        const timeline: AnalysisTimeline = {
          capturedMoves: nextCapturedMoves,
          moves: nextMoves,
          positions: replay.positions,
          uciMoves: nextUciMoves,
        };

        setPositions(timeline.positions);
        setMoves(timeline.moves);
        setUciMoves(timeline.uciMoves);
        setCapturedMoves(timeline.capturedMoves);
        setCurrentIndex(Math.max(0, timeline.positions.length - 1));
        setReviewTimeline(timeline);
        setVariationTimeline(null);
        setViewingVariation(false);
        setArchivedReview({ game: loadedGame, report });
        setReviewMode(loadedGame.sourceType.toLowerCase() === "fen" ? "fen" : "pgn");
        setLoadedSourceText(loadedGame.pgn ?? loadedGame.initialFen);
        setInputType(loadedGame.sourceType.toLowerCase() === "fen" ? "fen" : "pgn");
        setGameText(loadedGame.pgn ?? loadedGame.initialFen);
        setPlayerNames({ black: loadedGame.blackPlayer, white: loadedGame.whitePlayer });
        setGameResult(loadedGame.result);
        setSavedGameId(loadedGame.id);
        setSaveFeedback("Đây là báo cáo đã lưu. Bạn có thể thử biến mà không làm thay đổi ván gốc.");
        setMessage(`Đã mở ${loadedGame.title} từ kho ván cờ`);
      })
      .catch((caughtError) => {
        loadedArchiveIdRef.current = null;
        setInputError(caughtError instanceof Error ? caughtError.message : "Không thể mở ván đã lưu.");
      })
      .finally(() => setArchiveLoading(false));
  }, [authLoading, user]);

  useEffect(() => {
    const savedBoard = window.localStorage.getItem("chess-analysis-board-theme");
    const savedPieces = window.localStorage.getItem("chess-analysis-piece-theme");
    const savedUiTheme = window.localStorage.getItem("chess-analysis-ui-theme");

    if (BOARD_THEMES.some((theme) => theme.id === savedBoard)) {
      setBoardThemeId(savedBoard as BoardThemeId);
    }
    if (PIECE_THEMES.some((theme) => theme.id === savedPieces)) {
      setPieceThemeId(savedPieces as PieceThemeId);
    }
    if (savedUiTheme === "light" || savedUiTheme === "dark") {
      setUiTheme(savedUiTheme);
    }
    setAppearanceLoaded(true);
  }, []);

  useEffect(() => {
    if (!appearanceLoaded) return;
    window.localStorage.setItem("chess-analysis-board-theme", boardThemeId);
    window.localStorage.setItem("chess-analysis-piece-theme", pieceThemeId);
    window.localStorage.setItem("chess-analysis-ui-theme", uiTheme);
    document.documentElement.style.colorScheme = uiTheme;
  }, [appearanceLoaded, boardThemeId, pieceThemeId, uiTheme]);

  const boardTheme = BOARD_THEMES.find((theme) => theme.id === boardThemeId) ?? BOARD_THEMES[0];
  const pieceTheme = PIECE_THEMES.find((theme) => theme.id === pieceThemeId) ?? PIECE_THEMES[0];
  const pieceSet = useMemo(() => createPieceSet(pieceTheme), [pieceTheme]);

  const currentFen = positions[currentIndex] ?? STARTING_POSITION;
  const currentGame = useMemo(() => new Chess(currentFen), [currentFen]);
  const isVariationActive = Boolean(reviewMode && viewingVariation && variationTimeline);
  const payloadTimeline = useMemo<AnalysisTimeline>(
    () => reviewTimeline ?? { capturedMoves, moves, positions, uciMoves },
    [capturedMoves, moves, positions, reviewTimeline, uciMoves],
  );
  const {
    bookError,
    currentMatch: openingMatch,
    inBook,
    isLoading: isOpeningBookLoading,
    matches: openingMatches,
    theoryPositions,
  } = useOpeningBook(positions, moves, currentIndex);

  const openingNames = useMemo(() => {
    let latestName: string | undefined;

    return openingMatches.map((entry, index) => {
      if (entry) latestName = entry.name;
      return theoryPositions[index] ? latestName : undefined;
    });
  }, [openingMatches, theoryPositions]);

  const reviewPayload = useMemo<CreateAnalysisJobPayload | null>(() => {
    if (!reviewMode || archivedReview || isOpeningBookLoading) return null;
    const finalMatch = [...openingMatches].reverse().find(Boolean) ?? null;
    const depthRange = REVIEW_DEPTH_RANGES[reviewDepthMode];
    return {
      moves: payloadTimeline.moves.map((san, index) => analysisMovePayload({
        afterFen: payloadTimeline.positions[index + 1],
        beforeFen: payloadTimeline.positions[index],
        san,
        theory: Boolean(theoryPositions[index + 1]),
        theoryName: openingNames[index + 1],
        uci: payloadTimeline.uciMoves[index],
      })),
      openingEco: finalMatch?.eco ?? null,
      openingName: finalMatch?.name ?? null,
      maxDepth: depthRange.max,
      minDepth: depthRange.min,
      positions: payloadTimeline.positions,
      sourceText: loadedSourceText || payloadTimeline.positions[0],
      sourceType: reviewMode.toUpperCase() as "PGN" | "FEN",
    };
  }, [
    archivedReview,
    isOpeningBookLoading,
    loadedSourceText,
    openingMatches,
    openingNames,
    payloadTimeline,
    reviewMode,
    reviewDepthMode,
    theoryPositions,
  ]);
  const { error: backendReviewError, job: backendReviewJob } = useBackendReview({
    enabled: Boolean(reviewMode && reviewPayload),
    payload: reviewPayload,
    sessionId: reviewSessionId,
  });

  const {
    completed,
    currentEvaluation: localCurrentEvaluation,
    engineError: localEngineError,
    engineReady: localEngineReady,
    evaluationByFen: localEvaluationByFen,
    total,
  } = useStockfish(
    positions,
    currentIndex,
    null,
    Boolean(reviewMode && !isVariationActive),
  );

  const backendEvaluationByFen = useMemo<Record<string, StockfishEvaluation>>(() => {
    const result: Record<string, StockfishEvaluation> = {};
    for (const evaluation of backendReviewJob?.result?.evaluations ?? []) {
      result[evaluation.fen] = { ...evaluation, source: "engine" };
    }
    const initialEvaluation = archivedReview?.report.initialEvaluation;
    if (initialEvaluation) {
      result[initialEvaluation.fen] = { ...initialEvaluation, source: "engine" };
    }
    for (const move of archivedReview?.report.moves ?? []) {
      if (!move.afterFen || move.evaluation == null) continue;
      const variations = move.variations ?? [];
      result[move.afterFen] = {
        depth: move.depth ?? archivedReview?.game.depth ?? 0,
        mate: move.mate ?? null,
        moves: variations[0]?.moves ?? (move.bestMove ? [move.bestMove] : []),
        pawns: Number(move.evaluation),
        source: "engine",
        variations,
      };
    }
    return result;
  }, [archivedReview, backendReviewJob?.result?.evaluations]);
  const evaluationByFen = useMemo(
    () => reviewMode
      ? { ...backendEvaluationByFen, ...(isVariationActive ? localEvaluationByFen : {}) }
      : localEvaluationByFen,
    [backendEvaluationByFen, isVariationActive, localEvaluationByFen, reviewMode],
  );
  const currentEvaluation = isVariationActive
    ? localCurrentEvaluation ?? backendEvaluationByFen[currentFen]
    : reviewMode ? backendEvaluationByFen[currentFen] : localCurrentEvaluation;

  // Đặc trưng của đường đi đang xem — giống hệt payload gửi cho Game Review,
  // nhưng cho dòng hiện tại kể cả khi đang ở biến thử.
  const liveMovePayloads = useMemo(
    () => moves.map((san, index) => analysisMovePayload({
      afterFen: positions[index + 1],
      beforeFen: positions[index],
      san,
      theory: Boolean(theoryPositions[index + 1]),
      theoryName: openingNames[index + 1],
      uci: uciMoves[index],
    })),
    [moves, openingNames, positions, theoryPositions, uciMoves],
  );
  const liveEvaluations = useMemo(
    () => positions.map((fen) => evaluationByFen[fen]),
    [evaluationByFen, positions],
  );
  const liveClassification = useLiveClassification({
    evaluations: liveEvaluations,
    moves: liveMovePayloads,
  });
  const reviewCompleted = archivedReview
    ? reviewTimeline?.positions.length ?? positions.length
    : backendReviewJob?.completedPositions ?? 0;
  const reviewTotal = archivedReview
    ? reviewTimeline?.positions.length ?? positions.length
    : backendReviewJob?.totalPositions ?? reviewTimeline?.positions.length ?? positions.length;
  const reviewComplete = Boolean(archivedReview) || backendReviewJob?.status === "COMPLETED";
  const engineError = isVariationActive
    ? localEngineError
    : reviewMode
      ? Boolean(backendReviewError || backendReviewJob?.status === "FAILED")
      : localEngineError;
  const engineReady = isVariationActive
    ? localEngineReady
    : archivedReview
      ? true
      : reviewMode ? !engineError && Boolean(backendReviewJob) : localEngineReady;
  const backendReviewActiveAnalysis: ActiveAnalysis | null = reviewMode && backendReviewJob?.status === "RUNNING"
    ? {
        currentDepth: backendReviewJob.result?.evaluations.at(-1)?.depth ?? 0,
        fen: reviewTimeline?.positions[backendReviewJob.currentPosition ?? 0] ?? positions[0],
        kind: "review",
        targetDepth: backendReviewJob.maxDepth,
      }
    : null;
  const legalTargets = useMemo(() => {
    if (!selectedSquare) return [];

    return currentGame
      .moves({ square: selectedSquare, verbose: true })
      .map((move) => move.to);
  }, [currentGame, selectedSquare]);

  const legalMoveStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    if (selectedSquare) {
      styles[selectedSquare] = {
        boxShadow: "inset 0 0 0 5px rgba(216, 180, 95, 0.92)",
      };
    }

    for (const square of legalTargets) {
      const occupied = currentGame.get(square);
      styles[square] = occupied
        ? { boxShadow: "inset 0 0 0 6px rgba(216, 180, 95, 0.78)" }
        : {
            backgroundImage:
              "radial-gradient(circle, rgba(23, 32, 25, 0.30) 0 18%, transparent 20%)",
          };
    }

    return styles;
  }, [currentGame, legalTargets, selectedSquare]);

  const moveAssessments = useMemo(
    () => {
      return moves.map((_, moveIndex) => {
        const belongsToOriginalLine = !isVariationActive ||
          moveIndex < (variationTimeline?.startIndex ?? 0);
        if (reviewMode && belongsToOriginalLine) {
          const archivedItem = archivedReview?.report.moves[moveIndex];
          const backendItem = backendReviewJob?.result?.moves[moveIndex];
          const key = (archivedItem?.assessment ?? backendItem?.assessmentKey) as
            | MoveAssessmentKey
            | undefined;
          if (!reviewComplete || !key) return null;
          const meta = MOVE_ASSESSMENT_META[key];
          if (!meta) return null;
          return {
            ...meta,
            detail: archivedItem?.detail ?? backendItem?.detail ?? archivedItem?.assessmentLabel ?? meta.label,
            key,
            loss: Number(archivedItem?.loss ?? backendItem?.loss ?? 0),
          };
        }

        // Nhãn cho phân tích thủ công do backend cấp qua /api/analysis/classify.
        // Frontend không còn giữ bản sao bộ luật, nên nhãn ở đây và nhãn trong
        // Game Review chắc chắn khớp nhau.
        return liveClassification.assessments[moveIndex] ?? null;
      });
    },
    [
      archivedReview,
      backendReviewJob?.result?.moves,
      isVariationActive,
      liveClassification.assessments,
      moves,
      reviewComplete,
      reviewMode,
      variationTimeline?.startIndex,
    ],
  );

  const accuracyStats = useMemo(() => {
    if (archivedReview) {
      return {
        black: archivedReview.game.blackAccuracy,
        blackCount: Math.floor((reviewTimeline?.moves.length ?? 0) / 2),
        white: archivedReview.game.whiteAccuracy,
        whiteCount: Math.ceil((reviewTimeline?.moves.length ?? 0) / 2),
      };
    }
    if (reviewMode) {
      return {
        black: backendReviewJob?.result?.blackAccuracy ?? null,
        blackCount: reviewComplete ? Math.floor((reviewTimeline?.moves.length ?? moves.length) / 2) : 0,
        white: backendReviewJob?.result?.whiteAccuracy ?? null,
        whiteCount: reviewComplete ? Math.ceil((reviewTimeline?.moves.length ?? moves.length) / 2) : 0,
      };
    }

    // Accuracy cũng tính ở backend cùng lúc với nhãn, nên công thức
    // 103.1668·e^(−0.04354·chanceLoss) − 3.1669 chỉ còn tồn tại đúng một chỗ.
    const labelled = liveClassification.assessments.filter(Boolean).length;
    return {
      black: liveClassification.blackAccuracy,
      blackCount: Math.floor(labelled / 2),
      white: liveClassification.whiteAccuracy,
      whiteCount: Math.ceil(labelled / 2),
    };
  }, [
    archivedReview,
    backendReviewJob?.result,
    liveClassification.assessments,
    liveClassification.blackAccuracy,
    liveClassification.whiteAccuracy,
    moves.length,
    reviewComplete,
    reviewMode,
    reviewTimeline?.moves.length,
  ]);
  const finalOpening = useMemo(
    () => [...openingMatches].reverse().find((entry): entry is OpeningEntry => Boolean(entry)) ?? null,
    [openingMatches],
  );
  const currentMoveAssessment = currentIndex > 0
    ? moveAssessments[currentIndex - 1] ?? null
    : null;
  const currentMoveTarget = currentIndex > 0
    ? uciMoves[currentIndex - 1]?.slice(2, 4)
    : undefined;
  const bestMoveSuggestion = useMemo(() => {
    if (
      currentIndex <= 0 ||
      !currentMoveAssessment ||
      !BEST_MOVE_SUGGESTION_KEYS.has(currentMoveAssessment.key)
    ) return null;

    const beforeFen = positions[currentIndex - 1];
    const archivedBestMove = !isVariationActive
      ? archivedReview?.report.moves[currentIndex - 1]?.bestMove
      : null;
    const bestUci = archivedBestMove ?? evaluationByFen[beforeFen]?.variations[0]?.moves[0];
    if (!beforeFen || !bestUci) return null;

    const [san] = variationToSan(beforeFen, [bestUci]);
    return san ? { san, uci: bestUci } : null;
  }, [archivedReview, currentIndex, currentMoveAssessment, evaluationByFen, isVariationActive, positions]);

  function playBoardSound(isCapture: boolean) {
    if (typeof window === "undefined") return;

    const soundRef = isCapture ? captureSoundRef : moveSoundRef;
    const soundPath = isCapture ? "/sounds/Capture.mp3" : "/sounds/Move.mp3";
    const sound = soundRef.current ?? new Audio(soundPath);
    soundRef.current = sound;
    sound.pause();
    sound.currentTime = 0;
    void sound.play().catch(() => undefined);
  }

  function attemptMove(from: Square, to: Square) {
    const nextGame = new Chess(currentFen);

    try {
      const move = nextGame.move({ from, to, promotion: "q" });
      const keptPositions = positions.slice(0, currentIndex + 1);
      const keptMoves = moves.slice(0, currentIndex);
      const keptUciMoves = uciMoves.slice(0, currentIndex);
      const keptCaptures = capturedMoves.slice(0, currentIndex);
      const isCapture = move.isCapture();
      const uciMove = `${move.from}${move.to}${move.promotion ?? ""}`;
      const nextTimeline: AnalysisTimeline = {
        capturedMoves: [...keptCaptures, isCapture],
        moves: [...keptMoves, canonicalMoveSan(move.san, nextGame.fen())],
        positions: [...keptPositions, nextGame.fen()],
        uciMoves: [...keptUciMoves, uciMove],
      };

      if (reviewMode && reviewTimeline) {
        setVariationTimeline({
          ...nextTimeline,
          startIndex: isVariationActive
            ? Math.min(variationTimeline?.startIndex ?? currentIndex, currentIndex)
            : currentIndex,
        });
        setViewingVariation(true);
      }
      setPositions(nextTimeline.positions);
      setMoves(nextTimeline.moves);
      setUciMoves(nextTimeline.uciMoves);
      setCapturedMoves(nextTimeline.capturedMoves);
      setCurrentIndex(currentIndex + 1);
      setMessage(reviewMode
        ? `${describePosition(nextGame)} · Ván gốc vẫn được giữ nguyên`
        : describePosition(nextGame));
      setInputError("");
      setSelectedSquare(null);
      playBoardSound(isCapture);
      return true;
    } catch {
      setMessage("Nước đi không hợp lệ");
      return false;
    }
  }

  function handleSquareClick(square: string) {
    const clickedSquare = square as Square;

    if (selectedSquare && legalTargets.includes(clickedSquare)) {
      attemptMove(selectedSquare, clickedSquare);
      return;
    }

    const piece = currentGame.get(clickedSquare);
    if (piece?.color === currentGame.turn()) {
      setSelectedSquare(selectedSquare === clickedSquare ? null : clickedSquare);
    } else {
      setSelectedSquare(null);
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps -- chessboard callbacks read the current position and are intentionally rebuilt from the listed state */
  const boardOptions = useMemo(
    () => ({
      id: "main-chessboard",
      position: currentFen,
      pieces: pieceSet,
      squareStyles: legalMoveStyles,
      boardStyle: {
        borderRadius: "10px",
        boxShadow: "0 24px 60px rgba(15, 23, 18, 0.28)",
      },
      darkSquareStyle: { backgroundColor: boardTheme.dark },
      lightSquareStyle: { backgroundColor: boardTheme.light },
      darkSquareNotationStyle: { color: boardTheme.light, fontWeight: 700 },
      lightSquareNotationStyle: { color: boardTheme.dark, fontWeight: 700 },
      dropSquareStyle: {
        boxShadow: "inset 0 0 0 5px rgba(255, 210, 92, 0.72)",
      },
      animationDurationInMs: 180,
      squareRenderer: ({ square, children }: { square: string; children?: React.ReactNode }) => {
        const assessment = square === currentMoveTarget ? currentMoveAssessment : null;

        return (
          <div
            className="relative size-full"
            style={legalMoveStyles[square]}
          >
            {children}
            {assessment && (
              <span className="pointer-events-none absolute -top-2 right-0 z-30">
                <MoveAssessmentBadge assessment={assessment} size="board" />
              </span>
            )}
          </div>
        );
      },
      canDragPiece: ({ piece }: { piece: { pieceType: string } }) =>
        piece.pieceType[0]?.toLowerCase() === currentGame.turn(),
      onSquareClick: ({ square }: { square: string }) => handleSquareClick(square),
      onPieceDrag: () => setSelectedSquare(null),
      onPieceDrop: ({
        sourceSquare,
        targetSquare,
      }: {
        sourceSquare: string;
        targetSquare: string | null;
      }) =>
        targetSquare
          ? attemptMove(sourceSquare as Square, targetSquare as Square)
          : false,
    }),
    [
      currentFen,
      currentGame,
      currentMoveAssessment,
      currentMoveTarget,
      boardTheme,
      legalMoveStyles,
      legalTargets,
      pieceSet,
      selectedSquare,
    ],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  function resetGame() {
    setPositions([STARTING_POSITION]);
    setMoves([]);
    setUciMoves([]);
    setCapturedMoves([]);
    setCurrentIndex(0);
    setMessage("Đã làm mới — sẵn sàng dán ván cờ mới");
    setInputType("pgn");
    setGameText("");
    setLoadedSourceText("");
    setInputError("");
    setSelectedSquare(null);
    setReviewMode(null);
    setReviewTimeline(null);
    setVariationTimeline(null);
    setViewingVariation(false);
    setArchivedReview(null);
    setPlayerNames({ black: "Đen", white: "Trắng" });
    setGameResult("*");
    setSavedGameId(null);
    setSaveFeedback("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function goToPosition(index: number) {
    const safeIndex = Math.max(0, Math.min(index, positions.length - 1));
    if (safeIndex === currentIndex) return;

    const traversedMove = safeIndex > currentIndex ? safeIndex - 1 : currentIndex - 1;
    playBoardSound(capturedMoves[traversedMove] ?? false);
    setCurrentIndex(safeIndex);
    setSelectedSquare(null);

    if (safeIndex === 0) {
      setMessage(moves.length ? "Vị trí bắt đầu của ván" : "Trắng đi trước");
    } else {
      setMessage(describePosition(new Chess(positions[safeIndex])));
    }
  }

  function showOriginalLine() {
    if (!reviewTimeline) return;
    setPositions(reviewTimeline.positions);
    setMoves(reviewTimeline.moves);
    setUciMoves(reviewTimeline.uciMoves);
    setCapturedMoves(reviewTimeline.capturedMoves);
    setCurrentIndex(Math.min(
      variationTimeline?.startIndex ?? reviewTimeline.positions.length - 1,
      reviewTimeline.positions.length - 1,
    ));
    setViewingVariation(false);
    setSelectedSquare(null);
    setMessage("Đang xem ván gốc đã phân tích — biến thử vẫn được lưu riêng");
  }

  function showVariationLine() {
    if (!variationTimeline) return;
    setPositions(variationTimeline.positions);
    setMoves(variationTimeline.moves);
    setUciMoves(variationTimeline.uciMoves);
    setCapturedMoves(variationTimeline.capturedMoves);
    setCurrentIndex(variationTimeline.positions.length - 1);
    setViewingVariation(true);
    setSelectedSquare(null);
    setMessage("Đang xem biến thử — Stockfish phân tích các nước mới ở depth 16");
  }

  function playBestMoveSuggestion() {
    if (!bestMoveSuggestion || currentIndex <= 0) return;

    const replacedMoveIndex = currentIndex - 1;
    const beforeFen = positions[replacedMoveIndex];
    if (!beforeFen) return;

    try {
      const nextGame = new Chess(beforeFen);
      const move = nextGame.move({
        from: bestMoveSuggestion.uci.slice(0, 2) as Square,
        promotion: (bestMoveSuggestion.uci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
        to: bestMoveSuggestion.uci.slice(2, 4) as Square,
      });
      const san = canonicalMoveSan(move.san, nextGame.fen());
      const replacedMove = moves[replacedMoveIndex];

      const nextTimeline: AnalysisTimeline = {
        positions: [...positions.slice(0, currentIndex), nextGame.fen()],
        moves: [...moves.slice(0, replacedMoveIndex), san],
        uciMoves: [
          ...uciMoves.slice(0, replacedMoveIndex),
          `${move.from}${move.to}${move.promotion ?? ""}`,
        ],
        capturedMoves: [
          ...capturedMoves.slice(0, replacedMoveIndex),
          move.isCapture(),
        ],
      };
      if (reviewMode && reviewTimeline) {
        setVariationTimeline({
          ...nextTimeline,
          startIndex: isVariationActive
            ? Math.min(variationTimeline?.startIndex ?? replacedMoveIndex, replacedMoveIndex)
            : replacedMoveIndex,
        });
        setViewingVariation(true);
      }
      setPositions(nextTimeline.positions);
      setMoves(nextTimeline.moves);
      setUciMoves(nextTimeline.uciMoves);
      setCapturedMoves(nextTimeline.capturedMoves);
      setCurrentIndex(replacedMoveIndex + 1);
      setSelectedSquare(null);
      setInputError("");
      setMessage(`Đã thay ${replacedMove} bằng nước đi tốt nhất ${san}`);
      playBoardSound(move.isCapture());
    } catch {
      setMessage("Không thể triển khai nước đi tốt nhất ở vị trí này");
    }
  }

  function loadGame() {
    setInputError("");
    setSelectedSquare(null);
    setSavedGameId(null);
    setSaveFeedback("");
    setArchivedReview(null);
    setVariationTimeline(null);
    setViewingVariation(false);

    if (!gameText.trim()) {
      setInputError(inputType === "pgn" ? "Hãy dán nội dung PGN." : "Hãy dán một FEN.");
      return;
    }

    try {
      if (inputType === "fen") {
        const fenGame = new Chess(gameText.trim());
        setLoadedSourceText(gameText.trim());
        setPositions([fenGame.fen()]);
        setMoves([]);
        setUciMoves([]);
        setCapturedMoves([]);
        setReviewTimeline({
          capturedMoves: [],
          moves: [],
          positions: [fenGame.fen()],
          uciMoves: [],
        });
        setCurrentIndex(0);
        setReviewSessionId((session) => session + 1);
        setReviewMode("fen");
        setPlayerNames({ black: "Đen", white: "Trắng" });
        setGameResult(
          fenGame.isCheckmate()
            ? fenGame.turn() === "w" ? "0-1" : "1-0"
            : fenGame.isDraw() ? "1/2-1/2" : "*",
        );
        setMessage(`Stockfish đang đánh giá FEN ở chế độ ${REVIEW_DEPTH_RANGES[reviewDepthMode].label.toLowerCase()}`);
        return;
      }

      const parsedGame = new Chess();
      parsedGame.loadPgn(gameText.trim());
      setLoadedSourceText(gameText.trim());
      const headers = parsedGame.getHeaders();
      const parsedMoves = parsedGame.history({ verbose: true });
      const nextPositions = parsedMoves.length
        ? [parsedMoves[0].before, ...parsedMoves.map((move) => move.after)]
        : [parsedGame.fen()];

      setPositions(nextPositions);
      setMoves(parsedMoves.map((move) => canonicalMoveSan(move.san, move.after)));
      setUciMoves(
        parsedMoves.map((move) => `${move.from}${move.to}${move.promotion ?? ""}`),
      );
      setCapturedMoves(parsedMoves.map((move) => move.isCapture()));
      setReviewTimeline({
        capturedMoves: parsedMoves.map((move) => move.isCapture()),
        moves: parsedMoves.map((move) => canonicalMoveSan(move.san, move.after)),
        positions: nextPositions,
        uciMoves: parsedMoves.map((move) => `${move.from}${move.to}${move.promotion ?? ""}`),
      });
      setCurrentIndex(nextPositions.length - 1);
      setReviewSessionId((session) => session + 1);
      setReviewMode("pgn");
      setPlayerNames({
        black: headers.Black?.trim() || "Đen",
        white: headers.White?.trim() || "Trắng",
      });
      setGameResult(headers.Result?.trim() || (parsedGame.isCheckmate()
        ? parsedGame.turn() === "w" ? "0-1" : "1-0"
        : parsedGame.isDraw() ? "1/2-1/2" : "*"));
      setMessage(
        parsedMoves.length
          ? `Đã nạp ${parsedMoves.length} nước — đang review ${REVIEW_DEPTH_RANGES[reviewDepthMode].label.toLowerCase()} depth ${REVIEW_DEPTH_RANGES[reviewDepthMode].min}–${REVIEW_DEPTH_RANGES[reviewDepthMode].max}`
          : "PGN không có nước đi nào",
      );
    } catch {
      setInputError(
        inputType === "pgn"
          ? "PGN không hợp lệ. Hãy kiểm tra và thử lại."
          : "FEN không hợp lệ. Hãy kiểm tra và thử lại.",
      );
    }
  }

  async function saveAnalysisToArchive() {
    if (isSavingAnalysis) return;
    if (!reviewMode || !reviewComplete) {
      setSaveFeedback("Game Review chưa hoàn tất nên chưa thể lưu báo cáo.");
      return;
    }
    if (!user) {
      window.location.assign("/login?returnTo=/analysis");
      return;
    }

    setIsSavingAnalysis(true);
    setSaveFeedback("Đang gửi báo cáo tới backend và ghi vào MySQL...");
    try {
      const timelineToSave = reviewTimeline ?? { capturedMoves, moves, positions, uciMoves };
      const depth = Object.values(backendEvaluationByFen).reduce(
        (highest, evaluation) => Math.max(highest, evaluation.depth),
        0,
      );
      const analysisJson = JSON.stringify({
        engine: "Stockfish 18",
        initialEvaluation: backendEvaluationByFen[timelineToSave.positions[0]] ?? null,
        reviewMode,
        moves: timelineToSave.moves.map((san, index) => {
          const reviewed = backendReviewJob?.result?.moves[index];
          const evaluation = backendEvaluationByFen[timelineToSave.positions[index + 1]];
          const assessmentKey = reviewed?.assessmentKey ?? null;
          return {
          index: index + 1,
          san,
          uci: timelineToSave.uciMoves[index],
          beforeFen: timelineToSave.positions[index],
          afterFen: timelineToSave.positions[index + 1],
          capture: timelineToSave.capturedMoves[index],
          assessment: assessmentKey,
          assessmentLabel: assessmentKey
            ? MOVE_ASSESSMENT_META[assessmentKey as MoveAssessmentKey]?.label ?? assessmentKey
            : null,
          detail: reviewed?.detail ?? null,
          loss: reviewed?.loss ?? null,
          accuracy: reviewed?.accuracy ?? null,
          evaluation: evaluation?.pawns ?? null,
          depth: evaluation?.depth ?? null,
          mate: evaluation?.mate ?? null,
          bestMove: reviewed?.bestMove ?? null,
          variations: evaluation?.variations ?? [],
        };
        }),
      });
      const result = await backendRequest<{ id: number }>("/api/games", {
        method: "POST",
        body: JSON.stringify({
          title: `${playerNames.white} vs ${playerNames.black}`,
          whitePlayer: playerNames.white,
          blackPlayer: playerNames.black,
          result: gameResult,
          sourceType: reviewMode.toUpperCase(),
          pgn: reviewMode === "pgn" ? loadedSourceText : null,
          initialFen: timelineToSave.positions[0],
          finalFen: timelineToSave.positions[timelineToSave.positions.length - 1],
          openingEco: reviewPayload?.openingEco ?? finalOpening?.eco ?? null,
          openingName: reviewPayload?.openingName ?? finalOpening?.name ?? null,
          whiteAccuracy: accuracyStats.white,
          blackAccuracy: accuracyStats.black,
          depth: depth || 20,
          moveCount: timelineToSave.moves.length,
          analysisJson,
          // Backend đọc lại tác vụ này để ghi bảng analyzed_moves; không có nó
          // thì ván vẫn lưu được, chỉ là không vào tập dữ liệu phân tích.
          analysisJobId: backendReviewJob?.publicId ?? null,
        }),
      });
      setSavedGameId(result.id);
      setSaveFeedback("Đã lưu báo cáo vào kho ván cờ của bạn.");
      window.location.assign(`/archive?saved=${result.id}`);
    } catch (caughtError) {
      setSaveFeedback(caughtError instanceof Error ? caughtError.message : "Không thể lưu báo cáo.");
    } finally {
      setIsSavingAnalysis(false);
    }
  }

  async function handleFile(file?: File) {
    if (!file) return;

    try {
      const content = await file.text();
      setInputType("pgn");
      setGameText(content);
      setInputError("");
      setMessage(`Đã chọn tệp ${file.name}`);
    } catch {
      setInputError("Không thể đọc tệp PGN này.");
    }
  }

  const currentMove = currentIndex > 0 ? moves[currentIndex - 1] : null;
  const moveAssessment = currentMoveAssessment;

  return (
    <main
      className="chess-app min-h-screen bg-[#172019] text-[#f7f2e3] transition-colors duration-300"
      data-ui-theme={uiTheme}
    >
      <header className="px-5 pt-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl justify-end">
          <div className="flex items-center gap-2">
            <AppearanceSettings
              boardThemeId={boardThemeId}
              onBoardThemeChange={setBoardThemeId}
              onPieceThemeChange={setPieceThemeId}
              onUiThemeChange={setUiTheme}
              pieceThemeId={pieceThemeId}
              uiTheme={uiTheme}
            />
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-start gap-6 px-3 py-6 sm:px-4 lg:grid-cols-[minmax(0,760px)_380px] lg:px-8 lg:py-10">
        <div className="mx-auto grid w-full max-w-[760px] grid-cols-[34px_minmax(0,1fr)] gap-2 rounded-2xl border border-white/10 bg-[#263128] p-2 shadow-2xl shadow-black/30 sm:grid-cols-[42px_minmax(0,1fr)] sm:p-3">
          <EvaluationBar
            evaluation={currentEvaluation}
            winner={
              currentGame.isCheckmate()
                ? currentGame.turn() === "w" ? "black" : "white"
                : null
            }
            isLoading={!currentEvaluation}
          />
          <Chessboard options={boardOptions} />
        </div>

        <aside className="mx-auto w-full max-w-[720px] overflow-hidden rounded-2xl border border-white/10 bg-[#202623] shadow-2xl shadow-black/25 lg:sticky lg:top-4 lg:flex lg:h-[min(710px,calc(100dvh-32px),calc(100vw-518px))] lg:max-w-none lg:flex-col">
          <div className="shrink-0 bg-[#4b7fe8] px-5 py-4">
            <h1 className="text-center text-2xl font-semibold tracking-tight">Game Analysis</h1>
          </div>

          <div className="analysis-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-scroll lg:overscroll-contain">
          {archiveLoading && (
            <div className="flex items-center gap-2 border-b border-white/10 bg-[#d8b45f]/10 px-4 py-3 text-sm text-[#f0d994]">
              <LoaderCircle className="size-4 animate-spin" /> Đang mở báo cáo từ kho ván cờ…
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#292f2c] px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={`size-2.5 rounded-full ${engineError ? "bg-[#ef6461]" : engineReady ? "bg-[#72cf86]" : "animate-pulse bg-[#d8b45f]"}`}
              />
              <span className="font-medium">
                Stockfish 18 · {isVariationActive
                  ? `Biến thử depth ${INTERACTIVE_DEPTH}`
                  : archivedReview
                    ? "Báo cáo đã lưu"
                    : reviewMode
                      ? "Game Review backend"
                  : `Nước hiện tại depth ${INTERACTIVE_DEPTH}`}
              </span>
            </div>
            <span className="text-[#aeb8b1]">
              {engineError
                  ? "Lỗi engine"
                  : reviewMode
                    ? `${reviewCompleted}/${reviewTotal} review`
                    : `${completed}/${total} vị trí`}
            </span>
          </div>

          {reviewMode && (
            <>
              {reviewTimeline && (
                <section className="border-b border-white/10 bg-[#171c1a] p-3">
                  <div className="rounded-xl border border-[#78a7ff]/20 bg-[#78a7ff]/8 p-3">
                    <div className="flex items-start gap-2">
                      <GitBranch className="mt-0.5 size-4 shrink-0 text-[#78a7ff]" />
                      <div>
                        <p className="text-sm font-semibold text-white">Ván gốc và biến thử được giữ riêng</p>
                        <p className="mt-1 text-xs leading-5 text-[#aab6ae]">Đi một nước khác sẽ tạo biến mới; báo cáo, độ chính xác và toàn bộ nước của ván gốc không bị xóa.</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={showOriginalLine} disabled={!viewingVariation} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${!viewingVariation ? "bg-[#4b7fe8] text-white" : "bg-white/7 text-[#c5cec7] hover:bg-white/12"}`}><History className="size-4" /> Ván gốc ({reviewTimeline.moves.length})</button>
                      <button type="button" onClick={showVariationLine} disabled={!variationTimeline || viewingVariation} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${viewingVariation ? "bg-[#72cf86] text-[#112016]" : "bg-white/7 text-[#c5cec7] hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-45"}`}><GitBranch className="size-4" /> {variationTimeline ? `Biến thử (${variationTimeline.moves.length})` : "Chưa có biến thử"}</button>
                    </div>
                  </div>
                </section>
              )}
              <GameReviewCard
                accuracy={accuracyStats}
                activeAnalysis={backendReviewActiveAnalysis}
                engineError={Boolean(backendReviewError || backendReviewJob?.status === "FAILED")}
                errorMessage={backendReviewError || backendReviewJob?.errorMessage || ""}
                moveCount={reviewTimeline?.moves.length ?? moves.length}
                maxDepth={backendReviewJob?.maxDepth ?? REVIEW_DEPTH_RANGES[reviewDepthMode].max}
                minDepth={backendReviewJob?.minDepth ?? REVIEW_DEPTH_RANGES[reviewDepthMode].min}
                playerNames={playerNames}
                positions={reviewTimeline?.positions ?? positions}
                reviewComplete={reviewComplete}
                reviewCompleted={reviewCompleted}
                reviewMode={reviewMode}
                reviewTotal={reviewTotal}
              />
              {reviewComplete && (
                <section className="border-b border-white/10 bg-[#202623] px-3 py-3">
                  <div className="rounded-xl border border-white/8 bg-[#2b312e] p-3">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d8b45f]/12 text-[#d8b45f]"><Archive className="size-5" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white">Lưu báo cáo phân tích</p>
                        <p className="mt-1 text-xs leading-5 text-[#96a098]">Backend lưu PGN/FEN, khai cuộc, độ chính xác và nhãn từng nước theo tài khoản.</p>
                      </div>
                    </div>
                    {savedGameId ? (
                      <a href={`/archive/${savedGameId}`} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#72cf86] px-3 py-2.5 text-sm font-bold text-[#112016]">Mở ván vừa lưu <ChevronRight className="size-4" /></a>
                    ) : (
                      <button type="button" onClick={() => void saveAnalysisToArchive()} disabled={isSavingAnalysis} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#d8b45f] px-3 py-2.5 text-sm font-bold text-[#172019] hover:bg-[#e3c87f] disabled:cursor-wait disabled:opacity-60">
                        {isSavingAnalysis ? <LoaderCircle className="size-4 animate-spin" /> : user ? <Save className="size-4" /> : <LogIn className="size-4" />}
                        {isSavingAnalysis ? "Đang lưu..." : user ? "Lưu vào kho ván cờ" : "Đăng nhập để lưu"}
                      </button>
                    )}
                    {saveFeedback && <p className="mt-2 text-xs leading-5 text-[#b7c2ba]">{saveFeedback}</p>}
                  </div>
                </section>
              )}
            </>
          )}

          <EngineLines
            fen={currentFen}
            evaluation={currentEvaluation}
            targetDepth={reviewMode ? undefined : INTERACTIVE_DEPTH}
          />

          <OpeningCard
            bookError={bookError}
            currentIndex={currentIndex}
            inBook={inBook}
            isLoading={isOpeningBookLoading}
            match={openingMatch}
            moves={moves}
          />

          {moveAssessment && (
            <div className="border-b border-white/10 bg-[#171c1a] p-3">
              <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${moveAssessment.className}`}>
                <div className="flex items-center gap-2">
                  <MoveAssessmentBadge assessment={moveAssessment} size="small" />
                  <span>{currentMove ? `${currentMove} — ` : ""}{moveAssessment.label}</span>
                </div>
                <p className="mt-1 font-normal opacity-80">
                  {moveAssessment.detail}
                  {moveAssessment.loss > 0.01
                    ? ` · Mất ${moveAssessment.loss.toFixed(2)} điểm lợi thế`
                    : ""}
                </p>
                {bestMoveSuggestion && (
                  <button
                    type="button"
                    onClick={playBestMoveSuggestion}
                    className="mt-2 block text-left text-sm font-semibold text-[#55e66b] transition hover:text-[#82f092] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55e66b]"
                    title="Quay lại và triển khai nước đi tốt nhất"
                  >
                    Nước đi tốt nhất là{" "}
                    <span className="underline decoration-2 underline-offset-2">
                      {bestMoveSuggestion.san}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          <MoveHistory
            assessments={moveAssessments}
            currentIndex={currentIndex}
            moves={moves}
            onReset={resetGame}
            onSelect={goToPosition}
            showAssessmentSummary={!reviewMode || reviewComplete}
          />

          <div className="space-y-3 p-3">
            <div className="grid grid-cols-[1fr_142px] overflow-hidden rounded-xl border border-white/10 bg-[#333a37]">
              <div className="flex items-center px-4 text-sm font-medium text-[#dce1db]">
                Nạp ván cờ từ
              </div>
              <Select value={inputType} onValueChange={(value) => setInputType(value as InputType)}>
                <SelectTrigger className="h-12 w-full rounded-none border-y-0 border-r-0 border-l border-white/10 bg-[#3e4542] px-4 text-base text-white shadow-none focus-visible:ring-[#4b7fe8]/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#3e4542] text-white">
                  <SelectItem value="pgn" className="focus:bg-[#4b7fe8] focus:text-white">PGN</SelectItem>
                  <SelectItem value="fen" className="focus:bg-[#4b7fe8] focus:text-white">FEN</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#2b312e] p-2" aria-label="Chọn độ sâu Game Review">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Chế độ phân tích">
                {(Object.keys(REVIEW_DEPTH_RANGES) as ReviewDepthMode[]).map((mode) => {
                  const range = REVIEW_DEPTH_RANGES[mode];
                  const selected = reviewDepthMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setReviewDepthMode(mode)}
                      className={`rounded-lg px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4b7fe8] ${selected ? "bg-[#4b7fe8] text-white shadow-md" : "bg-white/5 text-[#c3ccc5] hover:bg-white/10"}`}
                    >
                      <span className="block text-sm font-bold">{range.label} · depth {range.min}–{range.max}</span>
                      <span className={`mt-0.5 block text-[10px] ${selected ? "text-[#dbe8ff]" : "text-[#89958d]"}`}>
                        {mode === "fast" ? "Ưu tiên có kết quả sớm" : "Nhãn ổn định và chính xác hơn"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <textarea
              value={gameText}
              onChange={(event) => setGameText(event.target.value)}
              placeholder={inputType === "pgn" ? "Dán PGN vào đây..." : "Dán FEN vào đây..."}
              className="min-h-32 w-full resize-y rounded-xl border border-white/10 bg-[#2b312e] p-4 text-sm leading-6 text-white outline-none transition placeholder:text-[#7f8982] focus:border-[#4b7fe8] focus:ring-2 focus:ring-[#4b7fe8]/25"
              aria-label={inputType === "pgn" ? "Nội dung PGN" : "Nội dung FEN"}
            />

            {inputError && (
              <p className="rounded-lg bg-[#ef6461]/12 px-3 py-2 text-sm text-[#ffaaa8]" role="alert">
                {inputError}
              </p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pgn,text/plain"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#3a413e] px-3 py-3 text-sm font-medium transition hover:bg-[#454d49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4b7fe8]"
              >
                <Upload className="size-4" />
                Tệp PGN
              </button>

              <button
                type="button"
                onClick={loadGame}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#303b51] px-3 py-3 font-semibold text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.16)] transition hover:bg-[#3a4863] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4b7fe8]"
              >
                <ScanSearch className="size-5" />
                Phân tích · {REVIEW_DEPTH_RANGES[reviewDepthMode].label}
              </button>
            </div>
          </div>

          <div className="border-t border-white/10 px-4 py-3">
            <p className="text-sm text-[#aeb8b1]" aria-live="polite">{message}</p>
            <p className="mt-1 text-xs text-[#758078]">
              Bấm vào một quân để xem các nước hợp lệ.
            </p>
          </div>
          </div>

          <div className="shrink-0 border-t border-white/10 bg-[#171c1a] p-3 shadow-[0_-10px_24px_rgba(0,0,0,0.22)]">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <p className="text-sm text-[#aeb8b1]" aria-live="polite">
                {currentIndex}/{moves.length} nước
              </p>
              <p className="truncate text-sm font-semibold text-[#d8b45f]">
                {currentMove ? `Nước vừa đi: ${currentMove}` : "Vị trí ban đầu"}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <NavButton label="Về đầu ván" disabled={currentIndex === 0} onClick={() => goToPosition(0)}>
                <ChevronFirst />
              </NavButton>
              <NavButton label="Lùi một nước" disabled={currentIndex === 0} onClick={() => goToPosition(currentIndex - 1)}>
                <ChevronLeft />
              </NavButton>
              <NavButton label="Tiến một nước" disabled={currentIndex >= positions.length - 1} onClick={() => goToPosition(currentIndex + 1)}>
                <ChevronRight />
              </NavButton>
              <NavButton label="Tới cuối ván" disabled={currentIndex >= positions.length - 1} onClick={() => goToPosition(positions.length - 1)}>
                <ChevronLast />
              </NavButton>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function UserAvatar({
  className = "size-10",
  user,
}: {
  className?: string;
  user: AuthUser;
}) {
  const preset = AVATAR_PRESETS.find((item) => item.id === user.avatarPreset) ?? AVATAR_PRESETS[0];

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/20 shadow-md ${className} ${preset.className}`}
      aria-hidden="true"
    >
      {user.hasCustomAvatar ? (
        // The authenticated image is served by Spring Boot and requires credentials.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={user.avatarVersion}
          src={getAvatarImageUrl(user)}
          alt=""
          crossOrigin="use-credentials"
          className="size-full object-cover"
        />
      ) : preset.symbol ? (
        <span className="text-[1.65em] leading-none">{preset.symbol}</span>
      ) : (
        <UserRound className="size-[58%]" />
      )}
    </span>
  );
}

function AppearanceSettings({
  boardThemeId,
  onBoardThemeChange,
  onPieceThemeChange,
  onUiThemeChange,
  pieceThemeId,
  uiTheme,
}: {
  boardThemeId: BoardThemeId;
  onBoardThemeChange: (theme: BoardThemeId) => void;
  onPieceThemeChange: (theme: PieceThemeId) => void;
  onUiThemeChange: (theme: UiTheme) => void;
  pieceThemeId: PieceThemeId;
  uiTheme: UiTheme;
}) {
  const {
    isLoading: isUserLoading,
    logout,
    updateAvatarPreset,
    uploadAvatar,
    user,
  } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState("");
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  async function chooseAvatarPreset(preset: string) {
    setAvatarFeedback("");
    setIsAvatarSaving(true);
    try {
      await updateAvatarPreset(preset);
      setAvatarFeedback("Đã cập nhật ảnh đại diện.");
    } catch (error) {
      setAvatarFeedback(error instanceof Error ? error.message : "Không thể cập nhật ảnh đại diện.");
    } finally {
      setIsAvatarSaving(false);
    }
  }

  async function chooseAvatarFile(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setAvatarFeedback("Ảnh đại diện không được lớn hơn 2 MB.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setAvatarFeedback("Chỉ hỗ trợ ảnh PNG, JPG hoặc WEBP.");
      return;
    }

    setAvatarFeedback("");
    setIsAvatarSaving(true);
    try {
      await uploadAvatar(file);
      setAvatarFeedback("Đã tải ảnh đại diện lên.");
    } catch (error) {
      setAvatarFeedback(error instanceof Error ? error.message : "Không thể tải ảnh đại diện lên.");
    } finally {
      setIsAvatarSaving(false);
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = "";
    }
  }

  return (
    <Sheet
      open={isSettingsOpen}
      onOpenChange={(open) => {
        setIsSettingsOpen(open);
        if (!open) {
          setIsAppearanceOpen(false);
          setIsThemeOpen(false);
        }
      }}
    >
      <SheetTrigger asChild>
        {user ? (
          <button
            type="button"
            className="group relative grid size-11 place-items-center rounded-full transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b45f]"
            aria-label={`Mở tài khoản và cài đặt của ${user.username}`}
            title={`${user.username} · Cài đặt`}
          >
            <UserAvatar user={user} className="size-11" />
            <span className="absolute bottom-0 right-0 grid size-4 place-items-center rounded-full border border-[#172019] bg-[#d8b45f] text-[#172019] shadow-sm transition group-hover:bg-[#f0cc75]">
              <Settings className="size-2.5 stroke-[2.7]" />
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full border border-white/15 text-[#e8eadf] transition hover:border-[#d8b45f]/70 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b45f]"
            aria-label="Mở cài đặt"
            title="Cài đặt"
          >
            <Settings className="size-5" />
          </button>
        )}
      </SheetTrigger>

      <SheetContent
        side="right"
        data-ui-theme={uiTheme}
        className="settings-panel w-[min(92vw,390px)] gap-0 border-l border-white/12 bg-[#202420] p-0 text-[#f5f2e8] sm:max-w-[390px]"
      >
        <SheetHeader className="border-b border-white/10 bg-[#181c19] px-5 py-5">
          <SheetTitle className="pr-8 text-xl text-white">
            {user ? "Tài khoản và cài đặt" : "Cài đặt"}
          </SheetTitle>
          <SheetDescription className="text-[#9da69f]">
            {user ? `Đang đăng nhập với ${user.username}.` : "Cá nhân hóa giao diện bàn cờ của bạn."}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#727a73_#202420]">
          {user && (
            <section className="border-b border-white/10 px-4 py-5" aria-labelledby="avatar-settings-title">
              <div className="mb-4 flex items-center gap-3">
                <UserAvatar user={user} className="size-14" />
                <div className="min-w-0">
                  <h2 id="avatar-settings-title" className="font-semibold text-white">Thay đổi ảnh đại diện</h2>
                  <p className="mt-0.5 truncate text-xs text-[#9da69f]">{user.username} · PNG, JPG hoặc WEBP</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2.5">
                {AVATAR_PRESETS.map((preset) => {
                  const selected = !user.hasCustomAvatar && user.avatarPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => void chooseAvatarPreset(preset.id)}
                      disabled={isAvatarSaving}
                      className={`group relative grid aspect-square place-items-center rounded-full border-2 transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f] disabled:cursor-wait disabled:opacity-60 ${preset.className} ${selected ? "border-[#8dc63f] shadow-[0_0_0_3px_rgba(141,198,63,0.18)]" : "border-white/15"}`}
                      aria-label={`Chọn ảnh đại diện ${preset.name}`}
                      aria-pressed={selected}
                      title={preset.name}
                    >
                      {preset.symbol ? (
                        <span className="text-3xl leading-none">{preset.symbol}</span>
                      ) : (
                        <UserRound className="size-7" />
                      )}
                      {selected && (
                        <span className="absolute right-0 top-0 grid size-5 place-items-center rounded-full bg-[#8dc63f] text-[#172019] shadow-md">
                          <Check className="size-3.5 stroke-[3]" />
                        </span>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => avatarFileInputRef.current?.click()}
                  disabled={isAvatarSaving}
                  className={`relative grid aspect-square place-items-center rounded-full border-2 border-dashed transition hover:-translate-y-0.5 hover:border-[#78a7ff] hover:bg-[#4b7fe8]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#78a7ff] disabled:cursor-wait disabled:opacity-60 ${user.hasCustomAvatar ? "border-[#8dc63f] bg-[#8dc63f]/8" : "border-white/25 bg-[#181c19]"}`}
                  aria-label="Tải ảnh đại diện từ máy tính"
                  title="Tải ảnh từ máy tính"
                >
                  <Plus className="size-7 text-[#dfe5df]" />
                  {user.hasCustomAvatar && (
                    <span className="absolute right-0 top-0 grid size-5 place-items-center rounded-full bg-[#8dc63f] text-[#172019] shadow-md">
                      <Check className="size-3.5 stroke-[3]" />
                    </span>
                  )}
                </button>
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => void chooseAvatarFile(event.target.files?.[0])}
                />
              </div>

              <p className={`mt-3 min-h-5 text-xs ${avatarFeedback.startsWith("Đã") ? "text-[#91d99d]" : "text-[#f0a19f]"}`} aria-live="polite">
                {isAvatarSaving ? "Đang lưu ảnh đại diện..." : avatarFeedback}
              </p>
            </section>
          )}

          <Collapsible open={isAppearanceOpen} onOpenChange={setIsAppearanceOpen}>
            <div className="border-b border-white/10 px-3 py-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="settings-row flex w-full items-center gap-3 border-r-2 border-[#f4f1e7] bg-[#292e2a] px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-[#343a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]"
                  aria-label={`${isAppearanceOpen ? "Thu gọn" : "Mở"} cài đặt bàn cờ và quân cờ`}
                >
                  <Grid2X2 className="size-5" />
                  <span className="flex-1">Bàn cờ và quân cờ</span>
                  <ChevronDown className={`size-4 text-[#b5bdb6] transition-transform duration-200 ${isAppearanceOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2">
              <div className="space-y-7 border-b border-white/10 px-4 py-5">
                <section aria-labelledby="board-theme-title">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <h2 id="board-theme-title" className="font-semibold text-white">Bàn cờ</h2>
                      <p className="mt-0.5 text-xs text-[#99a29b]">Chọn màu ô sáng và ô tối</p>
                    </div>
                    <span className="text-xs font-medium text-[#b5bdb6]">
                      {BOARD_THEMES.find((theme) => theme.id === boardThemeId)?.name}
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-2.5">
                    {BOARD_THEMES.map((theme) => {
                      const selected = theme.id === boardThemeId;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => onBoardThemeChange(theme.id)}
                          className={`relative aspect-square overflow-hidden rounded-md border-2 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f] ${selected ? "border-[#8dc63f] shadow-[0_0_0_2px_rgba(141,198,63,0.22)]" : "border-white/10"}`}
                          aria-label={`Chọn bàn cờ ${theme.name}`}
                          aria-pressed={selected}
                          title={theme.name}
                        >
                          <span className="grid size-full grid-cols-2 grid-rows-2" aria-hidden="true">
                            <span style={{ backgroundColor: theme.light }} />
                            <span style={{ backgroundColor: theme.dark }} />
                            <span style={{ backgroundColor: theme.dark }} />
                            <span style={{ backgroundColor: theme.light }} />
                          </span>
                          {selected && (
                            <span className="absolute inset-0 grid place-items-center bg-black/8">
                              <span className="grid size-5 place-items-center rounded-full bg-[#83bd3f] text-[#172019] shadow-md">
                                <Check className="size-3.5 stroke-[3]" />
                              </span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section aria-labelledby="piece-theme-title">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <h2 id="piece-theme-title" className="font-semibold text-white">Quân cờ</h2>
                      <p className="mt-0.5 text-xs text-[#99a29b]">Đổi hình dạng của toàn bộ bộ quân</p>
                    </div>
                    <span className="text-xs font-medium text-[#b5bdb6]">
                      {PIECE_THEMES.find((theme) => theme.id === pieceThemeId)?.name}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {PIECE_THEMES.map((theme) => {
                      const selected = theme.id === pieceThemeId;
                      const PreviewKnight = createPieceSet(theme).wN;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => onPieceThemeChange(theme.id)}
                          className={`piece-choice group relative rounded-lg border-2 bg-[#181c19] p-2 transition hover:-translate-y-0.5 hover:bg-[#262c27] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f] ${selected ? "border-[#8dc63f] shadow-[0_0_0_2px_rgba(141,198,63,0.18)]" : "border-white/10"}`}
                          aria-label={`Chọn bộ quân ${theme.name}`}
                          aria-pressed={selected}
                        >
                          <span className="mx-auto block aspect-square w-full max-w-20" aria-hidden="true">
                            <PreviewKnight />
                          </span>
                          <span className="mt-1 block truncate text-xs font-medium text-[#dce1dc]">{theme.name}</span>
                          {selected && (
                            <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-[#83bd3f] text-[#172019] shadow-md">
                              <Check className="size-3.5 stroke-[3]" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={isThemeOpen} onOpenChange={setIsThemeOpen}>
            <div className="border-b border-white/10 px-3 py-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="settings-row flex w-full items-center gap-3 bg-[#292e2a] px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-[#343a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]"
                >
                  {uiTheme === "dark" ? <Moon className="size-5" /> : <Sun className="size-5" />}
                  <span className="flex-1">Giao diện</span>
                  <span className="text-xs font-medium text-[#9da69f]">{uiTheme === "dark" ? "Tối" : "Sáng"}</span>
                  <ChevronDown className={`size-4 text-[#b5bdb6] transition-transform duration-200 ${isThemeOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2">
              <div className="border-b border-white/10 px-4 py-4">
                <div className="theme-switch-card flex items-center gap-3 rounded-xl border border-white/10 bg-[#181c19] px-4 py-3">
                  <Sun className="size-5 text-[#d8b45f]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Chế độ {uiTheme === "dark" ? "tối" : "sáng"}</p>
                    <p className="mt-0.5 text-xs text-[#99a29b]">Áp dụng cho toàn bộ giao diện phân tích</p>
                  </div>
                  <Switch
                    checked={uiTheme === "dark"}
                    onCheckedChange={(checked) => onUiThemeChange(checked ? "dark" : "light")}
                    className="data-[state=checked]:bg-[#4b7fe8] data-[state=unchecked]:bg-[#d8b45f]"
                    aria-label={uiTheme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
                  />
                  <Moon className="size-5 text-[#78a7ff]" />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="border-b border-white/10 px-3 py-3">
            {isUserLoading ? (
              <div className="settings-row flex w-full items-center gap-3 bg-[#292e2a] px-4 py-3 text-sm font-semibold text-white/75">
                <UserRound className="size-5" />
                <span className="min-w-0 flex-1">
                  <span className="block">Đang kiểm tra tài khoản...</span>
                </span>
              </div>
            ) : user ? (
              <button
                type="button"
                onClick={() => void logout()}
                className="settings-row flex w-full items-center gap-3 bg-[#292e2a] px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-[#343a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]"
              >
                <UserRound className="size-5" />
                <span className="min-w-0 flex-1">
                  <span className="block">Đăng xuất</span>
                  <span className="mt-0.5 block truncate text-xs font-normal text-[#9da69f]">
                    {user.username}
                  </span>
                </span>
                <LogOut className="size-4 text-[#b5bdb6]" />
              </button>
            ) : (
              <a
                href="/login"
                className="settings-row flex w-full items-center gap-3 bg-[#292e2a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#343a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]"
              >
                <UserRound className="size-5" />
                <span className="min-w-0 flex-1">
                  <span className="block">Đăng nhập</span>
                  <span className="mt-0.5 block text-xs font-normal text-[#9da69f]">Tài khoản Chess Analysis</span>
                </span>
                <LogIn className="size-4 text-[#b5bdb6]" />
                <ChevronRight className="size-4 text-[#b5bdb6]" />
              </a>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type MoveBadgeAssessment = Pick<
  MoveAssessment,
  "badgeClassName" | "key" | "label" | "symbol"
>;

function MoveAssessmentBadge({
  assessment,
  className = "",
  size = "tiny",
}: {
  assessment: MoveBadgeAssessment;
  className?: string;
  size?: "tiny" | "small" | "board";
}) {
  const sizeClass = size === "board"
    ? "size-[clamp(24px,5vw,38px)] text-[clamp(11px,2vw,16px)]"
    : size === "small"
      ? "size-7 text-xs"
      : "size-5 text-[9px]";
  const iconClass = size === "tiny" ? "size-3" : size === "small" ? "size-4" : "size-[58%]";

  let glyph: React.ReactNode;
  if (assessment.key === "best") {
    glyph = <Star className={iconClass} fill="currentColor" strokeWidth={2.5} />;
  } else if (assessment.key === "excellent") {
    glyph = <ThumbsUp className={iconClass} fill="currentColor" strokeWidth={2.6} />;
  } else if (assessment.key === "okay") {
    glyph = <Check className={iconClass} strokeWidth={4} />;
  } else if (assessment.key === "theory") {
    glyph = <BookOpen className={iconClass} strokeWidth={2.8} />;
  } else {
    glyph = <span className="relative z-10 tracking-[-0.08em]">{assessment.symbol}</span>;
  }

  return (
    <span
      aria-label={assessment.label}
      title={assessment.label}
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/45 font-black leading-none shadow-[0_2px_5px_rgba(0,0,0,0.4)] ring-1 ring-black/15 ${sizeClass} ${assessment.badgeClassName} ${className}`}
    >
      <span className="pointer-events-none absolute inset-px rounded-full bg-gradient-to-b from-white/30 via-white/5 to-black/15" />
      <span className="relative z-10 grid size-full place-items-center">{glyph}</span>
    </span>
  );
}

function GameReviewCard({
  accuracy,
  activeAnalysis,
  engineError,
  errorMessage,
  maxDepth,
  minDepth,
  moveCount,
  playerNames,
  positions,
  reviewComplete,
  reviewCompleted,
  reviewMode,
  reviewTotal,
}: {
  accuracy: {
    black: number | null;
    blackCount: number;
    white: number | null;
    whiteCount: number;
  };
  activeAnalysis: ActiveAnalysis | null;
  engineError: boolean;
  errorMessage: string;
  maxDepth: number;
  minDepth: number;
  moveCount: number;
  playerNames: { black: string; white: string };
  positions: string[];
  reviewComplete: boolean;
  reviewCompleted: number;
  reviewMode: InputType;
  reviewTotal: number;
}) {
  const progress = reviewTotal ? (reviewCompleted / reviewTotal) * 100 : 0;
  const activePositionIndex = activeAnalysis
    ? positions.findIndex((fen) => fen === activeAnalysis.fen) + 1
    : 0;
  const activeTime = activeAnalysis?.moveTimeMs
    ? `${(activeAnalysis.moveTimeMs / 1_000).toFixed(1)} giây`
    : "";

  const status = engineError
    ? errorMessage || "Không thể khởi động Stockfish ở backend"
    : reviewComplete
      ? `Hoàn tất ${reviewTotal}/${reviewTotal} vị trí`
      : activeAnalysis?.kind === "review"
        ? `Vị trí ${activePositionIndex}/${reviewTotal} · depth ${activeAnalysis.currentDepth || "…"} · ${activeTime}`
        : `Đang nhận diện khai cuộc và chuẩn bị ${reviewTotal || "các"} vị trí…`;

  return (
    <section className="border-b border-white/10 bg-[#202623] px-3 py-3" aria-label="Độ chính xác toàn ván">
      <div className="overflow-hidden rounded-xl border border-white/8 bg-[#2b312e]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-[#78a7ff]" />
            <h2 className="text-sm font-bold text-white">Game Review & độ chính xác</h2>
          </div>
          <span className="rounded-md bg-[#4b7fe8]/18 px-2 py-1 text-xs font-bold text-[#9fc0ff]">
            Backend · depth {minDepth}–{maxDepth}
          </span>
        </div>

        <div className="space-y-3 p-3">
          {!reviewComplete && (
            <div className="rounded-lg border border-[#4b7fe8]/20 bg-[#30363d] px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-semibold text-white">Đang phân tích toàn ván…</span>
                <span className="text-lg font-black tabular-nums text-white">
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress
                value={progress}
                className="h-2.5 bg-white/85 [&_[data-slot=progress-indicator]]:bg-[#2f80ed]"
              />
              <p className="mt-2 text-xs leading-5 text-[#c4cbc6]">
                ECO nhận diện nước lý thuyết ngay; backend vẫn đánh giá đủ mọi vị trí ở depth
                {` ${minDepth}–${maxDepth}`}. Icon và độ chính xác xuất hiện đồng loạt khi tiến trình đạt 100%.
              </p>
            </div>
          )}

          {reviewComplete && moveCount > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/8 bg-[#f0eee6] px-3 py-3 text-center text-[#1a1d1b]">
                <p className="truncate text-[11px] font-bold text-[#667068]" title={playerNames.white}>
                  {playerNames.white}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#899089]">Trắng</p>
                <p className="mt-1 text-2xl font-black tabular-nums">
                  {accuracy.white?.toFixed(1) ?? "—"}
                </p>
                <p className="text-[10px] text-[#737b75]">độ chính xác</p>
              </div>
              <div className="rounded-lg border border-white/8 bg-[#171b19] px-3 py-3 text-center text-white">
                <p className="truncate text-[11px] font-bold text-[#b7c0ba]" title={playerNames.black}>
                  {playerNames.black}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#707a73]">Đen</p>
                <p className="mt-1 text-2xl font-black tabular-nums">
                  {accuracy.black?.toFixed(1) ?? "—"}
                </p>
                <p className="text-[10px] text-[#7f8982]">độ chính xác</p>
              </div>
            </div>
          )}

          {reviewComplete && reviewMode === "fen" && (
            <div className="rounded-lg border border-white/8 bg-[#171b19] px-3 py-3 text-center text-xs leading-5 text-[#aeb8b1]">
              FEN chỉ chứa một thế cờ nên không có lịch sử nước đi để tính độ chính xác hai bên.
              Đánh giá thích ứng của vị trí đã hoàn tất.
            </div>
          )}

          <div aria-live="polite">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate text-[#aeb8b1]">{status}</span>
              <span className="shrink-0 font-bold tabular-nums text-[#d9dfda]">
                {Math.round(progress)}%
              </span>
            </div>
            <Progress
              value={progress}
              className="h-2 bg-white/10 [&_[data-slot=progress-indicator]]:bg-[#4b7fe8]"
            />
          </div>

          <p className="text-[10px] leading-4 text-[#7f8982]">
            Điểm được tính từ mức giảm xác suất thắng giữa hai thế cờ do Stockfish 18 đánh giá.
            Khai cuộc dùng depth {minDepth}; trung cuộc tăng thích ứng; tàn cuộc và FEN có thể đạt depth {maxDepth}.
            Thời gian phụ thuộc CPU và độ dài ván. Game Review chỉ chạy khi bạn nạp PGN/FEN.
          </p>
        </div>
      </div>
    </section>
  );
}

function OpeningCard({
  bookError,
  currentIndex,
  inBook,
  isLoading,
  match,
  moves,
}: {
  bookError: boolean;
  currentIndex: number;
  inBook: boolean;
  isLoading: boolean;
  match: OpeningMatch | null;
  moves: string[];
}) {
  if (isLoading) {
    return (
      <div className="border-b border-white/10 bg-[#202623] px-3 py-3">
        <div className="animate-pulse rounded-xl border border-white/8 bg-[#2c322f] px-4 py-5 text-center text-sm text-[#879189]">
          Đang tải từ điển khai cuộc…
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="border-b border-white/10 bg-[#202623] px-3 py-3">
        <div className="rounded-xl border border-white/8 bg-[#2c322f] px-4 py-4 text-center">
          <BookOpen className="mx-auto mb-2 size-5 text-[#bd885d]" />
          <p className="text-sm font-semibold text-[#dfe3de]">
            {bookError ? "Chưa thể nhận diện khai cuộc" : "Chưa xác định khai cuộc"}
          </p>
          <p className="mt-1 text-xs text-[#879189]">
            {currentIndex === 0
              ? "Hãy đi vài nước hoặc dán một ván PGN."
              : "Chưa nhận diện được chuỗi nước hiện tại."}
          </p>
        </div>
      </div>
    );
  }

  const separators = [match.entry.name.indexOf(":"), match.entry.name.indexOf(",")]
    .filter((index) => index >= 0);
  const separator = separators.length ? Math.min(...separators) : -1;
  const family = separator >= 0
    ? match.entry.name.slice(0, separator)
    : match.entry.name;
  const variation = separator >= 0
    ? match.entry.name.slice(separator + 1).trim()
    : "";
  const lastBookMove = match.index > 0 ? moves[match.index - 1] : null;
  const moveNumber = match.index > 0
    ? `${Math.ceil(match.index / 2)}${match.index % 2 === 0 ? "…" : "."}`
    : "";
  const continuesOpening =
    inBook || (currentIndex <= 20 && currentIndex - match.index <= 6);

  return (
    <div className="border-b border-white/10 bg-[#202623] px-3 py-3">
      <div className="overflow-hidden rounded-xl border border-white/8 bg-[#2c322f] shadow-inner">
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#9aa49d]">
            <BookOpen className="size-4 text-[#bd885d]" />
            {continuesOpening ? "Khai cuộc hiện tại" : "Tổng kết khai cuộc"}
          </span>
          <span className="rounded-md bg-[#bd885d]/18 px-2 py-1 text-xs font-bold text-[#ddb18d]">
            ECO {match.entry.eco}
          </span>
        </div>

        <div className="px-4 py-3 text-center" title={match.entry.moves}>
          <h2 className="text-base font-bold text-white">{family}</h2>
          {variation && (
            <p className="mt-1 text-sm font-semibold leading-5 text-[#d7dcd7]">
              {variation}
            </p>
          )}
          <p className={`mt-2 text-xs font-medium ${continuesOpening ? "text-[#9ed36b]" : "text-[#c5a17f]"}`}>
            {inBook
              ? "Đang đi trong lý thuyết khai cuộc"
              : continuesOpening
                ? "Đã nhận diện khai cuộc · đang tiếp tục biến thể"
                : `Đã rời lý thuyết sau ${moveNumber} ${lastBookMove ?? ""}`}
          </p>
        </div>
      </div>
    </div>
  );
}

function MoveHistory({
  assessments,
  currentIndex,
  moves,
  onReset,
  onSelect,
  showAssessmentSummary,
}: {
  assessments: Array<MoveAssessment | null>;
  currentIndex: number;
  moves: string[];
  onReset: () => void;
  onSelect: (index: number) => void;
  showAssessmentSummary: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const rows = Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => ({
    blackIndex: index * 2 + 1,
    number: index + 1,
    whiteIndex: index * 2,
  }));

  useEffect(() => {
    const currentMove = listRef.current?.querySelector<HTMLElement>(
      `[data-position-index="${currentIndex}"]`,
    );
    currentMove?.scrollIntoView({ block: "nearest" });
  }, [currentIndex]);

  function renderMove(moveIndex: number) {
    const move = moves[moveIndex];
    if (!move) return <span />;

    const positionIndex = moveIndex + 1;
    const assessment = assessments[moveIndex];
    const isCurrent = currentIndex === positionIndex;

    return (
      <button
        key={positionIndex}
        type="button"
        data-position-index={positionIndex}
        aria-current={isCurrent ? "step" : undefined}
        aria-label={`Đến nước ${positionIndex}: ${move}`}
        onClick={() => onSelect(positionIndex)}
        className={`flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#4b7fe8] ${
          isCurrent
            ? "bg-[#4b7fe8] text-white shadow-sm"
            : "text-[#eef1ec] hover:bg-white/8"
        }`}
      >
        {assessment && (
          <MoveAssessmentBadge assessment={assessment} />
        )}
        <span className="truncate">{move}</span>
      </button>
    );
  }

  return (
    <section className="border-b border-white/10 bg-[#1c211f] px-3 py-3" aria-label="Lịch sử nước đi">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-[#f1f3ef]">Lịch sử nước đi</h2>
          <p className="text-xs text-[#879189]">Bấm vào một nước để xem lại thế cờ</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-[#303633] px-2.5 py-2 text-xs font-semibold text-[#e8ebe6] transition hover:border-[#d8b45f]/55 hover:bg-[#3b423e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b45f]"
        >
          <RotateCcw className="size-3.5" />
          Làm mới ván
        </button>
      </div>

      {moves.length > 0 && showAssessmentSummary && (
        <MoveAssessmentSummary assessments={assessments} />
      )}

      <div
        ref={listRef}
        className="max-h-52 overflow-y-auto rounded-xl border border-white/8 bg-[#141816] p-2 [scrollbar-color:#4a554e_transparent]"
      >
        {rows.length ? (
          <div className="space-y-1">
            {rows.map((row) => (
              <div
                key={row.number}
                className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1"
              >
                <span className="text-right text-xs font-medium text-[#7f8982]">
                  {row.number}.
                </span>
                {renderMove(row.whiteIndex)}
                {renderMove(row.blackIndex)}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-2 py-5 text-center text-sm text-[#7f8982]">
            Chưa có nước đi — hãy chơi trên bàn cờ hoặc dán PGN.
          </p>
        )}
      </div>
    </section>
  );
}

function MoveAssessmentSummary({
  assessments,
}: {
  assessments: Array<MoveAssessment | null>;
}) {
  const counts = MOVE_ASSESSMENT_ORDER.reduce(
    (result, key) => {
      result[key] = { black: 0, white: 0 };
      return result;
    },
    {} as Record<(typeof MOVE_ASSESSMENT_ORDER)[number], { black: number; white: number }>,
  );

  assessments.forEach((assessment, moveIndex) => {
    if (!assessment) return;
    counts[assessment.key][moveIndex % 2 === 0 ? "white" : "black"] += 1;
  });

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-white/8 bg-[#282e2b]">
      <div className="grid grid-cols-[1fr_42px_42px] border-b border-white/8 px-2 py-1.5 text-[11px] font-semibold text-[#8e9991]">
        <span>Phân loại</span>
        <span className="text-center">Trắng</span>
        <span className="text-center">Đen</span>
      </div>
      {MOVE_ASSESSMENT_ORDER.map((key) => {
        const meta = MOVE_ASSESSMENT_META[key];
        return (
          <div
            key={key}
            className="grid grid-cols-[1fr_42px_42px] items-center px-2 py-1 text-xs even:bg-white/[0.025]"
          >
            <span className="flex items-center gap-2">
              <MoveAssessmentBadge assessment={{ ...meta, key }} />
              <span className="text-[#d8ddd8]">{meta.label}</span>
            </span>
            <span className="text-center font-semibold text-[#e9ece8]">
              {counts[key].white}
            </span>
            <span className="text-center font-semibold text-[#e9ece8]">
              {counts[key].black}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EngineLines({
  evaluation,
  fen,
  targetDepth,
}: {
  evaluation?: StockfishEvaluation;
  fen: string;
  targetDepth?: number;
}) {
  const variations = [
    evaluation?.variations[0] ?? null,
    evaluation?.variations[1] ?? null,
  ];

  return (
    <div className="border-b border-white/10 bg-[#252b28] px-3 py-3">
      <p className="mb-2 text-xs font-medium text-[#8e9991]">
        Depth: {evaluation?.depth ?? "…"}{targetDepth ? `/${targetDepth}` : " · thích ứng"}
        {targetDepth && evaluation && evaluation.depth < targetDepth
          ? ` · đang nâng lên ${targetDepth}`
          : ""}
      </p>
      <div className="space-y-2">
        {variations.map((variation, index) => {
          const san = variation ? variationToSan(fen, variation.moves) : [];
          return (
            <div
              key={variation ? `${index}-${variation.moves.join("-")}` : `loading-${index}`}
              className="flex min-w-0 items-center gap-2 rounded-lg bg-[#313735] px-2.5 py-2"
            >
              <span className="shrink-0 rounded-md bg-[#f4f1e7] px-2 py-1 text-sm font-semibold text-[#161916]">
                {variation ? formatEvaluation(variation) : "…"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#f0f2ee]">
                {san.length ? san.join(" ") : `Stockfish đang xây dựng biến ${index + 1}…`}
              </span>
              <ChevronDown className="size-4 shrink-0 text-[#aeb8b1]" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvaluationBar({
  evaluation,
  isLoading,
  winner,
}: {
  evaluation?: StockfishEvaluation;
  isLoading: boolean;
  winner: "black" | "white" | null;
}) {
  const score = evaluation?.pawns ?? 0;
  const whiteHeight = winner
    ? winner === "white" ? 100 : 0
    : evaluation?.mate !== null && evaluation?.mate !== undefined
      ? evaluation.mate > 0
        ? 96
        : 4
      : Math.max(5, Math.min(95, 50 + score * 10));
  const label = winner
    ? winner === "white" ? "Trắng thắng" : "Đen thắng"
    : isLoading
      ? "…"
      : evaluation?.mate !== null && evaluation?.mate !== undefined
        ? `${evaluation.mate > 0 ? "+" : "−"}M${Math.abs(evaluation.mate)}`
        : `${score >= 0 ? "+" : ""}${score.toFixed(1)}`;

  return (
    <div
      className="relative h-full min-h-48 overflow-hidden rounded-lg bg-[#111412] shadow-inner"
      aria-label={`Lợi thế: ${label}`}
      title="Số dương nghiêng về Trắng, số âm nghiêng về Đen"
    >
      <div
        className="absolute inset-x-0 bottom-0 bg-[#f4f1e7] transition-[height] duration-500 ease-out"
        style={{ height: `${whiteHeight}%` }}
      />
      <span
        className={`absolute inset-x-0 z-10 text-center text-[11px] font-bold sm:text-xs ${
          winner === "black" || (!winner && score < 0)
            ? "top-2 text-white"
            : "bottom-2 text-[#161916]"
        }`}
      >
        {label}
      </span>
      <span className="absolute left-1/2 top-1/2 z-10 h-px w-2 -translate-x-1/2 bg-[#8c948e]/70" />
    </div>
  );
}

function NavButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-12 place-items-center rounded-xl bg-[#2a302d] text-[#eff2ed] transition hover:bg-[#39413d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4b7fe8] disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:size-7"
    >
      {children}
    </button>
  );
}
