import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/guard";
import { createTelegramClient } from "@/lib/telegram/client";
import { decrypt } from "@/lib/crypto";
import { withFloodWait } from "@/lib/telegram/flood-wait";

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

  try {
    const sessionStr = decrypt(tgSession.sessionString);
    const client = createTelegramClient(sessionStr);
    await withFloodWait(() => client.connect());
    const me = await client.getMe();

    const name = [me.firstName, me.lastName].filter(Boolean).join(" ");
    const label = `${name}${me.username ? ` @${me.username}` : ""}`;

    await prisma.tgSession.update({
      where: { id },
      data: { isActive: true, label },
    });

    try {
      await client.disconnect();
    } catch {
      // ignore
    }

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
  }
}
