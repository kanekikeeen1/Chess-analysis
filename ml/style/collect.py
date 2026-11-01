"""Thu thập ván của từng kỳ thủ (D1): tải, nhận diện người chơi, lọc, khử trùng lặp, thống kê.

Nguồn (đều công khai):

- Chess.com Published-Data API: ``https://api.chess.com/pub/player/{user}/games/archives``, mỗi tháng một
  file PGN. Không cần khóa, nhưng phải gửi User-Agent.
- Lichess API: ``https://lichess.org/api/games/user/{user}`` trả cả lịch sử ván dạng PGN (khoảng 20 ván/giây
  khi không có token).
- Lichess broadcast database (CC0): ``https://database.lichess.org/broadcast/``, mỗi tháng một file
  ``.pgn.zst`` gồm các ván OTB được phát trực tiếp trên Lichess, có từ 2020-01.
- File PGN tải tay (TWIC, PGN Mentor…), dạng ``.pgn``, ``.pgn.zst`` hoặc ``.zip``.

Bước tải chỉ **giữ nguyên văn** các ván có dính tới một trong các kỳ thủ, vào ``raw/``. Mọi quyết định lọc
nằm ở bước ``build`` để có thể đổi luật mà không phải tải lại.

Tách văn bản thành từng ván bằng tay rồi đọc tiêu đề bằng regex, không qua python-chess: một tháng broadcast
có hàng chục nghìn ván mà chỉ vài chục ván cần giữ, phân tích đầy đủ từng ván sẽ chậm hơn hàng trăm lần.
"""

from __future__ import annotations

import collections
import dataclasses
import hashlib
import io
import json
import logging
import re
import time
import unicodedata
import zipfile
from collections.abc import Iterable, Iterator
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

import chess
import chess.pgn
import yaml
import zstandard

LOGGER = logging.getLogger(__name__)

USER_AGENT = "chess-analysis-thesis/1.0 (graduation project; style dataset)"
HEADER = re.compile(r'^\[(\w+)\s+"(.*)"\]\s*$')
TITLES = {"gm", "im", "fm", "cm", "nm", "wgm", "wim", "wfm", "wcm", "lm", "bot"}
SPEEDS = ("bullet", "blitz", "rapid", "classical", "correspondence", "unknown")
RESULTS = {"1-0", "0-1", "1/2-1/2"}
ONLINE_SOURCES = {"chesscom", "lichess"}


# --------------------------------------------------------------------------------------------- cấu hình


@dataclasses.dataclass(frozen=True, slots=True)
class Player:
    id: str
    display_name: str
    fide_id: str | None
    names: frozenset[frozenset[str]]
    chesscom: tuple[str, ...]
    lichess: tuple[str, ...]


def load_players(path: Path) -> dict[str, Player]:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))["players"]
    players = {}
    for player_id, entry in raw.items():
        players[player_id] = Player(
            id=player_id,
            display_name=entry.get("display_name", player_id),
            fide_id=str(entry["fide_id"]) if entry.get("fide_id") else None,
            names=frozenset(name_tokens(name) for name in [entry.get("display_name", ""), *entry.get("names", [])]
                            if name_tokens(name)),
            chesscom=tuple(entry.get("chesscom") or ()),
            lichess=tuple(entry.get("lichess") or ()),
        )
    return players


def name_tokens(name: str) -> frozenset[str]:
    """Tập từ của một tên: bỏ dấu, viết thường, bỏ dấu câu, nội dung trong ngoặc và danh hiệu."""
    text = re.sub(r"\(.*?\)", " ", name).replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char)).lower()
    tokens = re.split(r"[^a-z0-9]+", text)
    return frozenset(token for token in tokens if token and token not in TITLES)


# ----------------------------------------------------------------------------------------- đọc PGN thô


