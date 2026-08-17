import type { LlmProvider as PrismaLlmProvider } from "@prisma/client";

export type LlmProvider = PrismaLlmProvider;

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmCallOpts {
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
  signal?: AbortSignal;
}

export interface LlmCallResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  usedBackup?: string;
}

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_FALLBACK_MODEL = "deepseek-chat";
const FALLBACK_STATUS_CODES = new Set([401, 403, 429, 500, 502, 503, 504]);
const LLM_FETCH_TIMEOUT_MS = 30_000;

// Wrap a caller-supplied AbortSignal with a hard timeout so a hung
// fetch (server never replies) can't leak memory forever. If the caller's
// signal aborts first, we surface that; otherwise the timeout wins.
function withTimeoutSignal(external?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`LLM fetch timeout ${LLM_FETCH_TIMEOUT_MS}ms`)),
    LLM_FETCH_TIMEOUT_MS
  );
  if (external) {
    if (external.aborted) {
      clearTimeout(timer);
      controller.abort(external.reason);
    } else {
      external.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          controller.abort(external.reason);
        },
        { once: true }
      );
    }
  }
  const originalAbort = controller.abort.bind(controller);
  controller.abort = ((reason?: unknown) => {
    clearTimeout(timer);
    originalAbort(reason);
  }) as typeof controller.abort;
  return controller.signal;
}

function resolveOpenAIBase(opts: LlmCallOpts): string {
  switch (opts.provider) {
    case "GROQ_DEFAULT":
    case "GROQ_BYOK":
      return GROQ_BASE_URL;
    case "OPENAI_BYOK":
      return OPENAI_BASE_URL;
    case "OPENAI_COMPAT_BYOK":
      if (!opts.baseUrl) throw new Error("baseUrl is required for OPENAI_COMPAT_BYOK");
      return opts.baseUrl.replace(/\/+$/, "");
    default:
      throw new Error(`resolveOpenAIBase: unsupported provider ${opts.provider}`);
  }
}

async function callOpenAICompatible(opts: LlmCallOpts): Promise<LlmCallResult> {
  const base = resolveOpenAIBase(opts);
  const url = `${base}/chat/completions`;

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages,
    ],
    temperature: opts.temperature ?? 0.85,
    max_tokens: opts.maxTokens ?? 200,
  };

  if (opts.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: withTimeoutSignal(opts.signal),
  });

  if (!res.ok) {
    const text = await safeText(res);
    const err = new Error(
      `LLM ${opts.provider} ${res.status}: ${text.slice(0, 300)}`
    );
    (err as Error & { status: number; retryAfter?: number }).status = res.status;
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter)
      (err as Error & { status: number; retryAfter?: number }).retryAfter =
        Number(retryAfter);
    throw err;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = data.choices?.[0]?.message?.content ?? "";
  return {
    content,
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  };
}

async function callAnthropic(opts: LlmCallOpts): Promise<LlmCallResult> {
  const url = `${ANTHROPIC_BASE_URL}/messages`;

  const body = {
    model: opts.model,
    system: opts.system,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: opts.maxTokens ?? 200,
    temperature: opts.temperature ?? 0.85,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: withTimeoutSignal(opts.signal),
  });

  if (!res.ok) {
    const text = await safeText(res);
    const err = new Error(
      `LLM ANTHROPIC ${res.status}: ${text.slice(0, 300)}`
    );
    (err as Error & { status: number; retryAfter?: number }).status = res.status;
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter)
      (err as Error & { status: number; retryAfter?: number }).retryAfter =
        Number(retryAfter);
    throw err;
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const content =
    data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";

  return {
    content,
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function shouldFallback(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return false;
  const e = err as { status?: number };
  if (typeof e.status === "number") return FALLBACK_STATUS_CODES.has(e.status);
  return true;
}

const GROQ_BACKUP_ENV_VARS = ["GROQ_API_KEY2", "GROQ_API_KEY3"] as const;

async function callGroqWithKey(
  opts: LlmCallOpts,
  apiKey: string,
  usedBackup: string
): Promise<LlmCallResult> {
  const result = await callOpenAICompatible({ ...opts, apiKey });
  return { ...result, usedBackup };
}

async function callDeepseekFallback(opts: LlmCallOpts): Promise<LlmCallResult> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) {
    throw new Error("DEEPSEEK_API_KEY backup is not configured");
  }
  const fallbackOpts: LlmCallOpts = {
    ...opts,
    provider: "OPENAI_COMPAT_BYOK",
    apiKey: deepseekKey,
    baseUrl: DEEPSEEK_BASE_URL,
    model: DEEPSEEK_FALLBACK_MODEL,
  };
  const result = await callOpenAICompatible(fallbackOpts);
  return { ...result, usedBackup: "deepseek" };
}

function errMsg(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200);
}

export async function llmChat(opts: LlmCallOpts): Promise<LlmCallResult> {
  if (!opts.apiKey) throw new Error("LLM apiKey is required");
  if (!opts.model) throw new Error("LLM model is required");

  if (opts.provider === "ANTHROPIC_BYOK") {
    return callAnthropic(opts);
  }

  // User preference: when GROQ_DEFAULT is selected and DeepSeek is configured
  // (paid), route directly to DeepSeek. Groq becomes emergency fallback if
  // DeepSeek itself errors out.
  if (opts.provider === "GROQ_DEFAULT" && process.env.DEEPSEEK_API_KEY) {
    try {
      return await callDeepseekFallback(opts);
    } catch (deepseekErr) {
      if (!shouldFallback(deepseekErr)) throw deepseekErr;
      console.warn(
        `[llmChat] DeepSeek failed (${errMsg(deepseekErr)}); falling back to Groq`
      );
      // fall through to Groq path below
    }
  }

  try {
    return await callOpenAICompatible(opts);
  } catch (err) {
    if (opts.provider !== "GROQ_DEFAULT" || !shouldFallback(err)) throw err;

    let lastErr: unknown = err;
    for (const envVar of GROQ_BACKUP_ENV_VARS) {
      const backupKey = process.env[envVar];
      if (!backupKey) continue;
      console.warn(
        `[llmChat] Groq failed (${errMsg(lastErr)}); trying ${envVar}`
      );
      try {
        return await callGroqWithKey(opts, backupKey, `groq-${envVar.toLowerCase()}`);
      } catch (backupErr) {
        lastErr = backupErr;
        if (!shouldFallback(backupErr)) throw backupErr;
      }
    }

    if (process.env.DEEPSEEK_API_KEY) {
      console.warn(
        `[llmChat] All Groq keys failed (${errMsg(lastErr)}); falling back to DeepSeek`
      );
      return callDeepseekFallback(opts);
    }

    throw lastErr;
  }
}

export function resolveServerKey(provider: LlmProvider): string | null {
  if (provider === "GROQ_DEFAULT") {
    return process.env.GROQ_API_KEY ?? null;
  }
  return null;
}

export function defaultModelFor(provider: LlmProvider): string {
  switch (provider) {
    case "GROQ_DEFAULT":
      // DEEPSEEK_API_KEY is the paid primary; llmChat routes GROQ_DEFAULT to it.
      return process.env.DEEPSEEK_API_KEY ? "deepseek-chat" : "openai/gpt-oss-120b";
    case "GROQ_BYOK":
      return "openai/gpt-oss-120b";
    case "OPENAI_BYOK":
      return "gpt-4o-mini";
    case "ANTHROPIC_BYOK":
      return "claude-haiku-4-5-20251001";
    case "OPENAI_COMPAT_BYOK":
      return "";
  }
}
