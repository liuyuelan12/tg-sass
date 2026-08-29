import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { registerSocketHandlers } from "./lib/socket";
import { PrismaClient } from "@prisma/client";
import {
  runAIChatJob,
  isAIChatJobActive,
  listActiveAIChatJobs,
  forceEvictAIChatJob,
} from "./lib/ai-chat/start";

// Last line of defense: keep the process alive when *any* stray promise
// rejects or callback throws. Individual handlers should still catch their own
// errors (see lib/socket.ts, lib/ai-chat/start.ts); this catches the ones we
// missed. Killed the service on 2026-08-26 when an async socket handler let
// a Prisma P2025 escape — Railway restarts on exit but 8 groups all go dark
// for minutes until rollover finishes.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// On startup, reset orphaned RUNNING jobs from previous crash
async function cleanupOrphanedJobs() {
  const prisma = new PrismaClient();
  try {
    const staleChats = await prisma.chatJob.updateMany({
      where: { status: "RUNNING" },
      data: { status: "FAILED", error: "Server restarted — job interrupted" },
    });
    const staleScrapes = await prisma.scrapeJob.updateMany({
      where: { status: "RUNNING" },
      data: { status: "FAILED", error: "Server restarted — job interrupted" },
    });
    const staleAIChats = await prisma.aIChatJob.updateMany({
      where: { status: "RUNNING" },
      data: { status: "FAILED", error: "Server restarted — job interrupted" },
    });
    if (staleChats.count > 0 || staleScrapes.count > 0 || staleAIChats.count > 0) {
      console.log(
        `Cleaned up orphaned jobs: ${staleChats.count} chat, ${staleScrapes.count} scrape, ${staleAIChats.count} ai-chat`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Periodically resurrect AIChatJob rows marked autoResurrect=true that aren't
// currently running. Picks up jobs after server restart, runner crash, or any
// graceful completion (maxMessages-without-loop, all sessions banned, etc).
function startAIChatResurrector() {
  const TICK_MS = 60_000;
  const COOLDOWN_MS = 30_000;
  const prisma = new PrismaClient();
  const tick = async () => {
    try {
      const candidates = await prisma.aIChatJob.findMany({
        where: {
          autoResurrect: true,
          // Include RUNNING so we catch zombies: DB says RUNNING but in-memory
          // registry doesn't have it (crash + cleanup failed). isAIChatJobActive()
          // below is the authoritative aliveness check — real live RUNNING is skipped.
          status: { in: ["PENDING", "COMPLETED", "FAILED", "RUNNING"] },
        },
        select: { id: true, userId: true, lastResurrectAt: true },
      });
      const now = Date.now();
      for (const job of candidates) {
        if (isAIChatJobActive(job.id)) continue;
        if (
          job.lastResurrectAt &&
          now - job.lastResurrectAt.getTime() < COOLDOWN_MS
        ) {
          continue;
        }
        await prisma.aIChatJob.update({
          where: { id: job.id },
          data: { lastResurrectAt: new Date() },
        });
        console.log(`[auto-resurrect] starting ai-chat job ${job.id}`);
        runAIChatJob({ jobId: job.id, userId: job.userId }).catch((err) => {
          console.error(`[auto-resurrect ${job.id}]`, err);
        });
      }
    } catch (err) {
      console.error("[auto-resurrect] tick failed:", err);
    }
  };
  setInterval(tick, TICK_MS);
  // Don't fire the first tick immediately — give cleanupOrphanedJobs a head start
  // so we don't race against it on startup.
}

// Heartbeat watchdog: a runner whose sentCount has not advanced for
// STALE_MS is presumed wedged (LLM/gramJS deadlock, event-loop stuck).
// Force-evict it from the active map and flip its DB status so the
// resurrector picks up a clean instance on the next tick.
function startAIChatHeartbeat() {
  const TICK_MS = 5 * 60_000;
  // 2h stale window instead of 30 min. sentCount only advances between
  // sleeps, and users legitimately set intervalMax up to 90 min — so a
  // healthy runner's gap between sends already reaches ~90 min. STALE_MS
  // used to be 30 min and evicted these healthy runners every second turn
  // (2026-08-29 CN incident, memory `heartbeat_evict_revokes_sessions`),
  // and each evict → resurrect race revoked sessions via
  // AUTH_KEY_DUPLICATED. 120 min = intervalMax cap + 30 min slack. If you
  // ever push intervalMax higher, raise this in lockstep.
  const STALE_MS = 120 * 60_000;
  const GRACE_MS = 10 * 60_000;
  // Runners that have never posted get the same 120 min window as a stalled
  // one (was a separate FIRST_SEND_GRACE_MS constant before STALE_MS caught
  // up). The isResurrect first-tick sleep can legitimately pin sentCount at
  // 0 for the whole intervalMax.
  const FIRST_SEND_GRACE_MS = STALE_MS;
  const prisma = new PrismaClient();
  const lastSeen = new Map<string, { sent: number; at: number }>();
  const tick = async () => {
    try {
      const now = Date.now();
      const active = listActiveAIChatJobs();
      const activeIds = new Set(active.map((a) => a.jobId));
      // Clean up bookkeeping for runners no longer active.
      for (const id of lastSeen.keys()) {
        if (!activeIds.has(id)) lastSeen.delete(id);
      }
      for (const a of active) {
        const prev = lastSeen.get(a.jobId);
        if (!prev || prev.sent !== a.sentCount) {
          lastSeen.set(a.jobId, { sent: a.sentCount, at: now });
          continue;
        }
        const stalledMs = now - prev.at;
        const runningMs = now - a.startedAt;
        // Give freshly-started runners a grace window before any judgement —
        // connect + persona-analysis can legitimately eat minutes with no sends.
        if (runningMs < GRACE_MS) continue;
        // A runner that has never advanced past its debut send is almost
        // certainly still inside the first-tick sleep or waiting on a slow
        // startup step (persona analysis, group join). Keep it around until
        // the extended grace, otherwise a resurrect+heartbeat crash-loop
        // manufactures the exact "sessions posting too fast" symptom users
        // reported. Only sent-then-stuck runners fall through to STALE_MS.
        if (a.sentCount === 0 && runningMs < FIRST_SEND_GRACE_MS) continue;
        if (stalledMs < STALE_MS) continue;
        console.log(
          `[heartbeat] evicting wedged ai-chat job ${a.jobId} (sent=${a.sentCount}, stalled=${Math.round(stalledMs / 60_000)}m)`
        );
        // Await the disconnect: without it the resurrector 60s later boots
        // a fresh runner whose sessions collide with this runner's still-open
        // gramJS clients → AUTH_KEY_DUPLICATED → Telegram permanently revokes
        // the session (memory `heartbeat_evict_revokes_sessions`).
        await forceEvictAIChatJob(a.jobId);
        lastSeen.delete(a.jobId);
        try {
          await prisma.aIChatJob.update({
            where: { id: a.jobId },
            data: {
              status: "FAILED",
              error: `Heartbeat evicted (no sends for ${Math.round(stalledMs / 60_000)}m)`,
              lastResurrectAt: null,
            },
          });
        } catch (err) {
          console.error(`[heartbeat] db flip failed for ${a.jobId}:`, err);
        }
      }
    } catch (err) {
      console.error("[heartbeat] tick failed:", err);
    }
  };
  setInterval(tick, TICK_MS);
}

app.prepare().then(async () => {
  await cleanupOrphanedJobs();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    path: "/api/socketio",
    addTrailingSlash: false,
    cors: { origin: "*" },
  });

  registerSocketHandlers(io);

  startAIChatResurrector();
  startAIChatHeartbeat();

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
