"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  Archive,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Crown,
  Cpu,
  GitBranch,
  History,
  LogIn,
  LoaderCircle,
  ScanSearch,
  Save,
  Upload,
  Users,
} from "lucide-react";
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
  useStockfish,
} from "@/lib/use-stockfish";
import { MOVE_ASSESSMENT_META, type MoveAssessmentKey } from "@/lib/move-classification";
import { useLiveClassification } from "@/lib/use-live-classification";
import { type OpeningEntry, useOpeningBook } from "@/lib/use-opening-book";
import { useAuth } from "@/app/auth-provider";
import { backendRequest } from "@/lib/backend-api";
import { useBackendReview } from "@/lib/use-backend-review";
import type { CreateAnalysisJobPayload, GameDetail } from "@/lib/domain-types";
import { buildReplayTimeline, parseSavedAnalysis, savedMoveIsCapture } from "@/lib/saved-analysis";
import {
  STARTING_POSITION,
  BEST_MOVE_SUGGESTION_KEYS,
  type InputType,
  type ReviewDepthMode,
  type UiTheme,
  REVIEW_DEPTH_RANGES,
  type AnalysisTimeline,
  type VariationTimeline,
  type ArchivedReview,
  describePosition,
  variationToSan,
  canonicalMoveSan,
  analysisMovePayload,
} from "@/lib/analysis-helpers";
import {
  type BoardThemeId,
  type PieceThemeId,
  BOARD_THEMES,
  PIECE_THEMES,
  createPieceSet,
} from "@/components/analysis/board-themes";
import { AppearanceSettings } from "@/components/analysis/settings-panel";
import {
  MoveAssessmentBadge,
  GameReviewCard,
  OpeningCard,
  EngineLines,
} from "@/components/analysis/review-panels";
import { MoveHistory } from "@/components/analysis/move-history";
import { HumanMovesPanel } from "@/components/analysis/human-moves-panel";
import { GameEloCard } from "@/components/analysis/game-elo-card";
import { StyleMatchCard } from "@/components/analysis/style-match-card";
import { StyleMovesPanel } from "@/components/analysis/style-moves-panel";
import { IMPORT_PGN_KEY } from "@/lib/human-moves";
import { EvaluationBar, NavButton } from "@/components/analysis/board-controls";

type SideTab = "engine" | "human" | "styles" | "report" | "load";

