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
    pageTitle: "AI Group Chat",
    description: "Sessions chat with each other using AI. Personas inferred from a scrape CSV.",
    configJob: "Configure AI Chat",
    sessions: "Sessions",
    selected: "selected",
    selectAll: "Select All",
    deselectAll: "Deselect All",
    personaSource: "Persona Source (Scrape CSV)",
    choosePersonaSource: "Choose scrape job...",
    msgs: "msgs",
    targetGroup: "Target Group",
    targetGroupPlaceholder: "t.me/groupname or groupname",
    provider: "LLM Provider",
    model: "Model",
    modelPlaceholder: "e.g. llama-3.3-70b-versatile",
    apiKeysTitle: "API Keys (BYOK)",
    apiKeysDesc: "Save your own LLM API key. Server-side encrypted (AES-256-GCM).",
    apiKeyLabel: "Label (optional)",
    apiKeyValue: "API Key",
    apiKeyValuePlaceholder: "sk-...",
    saveKey: "Save Key",
    deleteKey: "Delete",
    baseUrlLabel: "Base URL (for OpenAI-Compat)",
    baseUrlPlaceholder: "https://api.example.com/v1",
    keyDefaultModel: "Default Model (optional)",
    minSec: "Min (s)",
    maxSec: "Max (s)",
    sendPct: "Send %",
    replyPct: "Reply %",
    reactPct: "React %",
    mediaPct: "GIF/Sticker %",
    contextSize: "Context size",
    maxMessages: "Max messages",
    shouldLoop: "Loop after maxMessages",
    dryRun: "Dry-run (don't actually send)",
    autoResurrect: "Auto-resurrect (survive server restarts)",
    autoResurrectHelp: "When ON: if the runner dies (Railway redeploy, crash, transient error) the resurrector picks the job back up within ~60s. Recommended for long-running keeper jobs.",
    priorityReplyStrangers: "Priority-reply when strangers speak",
    priorityReplyStrangersHelp: "When ON: if a non-own user posts an unanswered message, the next turn force-replies to them, then resumes normal session-to-session chat.",
    bannedKeywords: "Banned keywords",
    bannedKeywordsHelp: "Comma- or newline-separated. Generated messages containing any of these are discarded and the turn is skipped.",
    bannedKeywordsPlaceholder: "scam, rugpull\nexit liquidity",
    previewPersonas: "Preview Personas",
    previewing: "Analyzing CSV...",
    detectedLanguage: "Language",
    personasFound: "Personas",
    startAIChat: "Start AI Chat",
    stop: "Stop",
    liveLogs: "Live Logs",
    running: "Running",
    jobHistory: "Job History",
    clearing: "Clearing...",
    clearAll: "Clear All",
    noJobsYet: "No jobs yet",
    sent: "sent",
    tokens: "tokens",
    error: "Error",
    failed: "Failed",
    delete: "Delete",
    providerGroqDefault: "Groq (server key)",
    providerGroqByok: "Groq (your key)",
    providerOpenAI: "OpenAI",
    providerAnthropic: "Anthropic (Claude)",
    providerOpenAICompat: "OpenAI-Compatible",
    noKeysSaved: "No keys saved yet",
    keyMaskedLabel: "Key",
  },
  zh: {
    pageTitle: "AI 群聊",
    description: "Session 之间通过 AI 互相对话。Persona 由 scrape CSV 自动推断。",
    configJob: "配置 AI 群聊任务",
    sessions: "TG 账号",
    selected: "已选",
    selectAll: "全选",
    deselectAll: "取消全选",
    personaSource: "Persona 来源 (扒取的 CSV)",
    choosePersonaSource: "选择扒取记录...",
    msgs: "条消息",
    targetGroup: "目标群组",
    targetGroupPlaceholder: "t.me/groupname 或群组用户名",
    provider: "LLM 服务商",
    model: "模型",
    modelPlaceholder: "如 llama-3.3-70b-versatile",
    apiKeysTitle: "API Key 管理 (BYOK)",
    apiKeysDesc: "保存你自己的 LLM API key。服务端加密 (AES-256-GCM)。",
    apiKeyLabel: "标签（可选）",
    apiKeyValue: "API Key",
    apiKeyValuePlaceholder: "sk-...",
    saveKey: "保存 Key",
    deleteKey: "删除",
    baseUrlLabel: "Base URL（OpenAI 兼容用）",
    baseUrlPlaceholder: "https://api.example.com/v1",
    keyDefaultModel: "默认模型（可选）",
    minSec: "最小间隔(秒)",
    maxSec: "最大间隔(秒)",
    sendPct: "主动发话题 %",
    replyPct: "回复 %",
    reactPct: "表情互动 %",
    mediaPct: "GIF/贴纸 %",
    contextSize: "上下文消息数",
    maxMessages: "最大消息数",
    shouldLoop: "达到上限后循环",
    dryRun: "演练模式（不真发）",
    autoResurrect: "自动恢复（服务器重启后自愈）",
    autoResurrectHelp: "开启后：Railway redeploy / 崩溃 / 短暂异常导致 runner 死掉时，resurrector 会在 60 秒内自动把 job 重新拉起。长期驻留的 keeper 任务建议打开。",
    priorityReplyStrangers: "陌生人优先回复",
    priorityReplyStrangersHelp: "开启后：群里有非自己 session 的用户发言且尚未被回复时，下一回合强制回复他/她，回完后恢复 session 之间互聊。",
    bannedKeywords: "禁止关键字",
    bannedKeywordsHelp: "用逗号或换行分隔。AI 生成的内容只要包含任一关键字就会被丢弃并跳过本轮。",
    bannedKeywordsPlaceholder: "跑路, 骗子\n暴雷",
    previewPersonas: "预览 Persona",
    previewing: "正在分析 CSV...",
    detectedLanguage: "语言",
    personasFound: "Persona 列表",
    startAIChat: "开始 AI 群聊",
    stop: "停止",
    liveLogs: "实时日志",
    running: "运行中",
    jobHistory: "任务历史",
    clearing: "清理中...",
    clearAll: "清空全部",
    noJobsYet: "暂无任务",
    sent: "已发送",
    tokens: "tokens",
    error: "错误",
    failed: "失败",
    delete: "删除",
    providerGroqDefault: "Groq（服务器 key）",
    providerGroqByok: "Groq（你的 key）",
    providerOpenAI: "OpenAI",
    providerAnthropic: "Anthropic (Claude)",
    providerOpenAICompat: "OpenAI 兼容",
    noKeysSaved: "尚未保存任何 key",
    keyMaskedLabel: "Key",
  },
} as const;

