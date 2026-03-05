import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { deleteR2Prefix } from "@/lib/r2";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const job = await prisma.scrapeJob.findFirst({
    where: { id, userId: guard.user.id },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Clean up R2 files
  const r2Prefix = `users/${guard.user.id}/scrapes/${id}`;
  try {
    await deleteR2Prefix(r2Prefix);
  } catch {
    // continue even if R2 cleanup fails
  }

  await prisma.scrapeJob.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
