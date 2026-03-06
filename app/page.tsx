"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, ArrowRight, CheckCircle2 } from "lucide-react";
import { useLanguage, Language } from "@/lib/useLanguage";

const translations = {
  en: {
    title: "TG-SaaS",
    login: "Login",
    getStarted: "Get Started",
    heroTitle1: "Telegram Automation, ",
    heroTitleHighlight: "Simplified",
    heroDesc: "Powered by the latest AI models. Manage sessions, scrape groups, modify profiles, and utilize intelligent context-aware auto-replies — all from one dashboard.",
    startFreeTrial: "Start Free Trial",
    signIn: "Sign In",
    trialNote: "3-hour free trial. No credit card required.",
    featSession: "Session Manager",
    featSessionDesc: "Generate and manage Telegram sessions with multi-step authentication flow.",
    featProfile: "Profile Modifier",
    featProfileDesc: "Batch update names, usernames, and avatars across your Telegram accounts.",
    featScraper: "Group Scraper",
    featScraperDesc: "Extract messages and media from Telegram groups with topic support.",
    featAuto: "Auto Chat (AI Powered)",
    featAutoDesc: "Automated group messaging with context-aware smart replies, session rotation, and intelligent scheduling.",
    pricingTitle: "Pricing Plans",
    pricingDesc: "Choose the plan that fits your operation. All plans include encrypted storage and user isolation.",
    planBasic: "Basic",
    planBasicDesc: "Full Telegram automation toolkit",
    planPro: "Pro",
    planProDesc: "AI-powered automation + Discord",
    planEnterprise: "Enterprise",
    planEnterpriseDesc: "Full suite for serious operators",
    mostPopular: "Most Popular",
    paymentTitle: "Payment",
    paymentDesc: "We accept USDT payments. After payment, contact support with your transaction hash to activate your plan.",
    contactSupport: "Contact Support on Telegram",
    admin: "Admin"
  },
  zh: {
    title: "TG-SaaS",
    login: "登录",
    getStarted: "开始使用",
    heroTitle1: "Telegram 自动化，",
    heroTitleHighlight: "从此简单",
    heroDesc: "集成最新 AI 模型赋能。管理账号、采集群组、修改资料，并利用智能上下文感知进行自动回复 —— 在一个控制台中完成所有操作。",
    startFreeTrial: "免费试用",
    signIn: "登录",
    trialNote: "3小时免费试用，无需信用卡。",
    featSession: "账号管理",
    featSessionDesc: "生成和管理 Telegram 账号 Session，支持多步身份验证流程。",
    featProfile: "资料修改",
    featProfileDesc: "批量修改所有 Telegram 账号的名字、用户名和头像。",
    featScraper: "群组采集",
    featScraperDesc: "从 Telegram 群组中提取消息和媒体文件，支持话题（Topic）。",
    featAuto: "AI 自动群发",
    featAutoDesc: "AI 驱动的自动化群发，支持基于上下文的智能回复、账号轮换和定时调度。",
    pricingTitle: "价格方案",
    pricingDesc: "选择适合您的运营方案。所有方案均提供加密存储和用户隔离。",
    planBasic: "基础版",
    planBasicDesc: "完整的 Telegram 自动化工具包",
    planPro: "专业版",
    planProDesc: "AI 驱动的自动化 + Discord 支持",
    planEnterprise: "企业版",
    planEnterpriseDesc: "为专业运营团队打造的完整套件",
    mostPopular: "最受欢迎",
    paymentTitle: "支付方式",
    paymentDesc: "我们接受 USDT 支付。付款后，请通过 Telegram 联系客服并提供交易哈希以激活您的方案。",
    contactSupport: "通过 Telegram 联系客服",
    admin: "管理员"
  }
};

const getFeaturesList = (t: any) => [
  {
    title: t.featSession,
    description: t.featSessionDesc,
    icon: "🔐",
  },
  {
    title: t.featProfile,
    description: t.featProfileDesc,
    icon: "👤",
  },
  {
    title: t.featScraper,
    description: t.featScraperDesc,
    icon: "🕷️",
  },
  {
    title: t.featAuto,
    description: t.featAutoDesc,
    icon: "🤖",
  },
];

