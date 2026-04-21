import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { createTelegramClient } from "@/lib/telegram/client";
import { decrypt } from "@/lib/crypto";
import { withTimeout } from "@/lib/telegram/flood-wait";

interface CheckResult {
  id: string;
  active: boolean;
  label: string;
  firstName?: string;
  username?: string;
  error?: string;
}

const PER_SESSION_TIMEOUT_MS = 8000;
const CONCURRENCY = 3;

async function checkOne(tgSession: {
  id: string;
  sessionString: string;
  label: string;
}): Promise<CheckResult> {
  let client: ReturnType<typeof createTelegramClient> | null = null;
  try {
    const sessionStr = decrypt(tgSession.sessionString);
    client = createTelegramClient(sessionStr);

    await withTimeout(client.connect(), PER_SESSION_TIMEOUT_MS, "connect");
    const me = await withTimeout(client.getMe(), PER_SESSION_TIMEOUT_MS, "getMe");

    const name = [me.firstName, me.lastName].filter(Boolean).join(" ");
    const label = `${name}${me.username ? ` @${me.username}` : ""}`;

    await prisma.tgSession.update({
      where: { id: tgSession.id },
      data: { isActive: true, label },
    });

    return {
      id: tgSession.id,
      active: true,
      label,
      firstName: me.firstName || undefined,
      username: me.username || undefined,
    };
  } catch (err) {
    await prisma.tgSession.update({
      where: { id: tgSession.id },
      data: { isActive: false },
    });

    return {
      id: tgSession.id,
      active: false,
      label: tgSession.label,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (client) {
      try {
        await withTimeout(client.disconnect(), 3000, "disconnect");
      } catch {
        // ignore — we're cleaning up anyway
      }
    }
  }
}

export async function POST() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const sessions = await prisma.tgSession.findMany({
    where: { userId: guard.user.id },
  });

  const results: CheckResult[] = [];

  for (let i = 0; i < sessions.length; i += CONCURRENCY) {
    const batch = sessions.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(batch.map(checkOne));
    results.push(...settled);
  }

  return NextResponse.json(results);
}
