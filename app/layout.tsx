import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "电报大师兄 | 顶级 Telegram 自动化营销平台",
  description: "先进的 Telegram 自动化工具：账号生成、智能采集、资料管理和自动群发。Advanced Telegram automation tools: session genesis, intelligent scraping, profile management, and autonomous group interaction.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh" className="dark">
      <body className="min-h-screen antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
