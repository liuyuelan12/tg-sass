import * as path from "path";
import { TelegramClient, Api } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { createTelegramClient } from "./client";
import { withFloodWait, sleep } from "./flood-wait";
import { decrypt } from "@/lib/crypto";
import { downloadFromR2, listR2Objects } from "@/lib/r2";

const REACTIONS = [
  "\u{1F44D}",
  "\u{2764}\u{FE0F}",
  "\u{1F525}",
  "\u{1F44F}",
  "\u{1F389}",
  "\u{1F602}",
  "\u{1F914}",
  "\u{1F60D}",
  "\u{1F4AF}",
  "\u{1F64F}",
];

interface CsvRow {
  text: string;
  mediaType: string;
  mediaPath: string;
}

function parseCsvContent(content: string): CsvRow[] {
  const lines = content.split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const textIdx = header.indexOf("text");
  const mediaTypeIdx = header.indexOf("mediatype");
  const mediaPathIdx = header.indexOf("mediapath");
  if (textIdx === -1) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCsvLine(line);
    const text = fields[textIdx] || "";
    const mediaType = mediaTypeIdx >= 0 ? fields[mediaTypeIdx] || "" : "";
    const mediaPath = mediaPathIdx >= 0 ? fields[mediaPathIdx] || "" : "";
    if (text || mediaPath) {
      rows.push({ text, mediaType, mediaPath });
    }
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseGroupInput(input: string): {
  entity: string;
  topicId: number | null;
} {
  const urlMatch = input.match(/t\.me\/([^/]+)\/(\d+)$/);
  if (urlMatch)
    return { entity: urlMatch[1], topicId: parseInt(urlMatch[2], 10) };
  const simpleMatch = input.match(/t\.me\/([^/]+)\/?$/);
  if (simpleMatch) return { entity: simpleMatch[1], topicId: null };
  return { entity: input, topicId: null };
}

function randomInterval(min: number, max: number): number {
  return (min + Math.random() * (max - min)) * 1000;
}

function pickAction(
  sendPct: number,
  replyPct: number
): "send" | "reply" | "react" {
  const roll = Math.random() * 100;
  if (roll < sendPct) return "send";
  if (roll < sendPct + replyPct) return "reply";
  return "react";
}

export interface ChatJobConfig {
  encryptedSessions: string[];
  groupEntity: string;
  csvR2Key: string;
  mediaR2Prefix: string;
  intervalMin: number;
  intervalMax: number;
  sendPct: number;
  replyPct: number;
  reactPct: number;
  shouldLoop: boolean;
}

export interface ChatJobLog {
  type: "info" | "success" | "error" | "warn";
  message: string;
  timestamp: number;
}

export class AutoChatRunner {
  private aborted = false;
  private clients: TelegramClient[] = [];
  private clientNames: string[] = [];
  private onLog?: (log: ChatJobLog) => void;

  constructor(
    private config: ChatJobConfig,
    onLog?: (log: ChatJobLog) => void
  ) {
    this.onLog = onLog;
  }

  private log(type: ChatJobLog["type"], message: string) {
    this.onLog?.({ type, message, timestamp: Date.now() });
  }

  async start(): Promise<number> {
    const { entity, topicId } = parseGroupInput(this.config.groupEntity);

    // Load CSV from R2
    const csvBuffer = await downloadFromR2(this.config.csvR2Key);
    const rows = parseCsvContent(csvBuffer.toString("utf-8"));
    if (rows.length === 0) {
      this.log("error", "CSV is empty");
      return 0;
    }
    rows.reverse();
    this.log("info", `Loaded ${rows.length} messages from CSV`);

    // Load media file mapping from R2
    const mediaKeys = await listR2Objects(this.config.mediaR2Prefix);
    const mediaMap = new Map<string, string>();
    for (const key of mediaKeys) {
      const fileName = path.basename(key);
      mediaMap.set(`media/${fileName}`, key);
    }

    // Connect all sessions
    for (const encSession of this.config.encryptedSessions) {
      try {
        const sessionStr = decrypt(encSession);
        const client = createTelegramClient(sessionStr);
        await withFloodWait(() => client.connect());
        const me = await client.getMe();
        const name = me.firstName || "Unknown";
        this.clients.push(client);
        this.clientNames.push(name);
        this.log("success", `Connected: ${name} @${me.username || "n/a"}`);
      } catch (err) {
        this.log(
          "warn",
          `Session failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      await sleep(1000);
    }

    if (this.clients.length === 0) {
      this.log("error", "No active sessions available");
      return 0;
    }

    // Check group membership
    for (let i = 0; i < this.clients.length; i++) {
      try {
        const dialogs = await this.clients[i].getDialogs({});
        const inGroup = dialogs.some((d) => {
          const peer = d.entity;
          return (
            peer &&
            "username" in peer &&
            peer.username?.toLowerCase() === entity.toLowerCase()
          );
        });
        if (!inGroup) {
          this.log("info", `${this.clientNames[i]} joining group...`);
          await withFloodWait(async () => {
            await this.clients[i].invoke(
              new Api.channels.JoinChannel({ channel: entity })
            );
          });
          await sleep(2000);
        }
      } catch (err) {
        this.log(
          "warn",
          `${this.clientNames[i]} join failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Send messages
    let globalCount = 0;
    let round = 1;

    do {
      if (round > 1) this.log("info", `Round ${round}`);

      for (let i = 0; i < rows.length; i++) {
        if (this.aborted) {
          this.log("info", `Stopped after ${globalCount} messages`);
          return globalCount;
        }

        const row = rows[i];
        const clientIdx = globalCount % this.clients.length;
        const client = this.clients[clientIdx];
        const label = this.clientNames[clientIdx];
        const action = pickAction(
          this.config.sendPct,
          this.config.replyPct
        );

        try {
          if (action === "react") {
            const recent = await withFloodWait(() =>
              client.getMessages(entity, { limit: 20 })
            );
            const candidates = recent.filter(
              (m) => m instanceof Api.Message
            );
            if (candidates.length > 0) {
              const target =
                candidates[Math.floor(Math.random() * candidates.length)];
              const emoji =
                REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
              const peer = await withFloodWait(() =>
                client.getInputEntity(entity)
              );
              await withFloodWait(() =>
                client.invoke(
                  new Api.messages.SendReaction({
                    peer,
                    msgId: target.id,
                    reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
                  })
                )
              );
              this.log("success", `[${i + 1}/${rows.length}] ${label} reacted ${emoji}`);
            }
          } else {
            const mediaBuffer = await this.getMediaBuffer(row, mediaMap);
            let file: CustomFile | undefined;
            if (mediaBuffer) {
              const fileName = path.basename(row.mediaPath);
              file = new CustomFile(
                fileName,
                mediaBuffer.length,
                "",
                mediaBuffer
              );
            }

            if (action === "reply") {
              const recent = await withFloodWait(() =>
                client.getMessages(entity, { limit: 20 })
              );
              const candidates = recent.filter(
                (m) => m instanceof Api.Message && m.message
              );
              const replyTo =
                candidates.length > 0
                  ? candidates[Math.floor(Math.random() * candidates.length)]
                      .id
                  : topicId || undefined;

              await withFloodWait(() =>
                client.sendMessage(entity, {
                  message: row.text || undefined,
                  file: file || undefined,
                  replyTo,
                })
              );
              this.log(
                "success",
                `[${i + 1}/${rows.length}] ${label} replied: ${preview(row)}`
              );
            } else {
              await withFloodWait(() =>
                client.sendMessage(entity, {
                  message: row.text || undefined,
                  file: file || undefined,
                  replyTo: topicId || undefined,
                })
              );
              this.log(
                "success",
                `[${i + 1}/${rows.length}] ${label} sent: ${preview(row)}`
              );
            }
          }
        } catch (err) {
          this.log(
            "error",
            `[${i + 1}/${rows.length}] ${label} failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        globalCount++;
        const delay = randomInterval(
          this.config.intervalMin,
          this.config.intervalMax
        );
        await sleep(delay);
      }
      round++;
    } while (this.config.shouldLoop && !this.aborted);

    this.log("success", `Completed! Total sent: ${globalCount}`);
    return globalCount;
  }

  private async getMediaBuffer(
    row: CsvRow,
    mediaMap: Map<string, string>
  ): Promise<Buffer | null> {
    if (!row.mediaPath) return null;
    const r2Key = mediaMap.get(row.mediaPath);
    if (!r2Key) return null;
    try {
      return await downloadFromR2(r2Key);
    } catch {
      return null;
    }
  }

  stop() {
    this.aborted = true;
  }

  async disconnect() {
    for (const client of this.clients) {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    }
  }
}

function preview(row: CsvRow): string {
  if (row.text) {
    return row.text.substring(0, 40) + (row.text.length > 40 ? "..." : "");
  }
  return `[${row.mediaType || "media"}]`;
}
