import type { Persona } from "@/lib/ai/personas";
import type { PersonaAnalysis } from "@/lib/ai/personas";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import {
  AIChatRunner,
  type AIChatJobConfig,
  type AIChatLog,
} from "@/lib/telegram/ai-chat";

const activeAIChatJobs = new Map<string, AIChatRunner>();

export function getActiveAIChatJob(jobId: string): AIChatRunner | undefined {
  return activeAIChatJobs.get(jobId);
}

export function isAIChatJobActive(jobId: string): boolean {
  return activeAIChatJobs.has(jobId);
}

// Snapshot of every runner currently attached in-process. Consumers must not
// mutate the returned array; the runners themselves are owned by this module.
export function listActiveAIChatJobs(): Array<{
  jobId: string;
  runner: AIChatRunner;
  sentCount: number;
  startedAt: number;
}> {
  const out: Array<{
    jobId: string;
    runner: AIChatRunner;
    sentCount: number;
    startedAt: number;
  }> = [];
  for (const [jobId, runner] of activeAIChatJobs.entries()) {
    out.push({
      jobId,
      runner,
      sentCount: runner.getSentCount(),
      startedAt: runner.getStartedAt(),
    });
  }
  return out;
}

/**
 * Force-detach a runner from the active map without waiting for its start()
 * promise to unwind. Used by the heartbeat watchdog when start() is wedged and
 * finally-cleanup can never run. Callers are responsible for flipping the DB
 * status separately.
 */
export function forceEvictAIChatJob(jobId: string): void {
  const runner = activeAIChatJobs.get(jobId);
  if (!runner) return;
  activeAIChatJobs.delete(jobId);
  try {
    runner.stop();
  } catch {
    // ignore
  }
  runner.disconnect().catch(() => {
    // ignore — best effort
  });
}

interface RunOpts {
  jobId: string;
  userId: string;
  onLog?: (log: AIChatLog) => void;
}

export type RunAIChatResult =
  | { ok: true; finalStatus: "COMPLETED" | "STOPPED" }
  | { ok: false; reason: string };

/**
 * Loads an AIChatJob (PENDING) belonging to `userId`, resolves LLM creds and
 * sessions, instantiates an AIChatRunner, marks RUNNING → COMPLETED/FAILED.
 *
 * Both the Socket.IO `aichat:start` handler and the new HTTP `/start` route
 * call into this. With `onLog`, every runner log is forwarded (socket case).
 * Without it, logs go to stdout for server logs only (HTTP fire-and-forget).
 */
