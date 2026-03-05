import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline/promises";

// ── 环境变量 ──────────────────────────────────────────────

export interface EnvConfig {
  apiId: number;
  apiHash: string;
  sessionsFile: string;
}

export function loadEnv(): EnvConfig {
  dotenv.config();

  const apiId = process.env.API_ID;
  const apiHash = process.env.API_HASH;

  if (!apiId || !apiHash) {
    console.error("❌ 缺少环境变量 API_ID 或 API_HASH，请检查 .env 文件");
    process.exit(1);
  }

  const parsed = parseInt(apiId, 10);
  if (isNaN(parsed)) {
    console.error("❌ API_ID 必须是数字");
    process.exit(1);
  }

  return {
    apiId: parsed,
    apiHash,
    sessionsFile: process.env.SESSIONS_FILE || "sessions.txt",
  };
}

// ── 命令行交互 ────────────────────────────────────────────

let rl: readline.Interface | null = null;

function getRL(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

export async function promptUser(message: string): Promise<string> {
  const answer = await getRL().question(message);
  return answer.trim();
}

export function closeRL(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
}

// ── Session 文件操作 ──────────────────────────────────────

export function readSessions(filePath: string): string[] {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return [];
  }
  const content = fs.readFileSync(resolved, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export function appendSession(filePath: string, session: string): void {
  const resolved = path.resolve(filePath);
  const timestamp = new Date().toISOString();
  const entry = `# Added: ${timestamp}\n${session}\n`;
  fs.appendFileSync(resolved, entry, "utf-8");
}

// ── Flood Wait 重试 ──────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withFloodWait<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const error = err as { seconds?: number; errorMessage?: string; message?: string };

      const isFloodWait =
        error.errorMessage === "FLOOD" ||
        error.message?.includes("FLOOD") ||
        error.message?.includes("FloodWaitError");

      if (isFloodWait && attempt < maxRetries) {
        const waitSeconds = error.seconds || 30;
        console.warn(
          `⏳ 触发 FLOOD_WAIT，等待 ${waitSeconds} 秒后重试 (${attempt + 1}/${maxRetries})...`
        );
        await sleep(waitSeconds * 1000);
        continue;
      }

      throw err;
    }
  }

  throw new Error("withFloodWait: 不可达");
}
