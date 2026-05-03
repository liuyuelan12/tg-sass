import { Api } from "telegram";
import { withFloodWait, sleep } from "./flood-wait";
import { downloadFromR2 } from "@/lib/r2";
import {
  connectSessions,
  ensureGroupMembership,
  disconnectSessions,
  type ConnectedSession,
} from "./group-join";
import { llmChat, type LlmProvider } from "@/lib/ai/llm";
import { analyzePersonas, type Persona, type PersonaAnalysis } from "@/lib/ai/personas";
import { cleanAndValidate } from "@/lib/ai/refusal-guard";
import { prisma } from "@/lib/db";

const REACTIONS = [
  "\u{1F44D}",
  "\u{2764}\u{FE0F}",
  "\u{1F525}",
  "\u{1F44F}",
  "\u{1F389}",
  "\u{1F602}",
  "\u{1F914}",
  "\u{1F60D}",
  "\u{1F4AF}",
  "\u{1F64F}",
];

function parseGroupInput(input: string): {
  entity: string;
  topicId: number | null;
} {
  const urlMatch = input.match(/t\.me\/([^/]+)\/(\d+)$/);
  if (urlMatch) return { entity: urlMatch[1], topicId: parseInt(urlMatch[2], 10) };
  const simpleMatch = input.match(/t\.me\/([^/]+)\/?$/);
  if (simpleMatch) return { entity: simpleMatch[1], topicId: null };
  return { entity: input, topicId: null };
}

function randomInterval(min: number, max: number): number {
  return (min + Math.random() * Math.max(0, max - min)) * 1000;
}

