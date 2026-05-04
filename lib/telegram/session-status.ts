import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { createTelegramClient } from "./client";
import { withTimeout } from "./flood-wait";

export interface SessionCheckResult {
  id: string;
  active: boolean;
  label: string;
  firstName?: string;
  username?: string;
  status: "ok" | "deleted" | "restricted" | "auth_failed" | "timeout" | "error";
  reason?: string;
}

const PER_OP_TIMEOUT_MS = 8000;

interface MeLike {
  firstName?: string;
  lastName?: string;
  username?: string;
  deleted?: boolean;
  restricted?: boolean;
  restrictionReason?: { reason?: string; text?: string }[];
}

function summarizeMe(me: MeLike): {
  isDeleted: boolean;
  isRestricted: boolean;
  reasons: string;
  baseName: string;
} {
  const isDeleted = me.deleted === true;
  const isRestricted = me.restricted === true;
  const reasons = Array.isArray(me.restrictionReason)
    ? me.restrictionReason
        .map((r) => r.text || r.reason || "")
        .filter(Boolean)
        .join("; ")
    : "";
  const baseName = [me.firstName, me.lastName].filter(Boolean).join(" ").trim();
  return { isDeleted, isRestricted, reasons, baseName };
}

export async function checkSessionAndUpdate(tgSession: {
  id: string;
  sessionString: string;
  label: string;
}): Promise<SessionCheckResult> {
  let client: ReturnType<typeof createTelegramClient> | null = null;
  try {
    const sessionStr = decrypt(tgSession.sessionString);
    client = createTelegramClient(sessionStr);

    await withTimeout(client.connect(), PER_OP_TIMEOUT_MS, "connect");
    const me = (await withTimeout(
      client.getMe(),
      PER_OP_TIMEOUT_MS,
      "getMe"
    )) as MeLike;

    const { isDeleted, isRestricted, reasons, baseName } = summarizeMe(me);

    if (isDeleted) {
      const label = `[DELETED] ${baseName || tgSession.label || "Unknown"}`;
      await prisma.tgSession.update({
        where: { id: tgSession.id },
        data: { isActive: false, label },
      });
      return {
        id: tgSession.id,
        active: false,
        label,
        status: "deleted",
        reason: "Telegram marked this account as deleted",
      };
    }

    if (isRestricted) {
      const reasonText = reasons || "restricted by Telegram";
      const label = `[FROZEN] ${baseName || tgSession.label || "Unknown"}`;
      await prisma.tgSession.update({
        where: { id: tgSession.id },
        data: { isActive: false, label },
      });
      return {
        id: tgSession.id,
        active: false,
        label,
        status: "restricted",
        reason: reasonText,
      };
    }

    const label = `${baseName || "Unknown"}${me.username ? ` @${me.username}` : ""}`;
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
      status: "ok",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAuth =
      msg.includes("AUTH_KEY_UNREGISTERED") ||
      msg.includes("AUTH_KEY_INVALID") ||
      msg.includes("USER_DEACTIVATED") ||
      msg.includes("SESSION_REVOKED") ||
      msg.includes("SESSION_EXPIRED");
    const isTimeout = msg.includes("timed out") || msg.includes("TIMEOUT");

    let status: SessionCheckResult["status"] = "error";
    let labelPrefix = "";
    if (isAuth) {
      status = "auth_failed";
      labelPrefix = "[AUTH_FAILED] ";
    } else if (isTimeout) {
      status = "timeout";
      labelPrefix = "[TIMEOUT] ";
    }

    const newLabel = labelPrefix
      ? `${labelPrefix}${tgSession.label.replace(/^\[[A-Z_]+\]\s*/, "")}`
      : tgSession.label;

    await prisma.tgSession.update({
      where: { id: tgSession.id },
      data: { isActive: false, label: newLabel },
    });

    return {
      id: tgSession.id,
      active: false,
      label: newLabel,
      status,
      reason: msg,
    };
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
