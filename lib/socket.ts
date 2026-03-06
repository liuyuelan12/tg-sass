import { Server as SocketIOServer, Socket } from "socket.io";
import { getToken } from "next-auth/jwt";
import { generateSession } from "./telegram/session-gen";
import { encrypt } from "./crypto";
import { prisma } from "./db";
import { AutoChatRunner, type ChatJobConfig } from "./telegram/auto-chat";
import { ScrapeRunner } from "./telegram/scraper";

// In-memory store of active jobs
const activeChatJobs = new Map<string, AutoChatRunner>();
const activeScrapeJobs = new Map<string, ScrapeRunner>();

export function getActiveChatJob(jobId: string): AutoChatRunner | undefined {
  return activeChatJobs.get(jobId);
}

export function getActiveScrapeJob(jobId: string): ScrapeRunner | undefined {
  return activeScrapeJobs.get(jobId);
}

export function registerSocketHandlers(io: SocketIOServer) {
  // Authenticate socket connections via JWT
  io.use(async (socket, next) => {
    try {
      const cookies = socket.handshake.headers.cookie || "";
      // Parse session token from cookies
      const tokenCookie = cookies
        .split(";")
        .map((c) => c.trim())
        .find(
          (c) =>
            c.startsWith("authjs.session-token=") ||
            c.startsWith("__Secure-authjs.session-token=")
        );

      if (!tokenCookie) {
        return next(new Error("Authentication required"));
      }

      const tokenValue = tokenCookie.split("=").slice(1).join("=");

      const token = await getToken({
        req: {
          cookies: {
            "authjs.session-token": tokenValue,
            "__Secure-authjs.session-token": tokenValue,
          },
          headers: socket.handshake.headers,
        } as Parameters<typeof getToken>[0]["req"],
        secret: process.env.AUTH_SECRET,
        secureCookie: process.env.NODE_ENV === "production",
      });

      if (!token?.id) {
        return next(new Error("Invalid token"));
      }

      // Attach verified userId to socket
      (socket as Socket & { userId: string }).userId = token.id as string;
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = (socket as Socket & { userId: string }).userId;
    console.log(`Socket connected: ${socket.id} (user: ${userId})`);

    // --- Session Generation ---
    socket.on("session:start", async () => {
      let resolveInput: ((value: string) => void) | null = null;

      const waitForInput = (): Promise<string> => {
        return new Promise((resolve) => {
          resolveInput = resolve;
        });
      };

      socket.on("session:input", (input: string) => {
        if (resolveInput) {
          resolveInput(input);
          resolveInput = null;
        }
      });

      try {
        const result = await generateSession({
          emit: (event) => socket.emit("session:event", event),
          waitForInput,
        });

        const encryptedSession = encrypt(result.session);
        const label = `${result.name}${result.username ? ` @${result.username}` : ""}`;

        // Use server-verified userId, not client-sent
        await prisma.tgSession.create({
          data: {
            userId,
            label,
            sessionString: encryptedSession,
          },
        });

        socket.emit("session:saved", { label });
      } catch (err) {
        socket.emit("session:event", {
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // --- Scrape ---
    socket.on("scrape:start", async (data: { jobId: string; sessionId: string }) => {
      const { jobId, sessionId } = data;

      const job = await prisma.scrapeJob.findFirst({
        where: { id: jobId, userId },
      });
      if (!job) {
        socket.emit("scrape:error", { jobId, error: "Job not found" });
        return;
      }

      if (activeScrapeJobs.has(jobId)) {
        socket.emit("scrape:error", { jobId, error: "Already running" });
        return;
      }

      const tgSession = await prisma.tgSession.findFirst({
        where: { id: sessionId, userId },
      });
      if (!tgSession) {
        socket.emit("scrape:error", { jobId, error: "Session not found" });
        return;
      }

      await prisma.scrapeJob.update({
        where: { id: jobId },
        data: { status: "RUNNING" },
      });

      const runner = new ScrapeRunner((progress) => {
        socket.emit("scrape:progress", { jobId, ...progress });
      });
      activeScrapeJobs.set(jobId, runner);

      try {
        const result = await runner.run(
          tgSession.sessionString,
          job.groupEntity,
          job.topicId,
          job.progress > 0 ? job.progress : 100,
          userId,
          jobId
        );

        await prisma.scrapeJob.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            csvR2Key: result.csvKey,
            mediaR2Prefix: result.mediaPrefix,
            messageCount: result.totalMessages,
          },
        });

        socket.emit("scrape:done", { jobId, totalMessages: result.totalMessages });
      } catch (err) {
        await prisma.scrapeJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
          },
        });
        socket.emit("scrape:error", {
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        activeScrapeJobs.delete(jobId);
      }
    });

    socket.on("scrape:stop", async (data: { jobId: string }) => {
      const job = await prisma.scrapeJob.findFirst({
        where: { id: data.jobId, userId },
      });
      if (!job) return;

      const runner = activeScrapeJobs.get(data.jobId);
      if (runner) {
        runner.stop();
        await prisma.scrapeJob.update({
          where: { id: data.jobId },
          data: { status: "STOPPED" },
        });
      }
    });

    // --- Auto-Chat ---
    socket.on("autochat:start", async (data: { jobId: string }) => {
      const { jobId } = data;

      // Server-side: verify job belongs to this user and load config from DB
      const job = await prisma.chatJob.findFirst({
        where: { id: jobId, userId },
      });

      if (!job) {
        socket.emit("autochat:log", {
          type: "error",
          message: "Job not found or access denied",
          timestamp: Date.now(),
        });
        return;
      }

      if (activeChatJobs.has(jobId)) {
        socket.emit("autochat:log", {
          type: "warn",
          message: "Job is already running",
          timestamp: Date.now(),
        });
        return;
      }

      // Load encrypted sessions from DB (not from client)
      const tgSessions = await prisma.tgSession.findMany({
        where: { id: { in: job.sessionIds }, userId },
      });

      if (tgSessions.length === 0) {
        socket.emit("autochat:log", {
          type: "error",
          message: "No valid sessions found",
          timestamp: Date.now(),
        });
        return;
      }

      const config: ChatJobConfig = {
        encryptedSessions: tgSessions.map((s) => s.sessionString),
        groupEntity: job.groupEntity,
        csvR2Key: job.csvR2Key || "",
        mediaR2Prefix: job.mediaR2Prefix || "",
        intervalMin: job.intervalMin,
        intervalMax: job.intervalMax,
        sendPct: job.sendPct,
        replyPct: job.replyPct,
        reactPct: job.reactPct,
        shouldLoop: job.shouldLoop,
      };

      const runner = new AutoChatRunner(config, (log) => {
        socket.emit("autochat:log", log);
      });
      activeChatJobs.set(jobId, runner);

      try {
        await prisma.chatJob.update({
          where: { id: jobId },
          data: { status: "RUNNING" },
        });

        const sentCount = await runner.start();

        await prisma.chatJob.update({
          where: { id: jobId },
          data: { status: "COMPLETED", sentCount },
        });
      } catch (err) {
        await prisma.chatJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
          },
        });
        socket.emit("autochat:log", {
          type: "error",
          message: `Job failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        });
      } finally {
        await runner.disconnect();
        activeChatJobs.delete(jobId);
      }
    });

    socket.on("autochat:stop", async (data: { jobId: string }) => {
      // Verify ownership before stopping
      const job = await prisma.chatJob.findFirst({
        where: { id: data.jobId, userId },
      });
      if (!job) return;

      const runner = activeChatJobs.get(data.jobId);
      if (runner) {
        runner.stop();
        await prisma.chatJob.update({
          where: { id: data.jobId },
          data: { status: "STOPPED" },
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}
