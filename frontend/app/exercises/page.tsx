"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ChevronRight, Crown, LoaderCircle, Swords, Target } from "lucide-react";

import { backendRequest } from "@/lib/backend-api";
import type { ExerciseLesson } from "@/lib/domain-types";

const groupOrder = ["Khai cuộc mở", "Khai cuộc bán mở", "Khai cuộc kín", "Khai cuộc cánh"];

export default function ExercisesPage() {
  const [lessons, setLessons] = useState<ExerciseLesson[]>([]);
  const [activeCategory, setActiveCategory] = useState<"OPENING" | "ENDGAME">("OPENING");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void backendRequest<ExerciseLesson[]>("/api/exercises")
      .then(setLessons)
      .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Không thể tải bài tập."))
      .finally(() => setIsLoading(false));
  }, []);

  const visibleLessons = useMemo(() => lessons.filter((lesson) => lesson.category === activeCategory), [activeCategory, lessons]);
  const grouped = useMemo(() => {
    const result = new Map<string, ExerciseLesson[]>();
    for (const lesson of visibleLessons) result.set(lesson.groupName, [...(result.get(lesson.groupName) ?? []), lesson]);
    return [...result.entries()].sort(([a], [b]) => {
      if (activeCategory === "ENDGAME") return 0;
      return groupOrder.indexOf(a) - groupOrder.indexOf(b);
    });
  }, [activeCategory, visibleLessons]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_80%_0%,rgba(75,127,232,0.15),transparent_32%),#111713] px-5 py-10 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header>
          <div className="flex items-center gap-2 text-sm font-medium text-[#72cf86]"><BookOpenCheck className="size-4" /> Lộ trình luyện tập</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Học khai cuộc, làm chủ tàn cuộc</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#96a098]">30 khai cuộc thường gặp được chia theo cấu trúc thế trận; các thế tàn cuộc tập trung vào kỹ thuật chiếu hết, phong cấp và chuyển hóa lợi thế.</p>
        </header>

        <div className="mt-7 grid max-w-xl grid-cols-2 rounded-2xl border border-white/9 bg-[#1a211d] p-1.5">
          <button type="button" onClick={() => setActiveCategory("OPENING")} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition ${activeCategory === "OPENING" ? "bg-[#d8b45f] text-[#172019]" : "text-[#96a098] hover:text-white"}`}><Swords className="size-5" /> Khai cuộc</button>
          <button type="button" onClick={() => setActiveCategory("ENDGAME")} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition ${activeCategory === "ENDGAME" ? "bg-[#d8b45f] text-[#172019]" : "text-[#96a098] hover:text-white"}`}><Crown className="size-5" /> Tàn cuộc</button>
        </div>

        {error && <div className="mt-6 rounded-2xl border border-[#ef6461]/25 bg-[#ef6461]/10 p-4 text-sm text-[#ffaaa8]">{error}</div>}
        {isLoading ? <div className="mt-10 grid place-items-center py-20"><LoaderCircle className="size-8 animate-spin text-[#d8b45f]" /></div> : (
          <div className="mt-8 space-y-9">
            {grouped.map(([groupName, groupLessons]) => (
              <section key={groupName}>
                <div className="mb-4 flex items-center justify-between">
                  <div><h2 className="text-xl font-semibold">{groupName}</h2><p className="mt-1 text-xs text-[#89958d]">{groupLessons.length} bài học</p></div>
                  <Target className="size-5 text-[#69746c]" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {groupLessons.map((lesson) => (
                    <a key={lesson.slug} href={`/exercises/${lesson.slug}`} className="group rounded-2xl border border-white/9 bg-[#1a211d]/90 p-4 transition hover:-translate-y-0.5 hover:border-[#d8b45f]/30 hover:bg-[#202923]">
                      <div className="flex items-start justify-between gap-3"><span className="rounded-lg bg-white/6 px-2 py-1 text-xs text-[#aeb8b1]">{lesson.difficulty}</span><ChevronRight className="size-4 text-[#69746c] transition group-hover:translate-x-1 group-hover:text-[#d8b45f]" /></div>
                      <h3 className="mt-3 font-semibold text-white">{lesson.title}</h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#8f9a92]">{lesson.description}</p>
                      <p className="mt-3 truncate font-mono text-xs text-[#d8b45f]">{lesson.solutionLine}</p>
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