const SIDE_TABS: Array<{ id: SideTab; label: string; icon: typeof Cpu }> = [
  { id: "engine", label: "Engine", icon: Cpu },
  { id: "human", label: "Theo Elo", icon: Users },
  { id: "styles", label: "Kiện tướng", icon: Crown },
  { id: "report", label: "Báo cáo", icon: ClipboardList },
  { id: "load", label: "Nạp ván", icon: Upload },
];

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
  // Bên người dùng cầm trong ván: backend ước lượng Elo của bên đó và cộng vào hồ sơ người chơi.
  const [userSide, setUserSide] = useState<"w" | "b" | "">("");
  const [sideTab, setSideTab] = useState<SideTab>("engine");
  const [boardThemeId, setBoardThemeId] = useState<BoardThemeId>("forest");
  const [pieceThemeId, setPieceThemeId] = useState<PieceThemeId>("staunton");
  const [uiTheme, setUiTheme] = useState<UiTheme>("dark");
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moveSoundRef = useRef<HTMLAudioElement | null>(null);
  const captureSoundRef = useRef<HTMLAudioElement | null>(null);
  const loadedArchiveIdRef = useRef<string | null>(null);

  // Vừa nạp ván (PGN, FEN hay từ kho) thì mở thẳng tab báo cáo để thấy tiến độ review.
  useEffect(() => {
    if (reviewMode) setSideTab("report");
  }, [reviewMode, reviewSessionId]);

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
        setUserSide(loadedGame.userSide ?? "");
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
    // Ván chuyển sang từ trang đấu bot: điền sẵn PGN, người dùng chọn độ sâu rồi bấm Phân tích.
    let imported: string | null = null;
    try {
      imported = window.sessionStorage.getItem(IMPORT_PGN_KEY);
      window.sessionStorage.removeItem(IMPORT_PGN_KEY);
    } catch {
      return;
    }
    if (!imported) return;
    setInputType("pgn");
    setGameText(imported);
    setMessage("Đã chuyển ván đấu với bot sang. Bấm Phân tích để chạy Game Review.");
  }, []);

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
  const reviewedMoves = useMemo(
    () => (reviewTimeline?.uciMoves ?? [])
      .map((uci, index) => ({ fen: reviewTimeline?.positions[index] ?? "", uci }))
      .filter((move) => move.fen && move.uci),
    [reviewTimeline],
  );

  useEffect(() => {
    if (archivedReview || !user) return;
    // Tên trong PGN trùng tên đăng nhập thì gần như chắc là ván của người dùng; không trùng thì để họ chọn.
    const name = user.username.trim().toLowerCase();
    if (playerNames.white.trim().toLowerCase() === name) setUserSide("w");
    else if (playerNames.black.trim().toLowerCase() === name) setUserSide("b");
    else setUserSide("");
  }, [archivedReview, playerNames, user]);

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
    setUserSide("");
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
          userSide: userSide || null,
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

  function playHumanMove(uci: string) {
    if (uci.length < 4) return;
    attemptMove(uci.slice(0, 2) as Square, uci.slice(2, 4) as Square);
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

          <div className="grid shrink-0 grid-cols-5 border-b border-white/10 bg-[#171c1a]" role="tablist" aria-label="Khu vực phân tích">
            {SIDE_TABS.map(({ icon: Icon, id, label }) => {
              const active = sideTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSideTab(id)}
                  className={`flex flex-col items-center gap-0.5 border-b-2 px-1 py-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#4b7fe8] ${active ? "border-[#4b7fe8] bg-[#202623] text-white" : "border-transparent text-[#8e9991] hover:bg-white/5 hover:text-[#dce1db]"}`}
                >
                  <Icon className="size-4" />
                  <span>
                    {label}
                    {id === "report" && reviewMode && !reviewComplete ? ` ${reviewCompleted}/${reviewTotal}` : ""}
                  </span>
                </button>
              );
            })}
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

          {sideTab === "report" && !reviewMode && (
            <div className="border-b border-white/10 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-white">Chưa có báo cáo</p>
              <p className="mt-1 text-xs leading-5 text-[#8e9991]">Dán PGN ở tab Nạp ván rồi bấm Phân tích để có độ chính xác, nhãn từng nước và Elo ước lượng.</p>
              <button type="button" onClick={() => setSideTab("load")} className="mt-3 rounded-lg bg-[#4b7fe8] px-3 py-2 text-xs font-semibold text-white hover:bg-[#5b8cf0]">Mở tab Nạp ván</button>
            </div>
          )}

          {sideTab === "report" && reviewMode && (
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
              {reviewComplete && reviewedMoves.length > 0 && (
                <>
                  <GameEloCard moves={reviewedMoves} playerNames={playerNames} />
                  <StyleMatchCard moves={reviewedMoves} playerNames={playerNames} />
                </>
              )}
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
                    {!savedGameId && reviewedMoves.length > 0 && (
                      <div className="mt-3" role="radiogroup" aria-label="Bạn cầm quân nào trong ván này">
                        <p className="mb-1.5 text-[11px] text-[#96a098]">Bạn cầm quân nào? Dùng để ước lượng Elo của bạn qua các ván.</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {([["w", `♔ ${playerNames.white}`], ["b", `♚ ${playerNames.black}`], ["", "Không phải tôi"]] as const).map(([side, label]) => (
                            <button
                              key={side || "none"}
                              type="button"
                              role="radio"
                              aria-checked={userSide === side}
                              onClick={() => setUserSide(side)}
                              className={`truncate rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${userSide === side ? "bg-[#4b7fe8] text-white" : "bg-white/6 text-[#c5cec7] hover:bg-white/12"}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
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

          {sideTab === "human" && (
            <HumanMovesPanel
              fen={currentFen}
              gameOver={currentGame.isGameOver()}
              onPlayMove={playHumanMove}
              playedUci={uciMoves[currentIndex] ?? null}
            />
          )}

          {sideTab === "styles" && (
            <StyleMovesPanel
              fen={currentFen}
              gameOver={currentGame.isGameOver()}
              onPlayMove={playHumanMove}
              playedUci={uciMoves[currentIndex] ?? null}
            />
          )}

          {sideTab === "engine" && (
          <>
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
          </>
          )}

          {(sideTab === "engine" || sideTab === "report") && moveAssessment && (
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

          {sideTab !== "load" && (
          <MoveHistory
            assessments={moveAssessments}
            currentIndex={currentIndex}
            moves={moves}
            onReset={resetGame}
            onSelect={goToPosition}
            showAssessmentSummary={!reviewMode || reviewComplete}
          />
          )}

          {sideTab === "load" && (
          <>
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
          </>
          )}

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
