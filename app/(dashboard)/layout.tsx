"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe } from "lucide-react";
import { useLanguage } from "@/lib/useLanguage";

const translations = {
  en: {
    title: "TG-SaaS",
    navSessions: "Sessions",
    navProfile: "Profile",
    navScrape: "Scrape",
    navAutoChat: "Auto Chat (AI)",
    navPricing: "Pricing",
    loading: "Loading...",
    trial: "Trial",
    pro: "Pro",
    signOut: "Sign Out",
    trialExpired: "Trial Expired",
    upgradePlan: "Upgrade Your Plan",
    trialEndedDesc: "Your free trial has ended. Choose a plan to continue using TG-SaaS.",
    unlockFeaturesDesc: "Unlock more features by upgrading your plan.",
    close: "Close",
    mostPopular: "Most Popular",
    paymentTitle: "Payment (USDT)",
    contactSupport: "Contact Support on Telegram",
    planBasic: "Basic",
    planBasicDesc: "Full Telegram automation toolkit",
    planPro: "Pro",
    planProDesc: "AI-powered automation + Discord",
    planEnterprise: "Enterprise",
    planEnterpriseDesc: "Full suite for serious operators",
  },
  zh: {
    title: "电报大师兄",
    navSessions: "账号管理",
    navProfile: "资料修改",
    navScrape: "群组采集",
    navAutoChat: "AI 自动群发",
    navPricing: "价格方案",
    loading: "加载中...",
    trial: "加载中...",
    pro: "专业版",
    signOut: "退出登录",
    trialExpired: "试用已过期",
    upgradePlan: "升级您的方案",
    trialEndedDesc: "您的免费试用已结束。选择一个方案以继续使用电报大师兄。",
    unlockFeaturesDesc: "升级方案以解锁更多功能。",
    close: "关闭",
    mostPopular: "最受欢迎",
    paymentTitle: "支付方式 (USDT)",
    contactSupport: "通过 Telegram 联系客服",
    planBasic: "基础版",
    planBasicDesc: "完整的 Telegram 自动化工具包",
    planPro: "专业版",
    planProDesc: "AI 驱动的自动化 + Discord 支持",
    planEnterprise: "企业版",
    planEnterpriseDesc: "为专业运营团队打造的完整套件",
  }
};

const getNavItems = (t: any) => [
  { href: "/session-gen", label: t.navSessions, icon: "🔐" },
  { href: "/profile-modifier", label: t.navProfile, icon: "👤" },
  { href: "/scrape", label: t.navScrape, icon: "🕷️" },
  { href: "/auto-chat", label: t.navAutoChat, icon: "🤖" },
  { href: "#pricing", label: t.navPricing, icon: "💰" },
];

const getPlansList = (lang: string, t: any) => [
  {
    name: t.planBasic,
    price: "$200",
    highlight: false,
    description: t.planBasicDesc,
    features: lang === "en" ? [
      "Unlimited Telegram session generation & management",
      "Batch profile modifier (name, username, avatar)",
      "Group scraper with Forum/Topic support",
      "Auto-chat with session rotation & smart scheduling",
      "Media download & upload (CSV + ZIP)",
      "Cloudflare R2 encrypted storage",
      "Real-time progress monitoring",
      "Flood-wait auto-retry protection",
    ] : [
      "无限制生成和管理 Telegram 会话",
      "批量资料修改器（名称、用户名、头像）",
      "支持论坛/话题的群组采集器",
      "带会话轮换和智能调度的自动群发",
      "媒体下载与上传（CSV + ZIP）",
      "Cloudflare R2 加密存储",
      "实时进度监控",
      "频繁请求（Flood-wait）自动重试保护",
    ],
  },
  {
    name: t.planPro,
    price: "$300",
    highlight: true,
    description: t.planProDesc,
    features: lang === "en" ? [
      "Everything in Basic",
      "AI-assisted message rewriting & content generation",
      "Smart reply generation based on context",
      "Discord auto-posting & scheduled messaging",
      "Cross-platform content syndication (TG -> Discord)",
      "Advanced analytics dashboard",
      "Priority support via Telegram",
    ] : [
      "包含基础版所有功能",
      "AI 辅助消息重写与内容生成",
      "基于上下文的智能回复生成",
      "Discord 自动发布与定时发送",
      "跨平台内容同步（TG -> Discord）",
      "高级数据分析仪表盘",
      "通过 Telegram 优先获得支持",
    ],
  },
  {
    name: t.planEnterprise,
    price: "$500",
    highlight: false,
    description: t.planEnterpriseDesc,
    features: lang === "en" ? [
      "Everything in Pro",
      "Twitter/X real-time keyword monitoring & alerts",
      "Alpha token discovery engine",
      "Multi-account sniper with configurable strategies",
      "Custom webhook integrations",
      "Dedicated infrastructure & uptime SLA",
      "1-on-1 onboarding & strategy consultation",
    ] : [
      "包含专业版所有功能",
      "Twitter/X 实时关键字监控和警报",
      "Alpha 代币发现引擎",
      "支持可配置策略的多账户狙击",
      "自定义 Webhook 集成",
      "专属基础设施及运行时间 SLA 保障",
      "1 对 1 入门培训及战略咨询",
    ],
  },
];

