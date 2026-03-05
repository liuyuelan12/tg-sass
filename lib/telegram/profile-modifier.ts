import { Api } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { createTelegramClient } from "./client";
import { withFloodWait } from "./flood-wait";
import { decrypt } from "@/lib/crypto";

export interface ProfileInfo {
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
}

export async function getProfile(
  encryptedSession: string
): Promise<ProfileInfo> {
  const sessionStr = decrypt(encryptedSession);
  const client = createTelegramClient(sessionStr);
  try {
    await withFloodWait(() => client.connect());
    const me = await client.getMe();
    return {
      firstName: me.firstName || "",
      lastName: me.lastName || "",
      username: me.username || "",
      phone: me.phone || "",
    };
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  }
}

export async function updateProfile(
  encryptedSession: string,
  updates: {
    firstName?: string;
    lastName?: string;
    username?: string;
    avatarBuffer?: Buffer;
    avatarFileName?: string;
  }
): Promise<void> {
  const sessionStr = decrypt(encryptedSession);
  const client = createTelegramClient(sessionStr);

  try {
    await withFloodWait(() => client.connect());

    if (updates.firstName !== undefined || updates.lastName !== undefined) {
      const me = await client.getMe();
      await withFloodWait(async () => {
        await client.invoke(
          new Api.account.UpdateProfile({
            firstName: updates.firstName ?? me.firstName ?? "",
            lastName: updates.lastName,
          })
        );
      });
    }

    if (updates.username !== undefined) {
      await withFloodWait(async () => {
        await client.invoke(
          new Api.account.UpdateUsername({ username: updates.username! })
        );
      });
    }

    if (updates.avatarBuffer && updates.avatarFileName) {
      const customFile = new CustomFile(
        updates.avatarFileName,
        updates.avatarBuffer.length,
        "",
        updates.avatarBuffer
      );
      await withFloodWait(async () => {
        const uploadedPhoto = await client.uploadFile({
          file: customFile,
          workers: 1,
        });
        await client.invoke(
          new Api.photos.UploadProfilePhoto({ file: uploadedPhoto })
        );
      });
    }
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  }
}
