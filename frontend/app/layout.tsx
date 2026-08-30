import type { Metadata } from "next";
import "./globals.css";

import { AuthProvider } from "./auth-provider";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Chess Analysis",
  description: "Phân tích Stockfish, lưu trữ ván cờ và luyện khai cuộc, tàn cuộc.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">
        <AuthProvider>
          <SiteShell>{children}</SiteShell>
        </AuthProvider>
      </body>
    </html>
  );
}
