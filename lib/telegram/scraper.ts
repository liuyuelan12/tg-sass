import * as path from "path";
import { TelegramClient, Api } from "telegram";
import { createTelegramClient } from "./client";
import { withFloodWait, sleep } from "./flood-wait";
import { decrypt } from "@/lib/crypto";
import { uploadToR2 } from "@/lib/r2";

const MAX_MEDIA_SIZE = 10 * 1024 * 1024;

interface MessageRecord {
  id: string;
  date: string;
  text: string;
  mediaType: string;
  mediaPath: string;
}

export function parseGroupInput(input: string): {
  entity: string;
  topicId: number | null;
} {
  const urlMatch = input.match(/t\.me\/([^/]+)\/(\d+)$/);
  if (urlMatch) {
    return { entity: urlMatch[1], topicId: parseInt(urlMatch[2], 10) };
  }
  const simpleUrlMatch = input.match(/t\.me\/([^/]+)\/?$/);
  if (simpleUrlMatch) {
    return { entity: simpleUrlMatch[1], topicId: null };
  }
  return { entity: input, topicId: null };
}

function getMediaType(message: Api.Message): string {
  if (!message.media) return "";
  if (message.media instanceof Api.MessageMediaPhoto) return "photo";
  if (message.media instanceof Api.MessageMediaDocument) {
    const doc = message.media.document;
    if (doc instanceof Api.Document) {
      const mimeType = doc.mimeType || "";
      if (mimeType === "application/x-tgsticker") return "sticker";
      if (mimeType === "image/webp") return "sticker";
      if (mimeType.startsWith("video/")) {
        const isGif = doc.attributes?.some(
          (attr) => attr instanceof Api.DocumentAttributeAnimated
        );
        return isGif ? "gif" : "video";
      }
      if (mimeType.startsWith("audio/")) return "audio";
      if (mimeType.startsWith("image/")) return "photo";
      return "document";
    }
  }
  return "other";
}

function getMediaSize(message: Api.Message): number {
  if (message.media instanceof Api.MessageMediaDocument) {
    const doc = message.media.document;
    if (doc instanceof Api.Document) {
      return doc.size?.toJSNumber?.() ?? Number(doc.size) ?? 0;
    }
  }
  return 0;
}

function getMediaExtension(mediaType: string, message: Api.Message): string {
  if (mediaType === "photo") return ".jpg";
  if (mediaType === "gif") return ".gif";
  if (mediaType === "sticker") return ".tgs";
  if (message.media instanceof Api.MessageMediaDocument) {
    const doc = message.media.document;
    if (doc instanceof Api.Document) {
      const fileAttr = doc.attributes?.find(
        (attr) => attr instanceof Api.DocumentAttributeFilename
      ) as Api.DocumentAttributeFilename | undefined;
      if (fileAttr?.fileName) {
        const ext = path.extname(fileAttr.fileName);
        if (ext) return ext;
      }
      const mime = doc.mimeType || "";
      if (mime === "video/mp4") return ".mp4";
      if (mime === "audio/ogg") return ".ogg";
      if (mime === "audio/mpeg") return ".mp3";
      if (mime === "image/webp") return ".webp";
    }
  }
  return ".bin";
}

function recordsToCsv(records: MessageRecord[]): string {
  const header = "ID,Date,Text,MediaType,MediaPath";
  const rows = records.map((r) => {
    const escapedText = `"${r.text.replace(/"/g, '""')}"`;
    return `${r.id},${r.date},${escapedText},${r.mediaType},${r.mediaPath}`;
  });
  return [header, ...rows].join("\n");
}

export interface ScrapeProgress {
  fetched: number;
  total: number;
  mediaDownloaded: number;
  mediaSkipped: number;
  message?: string;
}

export class ScrapeRunner {
  private aborted = false;
  private client: TelegramClient | null = null;
  private onProgress?: (progress: ScrapeProgress) => void;

  constructor(onProgress?: (progress: ScrapeProgress) => void) {
    this.onProgress = onProgress;
  }

