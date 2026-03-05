import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";

export async function GET() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const tgSessions = await prisma.tgSession.findMany({
    where: { userId: guard.user.id },
    select: {
      id: true,
      label: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tgSessions);
}
