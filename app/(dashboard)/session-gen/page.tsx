"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TgSession {
  id: string;
  label: string;
  isActive: boolean;
  createdAt: string;
}

type Step = "idle" | "phone" | "code" | "password" | "connecting" | "done";

export default function SessionGenPage() {
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
    setLogs(["Connecting to server..."]);

    socket.on("connect", () => {
      addLog("Connected. Starting session generation...");
      socket.emit("session:start");
    });

    socket.on("session:event", (event: { type: string; message?: string; session?: string; name?: string; username?: string | null }) => {
      switch (event.type) {
        case "request_phone":
          setStep("phone");
          addLog("Please enter your phone number");
          break;
        case "request_code":
          setStep("code");
          addLog("Verification code sent to your phone");
          break;
        case "request_password":
          setStep("password");
          addLog("2FA password required");
          break;
        case "error":
          addLog(`Error: ${event.message}`);
          break;
        case "success":
          setStep("done");
          addLog(`Session generated for ${event.name} ${event.username ? `@${event.username}` : ""}`);
          break;
      }
    });

    socket.on("session:saved", (data: { label: string }) => {
      addLog(`Session saved: ${data.label}`);
      fetchSessions();
      setTimeout(() => {
        socket.disconnect();
        setStep("idle");
      }, 2000);
    });

    socket.on("disconnect", () => {
      addLog("Disconnected");
    });
  }

  function sendInput() {
    if (socketRef.current && input) {
      socketRef.current.emit("session:input", input);
      addLog(`Sent: ${"*".repeat(input.length)}`);
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

  const invalidCount = sessions.filter((s) => !s.isActive).length;

  const promptLabel =
    step === "phone"
      ? "Phone number (e.g., +86...)"
      : step === "code"
        ? "Verification code"
        : step === "password"
          ? "2FA Password"
          : "";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Session Manager</h1>
        <Button
          onClick={startGeneration}
          disabled={step !== "idle" && step !== "done"}
        >
          + New Session
        </Button>
      </div>

      {/* Session Generation Card */}
      {step !== "idle" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generate New Session</CardTitle>
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
                  Send
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
            Your Sessions ({sessions.length})
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={batchCheck}
              disabled={batchChecking || sessions.length === 0}
            >
              {batchChecking ? "Checking..." : "Batch Check All"}
            </Button>
            {invalidCount > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={deleteAllInvalid}
                disabled={deletingInvalid}
              >
                {deletingInvalid ? "Deleting..." : `Delete Invalid (${invalidCount})`}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No sessions yet. Create one to get started.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <Card key={s.id} className="bg-card/50">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Badge variant={s.isActive ? "default" : "destructive"}>
                      {s.isActive ? "Active" : "Dead"}
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
                      Check
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSession(s.id)}
                    >
                      Delete
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