  stop() {
    this.aborted = true;
  }

  async run(
    encryptedSession: string,
    entity: string,
    topicId: number | null,
    count: number,
    userId: string,
    jobId: string
  ): Promise<{ csvKey: string; mediaPrefix: string; totalMessages: number }> {
    const sessionStr = decrypt(encryptedSession);
    this.client = createTelegramClient(sessionStr);

    const r2Prefix = `users/${userId}/scrapes/${jobId}`;
    const csvKey = `${r2Prefix}/messages.csv`;
    const mediaPrefix = `${r2Prefix}/media`;

    try {
      await withFloodWait(() => this.client!.connect());

      const records: MessageRecord[] = [];
      let fetched = 0;
      let offsetId = 0;
      let mediaDownloaded = 0;
      let mediaSkipped = 0;
      const batchSize = 100;

      while (fetched < count) {
        if (this.aborted) {
          this.onProgress?.({
            fetched,
            total: count,
            mediaDownloaded,
            mediaSkipped,
            message: `Stopped by user after ${fetched} messages`,
          });
          break;
        }

        const limit = Math.min(batchSize, count - fetched);
        const client = this.client!;

        const messages = await withFloodWait(async () => {
          if (topicId) {
            const result = await client.invoke(
              new Api.messages.GetReplies({
                peer: entity,
                msgId: topicId,
                offsetId,
                limit,
                addOffset: 0,
                maxId: 0,
                minId: 0,
                hash: BigInt(0),
              })
            );
            return "messages" in result ? result.messages : [];
          }
          return await client.getMessages(entity, { limit, offsetId });
        });

        if (!messages || messages.length === 0) break;

        for (const msg of messages) {
          if (this.aborted) break;
          if (!(msg instanceof Api.Message)) continue;

          const mediaType = getMediaType(msg);
          let mediaPath = "";

          if (mediaType && msg.media) {
            const fileSize = getMediaSize(msg);
            if (fileSize > MAX_MEDIA_SIZE) {
              mediaSkipped++;
            } else {
              try {
                const downloadPromise = withFloodWait(() =>
                  client.downloadMedia(msg.media!)
                );
                const timeoutPromise = new Promise<null>((_, reject) =>
                  setTimeout(() => reject(new Error("Download timeout")), 15000)
                );
                const buffer = await Promise.race([downloadPromise, timeoutPromise]);
                if (buffer && Buffer.isBuffer(buffer) && buffer.length > 0) {
                  const ext = getMediaExtension(mediaType, msg);
                  const fileName = `${msg.id}${ext}`;
                  const r2Key = `${mediaPrefix}/${fileName}`;
                  await uploadToR2(r2Key, buffer);
                  mediaPath = `media/${fileName}`;
                  mediaDownloaded++;
                }
              } catch {
                mediaSkipped++;
              }
              await sleep(300);
            }
          }

          records.push({
            id: String(msg.id),
            date: msg.date ? new Date(msg.date * 1000).toISOString() : "",
            text: msg.message || "",
            mediaType,
            mediaPath,
          });

          fetched++;

          // Progress per message
          if (fetched % 5 === 0 || fetched === count) {
            this.onProgress?.({
              fetched,
              total: count,
              mediaDownloaded,
              mediaSkipped,
              message: `Fetched ${fetched}/${count} messages (media: ${mediaDownloaded} downloaded, ${mediaSkipped} skipped)`,
            });
          }
        }

        const lastMsg = messages[messages.length - 1];
        if (lastMsg && "id" in lastMsg) {
          offsetId = lastMsg.id;
        }

        await sleep(1000);
      }

      // Upload CSV even if stopped early (partial results are useful)
      if (records.length > 0) {
        const csvContent = recordsToCsv(records);
        await uploadToR2(csvKey, Buffer.from(csvContent, "utf-8"), "text/csv");
      }

      return {
        csvKey,
        mediaPrefix,
        totalMessages: records.length,
      };
    } finally {
      try {
        await this.client?.disconnect();
      } catch {
        // ignore
      }
    }
  }
}
