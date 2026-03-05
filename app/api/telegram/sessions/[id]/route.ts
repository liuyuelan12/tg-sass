import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";

export async function DELETE(
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

  await prisma.tgSession.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