type Provider =
  | "GROQ_DEFAULT"
  | "GROQ_BYOK"
  | "OPENAI_BYOK"
  | "ANTHROPIC_BYOK"
  | "OPENAI_COMPAT_BYOK";

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
}

interface AIChatJob {
  id: string;
  groupEntity: string;
  status: string;
  sentCount: number;
  tokensIn: number;
  tokensOut: number;
  detectedLanguage: string | null;
  provider: Provider;
  model: string;
  createdAt: string;
}

interface UserApiKey {
  id: string;
  provider: Provider;
  label: string | null;
  model: string | null;
  baseUrl: string | null;
  keyMasked: string;
  createdAt: string;
}

interface LogEntry {
  type: string;
  message: string;
  timestamp: number;
}

interface PersonaPreview {
  language: "zh" | "en";
  personas: { name: string; traits: string; samplePhrases: string[] }[];
}

const PROVIDER_DEFAULT_MODEL: Record<Provider, string> = {
  GROQ_DEFAULT: "llama-3.3-70b-versatile",
  GROQ_BYOK: "llama-3.3-70b-versatile",
  OPENAI_BYOK: "gpt-4o-mini",
  ANTHROPIC_BYOK: "claude-haiku-4-5-20251001",
  OPENAI_COMPAT_BYOK: "",
};

