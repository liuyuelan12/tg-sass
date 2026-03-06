import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { parseGroupInput } from "@/lib/telegram/scraper";

export async function GET() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const jobs = await prisma.chatJob.findMany({
    where: { userId: guard.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(jobs);
}

export async function DELETE() {
  try {
    const guard = await requireActiveUser();
    if (!guard.ok) return guard.response;

    // Delete all non-running jobs for this user
    const deleted = await prisma.chatJob.deleteMany({
      where: {
        userId: guard.user.id,
        status: { not: "RUNNING" },
      },
    });

    return NextResponse.json({ deleted: deleted.count });
  } catch (err) {
    console.error("[auto-chat DELETE all] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const {
    sessionIds,
    dataSourceJobId,
    targetGroup,
    intervalMin = 3,
    intervalMax = 5,
    sendPct = 70,
    replyPct = 20,
    reactPct = 10,
    shouldLoop = true,
  } = body;

  if (!sessionIds?.length || !dataSourceJobId || !targetGroup) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Verify sessions belong to user
  const tgSessions = await prisma.tgSession.findMany({
    where: { id: { in: sessionIds }, userId: guard.user.id },
  });

  if (tgSessions.length === 0) {
    return NextResponse.json({ error: "No valid sessions" }, { status: 400 });
  }

  // Get data source
  const dataSource = await prisma.scrapeJob.findFirst({
    where: { id: dataSourceJobId, userId: guard.user.id },
  });

  if (!dataSource?.csvR2Key) {
    return NextResponse.json(
      { error: "Data source not found" },
      { status: 404 }
    );
  }

  const { entity, topicId } = parseGroupInput(targetGroup);

  const job = await prisma.chatJob.create({
    data: {
      userId: guard.user.id,
      groupEntity: entity,
      topicId,
      csvR2Key: dataSource.csvR2Key,
      mediaR2Prefix: dataSource.mediaR2Prefix,
      sessionIds: tgSessions.map((s) => s.id),
      intervalMin,
      intervalMax,
      sendPct,
      replyPct,
      reactPct,
      shouldLoop,
      status: "PENDING",
    },
  });

  // Only return job ID — config is loaded server-side in socket handler
  return NextResponse.json({ id: job.id, status: "PENDING" });
}
