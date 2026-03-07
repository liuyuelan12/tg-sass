"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/useLanguage";

const translations = {
  en: {
    pageTitle: "Group Scraper",
    newScrapeJob: "New Scrape Job",
    session: "Session",
    chooseSession: "Choose a session...",
    groupLink: "Group Link / Username",
    groupLinkPlaceholder: "t.me/groupname or t.me/groupname/123",
    messages: "Messages",
    creatingJob: "Creating job...",
    failedCreate: "Failed to create job",
    connecting: "Connecting...",
    completed: "Completed! {count} messages scraped.",
    error: "Error: {error}",
    stopping: "Stopping...",
    uploadSuccess: "Files uploaded successfully!",
    uploadFailed: "Upload failed: {error}",
    uploadFailedShort: "Upload failed",
    scraping: "Scraping...",
    startScrape: "Start Scrape",
    stop: "Stop",
    uploadSourceTitle: "Upload Data Source",
    uploadSourceDesc: "Upload a CSV (and optional media ZIP) as a data source for auto-chat.",
    csvFile: "CSV File",
    mediaZip: "Media ZIP (optional)",
    targetGroup: "Target Group",
    targetGroupPlaceholder: "Group username or link",
    uploading: "Uploading...",
    upload: "Upload",
    dataSources: "Data Sources",
    noDataSources: "No data sources yet. Scrape a group or upload files.",
    msgs: "msgs",
    download: "Download",
    delete: "Delete",
    topic: "Topic:",
    mediaDownloaded: "Media: {d} downloaded, {s} skipped",
    progressMsgs: "{f} / {t} messages",
  },
  zh: {
    pageTitle: "扒取消息",
    newScrapeJob: "新建采集任务",
    session: "TG 账号",
    chooseSession: "选择账号...",
    groupLink: "群组链接 / 用户名",
    groupLinkPlaceholder: "t.me/groupname 或 t.me/groupname/123",
    messages: "消息数量",
    creatingJob: "正在创建任务...",
    failedCreate: "创建任务失败",
    connecting: "连接中...",
    completed: "完成！共采集了 {count} 条消息。",
    error: "错误: {error}",
    stopping: "停止中...",
    uploadSuccess: "文件上传成功！",
    uploadFailed: "上传失败: {error}",
    uploadFailedShort: "上传失败",
    scraping: "采集中...",
    startScrape: "开始采集",
    stop: "停止",
    uploadSourceTitle: "上传数据源",
    uploadSourceDesc: "上传 CSV（及可选的媒体 ZIP）作为自动群聊的数据源。",
    csvFile: "CSV 文件",
    mediaZip: "媒体 ZIP (可选)",
    targetGroup: "消息源名称",
    targetGroupPlaceholder: "群组用户名或链接",
    uploading: "上传中...",
    upload: "上传",
    dataSources: "数据源",
    noDataSources: "暂无数据源。请采集一个群组或上传文件。",
    msgs: "条消息",
    download: "下载",
    delete: "删除",
    topic: "话题:",
    mediaDownloaded: "媒体素材: 已下载 {d}，跳过 {s}",
    progressMsgs: "{f} / {t} 条消息",
  }
};

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
  const { lang, mounted } = useLanguage();
  const t = translations[lang];

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
    setStatusText(t.creatingJob);

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
        throw new Error(data.error || t.failedCreate);
      }

      const job = await res.json();
      setActiveJobId(job.id);
      setStatusText(t.connecting);

      const socket = connectSocket();

      socket.on("scrape:progress", (data: ScrapeProgressData) => {
        if (data.jobId === job.id) {
          setProgress(data);
          setStatusText(data.message);
        }
      });

      socket.on("scrape:done", (data: { jobId: string; totalMessages: number }) => {
        if (data.jobId === job.id) {
          setStatusText(t.completed.replace("{count}", String(data.totalMessages)));
          setScraping(false);
          setActiveJobId(null);
          refreshJobs();
        }
      });

      socket.on("scrape:error", (data: { jobId: string; error: string }) => {
        if (data.jobId === job.id) {
          setStatusText(t.error.replace("{error}", data.error));
          setScraping(false);
          setActiveJobId(null);
          refreshJobs();
        }
      });

      socket.emit("scrape:start", { jobId: job.id, sessionId: selectedSessionId });
    } catch (err) {
      setStatusText(err instanceof Error ? err.message : t.error.replace("{error}", "Unknown"));
      setScraping(false);
    }
  }

  function stopScrape() {
    if (activeJobId && socketRef.current) {
      socketRef.current.emit("scrape:stop", { jobId: activeJobId });
      setStatusText(t.stopping);
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
        setStatusText(t.uploadSuccess);
        refreshJobs();
        (e.target as HTMLFormElement).reset();
      } else {
        const data = await res.json();
        setStatusText(t.uploadFailed.replace("{error}", data.error || "Unknown"));
      }
    } catch {
      setStatusText(t.uploadFailedShort);
    } finally {
      setUploading(false);
    }
  }

  if (!mounted) return null;

  const progressPct = progress
    ? Math.round((progress.fetched / progress.total) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">{t.pageTitle}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.newScrapeJob}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t.session}</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              disabled={scraping}
            >
              <option value="">{t.chooseSession}</option>
              {sessions
                .filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label>{t.groupLink}</Label>
              <Input
                placeholder={t.groupLinkPlaceholder}
                value={groupLink}
                onChange={(e) => setGroupLink(e.target.value)}
                disabled={scraping}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.messages}</Label>
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
                    <span>{t.progressMsgs.replace("{f}", String(progress.fetched)).replace("{t}", String(progress.total))}</span>
                    <span>
                      {t.mediaDownloaded.replace("{d}", String(progress.mediaDownloaded)).replace("{s}", String(progress.mediaSkipped))}
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
              {scraping ? t.scraping : t.startScrape}
            </Button>
            {scraping && (
              <Button variant="destructive" onClick={stopScrape}>
                {t.stop}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upload section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.uploadSourceTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {t.uploadSourceDesc}
          </p>
          <form onSubmit={handleUpload}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.csvFile}</Label>
                  <Input type="file" name="csv" accept=".csv" required />
                </div>
                <div className="space-y-2">
                  <Label>{t.mediaZip}</Label>
                  <Input type="file" name="media" accept=".zip" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t.targetGroup}</Label>
                <Input name="groupEntity" placeholder={t.targetGroupPlaceholder} required />
              </div>
              <Button type="submit" disabled={uploading}>
                {uploading ? t.uploading : t.upload}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Data Sources (Scrape Jobs) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t.dataSources} ({jobs.length})</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noDataSources}</p>
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
                        {t.topic} {job.topicId}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {job.messageCount} {t.msgs}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {job.status === "COMPLETED" && job.csvR2Key && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadJob(job.id)}
                      >
                        {t.download}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteJob(job.id)}
                      disabled={deletingId === job.id}
                    >
                      {deletingId === job.id ? "..." : t.delete}
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