def split_games(lines: Iterable[str]) -> Iterator[str]:
    """Cắt luồng PGN thành văn bản từng ván: một ván mới bắt đầu ở dòng tiêu đề đầu tiên sau phần nước đi."""
    buffer: list[str] = []
    in_moves = False
    for line in lines:
        if line.startswith("[") and in_moves:
            yield "".join(buffer)
            buffer, in_moves = [], False
        if line.strip() and not line.startswith("["):
            in_moves = True
        buffer.append(line)
    if any(line.strip() for line in buffer):
        yield "".join(buffer)


def read_headers(text: str) -> dict[str, str]:
    headers = {}
    for line in text.splitlines():
        if not line.startswith("["):
            if line.strip():
                break
            continue
        match = HEADER.match(line)
        if match:
            headers[match.group(1)] = match.group(2)
    return headers


def open_text(path: Path) -> Iterator[Iterator[str]]:
    """Các luồng dòng văn bản trong một file .pgn, .pgn.zst hoặc .zip (mỗi file .pgn bên trong là một luồng)."""
    name = path.name.lower()
    if name.endswith(".zip"):
        with zipfile.ZipFile(path) as archive:
            for member in archive.namelist():
                if member.lower().endswith(".pgn"):
                    with archive.open(member) as raw:
                        yield io.TextIOWrapper(raw, encoding="utf-8", errors="replace")
        return
    with path.open("rb") as raw:
        binary = zstandard.ZstdDecompressor().stream_reader(raw) if name.endswith(".zst") else raw
        yield io.TextIOWrapper(binary, encoding="utf-8", errors="replace")


def iter_raw_games(path: Path) -> Iterator[str]:
    for stream in open_text(path):
        yield from split_games(stream)


# ------------------------------------------------------------------------------------ nhận diện kỳ thủ


def identify(headers: dict[str, str], players: dict[str, Player]) -> list[tuple[str, chess.Color]]:
    """Kỳ thủ nào (và cầm màu nào) trong một ván OTB, theo FIDE ID trước rồi tới tên."""
    found = []
    for color, side in ((chess.WHITE, "White"), (chess.BLACK, "Black")):
        fide = headers.get(f"{side}FideId", "").strip()
        tokens = name_tokens(headers.get(side, ""))
        for player in players.values():
            by_fide = bool(fide) and fide == player.fide_id
            # FIDE ID có mà khác thì là người khác, dù trùng tên.
            by_name = (not fide or not player.fide_id) and tokens in player.names
            if by_fide or by_name:
                found.append((player.id, color))
    return found


def account_color(headers: dict[str, str], account: str) -> chess.Color | None:
    """Bên mang tên tài khoản online; None nếu không bên nào (không nên xảy ra với dữ liệu từ API)."""
    wanted = account.lower()
    if headers.get("White", "").lower() == wanted:
        return chess.WHITE
    if headers.get("Black", "").lower() == wanted:
        return chess.BLACK
    return None


def quick_match(text: str, players: dict[str, Player]) -> bool:
    """Lọc nhanh khi quét broadcast: chỉ nhìn tiêu đề, không dựng ván."""
    return bool(identify(read_headers(text), players))


# ----------------------------------------------------------------------------------------- nhịp độ


TIME_CONTROL = re.compile(r"^(?:\d+/)?(\d+)(?:\+(\d+))?")


def classify_speed(headers: dict[str, str], source: str) -> str:
    """Nhịp độ theo ngưỡng của Lichess (thời gian ước tính = base + 40 × increment)."""
    tc = headers.get("TimeControl", "").strip()
    if source in ONLINE_SOURCES:
        if tc in ("-", "") or "/" in tc:
            # Lichess ghi "-" cho ván thư; Chess.com daily ghi "1/86400".
            return "correspondence" if tc else "unknown"
    match = TIME_CONTROL.match(tc)
    if match and tc not in ("-", "?"):
        estimate = int(match.group(1)) + 40 * int(match.group(2) or 0)
        if estimate < 180:
            return "bullet"
        if estimate < 480:
            return "blitz"
        if estimate < 1500:
            return "rapid"
        return "classical"
    event = f"{headers.get('Event', '')} {headers.get('BroadcastName', '')}".lower()
    if "bullet" in event:
        return "bullet"
    if "blitz" in event or "armageddon" in event:
        return "blitz"
    if "rapid" in event or "rápid" in event:
        return "rapid"
    # Ván OTB không ghi nhịp độ và không mang tên giải nhanh: mặc định cờ tiêu chuẩn.
    return "classical" if source not in ONLINE_SOURCES else "unknown"


