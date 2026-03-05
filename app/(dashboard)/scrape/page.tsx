"use client";

import { useEffect, useState, useRef } from "react";
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
  topicId: number | null;
  status: string;
  messageCount: number;
  csvR2Key: string | null;
  createdAt: string;
}

interface ScrapeProgressData {
  jobId: string;
  fetched: number;
  total: number;
  mediaDownloaded: number;
  mediaSkipped: number;
  message: string;
}

export default function ScrapePage() {
  const [sessions, setSessions] = useState<TgSession[]>([]);
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [groupLink, setGroupLink] = useState("");
  const [count, setCount] = useState("100");
  const [scraping, setScraping] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScrapeProgressData | null>(null);
  const [statusText, setStatusText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/telegram/sessions").then((r) => r.json()),
      fetch("/api/telegram/scrape").then((r) => r.json()),
    ]).then(([s, j]) => {
      setSessions(s);
      setJobs(j);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  function connectSocket(): Socket {
    if (socketRef.current?.connected) return socketRef.current;
    const socket = io({ path: "/api/socketio" });
    socketRef.current = socket;
    return socket;
  }

  async function startScrape() {
    if (!selectedSessionId || !groupLink) return;
    setScraping(true);
    setProgress(null);
    setStatusText("Creating job...");

    try {
      const res = await fetch("/api/telegram/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: selectedSessionId,
          groupLink,
          count: parseInt(count) || 100,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create job");
      }

      const job = await res.json();
      setActiveJobId(job.id);
      setStatusText("Connecting...");

      const socket = connectSocket();

      socket.on("scrape:progress", (data: ScrapeProgressData) => {
        if (data.jobId === job.id) {
          setProgress(data);
          setStatusText(data.message);
        }
      });

      socket.on("scrape:done", (data: { jobId: string; totalMessages: number }) => {
        if (data.jobId === job.id) {
          setStatusText(`Completed! ${data.totalMessages} messages scraped.`);
          setScraping(false);
          setActiveJobId(null);
          refreshJobs();
        }
      });

      socket.on("scrape:error", (data: { jobId: string; error: string }) => {
        if (data.jobId === job.id) {
          setStatusText(`Error: ${data.error}`);
          setScraping(false);
          setActiveJobId(null);
          refreshJobs();
        }
      });

      socket.emit("scrape:start", { jobId: job.id, sessionId: selectedSessionId });
    } catch (err) {
      setStatusText(err instanceof Error ? err.message : "Error");
      setScraping(false);
    }
  }

  function stopScrape() {
    if (activeJobId && socketRef.current) {
      socketRef.current.emit("scrape:stop", { jobId: activeJobId });
      setStatusText("Stopping...");
    }
  }

  async function refreshJobs() {
    const res = await fetch("/api/telegram/scrape");
    if (res.ok) setJobs(await res.json());
  }

  async function deleteJob(jobId: string) {
    setDeletingId(jobId);
    try {
      const res = await fetch(`/api/telegram/scrape/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  function downloadJob(jobId: string) {
    window.open(`/api/files/download?jobId=${jobId}&type=scrape`, "_blank");
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setStatusText("Files uploaded successfully!");
        refreshJobs();
        (e.target as HTMLFormElement).reset();
      } else {
        const data = await res.json();
        setStatusText(`Upload failed: ${data.error || "Unknown error"}`);
      }
    } catch {
      setStatusText("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const progressPct = progress
    ? Math.round((progress.fetched / progress.total) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Group Scraper</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Scrape Job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Session</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              disabled={scraping}
            >
              <option value="">Choose a session...</option>
              {sessions
                .filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label>Group Link / Username</Label>
              <Input
                placeholder="t.me/groupname or t.me/groupname/123"
                value={groupLink}
                onChange={(e) => setGroupLink(e.target.value)}
                disabled={scraping}
              />
            </div>
            <div className="space-y-2">
              <Label>Messages</Label>
              <Input
                type="number"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                min={1}
                max={10000}
                disabled={scraping}
              />
            </div>
          </div>

          {(statusText || scraping) && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">{statusText}</div>
              {progress && scraping && (
                <>
                  <div className="w-full bg-secondary rounded-full h-2.5">
                    <div
                      className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{progress.fetched} / {progress.total} messages</span>
                    <span>
                      Media: {progress.mediaDownloaded} downloaded, {progress.mediaSkipped} skipped
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={startScrape}
              disabled={scraping || !selectedSessionId || !groupLink}
            >
              {scraping ? "Scraping..." : "Start Scrape"}
            </Button>
            {scraping && (
              <Button variant="destructive" onClick={stopScrape}>
                Stop
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upload section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Data Source</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a CSV (and optional media ZIP) as a data source for auto-chat.
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
                <Label>Target Group</Label>
                <Input name="groupEntity" placeholder="Group username or link" required />
              </div>
              <Button type="submit" disabled={uploading}>
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Data Sources (Scrape Jobs) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Data Sources ({jobs.length})</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data sources yet. Scrape a group or upload files.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <Card key={job.id} className="bg-card/50">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        job.status === "COMPLETED"
                          ? "default"
                          : job.status === "FAILED" || job.status === "STOPPED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {job.status}
                    </Badge>
                    <span className="text-sm">{job.groupEntity}</span>
                    {job.topicId && (
                      <span className="text-xs text-muted-foreground">
                        Topic: {job.topicId}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {job.messageCount} msgs
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {job.status === "COMPLETED" && job.csvR2Key && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadJob(job.id)}
                      >
                        Download
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteJob(job.id)}
                      disabled={deletingId === job.id}
                    >
                      {deletingId === job.id ? "..." : "Delete"}
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