function pickAction(
  sendPct: number,
  replyPct: number
): "send" | "reply" | "react" {
  const roll = Math.random() * 100;
  if (roll < sendPct) return "send";
  if (roll < sendPct + replyPct) return "reply";
  return "react";
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface AIChatJobConfig {
  jobId: string;
  encryptedSessions: { id: string; sessionString: string }[];
  groupEntity: string;
  csvR2Key: string;
  llm: {
    provider: LlmProvider;
    apiKey: string;
    baseUrl?: string;
    model: string;
  };
  intervalMin: number;
  intervalMax: number;
  sendPct: number;
  replyPct: number;
  reactPct: number;
  contextSize: number;
  maxMessages: number;
  shouldLoop: boolean;
  dryRun?: boolean;
  cachedPersonas?: PersonaAnalysis | null;
  cachedSessionPersonaMap?: Record<string, number> | null;
}

export interface AIChatLog {
  type: "info" | "success" | "error" | "warn";
  message: string;
  timestamp: number;
}

export interface AIChatRunResult {
  sentCount: number;
  tokensIn: number;
  tokensOut: number;
}

const PERSIST_EVERY_N_MESSAGES = 5;

export class AIChatRunner {
  private aborted = false;
  private connected: ConnectedSession[] = [];
  private personaPerSession: Map<string, Persona> = new Map();
  private bannedSessionIds: Set<string> = new Set();
  private analysis: PersonaAnalysis | null = null;
  private abortController: AbortController = new AbortController();
  private tokensIn = 0;
  private tokensOut = 0;
  private sentCount = 0;
  private backupNotified = false;
  private onLog: (log: AIChatLog) => void;

  constructor(
    private config: AIChatJobConfig,
    onLog: (log: AIChatLog) => void
  ) {
    this.onLog = onLog;
  }

  private log(type: AIChatLog["type"], message: string) {
    this.onLog({ type, message, timestamp: Date.now() });
  }

  async start(): Promise<AIChatRunResult> {
    const { entity, topicId } = parseGroupInput(this.config.groupEntity);

    // ---- Phase A: persona analysis ----
    let analysis: PersonaAnalysis;
    if (this.config.cachedPersonas) {
      analysis = this.config.cachedPersonas;
      this.log("info", `Using cached personas (${analysis.personas.length} archetypes, lang=${analysis.language})`);
    } else {
      this.log("info", "Downloading CSV for persona analysis...");
      const csvBuffer = await downloadFromR2(this.config.csvR2Key);
      const csvText = csvBuffer.toString("utf-8");
      this.log("info", "Analyzing chat style with LLM...");
      analysis = await analyzePersonas(csvText, {
        provider: this.config.llm.provider,
        apiKey: this.config.llm.apiKey,
        baseUrl: this.config.llm.baseUrl,
        model: this.config.llm.model,
        signal: this.abortController.signal,
      });
      this.log(
        "success",
        `Detected language=${analysis.language}; extracted ${analysis.personas.length} personas: ${analysis.personas.map((p) => p.name).join(", ")}`
      );
      await prisma.aIChatJob.update({
        where: { id: this.config.jobId },
        data: {
          detectedLanguage: analysis.language,
          personasJson: analysis as unknown as object,
        },
      });
    }
    this.analysis = analysis;

    if (this.aborted) return this.result();

    // ---- Phase B: connect Telegram sessions + ensure group membership ----
    const inputs = this.config.encryptedSessions.map((s) => ({
      id: s.id,
      encryptedSession: s.sessionString,
    }));
    this.connected = await connectSessions(inputs, (t, m) => this.log(t, m));

    if (this.connected.length === 0) {
      this.log("error", "No active sessions could connect");
      return this.result();
    }
    if (this.aborted) return this.result();

    await ensureGroupMembership(this.connected, entity, (t, m) =>
      this.log(t, m)
    );

    // ---- Phase C: assign persona per session ----
    const personasShuffled = shuffle(analysis.personas);
    let savedMap: Record<string, number>;
    if (this.config.cachedSessionPersonaMap) {
      savedMap = this.config.cachedSessionPersonaMap;
    } else {
      savedMap = {};
      this.connected.forEach((s, i) => {
        savedMap[s.id] = i % personasShuffled.length;
      });
      await prisma.aIChatJob.update({
        where: { id: this.config.jobId },
        data: { sessionPersonaMap: savedMap as unknown as object },
      });
    }
    for (const s of this.connected) {
      const idx = savedMap[s.id] ?? 0;
      const persona =
        personasShuffled[idx % personasShuffled.length] ?? analysis.personas[0];
      this.personaPerSession.set(s.id, persona);
      this.log("info", `${s.name} → persona: ${persona.name}`);
    }

    if (this.aborted) return this.result();

    // ---- Phase D: main loop ----
    let round = 1;
    do {
      if (round > 1) this.log("info", `Round ${round}`);

      for (let turn = 0; turn < this.connected.length * 8; turn++) {
        if (this.aborted) {
          this.log("info", `Stopped after ${this.sentCount} messages`);
          return this.result();
        }
        if (this.sentCount >= this.config.maxMessages) {
          this.log(
            "success",
            `Reached maxMessages=${this.config.maxMessages}; stopping`
          );
          return this.result();
        }

        const eligible = this.connected.filter(
          (s) => !this.bannedSessionIds.has(s.id)
        );
        if (eligible.length === 0) {
          this.log("error", "All sessions are banned/forbidden in group");
          return this.result();
        }

        const session = eligible[this.sentCount % eligible.length];
        const persona = this.personaPerSession.get(session.id)!;
        const action = pickAction(this.config.sendPct, this.config.replyPct);

        try {
          await this.executeTurn(session, persona, action, entity, topicId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            msg.includes("CHAT_WRITE_FORBIDDEN") ||
            msg.includes("USER_BANNED_IN_CHANNEL") ||
            msg.includes("CHANNEL_PRIVATE")
          ) {
            this.bannedSessionIds.add(session.id);
            this.log(
              "warn",
              `${session.name} excluded from rotation: ${msg}`
            );
          } else {
            this.log("error", `${session.name} turn failed: ${msg}`);
          }
        }

        if (this.sentCount > 0 && this.sentCount % PERSIST_EVERY_N_MESSAGES === 0) {
          await this.persistCounters();
        }

        const delay = randomInterval(
          this.config.intervalMin,
          this.config.intervalMax
        );
        await sleep(delay);
      }
      round++;
    } while (this.config.shouldLoop && !this.aborted);

    await this.persistCounters();
    this.log("success", `Completed. Sent ${this.sentCount} message(s).`);
    return this.result();
  }

  private async executeTurn(
    session: ConnectedSession,
    persona: Persona,
    action: "send" | "reply" | "react",
    entity: string,
    topicId: number | null
  ): Promise<void> {
    const client = session.client;

    // React doesn't need LLM
    if (action === "react") {
      const recent = await withFloodWait(() =>
        client.getMessages(entity, { limit: 20 })
      );
      const candidates = recent.filter((m) => m instanceof Api.Message);
      if (candidates.length === 0) return;
      const target =
        candidates[Math.floor(Math.random() * candidates.length)];
      const emoji = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
      const peer = await withFloodWait(() => client.getInputEntity(entity));
      if (this.config.dryRun) {
        this.log(
          "info",
          `[DRY] ${session.name} would react ${emoji} to msg#${target.id}`
        );
        return;
      }
      await withFloodWait(() =>
        client.invoke(
          new Api.messages.SendReaction({
            peer,
            msgId: target.id,
            reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
          })
        )
      );
      this.log("success", `${session.name} reacted ${emoji} (#${target.id})`);
      return;
    }

    // Fetch context
    const recent = await withFloodWait(() =>
      client.getMessages(entity, { limit: this.config.contextSize })
    );
    const history = recent
      .filter((m) => m instanceof Api.Message && (m as Api.Message).message)
      .reverse()
      .map((m) => {
        const msg = m as Api.Message;
        const author =
          msg.fromId && "userId" in msg.fromId
            ? `user_${String(msg.fromId.userId).slice(-4)}`
            : "user";
        return `[${author}]: ${msg.message}`;
      });

    const replyTarget =
      action === "reply" && recent.length > 0
        ? (recent[0] as Api.Message)
        : null;

    const text = await this.generateReply(persona, action, history);
    if (!text) return;

    if (this.config.dryRun) {
      this.log(
        "info",
        `[DRY] ${session.name} (${persona.name}) ${action}: ${text.slice(0, 100)}`
      );
      this.sentCount++;
      return;
    }

    await withFloodWait(() =>
      client.sendMessage(entity, {
        message: text,
        replyTo: replyTarget?.id ?? topicId ?? undefined,
      })
    );
    this.sentCount++;
    this.log(
      "success",
      `${session.name} (${persona.name}) ${action}: ${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`
    );
  }

  private async generateReply(
    persona: Persona,
    action: "send" | "reply",
    history: string[]
  ): Promise<string | null> {
    if (!this.analysis) throw new Error("personas not initialized");
    const lang = this.analysis.language;

    const lengthRule =
      lang === "zh"
        ? `- 极短：单条消息最多 30 个中文字。绝对不要写多句话或长段落。\n` +
          `- 像微信群里的真人随手回，不要写文章。\n` +
          `- 不要总结、不要分析、不要列要点。`
        : `- VERY SHORT: a single message under 80 characters. NO multi-sentence essays.\n` +
          `- Like a casual chat user dashing off a quick reply.\n` +
          `- No summaries, no analysis, no bullet points.`;

    const system =
      `You are roleplaying as a Telegram group member with this style:\n` +
      `Name: ${persona.name}\n` +
      `Style: ${persona.traits}\n` +
      `Sample phrases: ${persona.samplePhrases.join(" | ")}\n\n` +
      `Rules:\n` +
      `- Reply ONLY in ${lang === "zh" ? "Chinese (中文)" : "English"}.\n` +
      `${lengthRule}\n` +
      `- NEVER mention you are an AI, model, or assistant.\n` +
      `- NEVER use phrases like "as a", "I'm here to help", or quoted preambles.\n` +
      `- No markdown, no bullet points, no headers.\n` +
      `- Match the casual register of the sample phrases above — if they are short and slangy, your reply must be too.`;

    const historyText =
      history.length > 0
        ? `Recent messages in the group (oldest first):\n${history.join("\n")}\n\n`
        : "";

    const userPrompt =
      action === "send"
        ? `${historyText}Write a single new message that fits naturally in this conversation. Output ONLY the message text.`
        : `${historyText}Write a SHORT reply to the LAST message above. Output ONLY the reply text.`;

    let attempt = 0;
    while (attempt < 2) {
      attempt++;
      try {
        const result = await llmChat({
          provider: this.config.llm.provider,
          apiKey: this.config.llm.apiKey,
          baseUrl: this.config.llm.baseUrl,
          model: this.config.llm.model,
          system,
          messages: [{ role: "user", content: userPrompt }],
          temperature: 0.85,
          maxTokens: 80,
          signal: this.abortController.signal,
        });
        this.tokensIn += result.tokensIn;
        this.tokensOut += result.tokensOut;
        if (result.usedBackup && !this.backupNotified) {
          this.backupNotified = true;
          this.log(
            "warn",
            `Primary LLM unavailable; switched to ${result.usedBackup} backup`
          );
        }
        const validated = cleanAndValidate(result.content, lang);
        if (validated.ok) return validated.cleaned;
        this.log(
          "warn",
          `LLM output rejected (${validated.reason}); retry=${attempt}`
        );
      } catch (err) {
        const e = err as Error & { status?: number; retryAfter?: number };
        if (e.status === 401 || e.status === 403) {
          throw new Error(`LLM auth failed (${e.status}). Check API key.`);
        }
        if (e.status === 429) {
          if (attempt < 2) {
            const wait = (e.retryAfter ?? 5) * 1000;
            this.log("warn", `Rate-limited; waiting ${wait}ms`);
            await sleep(wait);
            continue;
          }
          throw new Error("LLM rate-limited twice; giving up this turn");
        }
        throw err;
      }
    }
    return null;
  }

  private async persistCounters(): Promise<void> {
    try {
      await prisma.aIChatJob.update({
        where: { id: this.config.jobId },
        data: {
          sentCount: this.sentCount,
          tokensIn: this.tokensIn,
          tokensOut: this.tokensOut,
        },
      });
    } catch (err) {
      this.log(
        "warn",
        `Counter persist failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private result(): AIChatRunResult {
    return {
      sentCount: this.sentCount,
      tokensIn: this.tokensIn,
      tokensOut: this.tokensOut,
    };
  }

  stop() {
    this.aborted = true;
    try {
      this.abortController.abort();
    } catch {
      // ignore
    }
  }

  async disconnect() {
    await disconnectSessions(this.connected);
  }
}
