import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { registerSocketHandlers } from "./lib/socket";
import { PrismaClient } from "@prisma/client";

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
    if (staleChats.count > 0 || staleScrapes.count > 0) {
      console.log(
        `Cleaned up orphaned jobs: ${staleChats.count} chat, ${staleScrapes.count} scrape`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
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

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
