import * as fs from "fs";
import * as path from "path";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { CustomFile } from "telegram/client/uploads";
import {
  loadEnv,
  readSessions,
  promptUser,
  closeRL,
  withFloodWait,
  sleep,
} from "./utils";

// ── 常用 emoji 反应 ─────────────────────────────────────

const REACTIONS = ["👍", "❤️", "🔥", "👏", "🎉", "😂", "🤔", "😍", "💯", "🙏"];

// ── CSV 解析 ─────────────────────────────────────────────

interface CsvRow {
  text: string;
  mediaType: string;
  mediaPath: string;
}

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const textIdx = header.indexOf("text");
  const mediaTypeIdx = header.indexOf("mediatype");
  const mediaPathIdx = header.indexOf("mediapath");

  if (textIdx === -1) {
    throw new Error("CSV 缺少 Text 列");
  }

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

// ── 工具函数 ─────────────────────────────────────────────

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

function parseInterval(input: string): { min: number; max: number } {
  const rangeMatch = input.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1], 10);
    const b = parseInt(rangeMatch[2], 10);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const single = parseInt(input, 10) || 5;
  return { min: single, max: single };
}

function randomInterval(min: number, max: number): number {
  return (min + Math.random() * (max - min)) * 1000;
}

function pickAction(sendPct: number, replyPct: number): "send" | "reply" | "react" {
  const roll = Math.random() * 100;
  if (roll < sendPct) return "send";
  if (roll < sendPct + replyPct) return "reply";
  return "react";
}

function randomReaction(): string {
  return REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
}

// ── 发送逻辑 ─────────────────────────────────────────────

async function sendDirect(
  client: TelegramClient,
  entity: string,
  topicId: number | null,
  row: CsvRow
): Promise<void> {
  let file: CustomFile | undefined;

  if (row.mediaPath) {
    const resolved = path.resolve(row.mediaPath);
    if (fs.existsSync(resolved)) {
      const buffer = fs.readFileSync(resolved);
      const fileName = path.basename(resolved);
      file = new CustomFile(fileName, buffer.length, "", buffer);
    } else {
      console.warn(`⚠️  媒体文件不存在: ${resolved}`);
    }
  }

  await client.sendMessage(entity, {
    message: row.text || undefined,
    file: file || undefined,
    replyTo: topicId || undefined,
  });
}

async function replyToRecent(
  client: TelegramClient,
  entity: string,
  topicId: number | null,
  row: CsvRow
): Promise<void> {
  // 获取最近的消息用于回复
  const recent = await client.getMessages(entity, { limit: 20 });
  const candidates = recent.filter(
    (m) => m instanceof Api.Message && m.message
  );

  if (candidates.length === 0) {
    // 没有可回复的消息，退回直接发送
    await sendDirect(client, entity, topicId, row);
    return;
  }

  const target = candidates[Math.floor(Math.random() * candidates.length)];

  let file: CustomFile | undefined;
  if (row.mediaPath) {
    const resolved = path.resolve(row.mediaPath);
    if (fs.existsSync(resolved)) {
      const buffer = fs.readFileSync(resolved);
      const fileName = path.basename(resolved);
      file = new CustomFile(fileName, buffer.length, "", buffer);
    }
  }

  await client.sendMessage(entity, {
    message: row.text || undefined,
    file: file || undefined,
    replyTo: target.id,
  });
}

async function reactToRecent(
  client: TelegramClient,
  entity: string
): Promise<boolean> {
  const recent = await client.getMessages(entity, { limit: 20 });
  const candidates = recent.filter((m) => m instanceof Api.Message);

  if (candidates.length === 0) return false;

  const target = candidates[Math.floor(Math.random() * candidates.length)];
  const emoji = randomReaction();

  const peer = await client.getInputEntity(entity);
  await client.invoke(
    new Api.messages.SendReaction({
      peer,
      msgId: target.id,
      reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
    })
  );

  return true;
}

// ── 主流程 ───────────────────────────────────────────────

