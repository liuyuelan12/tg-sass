"use client";

import { Suspense, useState, useEffect } from "react";
import { getCsrfToken } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { signIn as nextAuthSignIn } from "next-auth/react";
import { useLanguage } from "@/lib/useLanguage";

const translations = {
  en: {
    loading: "Loading...",
    adminLogin: "Admin Login",
    adminDesc: "System administrator access",
    invalidCreds: "Invalid credentials",
    loginFailed: "Login failed",
    email: "Email",
    password: "Password",
    signingIn: "Signing in...",
    signIn: "Sign In",
    backToUser: "Back to user login",
    signInUser: "Sign In",
    signInDescPassword: "Sign in with your email and password",
    signInDescOtp: "Sign in with a one-time code",
    invalidPasswordLogin: "Invalid email or password. If you registered with OTP and haven't set a password, please use OTP login.",
    noAccount: "No account found with this email. Please register first.",
    failedToSend: "Failed to send code",
    invalidOtp: "Invalid or expired code",
    verificationFailed: "Verification failed",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "Your password",
    useOtpInstead: "Use OTP code instead",
    sending: "Sending...",
    sendCode: "Send Login Code",
    usePasswordInstead: "Use password instead",
    sentCodeTo: "We sent a code to",
    verificationCode: "Verification Code",
    verifying: "Verifying...",
    useDifferentEmail: "Use different email",
    noAccountPrompt: "Don't have an account?",
    signUp: "Sign up",
  },
  zh: {
    loading: "加载中...",
    adminLogin: "管理员登录",
    adminDesc: "系统管理员访问权限",
    invalidCreds: "凭据无效",
    loginFailed: "登录失败",
    email: "邮箱",
    password: "密码",
    signingIn: "登录中...",
    signIn: "登录",
    backToUser: "返回用户登录",
    signInUser: "登 录",
    signInDescPassword: "使用邮箱和密码登录",
    signInDescOtp: "使用一次性验证码登录",
    invalidPasswordLogin: "邮箱或密码无效。如果您使用验证码注册且尚未设置密码，请使用验证码登录。",
    noAccount: "未找到该邮箱对应的账号，请先注册。",
    failedToSend: "验证码发送失败",
    invalidOtp: "验证码无效或已过期",
    verificationFailed: "验证失败",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "您的密码",
    useOtpInstead: "使用验证码登录",
    sending: "发送中...",
    sendCode: "发送登录验证码",
    usePasswordInstead: "使用密码登录",
    sentCodeTo: "我们已将验证码发送至",
    verificationCode: "验证码",
    verifying: "验证中...",
    useDifferentEmail: "使用其他邮箱",
    noAccountPrompt: "还没有账号？",
    signUp: "立即注册",
  }
};

async function credentialsSignIn(
  provider: string,
  credentials: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await nextAuthSignIn(provider, {
      ...credentials,
      redirect: false,
    });
    if (res?.error) {
      return { ok: false, error: res.error };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: "Network error" };
  }
}

export default function LoginPage() {
  const { lang } = useLanguage();
  const t = translations[lang];

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">{t.loading}</p></div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("admin") === "true";
  const { lang } = useLanguage();
  const t = translations[lang];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loginMode, setLoginMode] = useState<"otp" | "password">("password");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAdminLogin() {
    setLoading(true);
    setError("");
    try {
      const result = await credentialsSignIn("admin", { email, password });
      if (result.ok) {
        window.location.href = "/admin/dashboard";
      } else {
        setError(t.invalidCreds);
      }
    } catch {
      setError(t.loginFailed);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin() {
    setLoading(true);
    setError("");
    try {
      const result = await credentialsSignIn("password", { email, password });
      if (result.ok) {
        window.location.href = "/session-gen";
      } else {
        setError(t.invalidPasswordLogin);
      }
    } catch {
      setError(t.loginFailed);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    setLoading(true);
    setError("");
    try {
      const checkRes = await fetch("/api/auth/check-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const checkData = await checkRes.json();
      if (!checkData.exists) {
        setError(t.noAccount);
        setLoading(false);
        return;
      }

      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedToSend);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setLoading(true);
    setError("");
    try {
      const result = await credentialsSignIn("otp", {
        email: email.toLowerCase().trim(),
        code,
      });
      if (result.ok) {
        window.location.href = "/session-gen";
      } else {
        setError(t.invalidOtp);
      }
    } catch {
      setError(t.verificationFailed);
    } finally {
      setLoading(false);
    }
  }

  // Clear errors when switching modes
  useEffect(() => {
    setError("");
  }, [loginMode, step]);

  if (isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t.adminLogin}</CardTitle>
            <CardDescription>{t.adminDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t.email}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t.password}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleAdminLogin}
                disabled={loading || !email || !password}
              >
                {loading ? t.signingIn : t.signIn}
              </Button>
            </div>
            <div className="mt-6 text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
                {t.backToUser}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t.signInUser}</CardTitle>
          <CardDescription>
            {loginMode === "password"
              ? t.signInDescPassword
              : t.signInDescOtp}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {loginMode === "password" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t.email}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t.password}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
                />
              </div>
              <Button
                className="w-full"
                onClick={handlePasswordLogin}
                disabled={loading || !email || !password}
              >
                {loading ? t.signingIn : t.signInUser}
              </Button>
              <button
                onClick={() => {
                  setLoginMode("otp");
                  setError("");
                }}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                {t.useOtpInstead}
              </button>
            </div>
          ) : step === "email" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t.email}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleSendOtp}
                disabled={loading || !email}
              >
                {loading ? t.sending : t.sendCode}
              </Button>
              <button
                onClick={() => {
                  setLoginMode("password");
                  setError("");
                }}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                {t.usePasswordInstead}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t.sentCodeTo} <strong>{email}</strong>
              </p>
              <div className="space-y-2">
                <Label htmlFor="code">{t.verificationCode}</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                  maxLength={6}
                  className="text-center text-lg tracking-widest"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleVerifyOtp}
                disabled={loading || code.length < 6}
              >
                {loading ? t.verifying : t.signInUser}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep("email");
                  setCode("");
                }}
              >
                {t.useDifferentEmail}
              </Button>
            </div>
          )}

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {t.noAccountPrompt}{" "}
            <Link href="/register" className="text-primary hover:underline">
              {t.signUp}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