# --------------------------------------------------------------------------------------------- tải


def _get(url: str, accept: str | None = None, token: str | None = None, retries: int = 5):
    headers = {"User-Agent": USER_AGENT}
    if accept:
        headers["Accept"] = accept
    if token:
        headers["Authorization"] = f"Bearer {token}"
    for attempt in range(retries):
        try:
            return urlopen(Request(url, headers=headers), timeout=120)
        except HTTPError as error:
            if error.code == 404:
                raise
            if error.code == 429 or error.code >= 500:
                wait = 60 if error.code == 429 else 5 * (attempt + 1)
                LOGGER.warning("%s trả %s, chờ %ss rồi thử lại", url, error.code, wait)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError(f"Không tải được {url} sau {retries} lần thử")


def _write_atomic(path: Path, chunks: Iterable[bytes]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".part")
    size = 0
    with partial.open("wb") as out:
        for chunk in chunks:
            out.write(chunk)
            size += len(chunk)
    partial.replace(path)
    return size


def _read_chunks(response, size: int = 1 << 16) -> Iterator[bytes]:
    with response:
        while chunk := response.read(size):
            yield chunk


def download_chesscom(account: str, raw_dir: Path, refresh: bool = False) -> int:
    """Tải từng tháng vào ``raw/chesscom/<account>/YYYY-MM.pgn``; tháng đã có thì bỏ qua (trừ tháng gần nhất)."""
    try:
        with _get(f"https://api.chess.com/pub/player/{quote(account.lower())}/games/archives") as response:
            archives = json.load(response)["archives"]
    except HTTPError as error:
        if error.code == 404:
            LOGGER.warning("Chess.com: không có tài khoản %s, bỏ qua", account)
            return 0
        raise
    target = raw_dir / "chesscom" / account
    downloaded = 0
    for index, url in enumerate(archives):
        year, month = url.rstrip("/").split("/")[-2:]
        path = target / f"{year}-{month}.pgn"
        latest = index == len(archives) - 1
        if path.exists() and not refresh and not latest:
            continue
        size = _write_atomic(path, _read_chunks(_get(f"{url}/pgn")))
        downloaded += 1
        LOGGER.info("Chess.com %s %s-%s: %.1f KB", account, year, month, size / 1024)
        time.sleep(0.3)
    LOGGER.info("Chess.com %s: %d tháng, tải mới %d", account, len(archives), downloaded)
    return downloaded


def download_lichess(account: str, raw_dir: Path, token: str | None = None, refresh: bool = False) -> int:
    """Toàn bộ ván của một tài khoản vào ``raw/lichess/<account>.pgn``."""
    path = raw_dir / "lichess" / f"{account}.pgn"
    if path.exists() and not refresh:
        LOGGER.info("Lichess %s: đã có %s, bỏ qua (dùng --refresh để tải lại)", account, path)
        return 0
    url = (f"https://lichess.org/api/games/user/{quote(account)}"
           "?clocks=false&evals=false&opening=false&literate=false")
    try:
        response = _get(url, accept="application/x-chess-pgn", token=token)
    except HTTPError as error:
        if error.code == 404:
            LOGGER.warning("Lichess: không có tài khoản %s (hoặc đã đóng), bỏ qua", account)
            return 0
        raise
    LOGGER.info("Lichess %s: đang tải (~20 ván/giây, tài khoản nhiều ván mất vài chục phút)…", account)
    size = _write_atomic(path, _read_chunks(response))
    LOGGER.info("Lichess %s: %.1f MB", account, size / 1e6)
    return 1


BROADCAST_LIST = "https://database.lichess.org/broadcast/list.txt"