const getPlansList = (lang: Language, t: any) => [
  {
    name: t.planBasic,
    price: "$200",
    period: "/mo",
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
    period: "/mo",
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
    period: "/mo",
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

// Motion configurations
const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function LandingPage() {
  const { lang, mounted, toggleLanguage } = useLanguage();

  if (!mounted) return null; // Prevent hydration mismatch

  const t = translations[lang];
  const featuresList = getFeaturesList(t);
  const plansList = getPlansList(lang, t);

  return (
    <div className="min-h-screen flex flex-col relative text-white selection:bg-primary/30">
      {/* Absolute Background Image */}
      <div
        className="fixed inset-0 z-[-2] w-full h-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/bg.png')" }}
      />
      {/* Overlay to ensure dark mode contrast and glassmorphism backdrop */}
      <div className="fixed inset-0 z-[-1] w-full h-full bg-black/60 backdrop-blur-[20px]" />

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="border-b border-white/10 px-6 py-4 bg-black/20 backdrop-blur-md sticky top-0 z-50"
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-8 h-8 rounded-lg shadow-lg shadow-primary/20 object-cover"
            />
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              {t.title}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              <Globe className="w-4 h-4" />
              {lang === "en" ? "中文" : "EN"}
            </button>
            <div className="h-4 w-px bg-white/20" />
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white hidden sm:flex">
                {t.login}
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-white text-black hover:bg-white/90 shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all">
                {t.getStarted}
              </Button>
            </Link>
          </div>
        </div>
      </motion.header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 pt-32 pb-20 overflow-hidden relative">
        {/* Subtle decorative glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] pointer-events-none z-[-1] opacity-50" />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="max-w-4xl text-center space-y-8 relative z-10"
        >
          <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-4 shadow-xl">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-medium text-white/80">TG-SaaS Beta Available</span>
          </motion.div>

          <motion.h2 variants={fadeIn} className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
            <span className="text-white/90">{t.heroTitle1}</span>
            <span className="block mt-2 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-primary to-purple-500 pb-2">
              {t.heroTitleHighlight}
            </span>
          </motion.h2>

          <motion.p variants={fadeIn} className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
            {t.heroDesc}
          </motion.p>

          <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" className="h-12 px-8 w-full sm:w-auto text-base bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:shadow-[0_0_40px_rgba(168,85,247,0.6)] transition-all border-0 group">
                {t.startFreeTrial}
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/login" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="h-12 px-8 w-full sm:w-auto text-base bg-white/5 border-white/10 hover:bg-white/10 text-white backdrop-blur-md">
                {t.signIn}
              </Button>
            </Link>
          </motion.div>
          <motion.p variants={fadeIn} className="text-xs sm:text-sm text-white/40">
            {t.trialNote}
          </motion.p>
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-32 max-w-6xl w-full relative z-10"
        >
          {featuresList.map((feature, i) => (
            <motion.div key={feature.title} variants={fadeIn}>
              <Card className="h-full bg-white/5 border-white/10 backdrop-blur-md hover:bg-white/10 hover:border-primary/50 transition-all duration-300 group overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader>
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-lg text-white/90">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/50 leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-32 border-t border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeIn}
            className="text-center space-y-4 mb-20"
          >
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white/90">
              {t.pricingTitle}
            </h2>
            <p className="text-lg text-white/50 max-w-xl mx-auto">
              {t.pricingDesc}
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center"
          >
            {plansList.map((plan, i) => (
              <motion.div key={plan.name} variants={fadeIn} className={plan.highlight ? "md:-mt-8 md:mb-8" : ""}>
                <Card
                  className={`relative flex flex-col h-full overflow-hidden transition-all duration-300 hover:-translate-y-2 ${plan.highlight
                    ? "bg-black/40 border-primary/50 shadow-[0_0_40px_rgba(168,85,247,0.15)] backdrop-blur-xl"
                    : "bg-white/5 border-white/10 backdrop-blur-md"
                    }`}
                >
                  {plan.highlight && (
                    <>
                      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-400 via-primary to-purple-500" />
                      <div className="absolute top-5 right-5 bg-primary/20 text-primary border border-primary/30 text-xs font-semibold px-3 py-1 rounded-full">
                        {t.mostPopular}
                      </div>
                    </>
                  )}
                  <CardHeader className="pb-8 pt-8 px-8">
                    <CardTitle className="text-xl text-white/90">{plan.name}</CardTitle>
                    <p className="text-sm text-white/50 mt-2 h-10">
                      {plan.description}
                    </p>
                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="text-5xl font-bold tracking-tight text-white">{plan.price}</span>
                      <span className="text-white/40 font-medium">{plan.period}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col px-8 pb-8">
                    <ul className="space-y-4 flex-1 mb-8">
                      {plan.features.map((feature, j) => (
                        <li key={j} className="flex gap-3 text-sm">
                          <CheckCircle2 className={`w-5 h-5 shrink-0 ${plan.highlight ? 'text-primary' : 'text-white/30'}`} />
                          <span className="text-white/70 leading-relaxed">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/register" className="w-full mt-auto">
                      <Button
                        className={`w-full h-12 text-base font-medium transition-all ${plan.highlight
                          ? "bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                          : "bg-white/10 hover:bg-white/20 text-white border-0"
                          }`}
                      >
                        {t.getStarted}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Payment & Contact */}
      <section className="px-6 py-24 border-t border-white/10 relative overflow-hidden">
        <div className="max-w-3xl mx-auto text-center space-y-10 relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-3xl p-8 sm:p-12 shadow-2xl"
          >
            <h2 className="text-3xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">{t.paymentTitle}</h2>
            <p className="text-base text-white/50 mb-8 max-w-xl mx-auto">
              {t.paymentDesc}
            </p>

            <div className="space-y-4 mb-10 text-left">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 transition-colors hover:bg-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-[#f3ba2f]/20 flex items-center justify-center">
                    <span className="text-[#f3ba2f] font-bold text-xs">BNB</span>
                  </div>
                  <div className="text-sm font-medium text-white/80">USDT (BEP20 - BSC)</div>
                </div>
                <code className="text-sm sm:text-base break-all select-all text-white font-mono block bg-black/50 p-3 rounded-lg border border-white/5">
                  0xa1a267a24316a039d3f9feff2968e3e0d1029848
                </code>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 transition-colors hover:bg-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-[#eb1528]/20 flex items-center justify-center">
                    <span className="text-[#eb1528] font-bold text-xs">TRX</span>
                  </div>
                  <div className="text-sm font-medium text-white/80">USDT (TRC20 - Tron)</div>
                </div>
                <code className="text-sm sm:text-base break-all select-all text-white font-mono block bg-black/50 p-3 rounded-lg border border-white/5">
                  TEfJbc178R6NzogDakY2Q1Xritm24VnxL7
                </code>
              </div>
            </div>

            <a
              href="https://t.me/kowliep"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <Button size="lg" className="h-14 px-8 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all flex items-center gap-2 text-base">
                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.11.03-1.87 1.18-5.28 3.45-.5.34-.95.51-1.35.49-.45-.02-1.32-.26-1.96-.46-.79-.26-1.42-.4-1.36-.85.03-.23.35-.48.96-.73 3.78-1.63 6.3-2.69 7.55-3.19 3.58-1.42 4.33-1.67 4.82-1.68.1 0 .34.02.49.13.13.1.18.25.19.35-.01.07-.01.19-.02.3z" />
                </svg>
                {t.contactSupport}
              </Button>
            </a>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-8 bg-black/40 backdrop-blur-md mt-auto relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <span className="font-semibold text-white/50">TG-SaaS</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
          <Link href="/login?admin=true" className="text-sm text-white/40 hover:text-white transition-colors">
            {t.admin}
          </Link>
        </div>
      </footer>
    </div>
  );
}
