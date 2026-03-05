import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { withFloodWait } from "./flood-wait";

export type SessionEvent =
  | { type: "request_phone" }
  | { type: "request_code" }
  | { type: "request_password" }
  | { type: "error"; message: string }
  | { type: "success"; session: string; name: string; username: string | null };

export interface SessionGenCallbacks {
  emit: (event: SessionEvent) => void;
  waitForInput: () => Promise<string>;
}

export async function generateSession(
  callbacks: SessionGenCallbacks
): Promise<{ session: string; name: string; username: string | null }> {
  const apiId = parseInt(process.env.API_ID!, 10);
  const apiHash = process.env.API_HASH!;

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await withFloodWait(async () => {
      await client.start({
        phoneNumber: async () => {
          callbacks.emit({ type: "request_phone" });
          return await callbacks.waitForInput();
        },
        phoneCode: async () => {
          callbacks.emit({ type: "request_code" });
          return await callbacks.waitForInput();
        },
        password: async () => {
          callbacks.emit({ type: "request_password" });
          return await callbacks.waitForInput();
        },
        onError: (err) => {
          callbacks.emit({ type: "error", message: err.message });
        },
      });
    });

    const me = await client.getMe();
    const name = [me.firstName, me.lastName].filter(Boolean).join(" ");
    const session = client.session.save() as unknown as string;

    callbacks.emit({
      type: "success",
      session,
      name,
      username: me.username || null,
    });

    return { session, name, username: me.username || null };
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }
}
