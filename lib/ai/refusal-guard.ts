const REFUSAL_PATTERNS_EN = [
  /\bas an? (ai|language model|assistant)\b/i,
  /\bi(?:'?m| am) (?:an? )?(?:ai|language model|assistant)\b/i,
  /\bi cannot (?:help|assist|comply|provide)\b/i,
  /\bi(?:'?m| am) (?:not able|unable) to\b/i,
  /\bsorry,? (?:but )?i (?:can'?t|cannot)\b/i,
  /\bi(?:'?m| am) here to (?:help|assist)\b/i,
];

const REFUSAL_PATTERNS_ZH = [
  /作为一个(?:人工智能|AI|语言模型|助手)/,
  /我是(?:一个)?(?:AI|人工智能|语言模型|助手)/,
  /我无法(?:帮助|协助|提供|完成)/,
  /抱歉[，,]?\s*我(?:不能|无法)/,
  /很抱歉[，,]?\s*我(?:不能|无法)/,
];

export interface CleanResult {
  ok: boolean;
  reason?: string;
  cleaned: string;
}

export interface CleanOpts {
  bannedKeywords?: string[];
}

function findBannedHit(text: string, banned?: string[]): string | null {
  if (!banned || banned.length === 0) return null;
  const lower = text.toLowerCase();
  for (const raw of banned) {
    const k = raw.trim();
    if (!k) continue;
    if (lower.includes(k.toLowerCase())) return k;
  }
  return null;
}

function stripMarkdown(text: string): string {
  let out = text.trim();
  out = out.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```\s*$/, "");
  out = out.replace(/^>\s+/gm, "");
  out = out.replace(/\*\*(.+?)\*\*/g, "$1");
  out = out.replace(/__(.+?)__/g, "$1");
  out = out.replace(/(?<!\\)\*([^*\n]+)\*/g, "$1");
  out = out.replace(/(?<!\\)_([^_\n]+)_/g, "$1");
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/^[-*]\s+/gm, "");
  out = out.replace(/\[(.+?)\]\(.+?\)/g, "$1");
  return out.trim();
}

function stripQuotedPreamble(text: string): string {
  const trimmed = text.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("「") && trimmed.endsWith("」")) ||
    (trimmed.startsWith("“") && trimmed.endsWith("”"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function asciiRatio(text: string): number {
  if (!text) return 0;
  let ascii = 0;
  let total = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) ascii++;
    total++;
  }
  return total === 0 ? 0 : ascii / total;
}

function chineseCharRatio(text: string): number {
  if (!text) return 0;
  let zh = 0;
  let total = 0;
  for (const ch of text) {
    total++;
    if (/[一-鿿]/.test(ch)) zh++;
  }
  return total === 0 ? 0 : zh / total;
}

function isRefusal(text: string, language: "zh" | "en"): boolean {
  const patterns = language === "zh" ? REFUSAL_PATTERNS_ZH : REFUSAL_PATTERNS_EN;
  for (const p of patterns) {
    if (p.test(text)) return true;
  }
  for (const p of language === "zh" ? REFUSAL_PATTERNS_EN : REFUSAL_PATTERNS_ZH) {
    if (p.test(text)) return true;
  }
  return false;
}

export function cleanAndValidate(
  rawContent: string,
  language: "zh" | "en",
  opts: CleanOpts = {}
): CleanResult {
  if (!rawContent) {
    return { ok: false, reason: "empty content", cleaned: "" };
  }

  let cleaned = stripMarkdown(rawContent);
  cleaned = stripQuotedPreamble(cleaned);

  if (cleaned.length < 1) {
    return { ok: false, reason: "empty after cleaning", cleaned };
  }

  // Drop multi-line into a single line — chat messages should be one line.
  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    cleaned = lines[0];
  }

  // Hard length caps per language. Chat messages should be short — if the
  // model ignored the prompt and wrote an essay, take only the first sentence.
  const maxLen = language === "zh" ? 60 : 200;
  if (cleaned.length > maxLen) {
    const sentenceEnd =
      language === "zh"
        ? cleaned.search(/[。！？\?]/)
        : cleaned.search(/[.!?]\s/);
    if (sentenceEnd > 0 && sentenceEnd < maxLen) {
      cleaned = cleaned.slice(0, sentenceEnd + 1);
    } else {
      cleaned = cleaned.slice(0, maxLen);
    }
  }

  if (isRefusal(cleaned, language)) {
    return { ok: false, reason: "refusal pattern detected", cleaned };
  }

  if (language === "zh") {
    const zhRatio = chineseCharRatio(cleaned);
    if (zhRatio < 0.2 && asciiRatio(cleaned) > 0.7) {
      return { ok: false, reason: "language mismatch (expected zh)", cleaned };
    }
  }

  const bannedHit = findBannedHit(cleaned, opts.bannedKeywords);
  if (bannedHit) {
    return { ok: false, reason: `banned keyword: ${bannedHit}`, cleaned };
  }

  return { ok: true, cleaned };
}
