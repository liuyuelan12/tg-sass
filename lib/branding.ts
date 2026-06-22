/**
 * 多域名品牌配置中心（客户端安全：纯数据 + 纯函数，可在 client/server/route 任意引用）。
 * 需要读请求头的服务端 helper 在 lib/branding-server.ts。
 *
 * 同一套代码 / 数据库，根据访问的域名（host）切换"表面"品牌：
 *   - dianbaodashixiong.xyz -> "电报大师兄"（默认品牌）
 *   - apollotgbot.xyz        -> 客户专属品牌（apollo）
 *
 * 认证、数据库、用户完全共用，这里只决定 landing/logo/文案/metadata/邮件署名。
 */

export type Brand = "dashixiong" | "apollo";
export type Lang = "zh" | "en";

/** 每个品牌、每种语言下会覆盖 landing page translations 的字段 */
export interface BrandLocaleStrings {
  /** header / 站点名 */
  title: string;
  /** hero 主标题第一行 */
  heroTitle1: string;
  /** hero 主标题高亮行 */
  heroTitleHighlight: string;
  /** hero 描述 */
  heroDesc: string;
  /** 试用提示 */
  trialNote: string;
  /** hero 顶部的状态徽章文案 */
  badge: string;
  /** <title> */
  metaTitle: string;
  /** <meta description> */
  metaDescription: string;
}

export interface BrandConfig {
  brand: Brand;
  /** header / sidebar 用的 logo 图片路径（public 下） */
  logo: string;
  /** favicon 路径（public 下） */
  favicon: string;
  /** footer 显示的品牌短名 */
  footerName: string;
  /** dashboard / 邮件等通用署名（站点名，与语言无关时使用） */
  emailName: string;
  /** 底部"联系客服"的 Telegram 链接 */
  supportTelegram: string;
  /** 收款地址：USDT BEP20 (BSC) */
  usdtBep20: string;
  /** 收款地址：USDT TRC20 (Tron) */
  usdtTrc20: string;
  /** hero 区背景图路径（public 下） */
  heroBackground: string;
  /** 价格倍率：基准价（200/300/500）× 此值 */
  priceMultiplier: number;
  /** 视觉主题，作为 CSS 变量注入 landing 根节点 */
  theme: BrandTheme;
  /** 分语言的品牌文案 */
  locale: Record<Lang, BrandLocaleStrings>;
}

/** 品牌视觉主题（注入 CSS 变量，驱动 Tailwind 配色） */
export interface BrandTheme {
  /** 主色 --color-primary（按钮、徽章、高亮） */
  primary: string;
  /** 焦点环 --color-ring */
  ring: string;
  /** 渐变起色 --brand-accent-1 */
  accent1: string;
  /** 渐变止色 --brand-accent-2 */
  accent2: string;
  /** 辉光阴影的 rgb 三元组（用法 rgba(var(--brand-glow), .4)）--brand-glow */
  glow: string;
}

