"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { BookOpen, Bot, Crown, Flag, Gauge, LoaderCircle, RotateCcw, ScanSearch, Swords, Undo2 } from "lucide-react";

import { useAuth } from "@/app/auth-provider";
import {
  fetchHumanMoves,
  IMPORT_PGN_KEY,
  sampleMove,
  type ScoredHumanMove,
  useHumanMoveLevels,
} from "@/lib/human-moves";
import {
  fastShare,
  fetchStyleMoves,
  initials,
  shortName,
  styleDisclaimer,
  type StyleSummary,
  useStyles,
} from "@/lib/styles";

const PROMOTION_PIECES = [
  { piece: "q", label: "Hậu" }, { piece: "r", label: "Xe" },
  { piece: "b", label: "Tượng" }, { piece: "n", label: "Mã" },
] as const;
// Bot lấy mẫu trong 10 nước cao nhất: phần xác suất còn lại thường dưới 1%, toàn nước người thật hiếm đi.
const BOT_TOP_K = 10;
// Đi ngay lập tức trông như máy; chờ một chút cho giống đang nghĩ.
const BOT_MIN_DELAY_MS = 450;

type Side = "w" | "b";
type Phase = "setup" | "playing" | "over";
type OpponentKind = "gm" | "elo";
type BotThought = {
  chosen: ScoredHumanMove;
  considered: ScoredHumanMove[];
  /** Với kiện tướng: nước lấy từ sổ khai cuộc (ván thật) hay từ mô hình phong cách. */
  source?: "book" | "model";
  bookGames?: number | null;
};

function replay(moves: string[]) {
  const game = new Chess();
  for (const uci of moves) {
    game.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] ?? "q" });
  }
  return game;
}

function describeOutcome(game: Chess, resigned: Side | null, userSide: Side, botName: string) {
  if (resigned) return resigned === userSide ? "Bạn đã xin thua." : `${botName} xin thua.`;
  if (game.isCheckmate()) return game.turn() === userSide ? `${botName} chiếu hết. Bạn thua.` : "Chiếu hết! Bạn thắng.";
  if (game.isStalemate()) return "Hòa do hết nước đi (stalemate).";
  if (game.isThreefoldRepetition()) return "Hòa do lặp lại thế cờ ba lần.";
  if (game.isInsufficientMaterial()) return "Hòa do không đủ quân chiếu hết.";
  if (game.isDraw()) return "Hòa theo luật 50 nước.";
  return "";
}

function resultTag(game: Chess, resigned: Side | null) {
  if (resigned) return resigned === "w" ? "0-1" : "1-0";
  if (game.isCheckmate()) return game.turn() === "w" ? "0-1" : "1-0";
  if (game.isDraw()) return "1/2-1/2";
  return "*";
}