async function main(): Promise<void> {
  const { apiId, apiHash, sessionsFile } = loadEnv();
  const sessions = readSessions(sessionsFile);

  if (sessions.length === 0) {
    console.log("⚠️  没有找到任何 session，请先运行 session-gen.ts");
    return;
  }

  console.log("🤖 Telegram 自动群发机器人");
  console.log("─".repeat(40));

  const csvPath = await promptUser("📄 CSV 文件路径 (默认 messages.csv): ");
  const resolvedCsv = path.resolve(csvPath || "messages.csv");
  if (!fs.existsSync(resolvedCsv)) {
    console.error("❌ CSV 文件不存在:", resolvedCsv);
    return;
  }

  const groupInput = await promptUser("📌 目标群组链接或ID: ");
  const intervalStr = await promptUser("⏱️  发送间隔秒数，支持区间如 3-5 (默认 3-5): ");
  const { min: intervalMin, max: intervalMax } = parseInterval(intervalStr || "3-5");

  const loopStr = await promptUser("🔁 消息发完后循环重发? (Y/n，默认 Y): ");
  const shouldLoop = loopStr.toLowerCase() !== "n";

  const probStr = await promptUser(
    "🎲 行为概率 [直接发送%,回复%,表情%] (默认 70,20,10): "
  );
  const probParts = (probStr || "70,20,10").split(",").map((s) => parseInt(s.trim(), 10));
  const sendPct = probParts[0] ?? 70;
  const replyPct = probParts[1] ?? 20;
  const reactPct = probParts[2] ?? 10;

  if (Math.abs(sendPct + replyPct + reactPct - 100) > 1) {
    console.warn(`⚠️  概率总和为 ${sendPct + replyPct + reactPct}%，建议为 100%`);
  }

  const { entity, topicId } = parseGroupInput(groupInput);
  if (topicId) {
    console.log(`📂 检测到 Topic ID: ${topicId}`);
  }

  const rows = parseCsv(resolvedCsv);
  if (rows.length === 0) {
    console.log("⚠️  CSV 中没有可发送的消息");
    return;
  }
  // 反转：CSV 最上面是最新消息，从最下面（最旧）开始发
  rows.reverse();
  console.log(`📊 共加载 ${rows.length} 条消息 (已按时间正序排列)`);
  console.log(`⚙️  间隔: ${intervalMin}-${intervalMax}s | 循环: ${shouldLoop ? "是" : "否"} | 概率: 发送${sendPct}% 回复${replyPct}% 表情${reactPct}%`);

  // 初始化所有 session 的 client
  console.log(`\n🔗 连接 ${sessions.length} 个 session...`);
  const clients: TelegramClient[] = [];
  const clientNames: string[] = [];

  for (const sessionStr of sessions) {
    const client = new TelegramClient(
      new StringSession(sessionStr),
      apiId,
      apiHash,
      { connectionRetries: 5 }
    );
    try {
      await withFloodWait(() => client.connect());
      const me = await client.getMe();
      const name = me.firstName || "未知";
      console.log(`  ✅ ${name} @${me.username || "无"}`);
      clients.push(client);
      clientNames.push(name);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ❌ 跳过失效 session: ${msg}`);
    }
    await sleep(1000);
  }

  if (clients.length === 0) {
    console.error("❌ 没有可用的活跃 session");
    return;
  }

  // 检查并加入群组
  console.log(`\n📋 检查群组成员状态...`);
  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const label = clientNames[i];
    try {
      const dialogs = await client.getDialogs({});
      const inGroup = dialogs.some((d) => {
        const peer = d.entity;
        if (peer && "username" in peer && peer.username) {
          return peer.username.toLowerCase() === entity.toLowerCase();
        }
        return false;
      });

      if (!inGroup) {
        console.log(`  🔄 ${label} 不在群组，正在加入...`);
        await withFloodWait(async () => {
          await client.invoke(
            new Api.channels.JoinChannel({ channel: entity })
          );
        });
        console.log(`  ✅ ${label} 已加入群组`);
        await sleep(2000);
      } else {
        console.log(`  ✅ ${label} 已在群组中`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠️  ${label} 加入群组失败: ${errMsg}`);
    }
  }

  // 发送消息
  console.log(`\n🚀 开始发送，使用 ${clients.length} 个 session 轮换...`);
  console.log("─".repeat(40));

  let round = 1;
  let globalCount = 0;

  do {
    if (round > 1) {
      console.log(`\n🔄 第 ${round} 轮`);
      console.log("─".repeat(40));
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const clientIdx = globalCount % clients.length;
      const client = clients[clientIdx];
      const label = clientNames[clientIdx];
      const action = pickAction(sendPct, replyPct);

      try {
        let actionLabel: string;

        if (action === "react") {
          // 表情反应不消耗 CSV 行内容
          const emoji = randomReaction();
          const reacted = await withFloodWait(() =>
            reactToRecent(client, entity)
          );
          if (reacted) {
            actionLabel = `😀 ${emoji}`;
          } else {
            // 没有可反应的消息，退回直接发送
            await withFloodWait(() => sendDirect(client, entity, topicId, row));
            actionLabel = formatPreview(row);
          }
        } else if (action === "reply") {
          await withFloodWait(() =>
            replyToRecent(client, entity, topicId, row)
          );
          actionLabel = `↩️ ${formatPreview(row)}`;
        } else {
          await withFloodWait(() =>
            sendDirect(client, entity, topicId, row)
          );
          actionLabel = formatPreview(row);
        }

        console.log(`✅ [${i + 1}/${rows.length}] ${label} → ${actionLabel}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ [${i + 1}/${rows.length}] ${label} → 失败: ${msg}`);
      }

      globalCount++;

      if (i < rows.length - 1 || shouldLoop) {
        const delay = randomInterval(intervalMin, intervalMax);
        await sleep(delay);
      }
    }

    round++;
  } while (shouldLoop);

  console.log("\n" + "─".repeat(40));
  console.log(`✅ 发送完毕! 共发送 ${globalCount} 条`);

  for (const client of clients) {
    try {
      await client.disconnect();
    } catch {
      // ignore disconnect timeout
    }
  }
  process.exit(0);
}

function formatPreview(row: CsvRow): string {
  if (row.text) {
    return row.text.substring(0, 40) + (row.text.length > 40 ? "..." : "");
  }
  return `[${row.mediaType || "media"}]`;
}

main()
  .catch((err) => {
    console.error("💥 致命错误:", err);
    process.exit(1);
  })
  .finally(() => closeRL());