def broadcast_months(first: str | None, last: str | None) -> list[tuple[str, str]]:
    with _get(BROADCAST_LIST) as response:
        urls = [line.strip() for line in response.read().decode().splitlines() if line.strip()]
    months = []
    for url in urls:
        match = re.search(r"(\d{4}-\d{2})\.pgn\.zst$", url)
        if match and (not first or match.group(1) >= first) and (not last or match.group(1) <= last):
            months.append((match.group(1), url))
    return sorted(months)


def filter_stream(lines: Iterable[str], players: dict[str, Player]) -> Iterator[str]:
    for text in split_games(lines):
        if quick_match(text, players):
            yield text


def download_broadcasts(players: dict[str, Player], raw_dir: Path, first: str | None = None,
                        last: str | None = None, refresh: bool = False) -> int:
    """Đọc thẳng từng tháng broadcast qua mạng, chỉ giữ ván của các kỳ thủ vào ``raw/broadcast/YYYY-MM.pgn``."""
    target = raw_dir / "broadcast"
    done = 0
    for month, url in broadcast_months(first, last):
        path = target / f"{month}.pgn"
        if path.exists() and not refresh:
            continue
        response = _get(url)
        with response:
            stream = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(response),
                                      encoding="utf-8", errors="replace")
            kept = list(filter_stream(stream, players))
        # Ghi cả khi rỗng: file tồn tại nghĩa là tháng đó đã quét xong.
        _write_atomic(path, (text.encode("utf-8") + b"\n" for text in kept))
        done += 1
        LOGGER.info("Broadcast %s: giữ %d ván", month, len(kept))
    return done


def scan_files(sources: Iterable[Path], players: dict[str, Player], raw_dir: Path) -> int:
    """Quét file PGN tải tay (TWIC, PGN Mentor…), giữ ván của các kỳ thủ vào ``raw/otb/<tên file>.pgn``."""
    files: list[Path] = []
    for source in sources:
        if source.is_dir():
            files += sorted(p for p in source.rglob("*") if p.name.lower().endswith((".pgn", ".pgn.zst", ".zip")))
        else:
            files.append(source)
    total = 0
    for file in files:
        kept = [text for text in iter_raw_games(file) if quick_match(text, players)]
        stem = re.sub(r"\.(pgn(\.zst)?|zip)$", "", file.name, flags=re.IGNORECASE)
        _write_atomic(raw_dir / "otb" / f"{stem}.pgn", (text.encode("utf-8") + b"\n" for text in kept))
        total += len(kept)
        LOGGER.info("%s: giữ %d ván", file, len(kept))
    return total


# --------------------------------------------------------------------------------------------- build


@dataclasses.dataclass(slots=True)
class Candidate:
    """Một ván thô gắn với một kỳ thủ và màu quân của họ."""

    player: str
    color: chess.Color
    source: str
    origin: str
    text: str


def iter_candidates(raw_dir: Path, players: dict[str, Player]) -> Iterator[Candidate]:
    accounts = {("chesscom", a.lower()): p.id for p in players.values() for a in p.chesscom}
    accounts |= {("lichess", a.lower()): p.id for p in players.values() for a in p.lichess}

    for source in ("chesscom", "lichess"):
        root = raw_dir / source
        if not root.exists():
            continue
        files = sorted(root.rglob("*.pgn"))
        for file in files:
            account = file.parent.name if source == "chesscom" else file.stem
            player = accounts.get((source, account.lower()))
            if player is None:
                LOGGER.warning("%s: tài khoản %s không còn trong players.yaml, bỏ qua", file, account)
                continue
            for text in iter_raw_games(file):
                color = account_color(read_headers(text), account)
                if color is not None:
                    yield Candidate(player, color, source, f"{source}:{account}", text)

    for source in ("broadcast", "otb"):
        root = raw_dir / source
        if not root.exists():
            continue
        for file in sorted(root.glob("*.pgn")):
            for text in iter_raw_games(file):
                for player, color in identify(read_headers(text), players):
                    yield Candidate(player, color, source, f"{source}:{file.stem}", text)


