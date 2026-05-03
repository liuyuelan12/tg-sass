import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireActiveUser();
    if (!guard.ok) return guard.response;

    const { id } = await params;

    const job = await prisma.aIChatJob.findFirst({
      where: { id, userId: guard.user.id },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status === "RUNNING") {
      return NextResponse.json(
        { error: "Cannot delete a running job. Stop it first." },
        { status: 400 }
      );
    }

    await prisma.aIChatJob.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ai-chat DELETE] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 }
    );
  }
}
