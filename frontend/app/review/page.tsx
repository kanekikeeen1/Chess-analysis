"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, CalendarClock, LoaderCircle, LogIn, Puzzle, Repeat2 } from "lucide-react";

import { useAuth } from "@/app/auth-provider";
import { backendRequest } from "@/lib/backend-api";
import type { ReviewSummary } from "@/lib/domain-types";
import { reviewHref } from "@/lib/review";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" });
}

export default function ReviewPage() {
  const { isLoading: authLoading, user } = useAuth();
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;
    void backendRequest<ReviewSummary>("/api/reviews/summary")
      .then(setSummary)
      .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Không thể tải lịch ôn."));
  }, [authLoading, user]);

  if (!authLoading && !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#111713] px-5">
        <div className="max-w-md rounded-3xl border border-white/9 bg-[#1a211d] p-8 text-center">
          <CalendarCheck className="mx-auto size-8 text-[#d8b45f]" />
          <h1 className="mt-4 text-2xl font-semibold">Ôn tập hôm nay</h1>
          <p className="mt-3 text-sm leading-6 text-[#aeb8b1]">Puzzle và sai lầm bạn làm sai sẽ được lên lịch ôn lại. Đăng nhập để xem lịch của bạn.</p>
          <a href="/login?returnTo=%2Freview" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#4b7fe8] px-4 py-2.5 font-semibold text-white"><LogIn className="size-4" /> Đăng nhập</a>
        </div>
      </main>
    );
  }

  const first = summary?.cards[0];

  return (
    <main className="min-h-screen bg-[#111713] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="rounded-3xl border border-white/9 bg-[#1a211d] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <CalendarCheck className="size-7 text-[#d8b45f]" />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Ôn tập hôm nay</h1>
              <p className="mt-1 text-sm text-[#aeb8b1]">Ôn lại đúng lúc sắp quên: làm đúng thì lần ôn sau giãn ra (1 → 6 → ~15 ngày…), làm sai thì gặp lại ngày mai.</p>
            </div>
          </div>
          {summary && (
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/5 px-4 py-3"><div className="text-xs text-[#89958d]">Đến hạn</div><div className="text-2xl font-semibold text-[#f0ddad]">{summary.due}</div></div>
              <div className="rounded-2xl bg-white/5 px-4 py-3"><div className="text-xs text-[#89958d]">Tổng số thẻ</div><div className="text-2xl font-semibold">{summary.total}</div></div>
              <div className="rounded-2xl bg-white/5 px-4 py-3"><div className="text-xs text-[#89958d]">Đã thuộc (≥ 21 ngày)</div><div className="text-2xl font-semibold text-[#72cf86]">{summary.learned}</div></div>
            </div>
          )}
        </header>

        {error && <div className="mt-5 rounded-3xl border border-[#ef6461]/25 bg-[#ef6461]/10 p-5 text-[#ffaaa8]">{error}</div>}

        {!summary && !error ? (
          <div className="mt-8 grid place-items-center"><LoaderCircle className="size-8 animate-spin text-[#d8b45f]" /></div>
        ) : summary && summary.cards.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-white/9 bg-[#1a211d] p-6 text-sm leading-6 text-[#c7d0c9]">
            <p className="flex items-center gap-2 font-semibold text-white"><CalendarClock className="size-5 text-[#72cf86]" /> Hôm nay không còn thẻ nào cần ôn.</p>
            <p className="mt-2">
              {summary.nextDueAt ? `Thẻ tiếp theo đến hạn lúc ${formatDate(summary.nextDueAt)}. ` : "Chưa có thẻ nào. "}
              Thẻ mới được tạo khi bạn giải sai một <a href="/puzzles" className="text-[#8fb4ff] hover:underline">puzzle</a> hoặc trả lời sai ở <a href="/mistakes" className="text-[#8fb4ff] hover:underline">Học từ sai lầm</a>.
            </p>
          </div>
        ) : summary && first && (
          <section className="mt-5 space-y-4">
            <a href={reviewHref(first.kind, first.itemId)} className="flex items-center justify-center gap-2 rounded-2xl bg-[#4b7fe8] px-5 py-3.5 font-semibold text-white hover:bg-[#5b8cf0]">
              Bắt đầu ôn ({summary.due} thẻ)
            </a>
            <ul className="divide-y divide-white/8 overflow-hidden rounded-3xl border border-white/9 bg-[#1a211d]">
              {summary.cards.map((card) => (
                <li key={card.cardId}>
                  <a href={reviewHref(card.kind, card.itemId)} className="flex items-center gap-4 px-5 py-4 hover:bg-white/4">
                    {card.kind === "PUZZLE"
                      ? <Puzzle className="size-5 shrink-0 text-[#d8b45f]" />
                      : <Repeat2 className="size-5 shrink-0 text-[#ef8b8b]" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{card.title}</div>
                      <div className="truncate text-xs text-[#89958d]">{card.detail}</div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-[#89958d]">
                      <div>{card.repetitions === 0 ? "Đang học lại" : `Nhớ ${card.repetitions} lần liên tiếp`}</div>
                      <div>Sai {card.lapses} lần</div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
