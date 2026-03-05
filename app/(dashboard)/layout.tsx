"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const navItems = [
  { href: "/session-gen", label: "Sessions", icon: "\u{1F510}" },
  { href: "/profile-modifier", label: "Profile", icon: "\u{1F464}" },
  { href: "/scrape", label: "Scrape", icon: "\u{1F577}\u{FE0F}" },
  { href: "/auto-chat", label: "Auto Chat", icon: "\u{1F916}" },
  { href: "#pricing", label: "Pricing", icon: "\u{1F4B0}" },
];

const plans = [
  {
    name: "Basic",
    price: "$200",
    highlight: false,
    description: "Full Telegram automation toolkit",
    features: [
      "Unlimited Telegram session generation & management",
      "Batch profile modifier (name, username, avatar)",
      "Group scraper with Forum/Topic support",
      "Auto-chat with session rotation & smart scheduling",
      "Media download & upload (CSV + ZIP)",
      "Cloudflare R2 encrypted storage",
      "Real-time progress monitoring",
      "Flood-wait auto-retry protection",
    ],
  },
  {
    name: "Pro",
    price: "$300",
    highlight: true,
    description: "AI-powered automation + Discord",
    features: [
      "Everything in Basic",
      "AI-assisted message rewriting & content generation",
      "Smart reply generation based on context",
      "Discord auto-posting & scheduled messaging",
      "Cross-platform content syndication (TG -> Discord)",
      "Advanced analytics dashboard",
      "Priority support via Telegram",
    ],
  },
  {
    name: "Enterprise",
    price: "$500",
    highlight: false,
    description: "Full suite for serious operators",
    features: [
      "Everything in Pro",
      "Twitter/X real-time keyword monitoring & alerts",
      "Alpha token discovery engine",
      "Multi-account sniper with configurable strategies",
      "Custom webhook integrations",
      "Dedicated infrastructure & uptime SLA",
      "1-on-1 onboarding & strategy consultation",
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

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border/40 flex flex-col">
        <div className="p-4 border-b border-border/40">
          <Link href="/" className="text-lg font-bold tracking-tight">
            TG-SaaS
          </Link>
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
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  pathname === item.href
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
          {userStatus && !userStatus.isPaid && timeLeft && (
            <div className="text-xs text-muted-foreground">
              Trial: <Badge variant="outline" className="ml-1">{timeLeft}</Badge>
            </div>
          )}
          {userStatus?.isPaid && (
            <Badge variant="default" className="text-xs">Pro</Badge>
          )}
          <div className="text-xs text-muted-foreground truncate">
            {session.user?.email}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Sign Out
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
                  {timeLeft === "Expired" ? "Trial Expired" : "Upgrade Your Plan"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {timeLeft === "Expired"
                    ? "Your free trial has ended. Choose a plan to continue using TG-SaaS."
                    : "Unlock more features by upgrading your plan."}
                </p>
              </div>
              {timeLeft !== "Expired" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPricing(false)}
                >
                  Close
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <Card
                  key={plan.name}
                  className={`relative flex flex-col ${
                    plan.highlight
                      ? "border-primary shadow-lg shadow-primary/10"
                      : "border-border/40"
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                      Most Popular
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
              <h3 className="text-sm font-semibold">Payment (USDT)</h3>
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
                    Contact Support on Telegram
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
