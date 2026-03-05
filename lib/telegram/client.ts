import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

export function createTelegramClient(sessionString = ""): TelegramClient {
  const apiId = parseInt(process.env.API_ID!, 10);
  const apiHash = process.env.API_HASH!;

  if (!apiId || !apiHash) {
    throw new Error("API_ID or API_HASH is not set");
  }

  return new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
  });
}