export async function runAIChatJob(opts: RunOpts): Promise<RunAIChatResult> {
  const { jobId, userId } = opts;
  const onLog =
    opts.onLog ??
    ((log: AIChatLog) =>
      console.log(`[ai-chat ${jobId}] [${log.type}] ${log.message}`));

  const job = await prisma.aIChatJob.findFirst({ where: { id: jobId, userId } });
  if (!job) {
    onLog({ type: "error", message: "Job not found or access denied", timestamp: Date.now() });
    return { ok: false, reason: "not-found" };
  }

  if (activeAIChatJobs.has(jobId)) {
    onLog({ type: "warn", message: "Job is already running", timestamp: Date.now() });
    return { ok: false, reason: "already-running" };
  }

  const tgSessions = await prisma.tgSession.findMany({
    where: { id: { in: job.sessionIds }, userId },
  });
  if (tgSessions.length === 0) {
    onLog({ type: "error", message: "No valid sessions found", timestamp: Date.now() });
    return { ok: false, reason: "no-sessions" };
  }

  // Resolve LLM credentials server-side
  let apiKey: string;
  let baseUrl: string | undefined;
  if (job.provider === "GROQ_DEFAULT") {
    apiKey = process.env.GROQ_API_KEY ?? "";
    if (!apiKey) {
      onLog({ type: "error", message: "Server GROQ_API_KEY not configured", timestamp: Date.now() });
      return { ok: false, reason: "no-groq-key" };
    }
  } else {
    const key = job.apiKeyId
      ? await prisma.userApiKey.findFirst({ where: { id: job.apiKeyId, userId } })
      : await prisma.userApiKey.findFirst({ where: { userId, provider: job.provider } });
    if (!key) {
      onLog({
        type: "error",
        message: `No saved API key for provider ${job.provider}`,
        timestamp: Date.now(),
      });
      return { ok: false, reason: "no-byok-key" };
    }
    try {
      apiKey = decrypt(key.encryptedKey);
    } catch {
      onLog({ type: "error", message: "Failed to decrypt saved API key", timestamp: Date.now() });
      return { ok: false, reason: "decrypt-failed" };
    }
    baseUrl = key.baseUrl ?? undefined;
  }

  // Source CSV is optional — only required if no full manual-persona coverage.
  let csvR2Key: string | null = null;
  if (job.scrapeJobId) {
    const scrapeJob = await prisma.scrapeJob.findFirst({
      where: { id: job.scrapeJobId, userId },
    });
    if (scrapeJob?.csvR2Key) csvR2Key = scrapeJob.csvR2Key;
  }
  const manualPersonas =
    (job.manualPersonasJson as unknown as Record<string, Persona>) ?? undefined;
  const manualCount = manualPersonas ? Object.keys(manualPersonas).length : 0;
  if (!csvR2Key && manualCount < tgSessions.length) {
    onLog({
      type: "error",
      message: `No source CSV and only ${manualCount}/${tgSessions.length} sessions have manual personas — cannot start`,
      timestamp: Date.now(),
    });
    return { ok: false, reason: "no-personas" };
  }

  const cachedPersonas =
    job.personasJson && typeof job.personasJson === "object"
      ? (job.personasJson as unknown as PersonaAnalysis)
      : null;
  const cachedSessionPersonaMap =
    job.sessionPersonaMap && typeof job.sessionPersonaMap === "object"
      ? (job.sessionPersonaMap as Record<string, number>)
      : null;

  const config: AIChatJobConfig = {
    jobId: job.id,
    encryptedSessions: tgSessions.map((s) => ({ id: s.id, sessionString: s.sessionString })),
    groupEntity: job.groupEntity,
    topicId: job.topicId,
    csvR2Key,
    llm: { provider: job.provider, apiKey, baseUrl, model: job.model },
    intervalMin: job.intervalMin,
    intervalMax: job.intervalMax,
    sendPct: job.sendPct,
    replyPct: job.replyPct,
    reactPct: job.reactPct,
    mediaPct: job.mediaPct,
    contextSize: job.contextSize,
    maxMessages: job.maxMessages,
    shouldLoop: job.shouldLoop,
    dryRun: job.dryRun,
    priorityReplyStrangers: job.priorityReplyStrangers,
    bannedKeywords: job.bannedKeywords,
    newsEnabled: job.newsEnabled,
    newsIntervalMinutes: job.newsIntervalMinutes,
    newsRssUrl: job.newsRssUrl ?? undefined,
    newsTopicMaxMessages: job.newsTopicMaxMessages,
    manualPersonas,
    cachedPersonas,
    cachedSessionPersonaMap,
  };

  const runner = new AIChatRunner(config, onLog);
  activeAIChatJobs.set(jobId, runner);

  try {
    // updateMany: if the row was deleted concurrently (e.g. user removed job
    // from web UI while runner was starting), Prisma returns count:0 instead
    // of throwing P2025. All five sites here are fire-and-forget status writes
    // — losing them on a deleted row is fine; crashing the whole node process
    // is not.
    await prisma.aIChatJob.updateMany({
      where: { id: jobId },
      data: { status: "RUNNING", error: null },
    });

    const result = await runner.start();

    const finalRow = await prisma.aIChatJob.findUnique({ where: { id: jobId } });
    const wasStopped = finalRow?.status === "STOPPED";
    if (!wasStopped) {
      await prisma.aIChatJob.updateMany({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          sentCount: result.sentCount,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        },
      });
    } else {
      await prisma.aIChatJob.updateMany({
        where: { id: jobId },
        data: {
          sentCount: result.sentCount,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        },
      });
    }
    return { ok: true, finalStatus: wasStopped ? "STOPPED" : "COMPLETED" };
  } catch (err) {
    // Belt-and-suspenders: updateMany already won't throw on missing row, but
    // wrap in try/catch so any *other* DB failure (connection lost, etc.) in
    // the error path can't itself become an unhandledRejection and crash the
    // whole process — this is exactly the failure mode that took the service
    // down on 2026-08-26.
    try {
      await prisma.aIChatJob.updateMany({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    } catch (dbErr) {
      console.error(`[runAIChatJob ${jobId}] failed to write FAILED status:`, dbErr);
    }
    onLog({
      type: "error",
      message: `Job failed: ${err instanceof Error ? err.message : String(err)}`,
      timestamp: Date.now(),
    });
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    await runner.disconnect();
    activeAIChatJobs.delete(jobId);
  }
}

/**
 * Marks an AIChatJob as STOPPED and signals its in-process runner to abort.
 * Safe to call even when the runner isn't local (multi-instance deploys) —
 * the DB state change will propagate; the runner just won't be aborted in-memory.
 */
export async function stopAIChatJob(opts: {
  jobId: string;
  userId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { jobId, userId } = opts;
  const job = await prisma.aIChatJob.findFirst({ where: { id: jobId, userId } });
  if (!job) return { ok: false, reason: "not-found" };

  const runner = activeAIChatJobs.get(jobId);
  if (runner) runner.stop();
  await prisma.aIChatJob.updateMany({
    where: { id: jobId },
    data: { status: "STOPPED" },
  });
  return { ok: true };
}