export default function PlayPage() {
  const { user } = useAuth();
  const { error: levelsError, levels } = useHumanMoveLevels();
  const { error: stylesError, styles } = useStyles();
  const [opponentKind, setOpponentKind] = useState<OpponentKind>("gm");
  const [styleId, setStyleId] = useState<string | null>(null);
  const [bucket, setBucket] = useState(3);
  const [colorChoice, setColorChoice] = useState<Side | "random">("w");
  const [userSide, setUserSide] = useState<Side>("w");
  const [phase, setPhase] = useState<Phase>("setup");
  const [moves, setMoves] = useState<string[]>([]);
  const [resigned, setResigned] = useState<Side | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [botThinking, setBotThinking] = useState(false);
  const [botError, setBotError] = useState("");
  const [thought, setThought] = useState<BotThought | null>(null);
  const [showThoughts, setShowThoughts] = useState(true);
  const [retry, setRetry] = useState(0);
  // Mỗi lần đi lại hay ván mới tăng số này; câu trả lời của bot cho lượt cũ đến muộn sẽ bị bỏ.
  const turnTokenRef = useRef(0);

  const level = levels?.levels.find((item) => item.bucket === bucket) ?? null;
  const gm: StyleSummary | null = styles?.styles.find((item) => item.id === styleId) ?? styles?.styles[0] ?? null;
  // Đối thủ đang chọn: một kiện tướng (mô hình phong cách) hoặc một mức Elo (M2).
  const opponentReady = opponentKind === "gm" ? Boolean(gm) : Boolean(level);
  const opponentKey = opponentKind === "gm" ? `gm:${gm?.id ?? ""}` : `elo:${level?.center ?? ""}`;
  const botName = opponentKind === "gm" && gm ? `Bot ${shortName(gm.displayName)}` : "Bot";
  const game = useMemo(() => replay(moves), [moves]);
  const fen = game.fen();
  const botSide: Side = userSide === "w" ? "b" : "w";
  const lastMove = game.history({ verbose: true }).at(-1);
  const outcome = phase === "setup" ? "" : describeOutcome(game, resigned, userSide, botName);
  const sanHistory = useMemo(() => game.history(), [game]);

  useEffect(() => {
    if (phase === "playing" && (game.isGameOver() || resigned)) setPhase("over");
  }, [game, phase, resigned]);

  useEffect(() => {
    if (phase !== "playing" || game.isGameOver() || game.turn() !== botSide || !opponentReady) return;
    const token = ++turnTokenRef.current;
    const startedAt = Date.now();
    const plyBefore = moves.length;
    setBotThinking(true);
    setBotError("");

    const request: Promise<Omit<BotThought, "chosen">> = opponentKind === "gm" && gm
      ? fetchStyleMoves(gm.id, fen, { topK: BOT_TOP_K })
          .then((response) => ({ considered: response.moves, source: response.source, bookGames: response.bookGames }))
      : fetchHumanMoves(fen, [level!.center], { topK: BOT_TOP_K })
          .then((response) => ({ considered: response.predictions[0]?.moves ?? [] }));

    request
      .then(async (response) => {
        // Rút ngẫu nhiên theo xác suất, kể cả trong sổ khai cuộc: kỳ thủ cũng không luôn đi cùng một nước.
        const chosen = sampleMove(response.considered);
        if (!chosen) throw new Error("Mô hình không trả về nước nào.");
        const wait = BOT_MIN_DELAY_MS - (Date.now() - startedAt);
        if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
        if (token !== turnTokenRef.current) return;
        setThought({ ...response, chosen });
        setMoves((current) => (current.length === plyBefore ? [...current, chosen.uci] : current));
      })
      .catch((caught) => {
        if (token !== turnTokenRef.current) return;
        setBotError(caught instanceof Error ? caught.message : "Bot không đi được nước nào.");
      })
      .finally(() => {
        if (token === turnTokenRef.current) setBotThinking(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy lại khi sang lượt mới
  }, [fen, phase, botSide, opponentKey, retry]);

  function startGame() {
    const side: Side = colorChoice === "random" ? (Math.random() < 0.5 ? "w" : "b") : colorChoice;
    turnTokenRef.current += 1;
    setUserSide(side);
    setMoves([]);
    setResigned(null);
    setThought(null);
    setBotError("");
    setBotThinking(false);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setPhase("playing");
  }

  function playUserMove(uci: string) {
    setMoves((current) => [...current, uci]);
    setSelectedSquare(null);
  }

  function attempt(from: Square, to: Square) {
    if (phase !== "playing" || botThinking || game.turn() !== userSide) return false;
    const candidates = game.moves({ square: from, verbose: true }).filter((move) => move.to === to);
    if (!candidates.length) return false;
    if (candidates.some((move) => move.promotion)) {
      setPendingPromotion({ from, to });
      return true;
    }
    playUserMove(`${from}${to}`);
    return true;
  }

  function handleSquareClick(square: string) {
    const clicked = square as Square;
    if (selectedSquare && attempt(selectedSquare, clicked)) return;
    const piece = game.get(clicked);
    setSelectedSquare(piece?.color === userSide && game.turn() === userSide ? clicked : null);
  }

  function takeBack() {
    // Lùi về lượt gần nhất của người chơi: bỏ nước bot (nếu đã đi) và nước của bạn.
    turnTokenRef.current += 1;
    setBotThinking(false);
    setBotError("");
    setResigned(null);
    setMoves((current) => {
      let next = current.slice(0, -1);
      if (next.length && replay(next).turn() !== userSide) next = next.slice(0, -1);
      return next;
    });
    setThought(null);
    setSelectedSquare(null);
    setPhase("playing");
  }

  function analyseGame() {
    const exported = replay(moves);
    const opponentName = opponentKind === "gm" && gm
      ? `Bot phong cách ${gm.displayName}`
      : `Bot M2 ${level?.label ?? ""}`.trim();
    const userName = user?.username ?? "Bạn";
    exported.setHeader("Event", opponentKind === "gm" && gm ? `Đấu với bot phong cách ${gm.displayName}` : "Đấu với bot M2");
    exported.setHeader("White", userSide === "w" ? userName : opponentName);
    exported.setHeader("Black", userSide === "b" ? userName : opponentName);
    exported.setHeader("Result", resultTag(game, resigned));
    try {
      window.sessionStorage.setItem(IMPORT_PGN_KEY, exported.pgn());
    } catch {
      // Không ghi được thì trang phân tích mở trống; người dùng vẫn có thể dán PGN.
    }
    window.location.assign("/analysis");
  }

  const legalTargets = useMemo(() => selectedSquare
    ? game.moves({ square: selectedSquare, verbose: true }).map((move) => move.to)
    : [], [game, selectedSquare]);
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: "rgba(216,180,95,.35)" };
      styles[lastMove.to] = { backgroundColor: "rgba(216,180,95,.5)" };
    }
    if (selectedSquare) styles[selectedSquare] = { boxShadow: "inset 0 0 0 5px #d8b45f" };
    for (const square of legalTargets) {
      styles[square] = game.get(square)
        ? { boxShadow: "inset 0 0 0 6px rgba(216,180,95,.78)" }
        : { backgroundImage: "radial-gradient(circle,rgba(20,30,22,.35) 0 18%,transparent 20%)" };
    }
    return styles;
  }, [game, lastMove, legalTargets, selectedSquare]);

  const status = phase === "setup"
    ? opponentKind === "gm" ? "Chọn kiện tướng và màu quân rồi bấm Bắt đầu." : "Chọn mức Elo và màu quân rồi bấm Bắt đầu."
    : outcome || (botThinking ? `${botName} đang nghĩ…` : game.turn() === userSide ? "Đến lượt bạn." : `Đến lượt ${botName}.`);

  return (
    <main className="min-h-screen bg-[#111713] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl border border-white/9 bg-[#1a211d] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Swords className="size-7 text-[#d8b45f]" />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Đấu với kiện tướng</h1>
              <p className="mt-1 text-sm text-[#aeb8b1]">
                Mỗi bot kiện tướng là một mô hình học cách chọn nước từ hàng nghìn ván công khai của chính người đó:
                khai cuộc lấy từ repertoire thật, sau đó mỗi nước được rút theo xác suất người đó đi nước ấy. Hoặc đấu
                với bot theo mức Elo (mô hình M2).
              </p>
            </div>
          </div>
        </header>

        <section className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,620px)_1fr]">
          <div className="relative rounded-3xl border border-white/9 bg-[#202923] p-3 shadow-2xl shadow-black/25">
            <Chessboard options={{
              id: "play-board",
              position: fen,
              boardOrientation: userSide === "w" ? "white" : "black",
              squareStyles,
              boardStyle: { borderRadius: "12px" },
              darkSquareStyle: { backgroundColor: "#68805f" },
              lightSquareStyle: { backgroundColor: "#e9e1c7" },
              animationDurationInMs: 220,
              canDragPiece: ({ piece }: { piece: { pieceType: string } }) =>
                phase === "playing" && !botThinking && piece.pieceType[0]?.toLowerCase() === userSide && game.turn() === userSide,
              onSquareClick: ({ square }: { square: string }) => handleSquareClick(square),
              onPieceDrag: () => setSelectedSquare(null),
              onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) =>
                targetSquare ? attempt(sourceSquare as Square, targetSquare as Square) : false,
            }} />
            {pendingPromotion && (
              <div className="absolute inset-x-6 top-1/2 z-40 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#1a211d] p-4 shadow-2xl">
                <p className="mb-3 text-center text-sm font-semibold">Phong cấp thành</p>
                <div className="grid grid-cols-4 gap-2">
                  {PROMOTION_PIECES.map(({ piece, label }) => (
                    <button key={piece} type="button" className="rounded-xl bg-white/8 px-3 py-2.5 font-semibold hover:bg-white/15"
                      onClick={() => {
                        const { from, to } = pendingPromotion;
                        setPendingPromotion(null);
                        playUserMove(`${from}${to}${piece}`);
                      }}>{label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-6">
              <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/5 p-4 text-sm leading-6 text-[#c7d0c9]">
                {botThinking ? <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin" /> : <Bot className="mt-0.5 size-5 shrink-0 text-[#78a7ff]" />}
                <div>
                  <p>{status}</p>
                  {phase !== "setup" && opponentReady && (
                    <p className="text-xs text-[#89958d]">
                      {opponentKind === "gm" && gm ? `Phong cách ${gm.displayName}` : `Bot Elo ${level?.label}`}
                      {" · "}bạn cầm {userSide === "w" ? "Trắng" : "Đen"}
                    </p>
                  )}
                </div>
              </div>
              {botError && (
                <p className="mt-3 rounded-xl bg-[#ef6461]/12 px-3 py-2 text-sm text-[#ffaaa8]">
                  {botError}
                  <button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-2 underline">Thử lại</button>
                </p>
              )}

              {phase === "setup" ? (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/20 p-1" role="tablist" aria-label="Loại đối thủ">
                    {([["gm", "Kiện tướng", Crown], ["elo", "Theo mức Elo", Gauge]] as const).map(([value, label, Icon]) => (
                      <button key={value} type="button" role="tab" aria-selected={opponentKind === value} onClick={() => setOpponentKind(value)}
                        className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${opponentKind === value ? "bg-[#4b7fe8] text-white" : "text-[#aeb8b1] hover:bg-white/8"}`}>
                        <Icon className="size-4" /> {label}
                      </button>
                    ))}
                  </div>

                  {opponentKind === "gm" ? (
                    <GrandmasterPicker error={stylesError} selectedId={gm?.id ?? null} onSelect={setStyleId}
                      styles={styles?.styles ?? []} unavailableReason={styles && !styles.available ? styles.unavailableReason : null} />
                  ) : (
                  <>
                  {levelsError && <p className="text-sm text-[#ffaaa8]">{levelsError}</p>}
                  {levels && !levels.available && (
                    <p className="text-sm text-[#ffaaa8]">Backend chưa nạp mô hình M2: {levels.unavailableReason}</p>
                  )}
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-[#89958d]">Mức Elo của bot</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {(levels?.levels ?? []).map((item) => (
                        <button key={item.bucket} type="button" aria-pressed={bucket === item.bucket} onClick={() => setBucket(item.bucket)}
                          className={`rounded-lg px-1 py-2 text-xs font-semibold transition ${bucket === item.bucket ? "bg-[#4b7fe8] text-white" : "bg-white/6 text-[#c5cec7] hover:bg-white/12"}`}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  </>
                  )}
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-[#89958d]">Bạn cầm</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([["w", "♔ Trắng"], ["b", "♚ Đen"], ["random", "Ngẫu nhiên"]] as const).map(([value, label]) => (
                        <button key={value} type="button" aria-pressed={colorChoice === value} onClick={() => setColorChoice(value)}
                          className={`rounded-lg px-2 py-2 text-sm font-semibold transition ${colorChoice === value ? "bg-[#4b7fe8] text-white" : "bg-white/6 text-[#c5cec7] hover:bg-white/12"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="button" onClick={startGame} disabled={!opponentReady}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#d8b45f] px-4 py-3 font-semibold text-[#172019] hover:bg-[#e3c87f] disabled:opacity-50">
                    <Swords className="size-4" /> Bắt đầu
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={takeBack} disabled={!moves.length}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-semibold disabled:opacity-40">
                    <Undo2 className="size-4" /> Đi lại
                  </button>
                  {phase === "playing" ? (
                    <button type="button" onClick={() => { turnTokenRef.current += 1; setBotThinking(false); setResigned(userSide); }}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-semibold">
                      <Flag className="size-4" /> Xin thua
                    </button>
                  ) : (
                    <button type="button" onClick={analyseGame} disabled={!moves.length}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#4b7fe8] px-4 py-2.5 font-semibold text-white disabled:opacity-40">
                      <ScanSearch className="size-4" /> Phân tích ván này
                    </button>
                  )}
                  <button type="button" onClick={() => { turnTokenRef.current += 1; setBotThinking(false); setPhase("setup"); }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-semibold">
                    <RotateCcw className="size-4" /> Ván mới
                  </button>
                </div>
              )}
            </div>

            {phase !== "setup" && (
              <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-6 text-sm">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{botName} vừa cân nhắc</h2>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#89958d]">
                    <input type="checkbox" checked={showThoughts} onChange={(event) => setShowThoughts(event.target.checked)} className="accent-[#4b7fe8]" />
                    Hiện
                  </label>
                </div>
                {!showThoughts ? (
                  <p className="mt-2 text-xs text-[#89958d]">Đang ẩn để không lộ ý đồ của bot.</p>
                ) : thought ? (
                  <ul className="mt-3 space-y-1">
                    {thought.source && (
                      <li className="mb-2 flex items-center gap-1.5 text-xs text-[#aeb8b1]">
                        {thought.source === "book" ? <BookOpen className="size-3.5 text-[#d8b45f]" /> : <Bot className="size-3.5 text-[#78a7ff]" />}
                        {thought.source === "book" && gm
                          ? `Sổ khai cuộc: ${shortName(gm.displayName)} đã gặp thế này ${thought.bookGames ?? 0} lần; % là tần suất từng nước.`
                          : "Mô hình phong cách: % là xác suất kỳ thủ đi nước đó."}
                      </li>
                    )}
                    {thought.considered.slice(0, 6).map((move) => {
                      const chosen = move.uci === thought.chosen.uci;
                      return (
                        <li key={move.uci} className={`grid grid-cols-[56px_minmax(0,1fr)_44px] items-center gap-2 rounded-md px-2 py-1 ${chosen ? "bg-[#4b7fe8]/18" : ""}`}>
                          <span className={`font-semibold ${chosen ? "text-white" : "text-[#c5cec7]"}`}>{move.san}</span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-white/8">
                            <span className="block h-full rounded-full bg-[#78a7ff]" style={{ width: `${Math.max(2, move.probability * 100)}%` }} />
                          </span>
                          <span className="text-right text-xs tabular-nums text-[#dce1db]">{(move.probability * 100).toFixed(0)}%</span>
                        </li>
                      );
                    })}
                    <li className="pt-1 text-xs text-[#89958d]">
                      {botName} đã rút trúng {thought.chosen.san} ({(thought.chosen.probability * 100).toFixed(0)}%).
                    </li>
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-[#89958d]">{botName} chưa đi nước nào.</p>
                )}
              </div>
            )}

            {phase !== "setup" && opponentKind === "gm" && gm && (
              <p className="px-2 text-xs leading-5 text-[#758078]">{styleDisclaimer(gm)}</p>
            )}

            {phase !== "setup" && sanHistory.length > 0 && (
              <div className="rounded-3xl border border-white/9 bg-[#1a211d] p-6 text-sm">
                <h2 className="mb-2 font-semibold">Biên bản</h2>
                <ol className="grid grid-cols-[32px_1fr_1fr] gap-x-2 gap-y-0.5 tabular-nums">
                  {Array.from({ length: Math.ceil(sanHistory.length / 2) }, (_, index) => (
                    <li key={index} className="contents">
                      <span className="text-[#758078]">{index + 1}.</span>
                      <span>{sanHistory[index * 2]}</span>
                      <span>{sanHistory[index * 2 + 1] ?? ""}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function GrandmasterPicker({
  error,
  onSelect,
  selectedId,
  styles,
  unavailableReason,
}: {
  error: string;
  onSelect: (id: string) => void;
  selectedId: string | null;
  styles: StyleSummary[];
  unavailableReason: string | null;
}) {
  if (error) return <p className="text-sm text-[#ffaaa8]">{error}</p>;
  if (unavailableReason) return <p className="text-sm text-[#ffaaa8]">Backend chưa nạp mô hình kỳ thủ: {unavailableReason}</p>;
  if (!styles.length) return <p className="text-sm text-[#89958d]">Đang tải danh sách kỳ thủ…</p>;

  const selected = styles.find((style) => style.id === selectedId) ?? styles[0];
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-[#89958d]">Chọn kiện tướng</p>
      <div className="grid gap-2" role="radiogroup" aria-label="Kiện tướng">
        {styles.map((style) => {
          const active = style.id === selected.id;
          const fast = fastShare(style);
          return (
            <button key={style.id} type="button" role="radio" aria-checked={active} onClick={() => onSelect(style.id)}
              className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4b7fe8] ${active ? "border-[#d8b45f]/70 bg-[#d8b45f]/10" : "border-white/8 bg-white/4 hover:bg-white/8"}`}>
              <span className={`grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold ${active ? "bg-[#d8b45f] text-[#172019]" : "bg-white/10 text-[#dce1db]"}`}>
                {initials(style.displayName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-white">{style.displayName}</span>
                <span className="block text-xs text-[#aeb8b1]">
                  {style.games.toLocaleString("vi-VN")} ván
                  {style.firstYear && style.lastYear ? ` · ${style.firstYear}–${style.lastYear}` : ""}
                  {fast !== null ? ` · ${Math.round(fast * 100)}% cờ nhanh` : ""}
                </span>
              </span>
              {style.testTop1 !== null && (
                <span className="shrink-0 text-right" title="Tỉ lệ đoán trúng nước kỳ thủ thật đi trên các ván mới nhất, chưa dùng khi huấn luyện">
                  <span className="block text-sm font-bold tabular-nums text-white">{Math.round(style.testTop1 * 100)}%</span>
                  <span className="block text-[10px] text-[#89958d]">đoán trúng</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#89958d]">
        {styleDisclaimer(selected)}
        {selected.testTop1 !== null && selected.baseTop1 !== null
          ? ` Trên các ván mới nhất của ${shortName(selected.displayName)} (mô hình chưa thấy), bot đoán trúng `
            + `${Math.round(selected.testTop1 * 100)}% nước thật, so với ${Math.round(selected.baseTop1 * 100)}% của mô hình M2 chung.`
          : ""}
      </p>
    </div>
  );
}