interface UserStatus {
  email: string;
  role: string;
  isPaid: boolean;
  trialExpiresAt: string | null;
  trialExpired: boolean;
  hasAccess: boolean;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [showPricing, setShowPricing] = useState(false);
  const { lang, toggleLanguage, mounted } = useLanguage();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/user/status");
        if (res.ok) {
          const data = await res.json();
          setUserStatus(data);
          if (data.trialExpired && !data.isPaid && data.role !== "ADMIN") {
            setShowPricing(true);
          }
        }
      } catch {
        // ignore
      }
    }
    if (session) fetchStatus();
  }, [session]);

  useEffect(() => {
    if (!userStatus?.trialExpiresAt || userStatus.isPaid) return;

    const interval = setInterval(() => {
      const diff = new Date(userStatus.trialExpiresAt!).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Expired");
        setShowPricing(true);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    }, 1000);

    return () => clearInterval(interval);
  }, [userStatus]);

  if (status === "loading" || !mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">{mounted ? translations[lang].loading : "Loading..."}</div>
      </div>
    );
  }

  if (!session) return null;

  const t = translations[lang];
  const navItems = getNavItems(t);
  const plans = getPlansList(lang, t);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border/40 flex flex-col">
        <div className="p-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-8 h-8 rounded-lg shadow-sm object-cover"
            />
            <Link href="/" className="text-lg font-bold tracking-tight">
              {t.title}
            </Link>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            if (item.href === "#pricing") {
              return (
                <button
                  key={item.href}
                  onClick={() => setShowPricing(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors w-full text-left text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  <span>{item.icon}</span>
                  {item.label}
                </button>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${pathname === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/40 space-y-3">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-2 px-3 py-2 w-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <Globe className="w-4 h-4" />
            {lang === "en" ? "中文" : "English"}
          </button>
          {userStatus && !userStatus.isPaid && timeLeft && (
            <div className="text-xs text-muted-foreground px-2">
              {t.trial}: <Badge variant="outline" className="ml-1">{timeLeft}</Badge>
            </div>
          )}
          {userStatus?.isPaid && (
            <Badge variant="default" className="text-xs mx-2">{t.pro}</Badge>
          )}
          <div className="text-xs text-muted-foreground truncate px-2">
            {session.user?.email}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            {t.signOut}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">{children}</main>

      {/* Pricing Modal */}
      {showPricing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  {timeLeft === "Expired" ? t.trialExpired : t.upgradePlan}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {timeLeft === "Expired" ? t.trialEndedDesc : t.unlockFeaturesDesc}
                </p>
              </div>
              {timeLeft !== "Expired" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPricing(false)}
                >
                  {t.close}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <Card
                  key={plan.name}
                  className={`relative flex flex-col ${plan.highlight
                    ? "border-primary shadow-lg shadow-primary/10"
                    : "border-border/40"
                    }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                      {t.mostPopular}
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <div className="mt-2">
                      <span className="text-3xl font-bold">{plan.price}</span>
                      <span className="text-muted-foreground">/mo</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {plan.description}
                    </p>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-2 flex-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-2 text-xs">
                          <svg
                            className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Payment info */}
            <div className="bg-card/50 border border-border/40 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">{t.paymentTitle}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground mb-1">BEP20 (BSC)</div>
                  <code className="break-all select-all text-foreground">
                    0xa1a267a24316a039d3f9feff2968e3e0d1029848
                  </code>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">TRC20 (Tron)</div>
                  <code className="break-all select-all text-foreground">
                    TEfJbc178R6NzogDakY2Q1Xritm24VnxL7
                  </code>
                </div>
              </div>
              <div className="pt-2">
                <a
                  href="https://t.me/kowliep"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    {t.contactSupport}
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
