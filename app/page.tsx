import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Session Manager",
    description: "Generate and manage Telegram sessions with multi-step authentication flow.",
    href: "/session-gen",
    icon: "\u{1F510}",
  },
  {
    title: "Profile Modifier",
    description: "Batch update names, usernames, and avatars across your Telegram accounts.",
    href: "/profile-modifier",
    icon: "\u{1F464}",
  },
  {
    title: "Group Scraper",
    description: "Extract messages and media from Telegram groups with topic support.",
    href: "/scrape",
    icon: "\u{1F577}\u{FE0F}",
  },
  {
    title: "Auto Chat",
    description: "Automated group messaging with session rotation and smart scheduling.",
    href: "/auto-chat",
    icon: "\u{1F916}",
  },
];

const plans = [
  {
    name: "Basic",
    price: "$200",
    period: "/mo",
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
    period: "/mo",
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
    period: "/mo",
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

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">TG-SaaS</h1>
          <div className="flex gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Login</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-3xl text-center space-y-6">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Telegram Automation,{" "}
            <span className="text-primary">Simplified</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Manage sessions, scrape groups, modify profiles, and automate
            messaging — all from one dashboard with complete user isolation.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/register">
              <Button size="lg">Start Free Trial</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">Sign In</Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            3-hour free trial. No credit card required.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-16 max-w-6xl w-full">
          {features.map((feature) => (
            <Card key={feature.title} className="bg-card/50 border-border/40 hover:border-primary/40 transition-colors">
              <CardHeader>
                <div className="text-3xl mb-2">{feature.icon}</div>
                <CardTitle className="text-base">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20 border-t border-border/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Pricing Plans
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Choose the plan that fits your operation. All plans include encrypted storage and user isolation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {plan.description}
                  </p>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <ul className="space-y-3 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2 text-sm">
                        <svg
                          className="w-4 h-4 text-primary shrink-0 mt-0.5"
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
                  <Link href="/register" className="mt-6">
                    <Button
                      className="w-full"
                      variant={plan.highlight ? "default" : "outline"}
                    >
                      Get Started
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Payment & Contact */}
      <section className="px-6 py-16 border-t border-border/40">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <h2 className="text-2xl font-bold">Payment</h2>
          <p className="text-sm text-muted-foreground">
            We accept USDT payments. After payment, contact support with your transaction hash to activate your plan.
          </p>

          <div className="space-y-4">
            <div className="bg-card/50 border border-border/40 rounded-lg p-4 text-left space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">USDT (BEP20 - BSC)</div>
                <code className="text-xs sm:text-sm break-all select-all text-foreground">
                  0xa1a267a24316a039d3f9feff2968e3e0d1029848
                </code>
              </div>
              <div className="border-t border-border/40 pt-3">
                <div className="text-xs text-muted-foreground mb-1">USDT (TRC20 - Tron)</div>
                <code className="text-xs sm:text-sm break-all select-all text-foreground">
                  TEfJbc178R6NzogDakY2Q1Xritm24VnxL7
                </code>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <p className="text-sm text-muted-foreground mb-3">
              Questions? Need help activating your plan?
            </p>
            <a
              href="https://t.me/kowliep"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">
                Contact Support on Telegram
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <span>TG-SaaS &copy; {new Date().getFullYear()}</span>
          <Link href="/login?admin=true" className="hover:text-foreground transition-colors">
            Admin
          </Link>
        </div>
      </footer>
    </div>
  );
}
