import * as fs from "fs";
import * as path from "path";
import bigInt from "big-integer";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createObjectCsvWriter } from "csv-writer";
import {
  loadEnv,
  readSessions,
  promptUser,
  closeRL,
  withFloodWait,
  sleep,
} from "./utils";

// 媒体文件大小上限 10MB，超过则跳过下载
const MAX_MEDIA_SIZE = 10 * 1024 * 1024;

interface MessageRecord {
  id: string;
  date: string;
  text: string;
  mediaType: string;
  mediaPath: string;
}

function parseGroupInput(input: string): { entity: string; topicId: number | null } {
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
      if (mime === "application/x-tgsticker") return ".tgs";
    }
  }
  return ".bin";
}

async function main(): Promise<void> {
  const { apiId, apiHash, sessionsFile } = loadEnv();
  const sessions = readSessions(sessionsFile);

  if (sessions.length === 0) {
    console.log("⚠️  没有找到任何 session，请先运行 session-gen.ts");
    return;
  }

  console.log("🕷️  Telegram 消息爬虫");
  console.log("─".repeat(40));

  const groupInput = await promptUser("📌 请输入群组链接或ID (支持 t.me/group/topicId): ");
  const countStr = await promptUser("📊 抓取消息数量: ");
  const count = parseInt(countStr, 10) || 100;

  const { entity, topicId } = parseGroupInput(groupInput);

  if (topicId) {
    console.log(`📂 检测到 Topic ID: ${topicId}`);
  }

  const client = new TelegramClient(
    new StringSession(sessions[0]),
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await withFloodWait(() => client.connect());
  console.log("✅ 已连接");

  const mediaDir = path.resolve("media");
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  const outputCsv = `messages.csv`;
  const csvWriter = createObjectCsvWriter({
    path: outputCsv,
    header: [
      { id: "id", title: "ID" },
      { id: "date", title: "Date" },
      { id: "text", title: "Text" },
      { id: "mediaType", title: "MediaType" },
      { id: "mediaPath", title: "MediaPath" },
    ],
  });

  console.log(`\n⏳ 正在抓取 ${count} 条消息...`);

  const records: MessageRecord[] = [];
  let fetched = 0;
  let offsetId = 0;
  let mediaDownloaded = 0;
  let mediaSkipped = 0;
  const batchSize = 100;

  while (fetched < count) {
    const limit = Math.min(batchSize, count - fetched);
    const batchStart = Date.now();

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
            hash: bigInt(0),
          })
        );
        return "messages" in result ? result.messages : [];
      } else {
        return await client.getMessages(entity, { limit, offsetId });
      }
    });

    if (!messages || messages.length === 0) {
      console.log(`⚠️  没有更多消息了，共获取 ${fetched} 条`);
      break;
    }

    console.log(`  📦 batch ${Math.floor(fetched / batchSize) + 1}: ${messages.length} 条 (${Date.now() - batchStart}ms)`);

    for (const msg of messages) {
      if (!(msg instanceof Api.Message)) continue;

      const mediaType = getMediaType(msg);
      let mediaPath = "";

      if (mediaType && msg.media) {
        const fileSize = getMediaSize(msg);

        if (fileSize > MAX_MEDIA_SIZE) {
          const sizeMB = (fileSize / 1024 / 1024).toFixed(1);
          console.log(`    ⏭️  跳过大文件 msg#${msg.id} (${mediaType}, ${sizeMB}MB > 10MB)`);
          mediaSkipped++;
        } else {
          try {
            const dlStart = Date.now();
            const buffer = await withFloodWait(() =>
              client.downloadMedia(msg.media!)
            );
            if (buffer && Buffer.isBuffer(buffer) && buffer.length > 0) {
              const ext = getMediaExtension(mediaType, msg);
              const fileName = `${msg.id}${ext}`;
              const filePath = path.join(mediaDir, fileName);
              fs.writeFileSync(filePath, buffer);
              mediaPath = path.join("media", fileName);
              mediaDownloaded++;
              console.log(`    💾 ${fileName} (${(buffer.length / 1024).toFixed(1)}KB, ${Date.now() - dlStart}ms)`);
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.warn(`    ⚠️  下载失败 msg#${msg.id}: ${errMsg}`);
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
    }

    console.log(`  📥 进度: ${fetched}/${count}`);

    const lastMsg = messages[messages.length - 1];
    if (lastMsg && "id" in lastMsg) {
      offsetId = lastMsg.id;
    }

    await sleep(1000);
  }

  await csvWriter.writeRecords(records);

  console.log(`\n✅ 完成! 共抓取 ${records.length} 条消息`);
  console.log(`📄 CSV: ${outputCsv}`);
  console.log(`📁 媒体: ${mediaDir} (下载 ${mediaDownloaded}, 跳过 ${mediaSkipped})`);

  try {
    await client.disconnect();
  } catch {
    // GramJS update loop TIMEOUT 是正常的，忽略
  }
  process.exit(0);
}

main()
  .catch((err) => {
    console.error("💥 致命错误:", err);
    process.exit(1);
  })
  .finally(() => closeRL());
