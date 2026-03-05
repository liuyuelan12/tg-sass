"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("admin") === "true";

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
      const result = await signIn("admin", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid credentials");
      } else {
        router.push("/admin/dashboard");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("CredentialsSignin")) {
        setError("Invalid credentials");
      } else {
        setError("Login failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin() {
    setLoading(true);
    setError("");
    try {
      const result = await signIn("password", {
        email,
        password,
        redirect: false,
      });
      console.log("signIn result:", JSON.stringify(result));
      if (result?.error) {
        setError("Invalid email or password. If you registered with OTP and haven't set a password, please use OTP login.");
      } else if (result?.ok) {
        router.push("/session-gen");
      } else {
        setError("Login failed - unexpected response");
      }
    } catch (err: unknown) {
      console.error("signIn error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("CredentialsSignin")) {
        setError("Invalid email or password");
      } else {
        setError("Login failed");
      }
    } finally {
      setLoading(false);
    }
  }

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

  async function handleVerifyOtp() {
    setLoading(true);
    setError("");
    try {
      const result = await signIn("otp", {
        email: email.toLowerCase().trim(),
        code,
        redirect: false,
      });
      console.log("OTP signIn result:", JSON.stringify(result));
      if (result?.error) {
        setError("Invalid or expired code");
      } else if (result?.ok) {
        router.push("/session-gen");
      } else {
        // NextAuth v5: signIn may not return error but also not ok
        router.push("/session-gen");
      }
    } catch (err: unknown) {
      console.error("OTP signIn catch:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("CredentialsSignin")) {
        setError("Invalid or expired code");
      } else {
        setError("Verification failed");
      }
    } finally {
      setLoading(false);
    }
  }

  if (isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Admin Login</CardTitle>
            <CardDescription>System administrator access</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </div>
            <div className="mt-6 text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
                Back to user login
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
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <CardDescription>
            {loginMode === "password"
              ? "Sign in with your email and password"
              : "Sign in with a one-time code"}
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
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your password"
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
                {loading ? "Signing in..." : "Sign In"}
              </Button>
              <button
                onClick={() => {
                  setLoginMode("otp");
                  setError("");
                }}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Use OTP code instead
              </button>
            </div>
          ) : step === "email" ? (
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
                {loading ? "Sending..." : "Send Login Code"}
              </Button>
              <button
                onClick={() => {
                  setLoginMode("password");
                  setError("");
                }}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Use password instead
              </button>
            </div>
          ) : (
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
                {loading ? "Verifying..." : "Sign In"}
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

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