export const BRAND_CONFIG: Record<Brand, BrandConfig> = {
  // ===== 默认品牌：电报大师兄（dianbaodashixiong.xyz）=====
  dashixiong: {
    brand: "dashixiong",
    logo: "/logo.png",
    favicon: "/favicon.ico",
    footerName: "TG-SaaS",
    emailName: "电报大师兄",
    supportTelegram: "https://t.me/kowliep",
    usdtBep20: "0xa1a267a24316a039d3f9feff2968e3e0d1029848",
    usdtTrc20: "TEfJbc178R6NzogDakY2Q1Xritm24VnxL7",
    heroBackground: "/hero-monkey.png",
    priceMultiplier: 1,
    theme: {
      // 保持现有视觉：蓝 primary + 青→紫 渐变 + 紫色辉光
      primary: "#3b82f6",
      ring: "#3b82f6",
      accent1: "#22d3ee", // cyan-400
      accent2: "#a855f7", // purple-500
      glow: "168,85,247", // purple
    },
    locale: {
      en: {
        title: "TG Master",
        heroTitle1: "Telegram Automation, ",
        heroTitleHighlight: "Boss Style",
        heroDesc:
          "The ultimate power tool for serious Telegram operators. Manage sessions, scrape groups, and deploy AI-driven auto-replies with the wisdom of the 'Big Brother'.",
        trialNote: "3-hour free trial. No credit card required.",
        badge: "TG Master Beta is live",
        metaTitle: "电报大师兄 | 顶级 Telegram 自动化营销平台",
        metaDescription:
          "先进的 Telegram 自动化工具：账号生成、智能采集、资料管理和自动群发。Advanced Telegram automation tools: session genesis, intelligent scraping, profile management, and autonomous group interaction.",
      },
      zh: {
        title: "电报大师兄",
        heroTitle1: "大师兄带你，",
        heroTitleHighlight: "制霸电报",
        heroDesc:
          "集成顶级 AI 模型，账号管理、扒取消息、资料修改，更有上帝视角的自动回复。电报营销，就找大师兄。",
        trialNote: "3小时免费试用，不留痕迹。",
        badge: "电报大师兄 Beta 已就绪",
        metaTitle: "电报大师兄 | 顶级 Telegram 自动化营销平台",
        metaDescription:
          "先进的 Telegram 自动化工具：账号生成、智能采集、资料管理和自动群发。Advanced Telegram automation tools: session genesis, intelligent scraping, profile management, and autonomous group interaction.",
      },
    },
  },

  // ===== 客户专属品牌：Apollo（apollotgbot.xyz）=====
  // TODO(apollo): 以下文案 / logo / favicon / 联系方式 / 收款地址均为占位，
  //               拿到客户真实素材后替换。logo 与 favicon 需放到
  //               public/brands/apollo/ 目录下。
  apollo: {
    brand: "apollo",
    logo: "/brands/apollo/logo.png",
    favicon: "/brands/apollo/favicon.ico",
    footerName: "Apollo",
    emailName: "Apollo TG Bot",
    supportTelegram: "https://t.me/kowliep", // TODO(apollo): 换成客户的客服 TG
    usdtBep20: "0xa1a267a24316a039d3f9feff2968e3e0d1029848", // TODO(apollo): 换成客户收款地址
    usdtTrc20: "TEfJbc178R6NzogDakY2Q1Xritm24VnxL7", // TODO(apollo): 换成客户收款地址
    heroBackground: "/brands/apollo/hero-bg.png", // 待 Gemini 生成
    priceMultiplier: 10, // 每个 plan 价格 ×10（$2000 / $3000 / $5000）
    theme: {
      // Apollo = 太阳神，金色 + 橙 高端主题，区别于大师兄的蓝紫
      primary: "#f59e0b", // amber-500 金
      ring: "#f59e0b",
      accent1: "#fcd34d", // amber-300 浅金
      accent2: "#ea580c", // orange-600 橙
      glow: "245,158,11", // amber
    },
    locale: {
      en: {
        title: "Apollo TG Bot",
        heroTitle1: "Telegram Automation, ",
        heroTitleHighlight: "Apollo Grade",
        heroDesc:
          "A professional toolkit for Telegram operators: session management, group scraping, profile editing, and AI-powered auto-replies — all in one place.",
        trialNote: "3-hour free trial. No credit card required.",
        badge: "Apollo TG Bot Beta is live",
        metaTitle: "Apollo TG Bot | Telegram Automation Platform",
        metaDescription:
          "Professional Telegram automation: session generation, intelligent scraping, profile management, and autonomous group interaction.",
      },
      zh: {
        title: "Apollo TG Bot",
        heroTitle1: "Apollo 带你，",
        heroTitleHighlight: "玩转电报",
        heroDesc:
          "专业的 Telegram 自动化工具：账号管理、扒取消息、资料修改，更有 AI 智能自动回复。一站式电报营销解决方案。",
        trialNote: "3小时免费试用，不留痕迹。",
        badge: "Apollo TG Bot Beta 已就绪",
        metaTitle: "Apollo TG Bot | Telegram 自动化营销平台",
        metaDescription:
          "专业的 Telegram 自动化工具：账号生成、智能采集、资料管理和自动群发。",
      },
    },
  },
};

/** 根据 host 判断品牌（纯函数，可在任何地方复用，含 API route） */
export function getBrandFromHost(host?: string | null): Brand {
  if (host && host.toLowerCase().includes("apollotgbot")) return "apollo";
  return "dashixiong";
}

/** 由 host 取完整品牌配置（纯函数版本，传入 host） */
export function getBrandConfigFromHost(host?: string | null): BrandConfig {
  return BRAND_CONFIG[getBrandFromHost(host)];
}

/**
 * 客户端组件里用：从 window.location.host 解析品牌。
 * SSR 阶段无 window，返回默认品牌（client 组件通常在 mounted 后再渲染）。
 */
export function getBrandFromWindow(): BrandConfig {
  if (typeof window === "undefined") return BRAND_CONFIG.dashixiong;
  return getBrandConfigFromHost(window.location.host);
}