export default function AIChatPage() {
  const { lang, mounted } = useLanguage();
  const t = translations[lang];

  const { data: authSession } = useSession();
  const [sessions, setSessions] = useState<TgSession[]>([]);
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJob[]>([]);
  const [aiJobs, setAIJobs] = useState<AIChatJob[]>([]);
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [scrapeJobId, setScrapeJobId] = useState("");
  const [targetGroup, setTargetGroup] = useState("");
  const [provider, setProvider] = useState<Provider>("GROQ_DEFAULT");
  const [model, setModel] = useState(PROVIDER_DEFAULT_MODEL.GROQ_DEFAULT);
  const [intervalMin, setIntervalMin] = useState("8");
  const [intervalMax, setIntervalMax] = useState("20");
  const [sendPct, setSendPct] = useState("60");
  const [replyPct, setReplyPct] = useState("22");
  const [reactPct, setReactPct] = useState("10");
  const [mediaPct, setMediaPct] = useState("8");
  const [contextSize, setContextSize] = useState("10");
  const [maxMessages, setMaxMessages] = useState("200");
  const [shouldLoop, setShouldLoop] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [autoResurrect, setAutoResurrect] = useState(true);
  const [priorityReplyStrangers, setPriorityReplyStrangers] = useState(false);
  const [bannedKeywordsText, setBannedKeywordsText] = useState("");
  const [newsEnabled, setNewsEnabled] = useState(false);
  const [newsIntervalMinutes, setNewsIntervalMinutes] = useState("120");
  const [newsTopicMaxMessages, setNewsTopicMaxMessages] = useState("50");
  const [newsRssUrl, setNewsRssUrl] = useState("");
  const [manualPersonasEnabled, setManualPersonasEnabled] = useState(false);
  const [manualPersonasMap, setManualPersonasMap] = useState<
    Record<string, { name: string; traits: string; samplePhrases: string }>
  >({});
  const [showByok, setShowByok] = useState(false);
  const [byokProvider, setByokProvider] = useState<Provider>("GROQ_BYOK");
  const [byokKey, setByokKey] = useState("");
  const [byokLabel, setByokLabel] = useState("");
  const [byokBaseUrl, setByokBaseUrl] = useState("");
  const [byokModel, setByokModel] = useState("");
  const [byokSaving, setByokSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [personaPreview, setPersonaPreview] = useState<PersonaPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/telegram/sessions").then((r) => r.json()),
      fetch("/api/telegram/scrape").then((r) => r.json()),
      fetch("/api/telegram/ai-chat").then((r) => r.json()),
      fetch("/api/user/api-keys").then((r) => r.json()),
    ]).then(([s, sj, aj, ak]) => {
      setSessions(s);
      const completed = sj.filter(
        (j: ScrapeJob) => j.status === "COMPLETED" && j.csvR2Key
      );
      setScrapeJobs(completed);
      setAIJobs(aj);
      setApiKeys(ak);

      const runningJob = aj.find((j: AIChatJob) => j.status === "RUNNING");
      if (runningJob) {
        setRunningJobId(runningJob.id);
        const socket = io({ path: "/api/socketio" });
        socketRef.current = socket;
        socket.on("aichat:log", (log: LogEntry) => {
          setLogs((prev) => [...prev, log]);
        });
      }

      const active = (s as TgSession[]).filter((sess) => sess.isActive);
      setSelectedSessions(active.map((sess) => sess.id));
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    setModel(PROVIDER_DEFAULT_MODEL[provider]);
  }, [provider]);

  function toggleSession(id: string) {
    setSelectedSessions((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  async function previewPersonas() {
    if (!scrapeJobId) return;
    setPreviewing(true);
    setPersonaPreview(null);
    setPreviewError("");
    try {
      const res = await fetch("/api/telegram/ai-chat/preview-personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scrapeJobId, provider, model }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error || t.failed);
      } else {
        setPersonaPreview(data);
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : t.error);
    } finally {
      setPreviewing(false);
    }
  }

  async function saveKey() {
    setByokSaving(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: byokProvider,
          apiKey: byokKey,
          label: byokLabel || undefined,
          model: byokModel || undefined,
          baseUrl: byokBaseUrl || undefined,
        }),
      });
      if (res.ok) {
        const k = await res.json();
        setApiKeys((prev) => {
          const filtered = prev.filter((p) => p.provider !== k.provider);
          return [k, ...filtered];
        });
        setByokKey("");
        setByokLabel("");
        setByokBaseUrl("");
        setByokModel("");
      } else {
        const data = await res.json();
        alert(data.error || t.failed);
      }
    } finally {
      setByokSaving(false);
    }
  }

  async function deleteKey(id: string) {
    const res = await fetch(`/api/user/api-keys?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    }
  }

  async function startJob() {
    if (
      !authSession?.user?.id ||
      selectedSessions.length === 0 ||
      !scrapeJobId ||
      !targetGroup
    )
      return;

    try {
      const res = await fetch("/api/telegram/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionIds: selectedSessions,
          scrapeJobId,
          targetGroup,
          provider,
          model,
          intervalMin: parseInt(intervalMin),
          intervalMax: parseInt(intervalMax),
          sendPct: parseInt(sendPct),
          replyPct: parseInt(replyPct),
          reactPct: parseInt(reactPct),
          mediaPct: parseInt(mediaPct),
          contextSize: parseInt(contextSize),
          maxMessages: parseInt(maxMessages),
          shouldLoop,
          dryRun,
          autoResurrect,
          priorityReplyStrangers,
          bannedKeywords: bannedKeywordsText
            .split(/[\n,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
          newsEnabled,
          newsIntervalMinutes: parseInt(newsIntervalMinutes) || 120,
          newsTopicMaxMessages: parseInt(newsTopicMaxMessages) || 50,
          newsRssUrl: newsRssUrl.trim() || undefined,
          manualPersonas: manualPersonasEnabled
            ? Object.fromEntries(
                Object.entries(manualPersonasMap)
                  .filter(([, v]) => v.name.trim())
                  .map(([id, v]) => [
                    id,
                    {
                      name: v.name.trim(),
                      traits: v.traits.trim(),
                      samplePhrases: v.samplePhrases
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  ])
              )
            : undefined,
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
        socket.emit("aichat:start", { jobId: job.id });
      });
      socket.on("aichat:log", (log: LogEntry) => {
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
    socketRef.current.emit("aichat:stop", { jobId: runningJobId });
    setRunningJobId(null);
    setTimeout(() => {
      socketRef.current?.disconnect();
      refreshJobs();
    }, 2000);
  }

  async function refreshJobs() {
    const res = await fetch("/api/telegram/ai-chat");
    if (res.ok) setAIJobs(await res.json());
  }

  async function deleteJob(jobId: string) {
    setDeletingJobId(jobId);
    try {
      const res = await fetch(`/api/telegram/ai-chat/${jobId}`, {
        method: "DELETE",
      });
      if (res.ok) setAIJobs((prev) => prev.filter((j) => j.id !== jobId));
    } finally {
      setDeletingJobId(null);
    }
  }

  async function clearAllJobs() {
    setClearingAll(true);
    try {
      const res = await fetch("/api/telegram/ai-chat", { method: "DELETE" });
      if (res.ok) {
        setAIJobs((prev) => prev.filter((j) => j.status === "RUNNING"));
      }
    } finally {
      setClearingAll(false);
    }
  }

  if (!mounted) return null;

  const activeSessionCount = sessions.filter((s) => s.isActive).length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">{t.pageTitle}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.configJob}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {t.sessions} ({selectedSessions.length}/{activeSessionCount} {t.selected})
              </Label>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setSelectedSessions(
                      sessions.filter((s) => s.isActive).map((s) => s.id)
                    )
                  }
                  className="text-xs text-blue-400 hover:underline"
                >
                  {t.selectAll}
                </button>
                <button
                  onClick={() => setSelectedSessions([])}
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

          <div className="space-y-2">
            <Label>{t.personaSource}</Label>
            <div className="flex gap-2">
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={scrapeJobId}
                onChange={(e) => setScrapeJobId(e.target.value)}
              >
                <option value="">{t.choosePersonaSource}</option>
                {scrapeJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.groupEntity} ({j.messageCount} {t.msgs})
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                disabled={!scrapeJobId || previewing}
                onClick={previewPersonas}
              >
                {previewing ? t.previewing : t.previewPersonas}
              </Button>
            </div>
            {previewError && (
              <div className="text-xs text-destructive">{previewError}</div>
            )}
            {personaPreview && (
              <div className="bg-card/50 border border-border/40 rounded-md p-3 space-y-2">
                <div className="text-xs">
                  <span className="text-muted-foreground">{t.detectedLanguage}: </span>
                  <Badge variant="secondary">{personaPreview.language}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.personasFound}:
                </div>
                <div className="space-y-2">
                  {personaPreview.personas.map((p, i) => (
                    <div key={i} className="text-xs">
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-muted-foreground">{p.traits}</div>
                      <div className="text-muted-foreground italic">
                        {p.samplePhrases.slice(0, 4).join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t.targetGroup}</Label>
            <Input
              placeholder={t.targetGroupPlaceholder}
              value={targetGroup}
              onChange={(e) => setTargetGroup(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t.provider}</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
              >
                <option value="GROQ_DEFAULT">{t.providerGroqDefault}</option>
                <option value="GROQ_BYOK">{t.providerGroqByok}</option>
                <option value="OPENAI_BYOK">{t.providerOpenAI}</option>
                <option value="ANTHROPIC_BYOK">{t.providerAnthropic}</option>
                <option value="OPENAI_COMPAT_BYOK">{t.providerOpenAICompat}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t.model}</Label>
              <Input
                placeholder={t.modelPlaceholder}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t.minSec}</Label>
              <Input
                value={intervalMin}
                onChange={(e) => setIntervalMin(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.maxSec}</Label>
              <Input
                value={intervalMax}
                onChange={(e) => setIntervalMax(e.target.value)}
              />
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
            <div className="space-y-1">
              <Label className="text-xs">{t.mediaPct}</Label>
              <Input value={mediaPct} onChange={(e) => setMediaPct(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t.contextSize}</Label>
              <Input
                value={contextSize}
                onChange={(e) => setContextSize(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.maxMessages}</Label>
              <Input
                value={maxMessages}
                onChange={(e) => setMaxMessages(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shouldLoop}
                onChange={(e) => setShouldLoop(e.target.checked)}
                className="rounded"
              />
              {t.shouldLoop}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded"
              />
              {t.dryRun}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoResurrect}
                  onChange={(e) => setAutoResurrect(e.target.checked)}
                  className="rounded"
                />
                {t.autoResurrect}
              </span>
              <span className="text-xs text-muted-foreground pl-6">
                {t.autoResurrectHelp}
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={priorityReplyStrangers}
                  onChange={(e) => setPriorityReplyStrangers(e.target.checked)}
                  className="rounded"
                />
                {t.priorityReplyStrangers}
              </span>
              <span className="text-xs text-muted-foreground pl-6">
                {t.priorityReplyStrangersHelp}
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-3">
              <span>{t.bannedKeywords}</span>
              <textarea
                value={bannedKeywordsText}
                onChange={(e) => setBannedKeywordsText(e.target.value)}
                placeholder={t.bannedKeywordsPlaceholder}
                rows={3}
                className="rounded border border-input bg-background px-2 py-1 text-sm font-mono"
              />
              <span className="text-xs text-muted-foreground">
                {t.bannedKeywordsHelp}
              </span>
            </label>
          </div>

          {/* News feature */}
          <div className="border border-border/40 rounded-md p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={newsEnabled}
                onChange={(e) => setNewsEnabled(e.target.checked)}
                className="rounded"
              />
              {lang === "zh" ? "📰 定时新闻触发话题" : "📰 Timed news topic injection"}
            </label>
            {newsEnabled && (
              <div className="space-y-2 pl-5">
                <p className="text-xs text-muted-foreground">
                  {lang === "zh"
                    ? "每隔指定分钟抓一批币圈新闻，让 AI 自然地在群里引出话题讨论。"
                    : "Periodically fetch crypto news and have the AI naturally bring up the hottest topic."}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      {lang === "zh" ? "刷新间隔（分钟）" : "Refresh interval (min)"}
                    </label>
                    <input
                      type="number"
                      min={5}
                      value={newsIntervalMinutes}
                      onChange={(e) => setNewsIntervalMinutes(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      {lang === "zh"
                        ? "话题最大消息数（用满后停用直到下次刷新）"
                        : "Max msgs per topic (paused until next refresh)"}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={newsTopicMaxMessages}
                      onChange={(e) => setNewsTopicMaxMessages(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs text-muted-foreground">
                      {lang === "zh" ? "RSS 地址（留空用默认）" : "RSS URL (blank = default)"}
                    </label>
                    <input
                      type="text"
                      placeholder="https://cn.cointelegraph.com/rss"
                      value={newsRssUrl}
                      onChange={(e) => setNewsRssUrl(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Manual persona per session */}
          <div className="border border-border/40 rounded-md p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={manualPersonasEnabled}
                onChange={(e) => setManualPersonasEnabled(e.target.checked)}
                className="rounded"
              />
              {lang === "zh" ? "🎭 手动配置每个账号的人格" : "🎭 Manual persona per account"}
            </label>
            {manualPersonasEnabled && (
              <div className="space-y-3 pl-5">
                <p className="text-xs text-muted-foreground">
                  {lang === "zh"
                    ? "为每个账号单独写人格，未填写的账号仍从 CSV 自动分析。"
                    : "Define persona per account. Accounts without a manual persona fall back to CSV analysis."}
                </p>
                {sessions
                  .filter((s) => s.isActive && selectedSessions.includes(s.id))
                  .map((s) => {
                    const p = manualPersonasMap[s.id] ?? { name: "", traits: "", samplePhrases: "" };
                    const set = (patch: Partial<typeof p>) =>
                      setManualPersonasMap((prev) => ({ ...prev, [s.id]: { ...p, ...patch } }));
                    return (
                      <div key={s.id} className="border border-border/30 rounded-md p-3 space-y-2">
                        <div className="text-xs font-semibold text-primary">{s.label}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">
                              {lang === "zh" ? "人格名称" : "Persona name"}
                            </label>
                            <input
                              type="text"
                              placeholder={lang === "zh" ? "如：激进多头" : "e.g. Aggressive Bull"}
                              value={p.name}
                              onChange={(e) => set({ name: e.target.value })}
                              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">
                              {lang === "zh" ? "风格特征" : "Style traits"}
                            </label>
                            <input
                              type="text"
                              placeholder={lang === "zh" ? "说话直接、爱用感叹号…" : "Direct, uses exclamation marks…"}
                              value={p.traits}
                              onChange={(e) => set({ traits: e.target.value })}
                              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">
                            {lang === "zh" ? "示例短语（每行一条）" : "Sample phrases (one per line)"}
                          </label>
                          <textarea
                            rows={3}
                            placeholder={lang === "zh" ? "冲！\n稳了稳了\n这波必涨" : "LFG!\nGMI\nThis is the bottom"}
                            value={p.samplePhrases}
                            onChange={(e) => set({ samplePhrases: e.target.value })}
                            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            {!runningJobId ? (
              <Button
                onClick={startJob}
                disabled={
                  selectedSessions.length === 0 ||
                  !scrapeJobId ||
                  !targetGroup ||
                  !model
                }
              >
                {t.startAIChat}
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopJob}>
                {t.stop}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* BYOK Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{t.apiKeysTitle}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowByok((v) => !v)}
            >
              {showByok ? "−" : "+"}
            </Button>
          </CardTitle>
        </CardHeader>
        {showByok && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t.apiKeysDesc}</p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t.provider}</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    value={byokProvider}
                    onChange={(e) => setByokProvider(e.target.value as Provider)}
                  >
                    <option value="GROQ_BYOK">{t.providerGroqByok}</option>
                    <option value="OPENAI_BYOK">{t.providerOpenAI}</option>
                    <option value="ANTHROPIC_BYOK">{t.providerAnthropic}</option>
                    <option value="OPENAI_COMPAT_BYOK">{t.providerOpenAICompat}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t.apiKeyLabel}</Label>
                  <Input
                    value={byokLabel}
                    onChange={(e) => setByokLabel(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t.apiKeyValue}</Label>
                <Input
                  type="password"
                  value={byokKey}
                  placeholder={t.apiKeyValuePlaceholder}
                  onChange={(e) => setByokKey(e.target.value)}
                />
              </div>

              {byokProvider === "OPENAI_COMPAT_BYOK" && (
                <div className="space-y-1">
                  <Label className="text-xs">{t.baseUrlLabel}</Label>
                  <Input
                    placeholder={t.baseUrlPlaceholder}
                    value={byokBaseUrl}
                    onChange={(e) => setByokBaseUrl(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">{t.keyDefaultModel}</Label>
                <Input
                  placeholder={PROVIDER_DEFAULT_MODEL[byokProvider]}
                  value={byokModel}
                  onChange={(e) => setByokModel(e.target.value)}
                />
              </div>

              <Button
                onClick={saveKey}
                disabled={byokSaving || byokKey.length < 8}
                size="sm"
              >
                {byokSaving ? "..." : t.saveKey}
              </Button>
            </div>

            <div className="space-y-2">
              {apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.noKeysSaved}</p>
              ) : (
                apiKeys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between bg-card/50 border border-border/40 rounded-md p-3"
                  >
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{k.provider}</Badge>
                        {k.label && (
                          <span className="text-muted-foreground">{k.label}</span>
                        )}
                      </div>
                      <div className="text-muted-foreground font-mono">
                        {t.keyMaskedLabel}: {k.keyMasked}
                        {k.model ? ` · model: ${k.model}` : ""}
                        {k.baseUrl ? ` · ${k.baseUrl}` : ""}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteKey(k.id)}
                    >
                      {t.deleteKey}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        )}
      </Card>

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

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t.jobHistory}</h2>
          {aiJobs.length > 0 && (
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
        {aiJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noJobsYet}</p>
        ) : (
          <div className="space-y-2">
            {aiJobs.map((job) => (
              <Card key={job.id} className="bg-card/50">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 flex-wrap">
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
                    <span className="text-xs text-muted-foreground">
                      {job.tokensIn + job.tokensOut} {t.tokens}
                    </span>
                    {job.detectedLanguage && (
                      <Badge variant="outline" className="text-xs">
                        {job.detectedLanguage}
                      </Badge>
                    )}
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
