import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/guard";
import { stopAIChatJob } from "@/lib/ai-chat/start";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const result = await stopAIChatJob({ jobId: id, userId: guard.user.id });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason ?? "Stop failed" },
      { status: result.reason === "not-found" ? 404 : 500 }
    );
  }
  return NextResponse.json({ jobId: id, status: "STOPPED" });
}
