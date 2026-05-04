import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import {
  checkSessionAndUpdate,
  type SessionCheckResult,
} from "@/lib/telegram/session-status";

const CONCURRENCY = 3;

export async function POST() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const sessions = await prisma.tgSession.findMany({
    where: { userId: guard.user.id },
  });

  const results: SessionCheckResult[] = [];

  for (let i = 0; i < sessions.length; i += CONCURRENCY) {
    const batch = sessions.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(batch.map(checkSessionAndUpdate));
    results.push(...settled);
  }

  return NextResponse.json(results);
}
