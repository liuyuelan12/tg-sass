import { TelegramClient, Api } from "telegram";
import { createTelegramClient } from "./client";
import { withFloodWait, sleep } from "./flood-wait";
import { decrypt } from "@/lib/crypto";

export interface SessionInput {
  id: string;
  encryptedSession: string;
}

export interface ConnectedSession {
  id: string;
  client: TelegramClient;
  name: string;
  username: string | null;
  userId: string;
}

export type GroupJoinLog = (
  type: "info" | "success" | "warn" | "error",
  message: string
) => void;

export type OnDeadSession = (
  sessionId: string,
  reason: string
) => void | Promise<void>;

const DEAD_SESSION_PATTERNS = [
  "AUTH_KEY_UNREGISTERED",
  "AUTH_KEY_INVALID",
  "SESSION_REVOKED",
  "SESSION_EXPIRED",
  "USER_DEACTIVATED",
  "USER_DEACTIVATED_BAN",
];

export function isDeadSessionError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  for (const p of DEAD_SESSION_PATTERNS) {
    if (msg.includes(p)) return p;
  }
  return null;
}

export async function connectSessions(
  inputs: SessionInput[],
  log: GroupJoinLog,
  onDead?: OnDeadSession
): Promise<ConnectedSession[]> {
  const connected: ConnectedSession[] = [];
  for (const input of inputs) {
    let client: TelegramClient | null = null;
    try {
      const sessionStr = decrypt(input.encryptedSession);
      client = createTelegramClient(sessionStr);
      await withFloodWait(() => client!.connect());
      const me = await client.getMe();
      const firstName =
        "firstName" in me && typeof me.firstName === "string" ? me.firstName : "";
      const username =
        "username" in me && typeof me.username === "string" ? me.username : null;
      const name = firstName || "Unknown";
      const meId = (me as { id?: { toString: () => string } }).id;
      const userId = meId ? meId.toString() : "";
      connected.push({ id: input.id, client, name, username, userId });
      log("success", `Connected: ${name}${username ? ` @${username}` : ""}`);
    } catch (err) {
      const deadReason = isDeadSessionError(err);
      log(
        deadReason ? "error" : "warn",
        `Session ${input.id} connect failed: ${err instanceof Error ? err.message : String(err)}${deadReason ? " → quarantined" : ""}`
      );
      // Ensure any half-opened gramJS client is torn down so its _updateLoop
      // doesn't keep reconnecting in the background and leaking memory.
      if (client) {
        try { await client.disconnect(); } catch { /* ignore */ }
        try { await client.destroy(); } catch { /* ignore */ }
      }
      if (deadReason && onDead) {
        try { await onDead(input.id, deadReason); } catch { /* ignore */ }
      }
    }
    await sleep(1000);
  }
  return connected;
}

export async function ensureGroupMembership(
  sessions: ConnectedSession[],
  entity: string,
  log: GroupJoinLog
): Promise<void> {
  for (const session of sessions) {
    try {
      const dialogs = await session.client.getDialogs({});
      const inGroup = dialogs.some((d) => {
        const peer = d.entity;
        return (
          peer &&
          "username" in peer &&
          typeof peer.username === "string" &&
          peer.username.toLowerCase() === entity.toLowerCase()
        );
      });
      if (!inGroup) {
        log("info", `${session.name} joining group...`);
        await withFloodWait(async () => {
          await session.client.invoke(
            new Api.channels.JoinChannel({ channel: entity })
          );
        });
        await sleep(2000);
      }
    } catch (err) {
      log(
        "warn",
        `${session.name} join failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

export async function disconnectSessions(
  sessions: ConnectedSession[]
): Promise<void> {
  for (const s of sessions) {
    try {
      await s.client.disconnect();
    } catch {
      // ignore
    }
  }
}
