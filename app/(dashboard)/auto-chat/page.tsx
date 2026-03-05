"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TgSession {
  id: string;
  label: string;
  isActive: boolean;
}

interface ScrapeJob {
  id: string;
  groupEntity: string;
  status: string;
  messageCount: number;
  csvR2Key: string | null;
  mediaR2Prefix: string | null;
}

interface ChatJob {
  id: string;
  groupEntity: string;
  status: string;
  sentCount: number;
  createdAt: string;
}

interface LogEntry {
  type: string;
  message: string;
  timestamp: number;
}

export default function AutoChatPage() {
  const { data: authSession } = useSession();
  const [sessions, setSessions] = useState<TgSession[]>([]);
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJob[]>([]);
  const [chatJobs, setChatJobs] = useState<ChatJob[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [selectedDataSource, setSelectedDataSource] = useState("");
  const [targetGroup, setTargetGroup] = useState("");
  const [intervalMin, setIntervalMin] = useState("3");
  const [intervalMax, setIntervalMax] = useState("5");
  const [sendPct, setSendPct] = useState("70");
  const [replyPct, setReplyPct] = useState("20");
  const [reactPct, setReactPct] = useState("10");
  const [shouldLoop, setShouldLoop] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/telegram/sessions").then((r) => r.json()),
      fetch("/api/telegram/scrape").then((r) => r.json()),
      fetch("/api/telegram/auto-chat").then((r) => r.json()),
    ]).then(([s, sj, cj]) => {
      setSessions(s);
      const completedJobs = sj.filter((j: ScrapeJob) => j.status === "COMPLETED" && j.csvR2Key);
      setScrapeJobs(completedJobs);
      setChatJobs(cj);

      // Default: select all active sessions
      const activeSessions = (s as TgSession[]).filter((sess) => sess.isActive);
      setSelectedSessions(activeSessions.map((sess) => sess.id));
    });
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function toggleSession(id: string) {
    setSelectedSessions((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function selectAllSessions() {
    const activeIds = sessions.filter((s) => s.isActive).map((s) => s.id);
    setSelectedSessions(activeIds);
  }

  function deselectAllSessions() {
    setSelectedSessions([]);
  }

  async function startJob() {
    if (!authSession?.user?.id || selectedSessions.length === 0 || !selectedDataSource || !targetGroup)
      return;

    try {
      const res = await fetch("/api/telegram/auto-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionIds: selectedSessions,
          dataSourceJobId: selectedDataSource,
          targetGroup,
          intervalMin: parseInt(intervalMin),
          intervalMax: parseInt(intervalMax),
          sendPct: parseInt(sendPct),
          replyPct: parseInt(replyPct),
          reactPct: parseInt(reactPct),
          shouldLoop,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }

      const job = await res.json();
      setRunningJobId(job.id);
      setLogs([]);

      const socket = io({ path: "/api/socketio" });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("autochat:start", { jobId: job.id });
      });

      socket.on("autochat:log", (log: LogEntry) => {
        setLogs((prev) => [...prev, log]);
      });
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        {
          type: "error",
          message: err instanceof Error ? err.message : "Error",
          timestamp: Date.now(),
        },
      ]);
    }
  }

  async function stopJob() {
    if (!runningJobId || !socketRef.current) return;
    socketRef.current.emit("autochat:stop", { jobId: runningJobId });
    setRunningJobId(null);
    setTimeout(() => {
      socketRef.current?.disconnect();
      refreshJobs();
    }, 2000);
  }

  async function refreshJobs() {
    const res = await fetch("/api/telegram/auto-chat");
    if (res.ok) setChatJobs(await res.json());
  }

  async function refreshDataSources() {
    const res = await fetch("/api/telegram/scrape");
    if (res.ok) {
      const all = await res.json();
      setScrapeJobs(all.filter((j: ScrapeJob) => j.status === "COMPLETED" && j.csvR2Key));
    }
  }

  async function deleteDataSource(jobId: string) {
    setDeletingSourceId(jobId);
    try {
      const res = await fetch(`/api/telegram/scrape/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        setScrapeJobs((prev) => prev.filter((j) => j.id !== jobId));
        if (selectedDataSource === jobId) setSelectedDataSource("");
      }
    } catch {
      // ignore
    } finally {
      setDeletingSourceId(null);
    }
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    setUploadStatus("");
    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setUploadStatus("Uploaded successfully!");
        refreshDataSources();
        (e.target as HTMLFormElement).reset();
      } else {
        const data = await res.json();
        setUploadStatus(`Failed: ${data.error || "Unknown error"}`);
      }
    } catch {
      setUploadStatus("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const activeSessionCount = sessions.filter((s) => s.isActive).length;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Auto Chat</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configure Job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Session selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Sessions ({selectedSessions.length}/{activeSessionCount} selected)</Label>
              <div className="flex gap-2">
                <button
                  onClick={selectAllSessions}
                  className="text-xs text-blue-400 hover:underline"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAllSessions}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Deselect All
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {sessions
                .filter((s) => s.isActive)
                .map((s) => (
                  <button
                    key={s.id}
                    onClick={() => toggleSession(s.id)}
                    className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                      selectedSessions.includes(s.id)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
            </div>
          </div>

          {/* Data source selection */}
          <div className="space-y-2">
            <Label>Data Source</Label>
            <div className="flex gap-2">
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={selectedDataSource}
                onChange={(e) => setSelectedDataSource(e.target.value)}
              >
                <option value="">Choose data source...</option>
                {scrapeJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.groupEntity} ({j.messageCount} msgs)
                  </option>
                ))}
              </select>
              {selectedDataSource && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteDataSource(selectedDataSource)}
                  disabled={deletingSourceId === selectedDataSource}
                >
                  {deletingSourceId === selectedDataSource ? "..." : "Delete"}
                </Button>
              )}
            </div>
          </div>

          {/* Target */}
          <div className="space-y-2">
            <Label>Target Group</Label>
            <Input
              placeholder="t.me/groupname or groupname"
              value={targetGroup}
              onChange={(e) => setTargetGroup(e.target.value)}
            />
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Min (s)</Label>
              <Input value={intervalMin} onChange={(e) => setIntervalMin(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max (s)</Label>
              <Input value={intervalMax} onChange={(e) => setIntervalMax(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Send %</Label>
              <Input value={sendPct} onChange={(e) => setSendPct(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reply %</Label>
              <Input value={replyPct} onChange={(e) => setReplyPct(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">React %</Label>
              <Input value={reactPct} onChange={(e) => setReactPct(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="loop"
              checked={shouldLoop}
              onChange={(e) => setShouldLoop(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="loop">Loop after all messages sent</Label>
          </div>

          <div className="flex gap-3">
            {!runningJobId ? (
              <Button
                onClick={startJob}
                disabled={
                  selectedSessions.length === 0 ||
                  !selectedDataSource ||
                  !targetGroup
                }
              >
                Start Auto-Chat
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopJob}>
                Stop
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upload Data Source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Data Source</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a modified CSV (and optional media ZIP) as a data source.
          </p>
          <form onSubmit={handleUpload}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CSV File</Label>
                  <Input type="file" name="csv" accept=".csv" required />
                </div>
                <div className="space-y-2">
                  <Label>Media ZIP (optional)</Label>
                  <Input type="file" name="media" accept=".zip" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Group Name (label)</Label>
                <Input name="groupEntity" placeholder="Group username or link" required />
              </div>
              {uploadStatus && (
                <div className={`text-sm ${uploadStatus.includes("success") ? "text-green-400" : "text-destructive"}`}>
                  {uploadStatus}
                </div>
              )}
              <Button type="submit" disabled={uploading}>
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Live Logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Live Logs
              {runningJobId && <Badge variant="default">Running</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-black/50 rounded-md p-3 max-h-80 overflow-y-auto font-mono text-xs space-y-1">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.type === "error"
                      ? "text-red-400"
                      : log.type === "success"
                        ? "text-green-400"
                        : log.type === "warn"
                          ? "text-yellow-400"
                          : "text-muted-foreground"
                  }
                >
                  [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job History */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Job History</h2>
        {chatJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs yet</p>
        ) : (
          <div className="space-y-2">
            {chatJobs.map((job) => (
              <Card key={job.id} className="bg-card/50">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        job.status === "COMPLETED" || job.status === "STOPPED"
                          ? "secondary"
                          : job.status === "FAILED"
                            ? "destructive"
                            : job.status === "RUNNING"
                              ? "default"
                              : "outline"
                      }
                    >
                      {job.status}
                    </Badge>
                    <span className="text-sm">{job.groupEntity}</span>
                    <span className="text-xs text-muted-foreground">
                      {job.sentCount} sent
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(job.createdAt).toLocaleDateString()}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