# Broadcast các giải cờ 960 thường không ghi Variant/FEN (Saint Louis Chess 9LX, giải vô địch Fischer
# Random 2022, Freestyle Chess…): nước đi hiện ra như cờ thường bị lỗi từ vài nước đầu.
CHESS960_EVENT = re.compile(r"960|9lx|fischer\s*random|freestyle|chess\s*random", re.IGNORECASE)


def reject_reason(headers: dict[str, str]) -> str | None:
    variant = headers.get("Variant", "Standard").lower()
    if variant not in ("standard", "chess", ""):
        return "variant"
    if CHESS960_EVENT.search(f"{headers.get('Event', '')} {headers.get('BroadcastName', '')}"):
        return "variant"
    fen = headers.get("FEN")
    if fen and fen != chess.STARTING_FEN:
        return "custom_start"
    if headers.get("Result") not in RESULTS:
        return "unfinished"
    return None


def game_date(headers: dict[str, str]) -> str:
    """Ngày dạng YYYY.MM.DD (có thể còn '??'); ưu tiên Date vì UTCDate của broadcast là giờ phát sóng."""
    for key in ("Date", "UTCDate"):
        value = headers.get(key, "")
        if re.match(r"^\d{4}\.", value):
            return value
    return "????.??.??"


@dataclasses.dataclass(slots=True)
class Stats:
    games: int = 0
    positions: int = 0
    by_source: collections.Counter = dataclasses.field(default_factory=collections.Counter)
    by_speed: collections.Counter = dataclasses.field(default_factory=collections.Counter)
    by_year: collections.Counter = dataclasses.field(default_factory=collections.Counter)
    by_color: collections.Counter = dataclasses.field(default_factory=collections.Counter)
    positions_by_speed: collections.Counter = dataclasses.field(default_factory=collections.Counter)
    rejected: collections.Counter = dataclasses.field(default_factory=collections.Counter)
    duplicates: int = 0
    truncated: int = 0
    first_date: str | None = None
    last_date: str | None = None

    def as_dict(self, target_games: int) -> dict:
        return {
            "games": self.games,
            "positions": self.positions,
            "meets_target": self.games >= target_games,
            "first_date": self.first_date,
            "last_date": self.last_date,
            "by_source": dict(self.by_source.most_common()),
            "by_speed": {speed: self.by_speed[speed] for speed in SPEEDS if self.by_speed[speed]},
            "positions_by_speed": {s: self.positions_by_speed[s] for s in SPEEDS if self.positions_by_speed[s]},
            "by_color": dict(self.by_color),
            "by_year": dict(sorted(self.by_year.items())),
            "duplicates_removed": self.duplicates,
            "truncated_kept": self.truncated,
            "rejected": dict(self.rejected.most_common()),
        }


KEEP_HEADERS = ("Event", "Site", "Date", "Round", "White", "Black", "Result", "WhiteElo", "BlackElo",
                "WhiteFideId", "BlackFideId", "TimeControl", "Termination", "ECO")


