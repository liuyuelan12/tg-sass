import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { createTelegramClient } from "@/lib/telegram/client";
import { decrypt } from "@/lib/crypto";
import { withTimeout } from "@/lib/telegram/flood-wait";

const PER_SESSION_TIMEOUT_MS = 8000;

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

  let client: ReturnType<typeof createTelegramClient> | null = null;
  try {
    const sessionStr = decrypt(tgSession.sessionString);
    client = createTelegramClient(sessionStr);

    await withTimeout(client.connect(), PER_SESSION_TIMEOUT_MS, "connect");
    const me = await withTimeout(client.getMe(), PER_SESSION_TIMEOUT_MS, "getMe");

    const name = [me.firstName, me.lastName].filter(Boolean).join(" ");
    const label = `${name}${me.username ? ` @${me.username}` : ""}`;

    await prisma.tgSession.update({
      where: { id },
      data: { isActive: true, label },
    });

    return NextResponse.json({ active: true, label });
  } catch (err) {
    await prisma.tgSession.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({
      active: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (client) {
      try {
        await withTimeout(client.disconnect(), 3000, "disconnect");
      } catch {
        // ignore
      }
    }
  }
}
