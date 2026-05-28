import { z } from "zod";
import { llmChat, type LlmCallOpts } from "./llm";

export interface Persona {
  name: string;
  traits: string;
  samplePhrases: string[];
}

export interface PersonaAnalysis {
  language: "zh" | "en";
  personas: Persona[];
}

const PersonaSchema = z.object({
  name: z.string().min(1).max(40),
  traits: z.string().min(1).max(400),
  samplePhrases: z.array(z.string().min(1)).min(1).max(8),
});

const PersonaAnalysisSchema = z.object({
  language: z.enum(["zh", "en"]),
  personas: z.array(PersonaSchema).min(1).max(8),
});

const SAMPLE_LIMIT = 120;
const MAX_TEXT_LEN = 280;

interface CsvParseResult {
  texts: string[];
}

function parseCsvText(csvContent: string): CsvParseResult {
  const lines = csvContent.split("\n");
  if (lines.length < 2) return { texts: [] };

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const textIdx = header.indexOf("text");
  if (textIdx === -1) return { texts: [] };

  const texts: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const t = (fields[textIdx] ?? "").trim();
    if (!t) continue;
    texts.push(t.length > MAX_TEXT_LEN ? t.slice(0, MAX_TEXT_LEN) + "..." : t);
  }
  return { texts };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function shuffleAndSample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function buildPersonaPrompt(samples: string[]): { system: string; user: string } {
  const system =
    "You analyze chat-group transcripts to extract stylistic archetypes for AI roleplay.\n" +
    "Return ONLY valid JSON matching the given schema. No prose, no markdown fences.";

  const user =
    `Below are ${samples.length} sampled messages from a chat group. Detect the dominant ` +
    `language ("zh" if Chinese is dominant, otherwise "en") and extract 3-5 distinct ` +
    `stylistic personas that capture how different members talk. Each persona is a STYLE ` +
    `ARCHETYPE, not a real person.\n\n` +
    `For each persona provide:\n` +
    `- name: short label (in detected language, max 12 chars)\n` +
    `- traits: ONE sentence on tone, length, punctuation, emoji habits, vocabulary\n` +
    `- samplePhrases: 4-6 example phrases consistent with that style, drawn or adapted from the transcript\n\n` +
    `Schema: {"language":"zh"|"en","personas":[{"name":"","traits":"","samplePhrases":[]}]}\n\n` +
    `Transcript:\n` +
    samples.map((s) => `- ${s}`).join("\n");

  return { system, user };
}

function genericFallback(language: "zh" | "en"): PersonaAnalysis {
  if (language === "zh") {
    return {
      language: "zh",
      personas: [
        {
          name: "话痨",
          traits: "活泼健谈，爱用 emoji 和语气词，消息较短但频繁",
          samplePhrases: ["哈哈哈", "对啊对啊", "牛啊", "真的假的", "我去"],
        },
        {
          name: "理性派",
          traits: "简洁理性，偶尔分享观点，少用 emoji",
          samplePhrases: ["我觉得不一定", "看情况吧", "嗯", "有道理", "可以一试"],
        },
      ],
    };
  }
  return {
    language: "en",
    personas: [
      {
        name: "Chatty",
        traits: "Friendly, energetic, uses emojis and short messages frequently",
        samplePhrases: ["lol", "for real", "noice", "bruh", "haha yeah"],
      },
      {
        name: "Analytical",
        traits: "Concise, thoughtful, rarely uses emojis",
        samplePhrases: ["interesting", "depends", "fair point", "hmm", "good call"],
      },
    ],
  };
}

function detectLanguageHeuristic(texts: string[]): "zh" | "en" {
  let zhChars = 0;
  let total = 0;
  for (const t of texts) {
    for (const ch of t) {
      total++;
      if (/[一-鿿]/.test(ch)) zhChars++;
    }
  }
  if (total === 0) return "en";
  return zhChars / total > 0.2 ? "zh" : "en";
}

function tryParseJson(content: string): unknown {
  const trimmed = content.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function analyzePersonas(
  csvContent: string,
  llmOpts: Omit<LlmCallOpts, "system" | "messages" | "responseFormat">
): Promise<PersonaAnalysis> {
  const { texts } = parseCsvText(csvContent);

  if (texts.length === 0) {
    throw new Error("CSV has no message rows to analyze");
  }

  const heuristicLang = detectLanguageHeuristic(texts);

  if (texts.length < 5) {
    return genericFallback(heuristicLang);
  }

  const samples = shuffleAndSample(texts, SAMPLE_LIMIT);
  const { system, user } = buildPersonaPrompt(samples);

  const callLlm = (responseFormat: "text" | "json") =>
    llmChat({
      ...llmOpts,
      system,
      messages: [{ role: "user", content: user }],
      responseFormat,
      temperature: 0.2,
      maxTokens: 1500,
    });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const supportsJson =
        llmOpts.provider === "GROQ_DEFAULT" ||
        llmOpts.provider === "GROQ_BYOK" ||
        llmOpts.provider === "OPENAI_BYOK";
      const result = await callLlm(supportsJson ? "json" : "text");
      const parsed = tryParseJson(result.content);
      if (!parsed) continue;
      const validated = PersonaAnalysisSchema.safeParse(parsed);
      if (!validated.success) continue;
      return validated.data;
    } catch (err) {
      if (attempt === 1) {
        console.error("[analyzePersonas] LLM error after retry:", err);
        return genericFallback(heuristicLang);
      }
    }
  }

  return genericFallback(heuristicLang);
}
