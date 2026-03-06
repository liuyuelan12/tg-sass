"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/useLanguage";

const translations = {
  en: {
    pageTitle: "Auto Chat",
    configJob: "Configure Job",
    sessions: "Sessions",
    selected: "selected",
    selectAll: "Select All",
    deselectAll: "Deselect All",
    dataSource: "Data Source",
    chooseDataSource: "Choose data source...",
    msgs: "msgs",
    delete: "Delete",
    targetGroup: "Target Group",
    targetGroupPlaceholder: "t.me/groupname or groupname",
    minSec: "Min (s)",
    maxSec: "Max (s)",
    sendPct: "Send %",
    replyPct: "Reply %",
    reactPct: "React %",
    loopMessages: "Loop after all messages sent",
    startAutoChat: "Start Auto-Chat",
    stop: "Stop",
    uploadSourceTitle: "Upload Data Source",
    uploadSourceDesc: "Upload a modified CSV (and optional media ZIP) as a data source.",
    csvFile: "CSV File",
    mediaZip: "Media ZIP (optional)",
    groupNameLabel: "Group Name (label)",
    groupNamePlaceholder: "Group username or link",
    uploading: "Uploading...",
    upload: "Upload",
    uploadSuccess: "Uploaded successfully!",
    uploadFailed: "Upload failed",
    liveLogs: "Live Logs",
    running: "Running",
    jobHistory: "Job History",
    clearing: "Clearing...",
    clearAll: "Clear All",
    noJobsYet: "No jobs yet",
    sent: "sent",
    error: "Error",
    failed: "Failed",
  },
  zh: {
    pageTitle: "自动群聊",
    configJob: "配置任务",
    sessions: "TG 账号",
    selected: "已选",
    selectAll: "全选",
    deselectAll: "取消全选",
    dataSource: "数据源",
    chooseDataSource: "选择数据源...",
    msgs: "条消息",
    delete: "删除",
    targetGroup: "目标群组",
    targetGroupPlaceholder: "t.me/groupname 或群组用户名",
    minSec: "最小间隔(秒)",
    maxSec: "最大间隔(秒)",
    sendPct: "发送概率 %",
    replyPct: "回复概率 %",
    reactPct: "表情互动概率 %",
    loopMessages: "发送完所有消息后循环",
    startAutoChat: "开始自动群聊",
    stop: "停止",
    uploadSourceTitle: "上传数据源",
    uploadSourceDesc: "上传修改过的话术 CSV（及可选的媒体文件 ZIP）作为数据源。",
    csvFile: "CSV 文件",
    mediaZip: "媒体文件 ZIP (可选)",
    groupNameLabel: "群组名称 (标签)",
    groupNamePlaceholder: "群组用户名或链接",
    uploading: "上传中...",
    upload: "上传",
    uploadSuccess: "上传成功！",
    uploadFailed: "上传失败",
    liveLogs: "实时日志",
    running: "运行中",
    jobHistory: "任务历史",
    clearing: "清理中...",
    clearAll: "清空全部",
    noJobsYet: "暂无任务",
    sent: "已发送",
    error: "错误",
    failed: "失败",
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
  const { lang, mounted } = useLanguage();
  const t = translations[lang];

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

      const runningJob = cj.find((j: ChatJob) => j.status === "RUNNING");
      if (runningJob) {
        setRunningJobId(runningJob.id);
        const socket = io({ path: "/api/socketio" });
        socketRef.current = socket;
        socket.on("autochat:log", (log: LogEntry) => {
          setLogs((prev) => [...prev, log]);
        });
      }

      // Default: select all active sessions
      const activeSessions = (s as TgSession[]).filter((sess) => sess.isActive);
      setSelectedSessions(activeSessions.map((sess) => sess.id));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
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
        throw new Error(data.error || t.failed);
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
          message: err instanceof Error ? err.message : t.error,
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
        setUploadStatus(t.uploadSuccess);
        refreshDataSources();
        (e.target as HTMLFormElement).reset();
      } else {
        const data = await res.json();
        setUploadStatus(`${t.failed}: ${data.error || t.error}`);
      }
    } catch {
      setUploadStatus(t.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  async function deleteJob(jobId: string) {
    setDeletingJobId(jobId);
    try {
      const res = await fetch(`/api/telegram/auto-chat/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        setChatJobs((prev) => prev.filter((j) => j.id !== jobId));
      }
    } catch {
      // ignore
    } finally {
      setDeletingJobId(null);
    }
  }

  async function clearAllJobs() {
    setClearingAll(true);
    try {
      const res = await fetch("/api/telegram/auto-chat", { method: "DELETE" });
      if (res.ok) {
        setChatJobs((prev) => prev.filter((j) => j.status === "RUNNING"));
      }
    } catch {
      // ignore
    } finally {
      setClearingAll(false);
    }
  }

  if (!mounted) {
    return null; // hide until hydration matches
  }

  const activeSessionCount = sessions.filter((s) => s.isActive).length;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">{t.pageTitle}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.configJob}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Session selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t.sessions} ({selectedSessions.length}/{activeSessionCount} {t.selected})</Label>
              <div className="flex gap-2">
                <button
                  onClick={selectAllSessions}
                  className="text-xs text-blue-400 hover:underline"
                >
                  {t.selectAll}
                </button>
                <button
                  onClick={deselectAllSessions}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {t.deselectAll}
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
                    className={`px-3 py-1 rounded-md text-sm border transition-colors ${selectedSessions.includes(s.id)
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
            <Label>{t.dataSource}</Label>
            <div className="flex gap-2">
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={selectedDataSource}
                onChange={(e) => setSelectedDataSource(e.target.value)}
              >
                <option value="">{t.chooseDataSource}</option>
                {scrapeJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.groupEntity} ({j.messageCount} {t.msgs})
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
                  {deletingSourceId === selectedDataSource ? "..." : t.delete}
                </Button>
              )}
            </div>
          </div>

          {/* Target */}
          <div className="space-y-2">
            <Label>{t.targetGroup}</Label>
            <Input
              placeholder={t.targetGroupPlaceholder}
              value={targetGroup}
              onChange={(e) => setTargetGroup(e.target.value)}
            />
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t.minSec}</Label>
              <Input value={intervalMin} onChange={(e) => setIntervalMin(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.maxSec}</Label>
              <Input value={intervalMax} onChange={(e) => setIntervalMax(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.sendPct}</Label>
              <Input value={sendPct} onChange={(e) => setSendPct(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.replyPct}</Label>
              <Input value={replyPct} onChange={(e) => setReplyPct(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.reactPct}</Label>
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
            <Label htmlFor="loop">{t.loopMessages}</Label>
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
                {t.startAutoChat}
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopJob}>
                {t.stop}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upload Data Source */}
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
                <Label>{t.groupNameLabel}</Label>
                <Input name="groupEntity" placeholder={t.groupNamePlaceholder} required />
              </div>
              {uploadStatus && (
                <div className={`text-sm ${uploadStatus.includes(t.uploadSuccess) ? "text-green-400" : "text-destructive"}`}>
                  {uploadStatus}
                </div>
              )}
              <Button type="submit" disabled={uploading}>
                {uploading ? t.uploading : t.upload}
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
              {t.liveLogs}
              {runningJobId && <Badge variant="default">{t.running}</Badge>}
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t.jobHistory}</h2>
          {chatJobs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={clearAllJobs}
              disabled={clearingAll}
            >
              {clearingAll ? t.clearing : t.clearAll}
            </Button>
          )}
        </div>
        {chatJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noJobsYet}</p>
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
                      {job.sentCount} {t.sent}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </span>
                    {job.status !== "RUNNING" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteJob(job.id)}
                        disabled={deletingJobId === job.id}
                      >
                        {deletingJobId === job.id ? "..." : t.delete}
                      </Button>
                    )}
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
