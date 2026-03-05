import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";

export async function DELETE() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const result = await prisma.tgSession.deleteMany({
    where: {
      userId: guard.user.id,
      isActive: false,
    },
  });

  return NextResponse.json({ deleted: result.count });
}
