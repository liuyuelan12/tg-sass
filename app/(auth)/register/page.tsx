"use client";

import { useState, useEffect } from "react";
import { getCsrfToken } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { signIn as nextAuthSignIn } from "next-auth/react";
import { useLanguage } from "@/lib/useLanguage";

const translations = {
  en: {
    failedToSend: "Failed to send code",
    invalidOtp: "Invalid or expired code",
    verificationFailed: "Verification failed",
    passwordTooShort: "Password must be at least 6 characters",
    passwordsNoMatch: "Passwords do not match",
    failedToSetPassword: "Failed to set password",
    setPasswordTitle: "Set Password",
    createAccountTitle: "Create Account",
    setPasswordDesc: "Set a password for future logins",
    createAccountDesc: "Get started with a 3-hour free trial",
    email: "Email",
    emailPlaceholder: "you@example.com",
    sending: "Sending...",
    sendVerifyCode: "Send Verification Code",
    sentCodeTo: "We sent a code to",
    verifyCode: "Verification Code",
    verifying: "Verifying...",
    verify: "Verify",
    useDifferentEmail: "Use different email",
    setPasswordGuide: "Set a password so you can log in with email + password later.",
    password: "Password",
    passwordPlaceholder: "At least 6 characters",
    confirmPassword: "Confirm Password",
    confirmPlaceholder: "Confirm password",
    setting: "Setting...",
    setPasswordAndContinue: "Set Password & Continue",
    skipForNow: "Skip for now",
    alreadyHaveAccount: "Already have an account?",
    signIn: "Sign in",
  },
  zh: {
    failedToSend: "验证码发送失败",
    invalidOtp: "验证码无效或已过期",
    verificationFailed: "验证失败",
    passwordTooShort: "密码长度不能少于6个字符",
    passwordsNoMatch: "两次输入的密码不一致",
    failedToSetPassword: "设置密码失败",
    setPasswordTitle: "设置密码",
    createAccountTitle: "创建账号",
    setPasswordDesc: "设置密码以便日后登录",
    createAccountDesc: "立即开始",
    email: "邮箱",
    emailPlaceholder: "you@example.com",
    sending: "发送中...",
    sendVerifyCode: "发送验证码",
    sentCodeTo: "我们已将验证码发送至",
    verifyCode: "验证码",
    verifying: "验证中...",
    verify: "验 证",
    useDifferentEmail: "使用其他邮箱",
    setPasswordGuide: "设置一个密码，以后可以使用邮箱+密码登录。",
    password: "密码",
    passwordPlaceholder: "至少6个字符",
    confirmPassword: "确认密码",
    confirmPlaceholder: "确认您的密码",
    setting: "设置中...",
    setPasswordAndContinue: "设置密码并继续",
    skipForNow: "暂不设置跳过",
    alreadyHaveAccount: "已有账号？",
    signIn: "立即登录",
  }
};

async function credentialsSignIn(
  provider: string,
  credentials: Record<string, string>
): Promise<{ ok: boolean }> {
  try {
    const res = await nextAuthSignIn(provider, {
      ...credentials,
      redirect: false,
    });
    return { ok: !res?.error };
  } catch (err) {
    return { ok: false };
  }
}

export default function RegisterPage() {
  const { lang, mounted } = useLanguage();
  const t = translations[lang];

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"email" | "otp" | "password">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSendOtp() {
    setLoading(true);
    setError("");
    try {
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

  async function handleVerify() {
    setLoading(true);
    setError("");
    try {
      const result = await credentialsSignIn("otp", {
        email: email.toLowerCase().trim(),
        code,
      });
      if (result.ok) {
        setStep("password");
      } else {
        setError(t.invalidOtp);
      }
    } catch {
      setError(t.verificationFailed);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword() {
    setError("");
    if (password.length < 6) {
      setError(t.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.passwordsNoMatch);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t.failedToSetPassword);
      }
      window.location.href = "/session-gen";
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedToSetPassword);
    } finally {
      setLoading(false);
    }
  }

  function skipPassword() {
    window.location.href = "/session-gen";
  }

  // Clear error when changing steps
  useEffect(() => {
    setError("");
  }, [step]);

  // Prevent hydration mismatch for text by ensuring mounted
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl invisible">Create Account</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {step === "password" ? t.setPasswordTitle : t.createAccountTitle}
          </CardTitle>
          <CardDescription>
            {step === "password"
              ? t.setPasswordDesc
              : t.createAccountDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {step === "email" && (
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
                {loading ? t.sending : t.sendVerifyCode}
              </Button>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t.sentCodeTo} <strong>{email}</strong>
              </p>
              <div className="space-y-2">
                <Label htmlFor="code">{t.verifyCode}</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                  maxLength={6}
                  className="text-center text-lg tracking-widest"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleVerify}
                disabled={loading || code.length < 6}
              >
                {loading ? t.verifying : t.verify}
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

          {step === "password" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t.setPasswordGuide}
              </p>
              <div className="space-y-2">
                <Label htmlFor="password">{t.password}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">{t.confirmPassword}</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder={t.confirmPlaceholder}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleSetPassword}
                disabled={loading || !password}
              >
                {loading ? t.setting : t.setPasswordAndContinue}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={skipPassword}
              >
                {t.skipForNow}
              </Button>
            </div>
          )}

          {step !== "password" && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {t.alreadyHaveAccount}{" "}
              <Link href="/login" className="text-primary hover:underline">
                {t.signIn}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
