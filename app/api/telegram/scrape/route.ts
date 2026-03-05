import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { parseGroupInput } from "@/lib/telegram/scraper";

export async function GET() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const jobs = await prisma.scrapeJob.findMany({
    where: { userId: guard.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const { sessionId, groupLink, count } = await req.json();

  if (!sessionId || !groupLink) {
    return NextResponse.json(
      { error: "sessionId and groupLink required" },
      { status: 400 }
    );
  }

  const tgSession = await prisma.tgSession.findFirst({
    where: { id: sessionId, userId: guard.user.id },
  });
  if (!tgSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { entity, topicId } = parseGroupInput(groupLink);

  const job = await prisma.scrapeJob.create({
    data: {
      userId: guard.user.id,
      groupEntity: entity,
      topicId,
      status: "PENDING",
      progress: count || 100,
    },
  });

  // Job will be started via Socket.IO scrape:start event from the frontend
  return NextResponse.json({ id: job.id, status: "PENDING" });
}
