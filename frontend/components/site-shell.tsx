"use client";

import { useState, type ReactNode } from "react";
import {
  Archive,
  BookOpenCheck,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Crown,
  Home,
  LockKeyhole,
  LogIn,
  Menu,
  Puzzle,
  Repeat2,
  SearchCheck,
  Swords,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { getAvatarImageUrl, useAuth } from "@/app/auth-provider";

const navigation = [
  { href: "/", label: "Trang chủ", icon: Home },
  { href: "/analysis", label: "Phân tích", icon: SearchCheck },
  { href: "/archive", label: "Kho ván cờ", icon: Archive, protected: true },
  { href: "/play", label: "Đấu bot", icon: Swords },
  { href: "/puzzles", label: "Puzzle", icon: Puzzle },
  { href: "/gm-puzzles", label: "Đoán nước GM", icon: Crown },
  { href: "/mistakes", label: "Sai lầm", icon: Repeat2, protected: true },
  { href: "/review", label: "Ôn tập", icon: CalendarCheck, protected: true },
  { href: "/exercises", label: "Bài tập", icon: BookOpenCheck },
];

const presetSymbols: Record<string, string> = {
  default: "♞",
  "knight-blue": "♞",
  "queen-purple": "♛",
  "rook-red": "♜",
  "bishop-gold": "♝",
  "pawn-green": "♟",
};

function ProfileMark() {
  const { user } = useAuth();
  if (!user) return <LogIn className="size-5" />;
  if (user.hasCustomAvatar) {
    // The authenticated image is dynamic and served by the Spring Boot API.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={getAvatarImageUrl(user)} alt="Ảnh đại diện" className="size-full object-cover" />;
  }
  return <span className="text-xl">{presetSymbols[user.avatarPreset] ?? "♞"}</span>;
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(pathname.startsWith("/analysis"));

  if (pathname === "/login" || pathname === "/register") return children;

  const sidebarWidth = collapsed ? "lg:w-20" : "lg:w-64";
  const contentOffset = collapsed ? "lg:pl-20" : "lg:pl-64";

  return (
    <div className="min-h-screen bg-[#111713] text-[#f4f1e7]">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-[#151b17]/95 px-4 backdrop-blur lg:hidden">
        <a href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-[#d8b45f] text-2xl text-[#172019]">♞</span>
          Chess Analysis
        </a>
        <button type="button" onClick={() => setMobileOpen((value) => !value)} className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5" aria-label="Mở điều hướng">
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      <aside className={`fixed inset-y-0 left-0 z-50 hidden border-r border-white/10 bg-[#151b17] transition-[width] duration-200 lg:flex lg:flex-col ${sidebarWidth}`}>
        <div className={`flex h-20 items-center border-b border-white/10 px-4 ${collapsed ? "justify-center" : "gap-3"}`}>
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#d8b45f] text-3xl text-[#172019] shadow-lg shadow-black/20">♞</span>
          {!collapsed && (
            <div>
              <p className="font-semibold tracking-tight">Chess Analysis</p>
              <p className="text-xs text-[#89958d]">Hiểu sâu từng nước đi</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1.5 p-3">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            return (
              <a key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={`flex min-h-12 items-center rounded-xl px-3 transition ${collapsed ? "justify-center" : "gap-3"} ${active ? "bg-[#d8b45f] text-[#172019]" : "text-[#c5cec7] hover:bg-white/7 hover:text-white"}`}>
                <Icon className="size-5 shrink-0" />
                {!collapsed && <span className="font-medium">{item.label}</span>}
                {!collapsed && item.protected && !user && <LockKeyhole className="ml-auto size-4 text-[#89958d]" />}
              </a>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-white/10 p-3">
          <a href={user ? "/analysis" : "/login"} title={collapsed ? (user?.username ?? "Đăng nhập") : undefined} className={`flex min-h-12 items-center rounded-xl bg-white/5 px-3 hover:bg-white/8 ${collapsed ? "justify-center" : "gap-3"}`}>
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#28322b] text-[#d8b45f]"><ProfileMark /></span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{user?.username ?? "Đăng nhập"}</span>
                <span className="block text-xs text-[#89958d]">{user ? "Hồ sơ & cài đặt" : "Để lưu tiến trình"}</span>
              </span>
            )}
          </a>
          <button type="button" onClick={() => setCollapsed((value) => !value)} className="flex min-h-10 w-full items-center justify-center rounded-xl text-[#89958d] hover:bg-white/5 hover:text-white" aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}>
            {collapsed ? <ChevronRight className="size-5" /> : <ChevronLeft className="size-5" />}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-x-0 top-16 z-30 border-b border-white/10 bg-[#151b17] p-3 shadow-2xl lg:hidden">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <a key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-[#d4dbd6] hover:bg-white/7">
                <Icon className="size-5" />
                {item.label}
                {item.protected && !user && <LockKeyhole className="ml-auto size-4" />}
              </a>
            );
          })}
        </div>
      )}

      <div className={`min-h-screen transition-[padding] duration-200 ${contentOffset}`}>{children}</div>
    </div>
  );
}
