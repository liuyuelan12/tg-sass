import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { isAIChatJobActive, runAIChatJob } from "@/lib/ai-chat/start";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const job = await prisma.aIChatJob.findFirst({
    where: { id, userId: guard.user.id },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status === "RUNNING" || isAIChatJobActive(id)) {
    return NextResponse.json(
      { error: "Job is already running", jobId: id, status: "RUNNING" },
      { status: 409 }
    );
  }
  if (job.status !== "PENDING" && job.status !== "STOPPED" && job.status !== "FAILED" && job.status !== "COMPLETED") {
    return NextResponse.json(
      { error: `Cannot start job in status ${job.status}` },
      { status: 400 }
    );
  }

  // Fire-and-forget. Log to server stdout; UI / CLI can poll status separately.
  runAIChatJob({ jobId: id, userId: guard.user.id }).catch((err) => {
    console.error(`[ai-chat /start fire-and-forget] ${id}:`, err);
  });

  return NextResponse.json({ jobId: id, status: "RUNNING" });
}
