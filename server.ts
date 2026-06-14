import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { registerSocketHandlers } from "./lib/socket";
import { PrismaClient } from "@prisma/client";
import { runAIChatJob, isAIChatJobActive } from "./lib/ai-chat/start";

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
          status: { in: ["PENDING", "COMPLETED", "FAILED"] },
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

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
