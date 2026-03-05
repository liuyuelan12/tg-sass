import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { loadEnv, readSessions, closeRL, withFloodWait, sleep } from "./utils";

async function main(): Promise<void> {
  const { apiId, apiHash, sessionsFile } = loadEnv();
  const sessions = readSessions(sessionsFile);

  if (sessions.length === 0) {
    console.log("⚠️  没有找到任何 session，请先运行 session-gen.ts");
    return;
  }

  console.log(`🔍 开始检查 ${sessions.length} 个 session...`);
  console.log("─".repeat(50));

  let activeCount = 0;
  let deadCount = 0;

  for (let i = 0; i < sessions.length; i++) {
    const sessionStr = sessions[i];
    const label = `Session #${i + 1} (${sessionStr.substring(0, 20)}...)`;

    try {
      const client = new TelegramClient(
        new StringSession(sessionStr),
        apiId,
        apiHash,
        { connectionRetries: 3 }
      );

      await withFloodWait(() => client.connect());

      const me = await client.getMe();
      const name = [me.firstName, me.lastName].filter(Boolean).join(" ");
      const username = me.username ? `@${me.username}` : "无用户名";
      console.log(`✅ ${label} → 活跃 | ${name} (${username})`);
      activeCount++;

      await client.disconnect();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ ${label} → 失效 | ${msg}`);
      deadCount++;
    }

    if (i < sessions.length - 1) {
      await sleep(1000);
    }
  }

  console.log("─".repeat(50));
  console.log(`📊 结果: ${activeCount} 活跃, ${deadCount} 失效, 共 ${sessions.length} 个`);
}

main()
  .catch((err) => {
    console.error("💥 致命错误:", err);
    process.exit(1);
  })
  .finally(() => closeRL());
