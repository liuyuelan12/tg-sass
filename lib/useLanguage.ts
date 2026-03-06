"use client";

import { useState, useEffect } from "react";

export type Language = "zh" | "en";

export function useLanguage() {
    const [lang, setLang] = useState<Language>("zh");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Read user preference from local storage on mount
        const savedLang = localStorage.getItem("tg-saas-lang") as Language;
        if (savedLang && (savedLang === "en" || savedLang === "zh")) {
            setLang(savedLang);
        } else {
            // Auto-detect browser language
            if (typeof navigator !== "undefined" && navigator.language.startsWith("en")) {
                setLang("en");
            } else {
                setLang("zh");
            }
        }
        setMounted(true);
    }, []);

    // Listen for language changes from other components
    useEffect(() => {
        const handleLanguageChange = () => {
            const savedLang = localStorage.getItem("tg-saas-lang") as Language;
            if (savedLang && (savedLang === "en" || savedLang === "zh")) {
                setLang(savedLang);
            }
        };

        window.addEventListener("tg-saas-lang-change", handleLanguageChange);
        return () => {
            window.removeEventListener("tg-saas-lang-change", handleLanguageChange);
        };
    }, []);

    const toggleLanguage = () => {
        const newLang = lang === "en" ? "zh" : "en";
        setLang(newLang);
        localStorage.setItem("tg-saas-lang", newLang);
        // Dispatch custom event to sync across other active components on the same page
        window.dispatchEvent(new Event("tg-saas-lang-change"));
    };

    return { lang, mounted, toggleLanguage, setLang };
}
