import { Api } from "telegram";
import { withFloodWait, sleep, FloodWaitTooLongError } from "./flood-wait";
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

function getSenderUserId(m: Api.Message): string | null {
  const fromId = m.fromId;
  if (fromId && "userId" in fromId && fromId.userId) {
    return fromId.userId.toString();
  }
  return null;
}

function extractOpening(text: string, lang: "zh" | "en"): string {
  const trimmed = text.replace(/^[\s，。、！？!,.?\-—…@#"'“”「」]+/, "");
  if (lang === "zh") return trimmed.slice(0, 4);
  const m = trimmed.match(/^[A-Za-z']+/);
  return m ? m[0].toLowerCase() : trimmed.slice(0, 8).toLowerCase();
}

const MAX_RECENT_OPENINGS = 6;
const OPENING_REPEAT_THRESHOLD = 2;

function findOverusedOpenings(openings: string[]): string[] {
  const counts = new Map<string, number>();
  for (const o of openings) {
    if (!o) continue;
    counts.set(o, (counts.get(o) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= OPENING_REPEAT_THRESHOLD)
    .map(([o]) => o);
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
  priorityReplyStrangers?: boolean;
  bannedKeywords?: string[];
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

// FLOOD_WAITs shorter than this are silently retried; longer ones bail out so
// the rest of the rotation keeps moving instead of blocking on a single session.
const FLOOD_WAIT_CAP_SECONDS = 90;
// When every session is cooling down, the main loop sleeps in chunks of at most
// this long before re-evaluating, so stop()/maxMessages still take effect promptly.
const ALL_COOLING_MAX_SLEEP_MS = 5 * 60 * 1000;

export class AIChatRunner {
  private aborted = false;
  private connected: ConnectedSession[] = [];
  private ownUserIds: Set<string> = new Set();
  private repliedStrangerMsgIds: Set<number> = new Set();
  private personaPerSession: Map<string, Persona> = new Map();
  private bannedSessionIds: Set<string> = new Set();
  private cooldownUntil: Map<string, number> = new Map();
  // Track openings of recently sent self-messages so we can warn the LLM not
  // to repeat the same start word over and over (e.g. screenshots showed
  // every reply beginning with "截图哥...").
  private recentSelfOpenings: string[] = [];
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

  /**
   * Wraps Telegram calls with a FLOOD_WAIT cap so a single throttled session
   * can't silently block the whole runner for an hour.
   */
  private floodWait<T>(fn: () => Promise<T>, label?: string): Promise<T> {
    return withFloodWait(fn, {
      maxWaitSeconds: FLOOD_WAIT_CAP_SECONDS,
      onWait: (seconds) => {
        if (seconds >= 30) {
          this.log(
            "warn",
            `FLOOD_WAIT ${seconds}s${label ? ` on ${label}` : ""}; retrying after backoff`
          );
        }
      },
    });
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
    this.ownUserIds = new Set(
      this.connected.map((s) => s.userId).filter((id) => id.length > 0)
    );
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

        const notBanned = this.connected.filter(
          (s) => !this.bannedSessionIds.has(s.id)
        );
        if (notBanned.length === 0) {
          this.log("error", "All sessions are banned/forbidden in group");
          return this.result();
        }

        const now = Date.now();
        const eligible = notBanned.filter((s) => {
          const cd = this.cooldownUntil.get(s.id);
          return !cd || cd <= now;
        });

        if (eligible.length === 0) {
          // Every non-banned session is FLOOD_WAIT-cooling. Sleep until the
          // earliest one is ready (capped) so stop()/maxMessages can still fire.
          const minCooldown = Math.min(
            ...notBanned.map((s) => this.cooldownUntil.get(s.id) ?? 0)
          );
          const waitMs = Math.max(1000, minCooldown - now);
          const sleepMs = Math.min(waitMs, ALL_COOLING_MAX_SLEEP_MS);
          this.log(
            "warn",
            `All ${notBanned.length} session(s) cooling down (FLOOD_WAIT); sleeping ${Math.ceil(sleepMs / 1000)}s before retry`
          );
          await sleep(sleepMs);
          continue;
        }

        const session = eligible[this.sentCount % eligible.length];
        const persona = this.personaPerSession.get(session.id)!;
        const action = pickAction(this.config.sendPct, this.config.replyPct);

        try {
          await this.executeTurn(session, persona, action, entity, topicId);
        } catch (err) {
          if (err instanceof FloodWaitTooLongError) {
            const cooldownMs = err.waitSeconds * 1000;
            this.cooldownUntil.set(session.id, Date.now() + cooldownMs);
            const mins = Math.ceil(err.waitSeconds / 60);
            this.log(
              "warn",
              `${session.name} hit FLOOD_WAIT ${err.waitSeconds}s; cooling down ~${mins}m, rotating to remaining sessions`
            );
          } else {
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
    originalAction: "send" | "reply" | "react",
    entity: string,
    topicId: number | null
  ): Promise<void> {
    const client = session.client;

    // Always fetch recent first — used for stranger detection, react targets,
    // reply targets, and history context.
    const fetchLimit = Math.max(this.config.contextSize, 20);
    const recent = await this.floodWait(
      () => client.getMessages(entity, { limit: fetchLimit }),
      `${session.name} getMessages`
    );
    const recentMsgs = recent.filter(
      (m): m is Api.Message => m instanceof Api.Message
    );

    // Stranger priority: if toggle is on and an unanswered stranger spoke,
    // override action to "reply" and pin the target.
    let action = originalAction;
    let strangerTarget: Api.Message | null = null;
    if (this.config.priorityReplyStrangers) {
      strangerTarget = this.findUnansweredStranger(recentMsgs);
      if (strangerTarget) {
        action = "reply";
        this.log(
          "info",
          `Stranger msg#${strangerTarget.id} unanswered — prioritizing reply`
        );
      }
    }

    // React doesn't need LLM
    if (action === "react") {
      if (recentMsgs.length === 0) return;
      const target =
        recentMsgs[Math.floor(Math.random() * recentMsgs.length)];
      const emoji = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
      const peer = await this.floodWait(
        () => client.getInputEntity(entity),
        `${session.name} getInputEntity`
      );
      if (this.config.dryRun) {
        this.log(
          "info",
          `[DRY] ${session.name} would react ${emoji} to msg#${target.id}`
        );
        return;
      }
      await this.floodWait(
        () =>
          client.invoke(
            new Api.messages.SendReaction({
              peer,
              msgId: target.id,
              reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
            })
          ),
        `${session.name} sendReaction`
      );
      this.log("success", `${session.name} reacted ${emoji} (#${target.id})`);
      return;
    }

    // Build history for LLM (chronological, oldest first)
    const historyMsgs = recentMsgs
      .filter((m) => m.message)
      .slice(0, this.config.contextSize)
      .reverse();
    const history = historyMsgs.map((m) => {
      const senderId = getSenderUserId(m);
      const isOwn = senderId && this.ownUserIds.has(senderId);
      const tag = isOwn
        ? "self"
        : senderId
        ? `user_${senderId.slice(-4)}`
        : "user";
      return `[${tag}]: ${m.message}`;
    });

    // Reply target: stranger override > most recent message > topic root
    const replyTarget: Api.Message | null =
      strangerTarget ?? (action === "reply" && recentMsgs.length > 0 ? recentMsgs[0] : null);

    const text = await this.generateReply(persona, action, history);
    if (!text) return;

    if (this.config.dryRun) {
      const tag = strangerTarget ? "[DRY][stranger]" : "[DRY]";
      this.log(
        "info",
        `${tag} ${session.name} (${persona.name}) ${action}: ${text.slice(0, 100)}`
      );
      this.sentCount++;
      if (strangerTarget) this.repliedStrangerMsgIds.add(strangerTarget.id);
      this.recordSelfOpening(text);
      return;
    }

    await this.floodWait(
      () =>
        client.sendMessage(entity, {
          message: text,
          replyTo: replyTarget?.id ?? topicId ?? undefined,
        }),
      `${session.name} sendMessage`
    );
    this.sentCount++;
    if (strangerTarget) this.repliedStrangerMsgIds.add(strangerTarget.id);
    this.recordSelfOpening(text);
    const tag = strangerTarget ? `${action}→stranger` : action;
    this.log(
      "success",
      `${session.name} (${persona.name}) ${tag}: ${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`
    );
  }

  private recordSelfOpening(text: string): void {
    const lang = this.analysis?.language ?? "en";
    const opening = extractOpening(text, lang);
    if (!opening) return;
    this.recentSelfOpenings.push(opening);
    if (this.recentSelfOpenings.length > MAX_RECENT_OPENINGS) {
      this.recentSelfOpenings.shift();
    }
  }

  private findUnansweredStranger(messages: Api.Message[]): Api.Message | null {
    if (messages.length === 0) return null;

    // messages are newest-first. Find newest stranger msg with text.
    let strangerIdx = -1;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!m.message) continue;
      const senderId = getSenderUserId(m);
      if (!senderId) continue;
      if (!this.ownUserIds.has(senderId)) {
        strangerIdx = i;
        break;
      }
    }
    if (strangerIdx === -1) return null;

    const strangerMsg = messages[strangerIdx];
    if (this.repliedStrangerMsgIds.has(strangerMsg.id)) return null;

    // Have any of our sessions spoken since? (newer = smaller index)
    for (let i = 0; i < strangerIdx; i++) {
      const senderId = getSenderUserId(messages[i]);
      if (senderId && this.ownUserIds.has(senderId)) return null;
    }

    return strangerMsg;
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

    const overused = findOverusedOpenings(this.recentSelfOpenings);
    const overusedRule =
      overused.length > 0
        ? lang === "zh"
          ? `\n- 不要再以这些词开头：${overused.join("、")}。换一个新的开头方式。`
          : `\n- DO NOT start your message with any of: ${overused.join(", ")}. Use a fresh opening.`
        : "";

    const banned = (this.config.bannedKeywords ?? []).filter((k) => k.trim().length > 0);
    const bannedRule =
      banned.length > 0
        ? lang === "zh"
          ? `\n- 严禁出现这些词（任何形式都不行）：${banned.join("、")}。`
          : `\n- NEVER include these words in any form: ${banned.join(", ")}.`
        : "";

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
      `- Vary your opening word — don't echo the same name/topic word every message just because the chat history does.${overusedRule}${bannedRule}\n` +
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
        const validated = cleanAndValidate(result.content, lang, {
          bannedKeywords: this.config.bannedKeywords,
        });
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
