import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { getCurrentBrand } from "@/lib/branding-server";

// metadata 按访问域名（host）动态切换品牌：title / description / favicon。
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getCurrentBrand();
  // 默认中文站点，metadata 用 zh 文案
  const { metaTitle, metaDescription } = brand.locale.zh;
  return {
    title: metaTitle,
    description: metaDescription,
    icons: { icon: brand.favicon },
  };
}

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
