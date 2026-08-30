"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Database, LockKeyhole, LogIn, ShieldCheck, UserRound } from "lucide-react";

import { useAuth } from "@/app/auth-provider";

export default function LoginPage() {
  const { isLoading, login, user } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setRegistered(search.get("registered") === "1");
    const requestedPath = search.get("returnTo");
    if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) setReturnTo(requestedPath);
  }, []);

  useEffect(() => {
    if (!isLoading && user) window.location.replace(returnTo);
  }, [isLoading, returnTo, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
      window.location.assign(returnTo);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Không thể đăng nhập. Hãy thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page min-h-screen bg-[#172019] px-4 py-8 text-[#f7f2e3] sm:grid sm:place-items-center sm:py-12">
      <section className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#202623] shadow-2xl shadow-black/35">
        <div className="border-b border-white/10 bg-[#181c19] px-5 py-4">
          <a href="/" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[#b8c1ba] transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b45f]">
            <ArrowLeft className="size-4" />
            Trở về Chess Analysis
          </a>
        </div>

        <div className="px-6 py-8 sm:px-8">
          <div className="mb-7 flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-[#d8b45f] text-3xl text-[#172019] shadow-lg shadow-black/20">♞</div>
            <div>
              <p className="text-xl font-semibold tracking-tight">Chess Analysis</p>
              <p className="text-sm text-[#96a098]">Tài khoản nội bộ</p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Đăng nhập</h1>
          <p className="mt-2 text-sm leading-6 text-[#aeb8b1]">Nhập tài khoản Chess Analysis bạn đã đăng ký.</p>

          {registered && (
            <p className="mt-4 rounded-xl border border-[#72cf86]/25 bg-[#72cf86]/10 px-3 py-2.5 text-sm text-[#b9e7c2]">
              Đăng ký thành công. Hãy đăng nhập bằng tài khoản vừa tạo.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Tên đăng nhập</span>
              <span className="relative block">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#7f8982]" />
                <input value={username} onChange={(event) => setUsername(event.target.value)} required minLength={4} maxLength={24} autoComplete="username" className="h-12 w-full rounded-xl border border-white/10 bg-[#171c1a] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-[#69736c] focus:border-[#4b7fe8] focus:ring-2 focus:ring-[#4b7fe8]/25" placeholder="Nhập tên đăng nhập" />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Mật khẩu</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#7f8982]" />
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={72} autoComplete="current-password" className="h-12 w-full rounded-xl border border-white/10 bg-[#171c1a] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-[#69736c] focus:border-[#4b7fe8] focus:ring-2 focus:ring-[#4b7fe8]/25" placeholder="Tối thiểu 8 ký tự" />
              </span>
            </label>

            {error && <p className="rounded-xl bg-[#ef6461]/12 px-3 py-2.5 text-sm text-[#ffaaa8]" role="alert">{error}</p>}

            <button type="submit" disabled={isLoading || isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4b7fe8] px-4 py-3.5 font-semibold text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.16)] transition hover:bg-[#5a8cf0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9fc0ff] disabled:cursor-wait disabled:opacity-60">
              <LogIn className="size-5" />
              {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#aeb8b1]">Chưa có tài khoản? <a href={`/register?returnTo=${encodeURIComponent(returnTo)}`} className="font-semibold text-[#78a7ff] hover:text-[#9fc0ff] hover:underline">Đăng ký</a></p>

          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-white/8 bg-[#171c1a] p-3 text-xs leading-5 text-[#96a098]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#72cf86]" />
            <span><strong className="text-[#cbd2cc]">Bảo mật phía máy chủ:</strong> mật khẩu được BCrypt băm trước khi lưu vào MySQL.</span>
          </div>
          <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-white/8 bg-[#171c1a] p-3 text-xs leading-5 text-[#96a098]">
            <Database className="mt-0.5 size-4 shrink-0 text-[#78a7ff]" />
            Phiên đăng nhập được backend Spring Boot quản lý bằng cookie HttpOnly.
          </div>
        </div>
      </section>
    </main>
  );
}
