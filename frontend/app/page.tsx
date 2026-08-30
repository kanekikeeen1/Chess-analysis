"use client";

import {
  Archive,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  LockKeyhole,
  SearchCheck,
  Sparkles,
  Target,
} from "lucide-react";

import { useAuth } from "@/app/auth-provider";

const features = [
  {
    href: "/analysis",
    icon: SearchCheck,
    title: "Phân tích ván cờ",
    description: "Dán PGN hoặc FEN, theo dõi Stockfish, nhãn từng nước, khai cuộc và độ chính xác.",
    accent: "text-[#78a7ff] bg-[#78a7ff]/12",
  },
  {
    href: "/archive",
    icon: Archive,
    title: "Kho ván cờ",
    description: "Lưu báo cáo đã phân tích theo tài khoản để mở lại, so sánh và học từ sai lầm cũ.",
    accent: "text-[#d8b45f] bg-[#d8b45f]/12",
    protected: true,
  },
  {
    href: "/exercises",
    icon: BookOpenCheck,
    title: "Bài tập có lộ trình",
    description: "Luyện 30 khai cuộc phổ biến và các thế tàn cuộc nền tảng theo từng nhóm kỹ năng.",
    accent: "text-[#72cf86] bg-[#72cf86]/12",
  },
];

export default function HomePage() {
  const { user } = useAuth();

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_70%_0%,rgba(76,126,89,0.24),transparent_34%),#111713]">
      <section className="mx-auto max-w-7xl px-5 pb-12 pt-10 sm:px-8 lg:px-10 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d8b45f]/25 bg-[#d8b45f]/8 px-3 py-1.5 text-sm text-[#e3c87f]">
              <Sparkles className="size-4" />
              Phân tích, lưu trữ và luyện tập trong một hệ thống
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl">
              Không chỉ biết nước sai — <span className="text-[#d8b45f]">hãy hiểu vì sao.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#aeb8b1] sm:text-lg">
              Chess Analysis kết hợp Stockfish, thư viện ECO và dữ liệu học tập cá nhân để biến mỗi ván đấu thành một bài học có thể xem lại.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/analysis" className="inline-flex items-center gap-2 rounded-xl bg-[#d8b45f] px-5 py-3.5 font-semibold text-[#172019] shadow-[inset_0_-3px_0_rgba(0,0,0,0.16)] transition hover:bg-[#e3c87f]">
                Phân tích ngay <ArrowRight className="size-5" />
              </a>
              <a href={user ? "/archive" : "/login?returnTo=/archive"} className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-5 py-3.5 font-semibold text-white transition hover:bg-white/9">
                {user ? <Archive className="size-5" /> : <LockKeyhole className="size-5" />}
                {user ? "Mở kho ván cờ" : "Đăng nhập để lưu"}
              </a>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-5 rounded-[2.5rem] bg-[#4b7fe8]/8 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#1c2420]/92 p-5 shadow-2xl shadow-black/35">
              <div className="flex items-center justify-between border-b border-white/8 pb-4">
                <div>
                  <p className="font-semibold">Báo cáo sau ván</p>
                  <p className="text-xs text-[#89958d]">Stockfish Depth 20 · ECO C50</p>
                </div>
                <span className="rounded-lg bg-[#72cf86]/12 px-2.5 py-1 text-sm font-semibold text-[#8bd99a]">Hoàn tất</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#151b17] p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-[#89958d]">Độ chính xác trắng</p>
                  <p className="mt-2 text-3xl font-semibold">91.8%</p>
                </div>
                <div className="rounded-2xl bg-[#151b17] p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-[#89958d]">Độ chính xác đen</p>
                  <p className="mt-2 text-3xl font-semibold">87.4%</p>
                </div>
              </div>
              <div className="mt-3 rounded-2xl bg-[#151b17] p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-[#32b7ce] text-xl font-bold">!!</span>
                  <div>
                    <p className="font-semibold">Nước đi thiên tài được phát hiện</p>
                    <p className="text-sm text-[#89958d]">Hi sinh có cơ sở và giữ thế thắng</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-[#d8b45f]/20 bg-[#d8b45f]/7 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[#cdbb89]">Khai cuộc</p>
                <p className="mt-1 font-semibold text-[#f0ddad]">Italian Game: Classical Variation</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <a key={feature.href} href={feature.protected && !user ? `/login?returnTo=${feature.href}` : feature.href} className="group rounded-3xl border border-white/9 bg-[#1a211d]/85 p-5 transition hover:-translate-y-1 hover:border-white/16 hover:bg-[#202923]">
                <div className="flex items-start justify-between">
                  <span className={`grid size-12 place-items-center rounded-2xl ${feature.accent}`}><Icon className="size-6" /></span>
                  {feature.protected && !user ? <LockKeyhole className="size-4 text-[#6f7a72]" /> : <ArrowRight className="size-5 text-[#6f7a72] transition group-hover:translate-x-1 group-hover:text-white" />}
                </div>
                <h2 className="mt-5 text-xl font-semibold">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#96a098]">{feature.description}</p>
              </a>
            );
          })}
        </div>

        <div className="mt-8 grid gap-4 rounded-3xl border border-white/9 bg-[#151b17]/75 p-5 sm:grid-cols-3 sm:p-6">
          <div className="flex items-center gap-3"><BrainCircuit className="size-6 text-[#78a7ff]" /><div><p className="font-semibold">Stockfish Depth 20</p><p className="text-xs text-[#89958d]">Phân tích thích ứng theo giai đoạn</p></div></div>
          <div className="flex items-center gap-3"><Target className="size-6 text-[#72cf86]" /><div><p className="font-semibold">Nhãn nước đi có quy tắc</p><p className="text-xs text-[#89958d]">WDL, CPL, độ duy nhất và hi sinh</p></div></div>
          <div className="flex items-center gap-3"><BarChart3 className="size-6 text-[#d8b45f]" /><div><p className="font-semibold">Tiến trình theo tài khoản</p><p className="text-xs text-[#89958d]">Dữ liệu được backend quản lý</p></div></div>
        </div>
      </section>
    </main>
  );
}
