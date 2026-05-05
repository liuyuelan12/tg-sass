export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export class FloodWaitTooLongError extends Error {
  readonly waitSeconds: number;
  constructor(waitSeconds: number, originalMessage?: string) {
    super(
      `FLOOD_WAIT_TOO_LONG: ${waitSeconds}s exceeds cap${
        originalMessage ? ` (${originalMessage})` : ""
      }`
    );
    this.name = "FloodWaitTooLongError";
    this.waitSeconds = waitSeconds;
  }
}

export interface WithFloodWaitOpts {
  maxRetries?: number;
  /** When defined, FLOOD_WAITs longer than this throw FloodWaitTooLongError instead of silently sleeping. */
  maxWaitSeconds?: number;
  /** Called once per FLOOD_WAIT retry (after deciding to wait, before sleeping). */
  onWait?: (waitSeconds: number, attempt: number) => void;
}

export async function withFloodWait<T>(
  fn: () => Promise<T>,
  optsOrRetries: WithFloodWaitOpts | number = {}
): Promise<T> {
  const opts: WithFloodWaitOpts =
    typeof optsOrRetries === "number" ? { maxRetries: optsOrRetries } : optsOrRetries;
  const maxRetries = opts.maxRetries ?? 3;

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

      if (isFloodWait) {
        const waitSeconds = error.seconds || 30;

        if (opts.maxWaitSeconds !== undefined && waitSeconds > opts.maxWaitSeconds) {
          throw new FloodWaitTooLongError(waitSeconds, error.message ?? error.errorMessage);
        }

        if (attempt < maxRetries) {
          opts.onWait?.(waitSeconds, attempt + 1);
          console.warn(
            `FLOOD_WAIT: waiting ${waitSeconds}s (attempt ${attempt + 1}/${maxRetries})`
          );
          await sleep(waitSeconds * 1000);
          continue;
        }
      }

      throw err;
    }
  }

  throw new Error("withFloodWait: unreachable");
}
