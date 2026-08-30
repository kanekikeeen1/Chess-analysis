"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  CalendarDays,
  Eye,
  LoaderCircle,
  LockKeyhole,
  SearchCheck,
  Trash2,
  Trophy,
} from "lucide-react";

import { useAuth } from "@/app/auth-provider";
import { backendRequest } from "@/lib/backend-api";
import type { GameSummary } from "@/lib/domain-types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function AccuracyPill({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="rounded-lg bg-white/6 px-2.5 py-1 text-xs text-[#aeb8b1]">
      {label} <strong className="ml-1 text-white">{value == null ? "—" : `${value.toFixed(1)}%`}</strong>
    </span>
  );
}

export default function ArchivePage() {
  const { isLoading: authLoading, user } = useAuth();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const loadGames = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setGames(await backendRequest<GameSummary[]>("/api/games"));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Không thể tải kho ván cờ.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setSavedNotice(new URLSearchParams(window.location.search).has("saved"));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      window.location.replace("/login?returnTo=/archive");
      return;
    }
    void loadGames();
  }, [authLoading, loadGames, user]);

  async function deleteGame(id: number) {
    if (!window.confirm("Xóa ván cờ này khỏi kho lưu trữ?")) return;
    setDeletingId(id);
    try {
      await backendRequest<void>(`/api/games/${id}`, { method: "DELETE" });
      setGames((current) => current.filter((game) => game.id !== id));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Không thể xóa ván cờ.");
    } finally {
      setDeletingId(null);
    }
  }

  if (authLoading || !user) {
    return <main className="grid min-h-screen place-items-center"><LoaderCircle className="size-8 animate-spin text-[#d8b45f]" /></main>;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_80%_0%,rgba(76,126,89,0.18),transparent_30%),#111713] px-5 py-10 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#d8b45f]"><Archive className="size-4" /> Dữ liệu riêng của {user.username}</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Kho ván cờ đã phân tích</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#96a098]">Mỗi báo cáo được lưu trong MySQL và chỉ chủ tài khoản mới có quyền đọc hoặc xóa.</p>
          </div>
          <a href="/analysis" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d8b45f] px-4 py-3 font-semibold text-[#172019] hover:bg-[#e3c87f]"><SearchCheck className="size-5" /> Phân tích ván mới</a>
        </header>

        {error && <div className="mt-6 rounded-2xl border border-[#ef6461]/25 bg-[#ef6461]/10 p-4 text-sm text-[#ffaaa8]">{error}</div>}
        {savedNotice && !error && (
          <div className="mt-6 rounded-2xl border border-[#72cf86]/25 bg-[#72cf86]/10 p-4 text-sm font-medium text-[#b9e7c2]">
            Đã ghi ván cờ vào MySQL và tải lại kho lưu trữ thành công.
          </div>
        )}

        {isLoading ? (
          <div className="mt-10 grid place-items-center rounded-3xl border border-white/8 bg-[#1a211d] py-20"><LoaderCircle className="size-8 animate-spin text-[#d8b45f]" /></div>
        ) : games.length === 0 ? (
          <section className="mt-8 grid place-items-center rounded-3xl border border-dashed border-white/15 bg-[#1a211d]/70 px-5 py-20 text-center">
            <span className="grid size-16 place-items-center rounded-3xl bg-white/6"><Archive className="size-8 text-[#89958d]" /></span>
            <h2 className="mt-5 text-xl font-semibold">Kho ván cờ đang trống</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#96a098]">Nạp một ván PGN hoặc FEN, chờ Game Review hoàn tất rồi chọn “Lưu vào kho ván cờ”.</p>
            <a href="/analysis" className="mt-5 rounded-xl bg-[#4b7fe8] px-4 py-3 font-semibold text-white hover:bg-[#5a8cf0]">Đi tới phân tích</a>
          </section>
        ) : (
          <section className="mt-8 grid gap-4">
            {games.map((game) => (
              <article key={game.id} className="group rounded-3xl border border-white/9 bg-[#1a211d]/90 p-5 transition hover:border-white/16 hover:bg-[#202923]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <a href={`/archive/${game.id}`} className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#89958d]">
                      <span className="rounded-md bg-[#d8b45f]/12 px-2 py-1 font-semibold text-[#e3c87f]">{game.sourceType}</span>
                      {game.openingEco && <span>{game.openingEco}</span>}
                      <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> {formatDate(game.createdAt)}</span>
                    </div>
                    <h2 className="mt-3 truncate text-lg font-semibold text-white">{game.title}</h2>
                    <p className="mt-1 truncate text-sm text-[#96a098]">{game.openingName ?? "Chưa xác định khai cuộc"}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <AccuracyPill label="Trắng" value={game.whiteAccuracy} />
                      <AccuracyPill label="Đen" value={game.blackAccuracy} />
                      <span className="rounded-lg bg-white/6 px-2.5 py-1 text-xs text-[#aeb8b1]">{game.moveCount} lượt · Depth {game.depth ?? "—"}</span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-[#72cf86]/10 px-2.5 py-1 text-xs font-semibold text-[#8bd99a]"><Trophy className="size-3.5" /> {game.result}</span>
                    </div>
                  </a>
                  <div className="flex items-center gap-2 sm:pl-3">
                    <a href={`/analysis?archive=${game.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#4b7fe8] px-4 text-sm font-semibold text-white transition hover:bg-[#5a8cf0]" aria-label={`Xem lại ${game.title}`}>
                      <Eye className="size-4" />
                      Xem lại
                    </a>
                    <button type="button" onClick={() => void deleteGame(game.id)} disabled={deletingId === game.id} className="grid size-11 place-items-center rounded-xl border border-white/10 text-[#96a098] hover:border-[#ef6461]/30 hover:bg-[#ef6461]/10 hover:text-[#ff8986] disabled:opacity-50" aria-label="Xóa ván cờ">
                      {deletingId === game.id ? <LoaderCircle className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/8 bg-[#151b17] p-4 text-sm text-[#96a098]">
          <LockKeyhole className="mt-0.5 size-5 shrink-0 text-[#72cf86]" />
          API kiểm tra cookie phiên đăng nhập và `user_id` ở mọi thao tác. Người dùng không thể mở ván cờ của tài khoản khác bằng cách đổi URL.
        </div>
      </div>
    </main>
  );
}
