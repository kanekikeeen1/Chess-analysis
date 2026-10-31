export type GameSummary = {
  id: number;
  title: string;
  whitePlayer: string;
  blackPlayer: string;
  result: string;
  sourceType: string;
  openingEco: string | null;
  openingName: string | null;
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  depth: number | null;
  moveCount: number;
  createdAt: string;
};

export type GameDetail = GameSummary & {
  pgn: string | null;
  initialFen: string;
  finalFen: string;
  analysisJson: string;
  analysisJobId?: string | null;
  updatedAt: string;
};

export type ExerciseLesson = {
  id: number;
  slug: string;
  category: "OPENING" | "ENDGAME";
  groupName: string;
  title: string;
  description: string;
  startingFen: string | null;
  solutionLine: string;
  difficulty: string;
  sortOrder: number;
};

export type ExerciseProgress = {
  totalAttempts: number;
  completedLessons: number;
  bestScores: Record<string, number>;
};

/** Phiên làm một thế tàn cuộc; server giữ trạng thái, đi nước đáp và tự chấm điểm. */
export type ExerciseSession = {
  sessionId: string;
  lessonSlug: string | null;
  positionId: number;
  goalType: "CHECKMATE" | "PROMOTE" | "WIN_ROOK" | "DRAW";
  playerSide: "w" | "b";
  startingFen: string;
  currentFen: string;
  status: "ACTIVE" | "COMPLETED" | "FAILED";
  mistakes: number;
  acceptedMoves: number;
  score: number | null;
};

export type ExerciseMoveResult = {
  session: ExerciseSession;
  accepted: boolean;
  playedUci: string;
  assessmentKey: string;
  detail: string;
  bestMove: string | null;
  opponentReply: string | null;
  message: string | null;
};

/** Puzzle gửi cho người giải; server giữ lời giải. */
export type PuzzleSummary = {
  id: number;
  lichessId: string;
  startFen: string;
  playerSide: "w" | "b";
  rating: number;
  themes: string[];
  solutionLength: number;
  gameUrl: string | null;
};

export type PuzzleSession = {
  sessionId: string;
  puzzle: PuzzleSummary;
  /** Vị trí trước nước dàn dựng của đối thủ; giao diện diễn lại `setupMove` như Lichess. */
  sourceFen: string;
  setupMove: string;
  currentFen: string;
  status: "ACTIVE" | "SOLVED" | "FAILED";
  progress: number;
  rated: boolean;
};

export type PuzzleMoveResult = {
  session: PuzzleSession;
  correct: boolean;
  playedUci: string | null;
  opponentReply: string | null;
  expectedMove: string | null;
  /** Phần lời giải còn lại khi lượt giải kết thúc (để xem lại). */
  solution: string[] | null;
  ratingChange: {
    before: number;
    after: number;
    delta: number;
    deviation: number;
    provisional: boolean;
  } | null;
};

export type PuzzleRating = {
  rating: number;
  deviation: number;
  volatility: number;
  provisional: boolean;
  attempts: number;
  solved: number;
};

export type PuzzleTheme = { theme: string; puzzles: number };

export type BackendEngineVariation = {
  depth: number;
  mate: number | null;
  moves: string[];
  pawns: number;
};

export type BackendPositionEvaluation = BackendEngineVariation & {
  positionIndex: number;
  fen: string;
  variations: BackendEngineVariation[];
};

export type BackendMoveReview = {
  index: number;
  san: string;
  uci: string;
  assessmentKey: string;
  detail: string;
  loss: number;
  accuracy: number | null;
  evaluation: number | null;
  depth: number | null;
  bestMove: string | null;
};

export type BackendAnalysisResult = {
  evaluations: BackendPositionEvaluation[];
  moves: BackendMoveReview[];
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  averageDepth: number | null;
};

export type BackendAnalysisJob = {
  publicId: string;
  sourceType: "PGN" | "FEN";
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  progressPercent: number;
  completedPositions: number;
  totalPositions: number;
  minDepth: number;
  maxDepth: number;
  currentPosition: number | null;
  errorMessage: string | null;
  result: BackendAnalysisResult | null;
  /** Index of the first entry in `result.evaluations`; earlier ones were sent in previous polls. */
  evaluationsFrom: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type AnalysisMovePayload = {
  san: string;
  uci: string;
  beforeFen: string;
  afterFen: string;
  theory: boolean;
  theoryName: string | null;
  capture: boolean;
  check: boolean;
  checkmate: boolean;
  promotion: boolean;
  sacrificeCandidate: boolean;
  abandonedPieceCandidate: boolean;
  sacrificeValue: number;
  sacrificeKind: "NONE" | "MOVED" | "ABANDONED";
  legalMoveCount: number;
};

export type CreateAnalysisJobPayload = {
  sourceType: "PGN" | "FEN";
  sourceText: string;
  positions: string[];
  moves: AnalysisMovePayload[];
  openingEco: string | null;
  openingName: string | null;
  minDepth: 10 | 16;
  maxDepth: 14 | 20;
};

export type ClassifyMovesResult = {
  moves: BackendMoveReview[];
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  /** "rules" khi dùng bộ luật ngưỡng, "model" khi mô hình M1 đã vào chỗ. */
  labelSource: string;
};

export type AnalysisMetrics = {
  cache: {
    hits: number;
    misses: number;
    skipped: number;
    hitRate: number;
    storedPositions: number;
  };
  enginePool: {
    size: number;
    idleCount: number;
    inUse: number;
    totalBorrows: number;
    reusedEngines: number;
    startedProcesses: number;
  };
  queue: {
    queued: number;
    running: number;
    workers: number;
    remainingCapacity: number;
  };
};
