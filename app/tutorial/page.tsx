"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    ChevronRight,
    BookOpen,
    UserPlus,
    Edit3,
    Search,
    MessageSquare,
    CheckCircle2,
    ArrowLeft,
    Smartphone,
    Info
} from "lucide-react";
import { useLanguage } from "@/lib/useLanguage";

export default function TutorialPage() {
    const { lang, mounted, toggleLanguage, setLang } = useLanguage();

    useEffect(() => {
        if (mounted) {
            const savedLang = localStorage.getItem("tg-saas-lang");
            if (!savedLang) {
                setLang("zh");
            }
        }
    }, [mounted, setLang]);

    // Force zh if not mounted or if no saved preference yet (default to zh)
    const isZh = !mounted ? true : lang === "zh";

    const t = {
        title: isZh ? "使用教程" : "User Tutorial",
        subtitle: isZh ? "带您快速上手电报大师兄，制霸电报营销" : "Master Telegram marketing with TG Master",
        backHome: isZh ? "返回首页" : "Back Home",
        lastUpdated: isZh ? "最后更新: 2026年3月7日" : "Last Updated: March 7, 2026",
        sections: [
            {
                id: "start",
                title: isZh ? "1. 首页与登录" : "1. Home & Login",
                icon: <UserPlus className="w-6 h-6 text-blue-400" />,
                content: isZh
                    ? "访问官网进入首页。点击右上角“登录账号”，输入邮箱和密码即可进入大师兄。没有账号？点击注册，极速开启。"
                    : "Visit the home page. Click 'Login' at the top right, enter your email and password. No account? Click register to start instantly.",
                image: "/prod_landing_hero.png",
            },
            {
                id: "session",
                title: isZh ? "2. 账号管理 (Session 生成)" : "2. Session Management",
                icon: <Smartphone className="w-6 h-6 text-purple-400" />,
                content: isZh
                    ? "在账号管理页面点击“+ 生成Session”，输入手机号和验证码。成功后您的账号将自动保存并保持在线状态。"
                    : "Click '+ Generate Session', enter your phone number and the code. Your sessions will be saved and kept active automatically.",
                image: "/prod_session_gen.png",
            },
            {
                id: "profile",
                title: isZh ? "3. 资料修改 (批量操作)" : "3. Profile Modifier",
                icon: <Edit3 className="w-6 h-6 text-green-400" />,
                content: isZh
                    ? "一键勾选多个账号，批量修改姓名、用户名以及同步上传高端头像，让您的矩阵账号瞬间改头换面。"
                    : "Select multiple accounts to batch modify names, usernames, and update avatars globally in one go.",
                image: "/prod_profile_modifier.png",
            },
            {
                id: "scrape",
                title: isZh ? "4. 扒取消息 (群组采集)" : "4. Message Scraping",
                icon: <Search className="w-6 h-6 text-orange-400" />,
                content: isZh
                    ? "支持从任何公开群组或频道采集历史消息。完美支持论坛话题(Topic)模式，支持一键下载 CSV 及配套媒体。"
                    : "Scrape messages from any public group or channel. Fully supports Topics, with one-click CSV and media downloads.",
                image: "/prod_scrape_page.png",
            },
            {
                id: "autochat",
                title: isZh ? "5. AI 自动群发" : "5. AI Auto Chat",
                icon: <MessageSquare className="w-6 h-6 text-pink-400" />,
                content: isZh
                    ? "上传采集的数据，配置 AI 模型。设置智能回复频率和多号轮调策略，模拟最真实的社群互动。"
                    : "Upload scraped data, configure AI models. Set smart reply intervals and rotation strategies for authentic interaction.",
                image: "/prod_autochat_page.png",
            }
        ],
        tipsTitle: isZh ? "大师兄贴士" : "Pro Tips",
        tips: [
            isZh ? "使用扒取功能时，建议选择高活跃度的群组作为素材库。" : "When scraping, pick highly active groups for better material.",
            isZh ? "矩阵运营建议结合多个账号轮流群发，以提高账号权重和安全性。" : "Rotate multiple accounts for better reach and safety.",
            isZh ? "如果遇到 Session 失效，请及时点击‘检测’并重新登录。" : "If a session expires, use 'Check' and re-login promptly."
        ]
    };

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-slate-200 selection:bg-blue-500/30">
            {/* Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 max-w-5xl mx-auto px-6 py-12 lg:py-20">
                {/* Navigation */}
                <div className="mb-12">
                    <Link
                        href="/"
                        className="inline-flex items-center text-slate-400 hover:text-white transition-colors group"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                        {t.backHome}
                    </Link>

                    <button
                        onClick={toggleLanguage}
                        className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2 ml-4"
                    >
                        <span>{lang === "zh" ? "English" : "中文"}</span>
                    </button>
                </div>

                {/* Header */}
                <header className="mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 mb-6">
                            <BookOpen className="w-4 h-4 text-blue-400 mr-2" />
                            <span className="text-sm font-medium text-blue-400 uppercase tracking-wider">{isZh ? "官方文档" : "Official Guide"}</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-slate-400 mb-6 italic">
                            {t.title}
                        </h1>
                        <p className="text-lg md:text-xl text-slate-400 max-w-2xl leading-relaxed">
                            {t.subtitle}
                        </p>
                        <div className="mt-8 text-sm text-slate-500">{t.lastUpdated}</div>
                    </motion.div>
                </header>

                {/* Main Sections */}
                <div className="space-y-32">
                    {t.sections.map((section, index) => (
                        <motion.section
                            key={section.id}
                            initial={{ opacity: 0, y: 40 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.8, delay: index * 0.1 }}
                            className="group"
                        >
                            <div className={`flex flex-col ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-12 lg:gap-20 items-center`}>
                                <div className="flex-1 space-y-6">
                                    <div className="inline-flex p-3 rounded-2xl bg-white/5 border border-white/10 shadow-xl">
                                        {section.icon}
                                    </div>
                                    <h2 className="text-3xl font-bold text-white group-hover:text-blue-400 transition-colors">
                                        {section.title}
                                    </h2>
                                    <p className="text-lg text-slate-400 leading-relaxed">
                                        {section.content}
                                    </p>
                                    <div className="flex items-center text-blue-400 font-medium cursor-default">
                                        <CheckCircle2 className="w-5 h-5 mr-2" />
                                        {isZh ? "核心功能已就绪" : "Feature verified"}
                                    </div>
                                </div>

                                <div className="flex-1 relative">
                                    <div className="absolute inset-0 bg-blue-500/20 rounded-2xl blur-3xl opacity-0 group-hover:opacity-40 transition-opacity duration-700" />
                                    <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#16161e]">
                                        <img
                                            src={section.image}
                                            alt={section.title}
                                            className="w-full h-auto grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent opacity-40" />
                                    </div>
                                </div>
                            </div>
                        </motion.section>
                    ))}
                </div>

                {/* Tips Section */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="mt-40 p-8 md:p-12 rounded-3xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/10 relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-4">
                        <Info className="w-12 h-12 text-white/5" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-8 flex items-center">
                        <ChevronRight className="w-6 h-6 text-blue-400 mr-2" />
                        {t.tipsTitle}
                    </h2>
                    <div className="grid md:grid-cols-3 gap-8">
                        {t.tips.map((tip, i) => (
                            <div key={i} className="space-y-3">
                                <div className="w-8 h-1 bg-blue-500/50 rounded-full" />
                                <p className="text-slate-400 leading-relaxed">{tip}</p>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Footer Link */}
                <footer className="mt-32 text-center pb-20">
                    <p className="text-slate-500 mb-8">{isZh ? "准备好开始了吗？" : "Ready to start?"}</p>
                    <Link
                        href="/login"
                        className="inline-flex items-center px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-blue-400 hover:text-white transition-all transform hover:scale-105 active:scale-95"
                    >
                        {isZh ? "立即开启登录" : "Get Started Now"}
                        <ChevronRight className="w-5 h-5 ml-2" />
                    </Link>
                </footer>
            </div>
        </div>
    );
}
