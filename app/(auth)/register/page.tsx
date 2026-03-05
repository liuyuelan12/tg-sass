"use client";

import { useState } from "react";
import { getCsrfToken } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

async function credentialsSignIn(
  provider: string,
  credentials: Record<string, string>
): Promise<{ ok: boolean }> {
  const csrfToken = await getCsrfToken();
  const params = new URLSearchParams({
    ...credentials,
    csrfToken: csrfToken || "",
    json: "true",
  });
  const res = await fetch(`/api/auth/callback/${provider}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    redirect: "follow",
  });
  return { ok: res.ok };
}

export default function RegisterPage() {
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
      setError(err instanceof Error ? err.message : "Failed to send code");
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
        setError("Invalid or expired code");
      }
    } catch {
      setError("Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword() {
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
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
        throw new Error(data.error || "Failed to set password");
      }
      window.location.href = "/session-gen";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setLoading(false);
    }
  }

  function skipPassword() {
    window.location.href = "/session-gen";
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {step === "password" ? "Set Password" : "Create Account"}
          </CardTitle>
          <CardDescription>
            {step === "password"
              ? "Set a password for future logins"
              : "Get started with a 3-hour free trial"}
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
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
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
                {loading ? "Sending..." : "Send Verification Code"}
              </Button>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We sent a code to <strong>{email}</strong>
              </p>
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
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
                {loading ? "Verifying..." : "Verify"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep("email");
                  setCode("");
                }}
              >
                Use different email
              </Button>
            </div>
          )}

          {step === "password" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set a password so you can log in with email + password later.
              </p>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Confirm password"
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
                {loading ? "Setting..." : "Set Password & Continue"}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={skipPassword}
              >
                Skip for now
              </Button>
            </div>
          )}

          {step !== "password" && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
