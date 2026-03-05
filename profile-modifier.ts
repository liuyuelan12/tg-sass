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
} from "./utils";

async function selectSession(sessions: string[]): Promise<string> {
  console.log("\n📋 可用的 Sessions:");
  for (let i = 0; i < sessions.length; i++) {
    console.log(`  [${i + 1}] ${sessions[i].substring(0, 40)}...`);
  }
  const choice = await promptUser(`\n请选择 Session 编号 (1-${sessions.length}): `);
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= sessions.length) {
    throw new Error("无效的选择");
  }
  return sessions[idx];
}

async function modifyProfile(client: TelegramClient): Promise<void> {
  const me = await client.getMe();
  console.log(`\n当前资料:`);
  console.log(`  姓名: ${me.firstName || ""} ${me.lastName || ""}`);
  console.log(`  用户名: ${me.username || "无"}`);

  console.log("\n可修改项 (直接回车跳过):");

  const firstName = await promptUser("  新 First Name: ");
  const lastName = await promptUser("  新 Last Name: ");
  const username = await promptUser("  新 Username (不含@): ");
  const avatarPath = await promptUser("  新头像图片路径: ");

  // 修改姓名
  if (firstName || lastName) {
    await withFloodWait(async () => {
      await client.invoke(
        new Api.account.UpdateProfile({
          firstName: firstName || me.firstName || "",
          lastName: lastName || undefined,
        })
      );
    });
    console.log("✅ 姓名已更新");
  }

  // 修改用户名
  if (username) {
    await withFloodWait(async () => {
      await client.invoke(
        new Api.account.UpdateUsername({ username })
      );
    });
    console.log("✅ 用户名已更新");
  }

  // 修改头像
  if (avatarPath) {
    const resolved = path.resolve(avatarPath);
    if (!fs.existsSync(resolved)) {
      console.error("❌ 图片文件不存在:", resolved);
      return;
    }

    const buffer = fs.readFileSync(resolved);
    const fileName = path.basename(resolved);
    const customFile = new CustomFile(fileName, buffer.length, "", buffer);

    await withFloodWait(async () => {
      const uploadedPhoto = await client.uploadFile({
        file: customFile,
        workers: 1,
      });
      await client.invoke(
        new Api.photos.UploadProfilePhoto({ file: uploadedPhoto })
      );
    });
    console.log("✅ 头像已更新");
  }

  if (!firstName && !lastName && !username && !avatarPath) {
    console.log("ℹ️  未做任何修改");
  }
}

async function main(): Promise<void> {
  const { apiId, apiHash, sessionsFile } = loadEnv();
  const sessions = readSessions(sessionsFile);

  if (sessions.length === 0) {
    console.log("⚠️  没有找到任何 session，请先运行 session-gen.ts");
    return;
  }

  console.log("🛠️  Telegram 资料修改器");
  console.log("─".repeat(40));

  const sessionStr = await selectSession(sessions);
  const client = new TelegramClient(
    new StringSession(sessionStr),
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await withFloodWait(() => client.connect());
  console.log("✅ 已连接");

  await modifyProfile(client);

  await client.disconnect();
}

main()
  .catch((err) => {
    console.error("💥 致命错误:", err);
    process.exit(1);
  })
  .finally(() => closeRL());
