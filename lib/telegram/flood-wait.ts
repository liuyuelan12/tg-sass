export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withFloodWait<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const error = err as {
        seconds?: number;
        errorMessage?: string;
        message?: string;
      };

      const isFloodWait =
        error.errorMessage === "FLOOD" ||
        error.message?.includes("FLOOD") ||
        error.message?.includes("FloodWaitError");

      if (isFloodWait && attempt < maxRetries) {
        const waitSeconds = error.seconds || 30;
        console.warn(
          `FLOOD_WAIT: waiting ${waitSeconds}s (attempt ${attempt + 1}/${maxRetries})`
        );
        await sleep(waitSeconds * 1000);
        continue;
      }

      throw err;
    }
  }

  throw new Error("withFloodWait: unreachable");
}