def build(raw_dir: Path, out_dir: Path, players: dict[str, Player], min_plies: int = 20,
          target_games: int = 3000) -> dict:
    """Lọc + khử trùng lặp + ghi ``<out>/<player>/games.pgn`` (sắp theo ngày, cho D2 chia theo thời gian).

    Trùng lặp: cùng kỳ thủ, cùng màu, cùng chuỗi nước đi. Cùng một ván OTB thường có mặt ở cả broadcast lẫn
    TWIC với tên giải và cách ghi tên khác nhau, nên khóa chỉ dựa vào nước đi. Hai ván khác nhau trùng
    nguyên chuỗi từ {min_plies} nửa nước trở lên gần như chỉ là các ván hòa lặp lý thuyết, mất chúng không đáng kể.
    """
    stats = {player_id: Stats() for player_id in players}
    seen: set[tuple[str, bool, str]] = set()
    kept: dict[str, list[tuple[str, str]]] = {player_id: [] for player_id in players}
    exporter_args = dict(headers=True, variations=False, comments=False)

    for candidate in iter_candidates(raw_dir, players):
        stat = stats[candidate.player]
        headers = read_headers(candidate.text)
        reason = reject_reason(headers)
        truncated = False
        if reason is None:
            game = chess.pgn.read_game(io.StringIO(candidate.text))
            if game is None:
                reason = "parse_error"
            elif game.errors:
                # python-chess dừng ở nước lỗi và giữ các nước trước đó. Lỗi bàn DGT cuối ván thì phần
                # trước vẫn là cờ thật; lỗi từ vài nước đầu (ván 960 không ghi nhãn) sẽ rơi vào too_short.
                truncated = True
        if reason is None:
            moves = [move.uci() for move in game.mainline_moves()]
            if len(moves) < min_plies:
                reason = "parse_error" if truncated else "too_short"
        if reason is not None:
            stat.rejected[reason] += 1
            continue

        key = (candidate.player, candidate.color, hashlib.sha1(" ".join(moves).encode()).hexdigest())
        if key in seen:
            stat.duplicates += 1
            continue
        seen.add(key)

        speed = classify_speed(headers, candidate.source)
        date = game_date(headers)
        color = "white" if candidate.color == chess.WHITE else "black"
        # Số nước của chính kỳ thủ: Trắng đi các nửa nước chẵn (0, 2, …).
        own_moves = (len(moves) + (1 if candidate.color == chess.WHITE else 0)) // 2

        clean = chess.pgn.Game()
        for name in KEEP_HEADERS:
            if headers.get(name):
                clean.headers[name] = headers[name]
        clean.headers["Date"] = date
        clean.headers["StylePlayer"] = candidate.player
        clean.headers["StyleColor"] = color
        clean.headers["StyleSource"] = candidate.origin
        clean.headers["StyleSpeed"] = speed
        if truncated:
            clean.headers["StyleTruncated"] = "1"
        node = clean
        for move in game.mainline_moves():
            node = node.add_variation(move)
        kept[candidate.player].append((date, clean.accept(chess.pgn.StringExporter(**exporter_args))))

        stat.truncated += truncated
        stat.games += 1
        stat.positions += own_moves
        stat.by_source[candidate.source] += 1
        stat.by_speed[speed] += 1
        stat.positions_by_speed[speed] += own_moves
        stat.by_color[color] += 1
        year = date[:4]
        stat.by_year[year if year.isdigit() else "unknown"] += 1
        if date[:4].isdigit():
            stat.first_date = min(stat.first_date or date, date)
            stat.last_date = max(stat.last_date or date, date)

    for player_id, games in kept.items():
        games.sort(key=lambda item: item[0])
        target = out_dir / player_id / "games.pgn"
        _write_atomic(target, (text.encode("utf-8") + b"\n\n" for _, text in games))
        LOGGER.info("%s: %d ván, %d nước của kỳ thủ → %s", player_id, stats[player_id].games,
                    stats[player_id].positions, target)

    return {
        "description": "Ván công khai của từng kỳ thủ cho giai đoạn D (mô hình theo phong cách).",
        "sources": {
            "chesscom": "Chess.com Published-Data API (api.chess.com/pub)",
            "lichess": "Lichess API /api/games/user",
            "broadcast": "Lichess broadcast database, CC0 (database.lichess.org/broadcast)",
            "otb": "File PGN tải tay (TWIC, PGN Mentor…)",
        },
        "filters": {
            "min_plies": min_plies,
            "variant": "chỉ cờ tiêu chuẩn từ thế ban đầu",
            "result": "chỉ ván đã có kết quả",
            "dedupe": "cùng kỳ thủ + cùng màu + cùng chuỗi nước đi",
            "chess960_events": "loại theo tên giải (960, 9LX, Fischer Random, Freestyle)",
            "truncated": "ván có nước lỗi (bàn DGT) giữ phần trước nước lỗi nếu còn ≥ min_plies",
        },
        "target_games": target_games,
        "players": {player_id: {"display_name": players[player_id].display_name,
                                **stats[player_id].as_dict(target_games)} for player_id in players},
    }
