import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { createTelegramClient } from "@/lib/telegram/client";
import { decrypt } from "@/lib/crypto";
import { withFloodWait } from "@/lib/telegram/flood-wait";

interface CheckResult {
  id: string;
  active: boolean;
  label: string;
  firstName?: string;
  username?: string;
  error?: string;
}

export async function POST() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const sessions = await prisma.tgSession.findMany({
    where: { userId: guard.user.id },
  });

  const results: CheckResult[] = [];

  for (const tgSession of sessions) {
    try {
      const sessionStr = decrypt(tgSession.sessionString);
      const client = createTelegramClient(sessionStr);
      await withFloodWait(() => client.connect());
      const me = await client.getMe();

      const name = [me.firstName, me.lastName].filter(Boolean).join(" ");
      const label = `${name}${me.username ? ` @${me.username}` : ""}`;

      await prisma.tgSession.update({
        where: { id: tgSession.id },
        data: { isActive: true, label },
      });

      results.push({
        id: tgSession.id,
        active: true,
        label,
        firstName: me.firstName || undefined,
        username: me.username || undefined,
      });

      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    } catch (err) {
      await prisma.tgSession.update({
        where: { id: tgSession.id },
        data: { isActive: false },
      });

      results.push({
        id: tgSession.id,
        active: false,
        label: tgSession.label,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Small delay between checks to avoid flood
    await new Promise((r) => setTimeout(r, 1000));
  }

  return NextResponse.json(results);
}
