"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/useLanguage";

const translations = {
  en: {
    pageTitle: "Session Manager",
    newSessionBtn: "+ New Session",
    generateSession: "Generate New Session",
    phonePlaceholder: "Phone number (e.g., +86...)",
    codePlaceholder: "Verification code",
    passwordPlaceholder: "2FA Password",
    send: "Send",
    yourSessions: "Your Sessions",
    batchCheckAll: "Batch Check All",
    checking: "Checking...",
    deleteInvalid: "Delete Invalid",
    deleting: "Deleting...",
    loading: "Loading...",
    noSessions: "No sessions yet. Create one to get started.",
    active: "Active",
    dead: "Dead",
    check: "Check",
    delete: "Delete",
    logConnecting: "Connecting to server...",
    logConnected: "Connected. Starting session generation...",
    logPhone: "Please enter your phone number",
    logCode: "Verification code sent to your phone",
    logPassword: "2FA password required",
    logError: "Error",
    logGenerated: "Session generated for",
    logSaved: "Session saved",
    logDisconnected: "Disconnected",
    logSent: "Sent",
  },
  zh: {
    pageTitle: "账号管理",
    newSessionBtn: "+ 获取新账号",
    generateSession: "获取新 TG 账号",
    phonePlaceholder: "手机号 (例如: +86...)",
    codePlaceholder: "验证码",
    passwordPlaceholder: "二次验证码 (2FA) 密码",
    send: "发送",
    yourSessions: "你的 TG 账号",
    batchCheckAll: "一键检测所有状态",
    checking: "检测中...",
    deleteInvalid: "一键删除失效账号",
    deleting: "删除中...",
    loading: "加载中...",
    noSessions: "暂无账号。请点击“获取新账号”开始。",
    active: "正常",
    dead: "失效",
    check: "检测",
    delete: "删除",
    logConnecting: "正在连接服务器...",
    logConnected: "已连接。即将开始获取账号...",
    logPhone: "请输入你的手机号（带国家代码，如 +86138...）",
    logCode: "验证码已发送至你的 TG，请在下方输入",
    logPassword: "该账号启用了二次验证，请输入 2FA 密码",
    logError: "错误",
    logGenerated: "成功获取账号",
    logSaved: "账号已保存",
    logDisconnected: "连接已断开",
    logSent: "已发送",
  }
};

interface TgSession {
  id: string;
  label: string;
  isActive: boolean;
  createdAt: string;
}

type Step = "idle" | "phone" | "code" | "password" | "connecting" | "done";

export default function SessionGenPage() {
  const { lang, mounted } = useLanguage();
  const t = translations[lang];

  const { data: session } = useSession();
  const [sessions, setSessions] = useState<TgSession[]>([]);
  const [step, setStep] = useState<Step>("idle");
  const [input, setInput] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchChecking, setBatchChecking] = useState(false);
  const [deletingInvalid, setDeletingInvalid] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    try {
      const res = await fetch("/api/telegram/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function startGeneration() {
    if (!session?.user?.id) return;

    const socket = io({ path: "/api/socketio" });
    socketRef.current = socket;
    setStep("connecting");
    setLogs([t.logConnecting]);

    socket.on("connect", () => {
      addLog(t.logConnected);
      socket.emit("session:start");
    });

    socket.on("session:event", (event: { type: string; message?: string; session?: string; name?: string; username?: string | null }) => {
      switch (event.type) {
        case "request_phone":
          setStep("phone");
          addLog(t.logPhone);
          break;
        case "request_code":
          setStep("code");
          addLog(t.logCode);
          break;
        case "request_password":
          setStep("password");
          addLog(t.logPassword);
          break;
        case "error":
          addLog(`${t.logError}: ${event.message}`);
          break;
        case "success":
          setStep("done");
          addLog(`${t.logGenerated} ${event.name} ${event.username ? `@${event.username}` : ""}`);
          break;
      }
    });

    socket.on("session:saved", (data: { label: string }) => {
      addLog(`${t.logSaved}: ${data.label}`);
      fetchSessions();
      setTimeout(() => {
        socket.disconnect();
        setStep("idle");
      }, 2000);
    });

    socket.on("disconnect", () => {
      addLog(t.logDisconnected);
    });
  }

  function sendInput() {
    if (socketRef.current && input) {
      socketRef.current.emit("session:input", input);
      addLog(`${t.logSent}: ${"*".repeat(input.length)}`);
      setInput("");
    }
  }

  function addLog(msg: string) {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  async function deleteSession(id: string) {
    const res = await fetch(`/api/telegram/sessions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.id !== id));
    }
  }

  async function checkSession(id: string) {
    const res = await fetch(`/api/telegram/sessions/${id}/check`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: data.active, label: data.label || s.label } : s))
      );
    }
  }

  async function batchCheck() {
    setBatchChecking(true);
    try {
      const res = await fetch("/api/telegram/sessions/batch-check", { method: "POST" });
      if (res.ok) {
        const results: Array<{ id: string; active: boolean; label: string }> = await res.json();
        setSessions((prev) =>
          prev.map((s) => {
            const result = results.find((r) => r.id === s.id);
            if (result) {
              return { ...s, isActive: result.active, label: result.label };
            }
            return s;
          })
        );
      }
    } catch {
      // ignore
    } finally {
      setBatchChecking(false);
    }
  }

  async function deleteAllInvalid() {
    setDeletingInvalid(true);
    try {
      const res = await fetch("/api/telegram/sessions/batch-delete-invalid", { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.isActive));
      }
    } catch {
      // ignore
    } finally {
      setDeletingInvalid(false);
    }
  }

  if (!mounted) return null;

  const invalidCount = sessions.filter((s) => !s.isActive).length;

  const promptLabel =
    step === "phone"
      ? t.phonePlaceholder
      : step === "code"
        ? t.codePlaceholder
        : step === "password"
          ? t.passwordPlaceholder
          : "";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.pageTitle}</h1>
        <Button
          onClick={startGeneration}
          disabled={step !== "idle" && step !== "done"}
        >
          {t.newSessionBtn}
        </Button>
      </div>

      {/* Session Generation Card */}
      {step !== "idle" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.generateSession}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(step === "phone" || step === "code" || step === "password") && (
              <div className="flex gap-2">
                <Input
                  placeholder={promptLabel}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendInput()}
                  type={step === "password" ? "password" : "text"}
                  autoFocus
                />
                <Button onClick={sendInput} disabled={!input}>
                  {t.send}
                </Button>
              </div>
            )}

            <div className="bg-black/50 rounded-md p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="text-muted-foreground">{log}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {t.yourSessions} ({sessions.length})
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={batchCheck}
              disabled={batchChecking || sessions.length === 0}
            >
              {batchChecking ? t.checking : t.batchCheckAll}
            </Button>
            {invalidCount > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={deleteAllInvalid}
                disabled={deletingInvalid}
              >
                {deletingInvalid ? t.deleting : `${t.deleteInvalid} (${invalidCount})`}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">{t.loading}</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.noSessions}</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <Card key={s.id} className="bg-card/50">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Badge variant={s.isActive ? "default" : "destructive"}>
                      {s.isActive ? t.active : t.dead}
                    </Badge>
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => checkSession(s.id)}
                    >
                      {t.check}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSession(s.id)}
                    >
                      {t.delete}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
