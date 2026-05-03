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

export async function connectSessions(
  inputs: SessionInput[],
  log: GroupJoinLog
): Promise<ConnectedSession[]> {
  const connected: ConnectedSession[] = [];
  for (const input of inputs) {
    try {
      const sessionStr = decrypt(input.encryptedSession);
      const client = createTelegramClient(sessionStr);
      await withFloodWait(() => client.connect());
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
      log(
        "warn",
        `Session ${input.id} connect failed: ${err instanceof Error ? err.message : String(err)}`
      );
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
