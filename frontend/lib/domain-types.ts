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

export type ExercisePosition = {
  id: number;
  lessonSlug: string;
  startingFen: string;
  goalType: "CHECKMATE" | "PROMOTE" | "WIN_ROOK" | "DRAW";
};

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

export type EvaluateMoveResult = {
  assessmentKey: string;
  detail: string;
  loss: number;
  bestMove: string | null;
  opponentReply: string | null;
  before: BackendPositionEvaluation;
  after: BackendPositionEvaluation;
};
