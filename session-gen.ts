import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { loadEnv, promptUser, appendSession, closeRL, withFloodWait } from "./utils";

async function main(): Promise<void> {
  const { apiId, apiHash, sessionsFile } = loadEnv();

  console.log("🔐 Telegram Session 生成器");
  console.log("─".repeat(40));

  const stringSession = new StringSession("");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await withFloodWait(async () => {
    await client.start({
      phoneNumber: async () => {
        return await promptUser("📱 请输入手机号 (含国际区号，如 +86...): ");
      },
      phoneCode: async () => {
        return await promptUser("💬 请输入收到的验证码: ");
      },
      password: async () => {
        return await promptUser("🔑 请输入两步验证密码 (2FA): ");
      },
      onError: (err) => {
        console.error("❌ 登录错误:", err.message);
      },
    });
  });

  const savedSession = client.session.save() as unknown as string;

  appendSession(sessionsFile, savedSession);
  console.log("\n✅ Session 已生成并保存到", sessionsFile);
  console.log("📋 Session 字符串:", savedSession.substring(0, 50) + "...");

  await client.disconnect();
  closeRL();
}

main().catch((err) => {
  console.error("💥 致命错误:", err);
  closeRL();
  process.exit(1);
});
