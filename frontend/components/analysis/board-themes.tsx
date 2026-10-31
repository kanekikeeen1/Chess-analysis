import { defaultPieces, type PieceRenderObject } from "react-chessboard";

export type BoardThemeId =
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

export type PieceThemeId = "staunton" | "geometric" | "modern" | "royal" | "ivory" | "gold";

export type BoardTheme = {
  id: BoardThemeId;
  name: string;
  light: string;
  dark: string;
};

export type PieceTheme = {
  id: PieceThemeId;
  name: string;
  mode: "default" | "geometric" | "unicode";
  fontFamily?: string;
  filter?: string;
  scale?: string;
};

export const BOARD_THEMES: BoardTheme[] = [
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

export const PIECE_THEMES: PieceTheme[] = [
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

export type AvatarPreset = {
  id: string;
  name: string;
  symbol?: string;
  className: string;
};

export const AVATAR_PRESETS: AvatarPreset[] = [
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

export const UNICODE_PIECES: Record<string, string> = {
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

export const PIECE_TYPES = ["K", "Q", "R", "B", "N", "P"] as const;

export function GeometricPiece({ color, type }: { color: "w" | "b"; type: string }) {
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

export function createPieceSet(theme: PieceTheme): PieceRenderObject {
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
