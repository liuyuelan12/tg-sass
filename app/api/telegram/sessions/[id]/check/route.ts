import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { checkSessionAndUpdate } from "@/lib/telegram/session-status";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const tgSession = await prisma.tgSession.findFirst({
    where: { id, userId: guard.user.id },
  });

  if (!tgSession) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await checkSessionAndUpdate(tgSession);
  return NextResponse.json({
    active: result.active,
    label: result.label,
    status: result.status,
    reason: result.reason,
    error: result.active ? undefined : result.reason,
  });
}
