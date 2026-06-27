import { llmChat, type LlmProvider } from "./llm";

/**
 * LLM 智能广告识别。配合 ai-chat 里基于关键词的 dropAdMessages 一起用：
 * 关键词表只能挡住已知措辞，新式广告靠这里的语义判定来兜住。
 *
 * 设计要点：
 * - 一次调用批量判定多条消息（省 token / 省调用次数）。
 * - llmChat 抛错（网络/限流）会**向上抛**，让调用方决定是否缓存/重试，
 *   避免把一次性故障永久缓存成「不是广告」。
 * - 能拿到响应但 JSON 解析失败时按「都不是广告」处理（不阻断发言）。
 */

export interface AdDetectLlm {
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  signal?: AbortSignal;
}

const AD_CLASSIFIER_SYSTEM =
  `You are a strict spam/advertisement classifier for a crypto Telegram group.\n` +
  `You receive a numbered list of chat messages. For EACH message decide whether it is an ` +
  `advertisement / promotion / solicitation. Treat these as ads: shilling, recruitment ` +
  `(招代理/招渠道/招聘/找老板), money-making or part-time pitches (日入/日结/兼职/上岸/包赔/稳赚/高佣), ` +
  `gambling/betting, USDT or money exchange offers (出U/兑U/代付/返水/返佣), ` +
  `contact-soliciting spam (加微信/加vx/加QQ/加电报/私聊我/加我), referral/affiliate or ` +
  `external promo links, and obvious scams.\n` +
  `Normal chatter, opinions, questions, jokes, price/market talk, and project discussion are NOT ads.\n` +
  `Return ONLY a JSON object: {"ads":[<1-based indices of messages that ARE ads>]}. ` +
  `If none are ads, return {"ads":[]}. Do not add any other text.`;

/**
 * 返回与 texts 等长的 boolean[]，true = 该条是广告。
 * @throws 当底层 LLM 调用失败时抛出（调用方应据此决定不缓存、下轮重试）。
 */
export async function detectAds(
  texts: string[],
  llm: AdDetectLlm
): Promise<boolean[]> {
  const verdict = new Array<boolean>(texts.length).fill(false);

  // 只判定非空文本，记下它们在原数组里的位置
  const nonEmpty = texts
    .map((t, i) => ({ text: t.trim(), origIdx: i }))
    .filter((x) => x.text.length > 0);
  if (nonEmpty.length === 0) return verdict;

  const numbered = nonEmpty
    .map((x, idx) => `${idx + 1}. ${x.text.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");

  const result = await llmChat({
    provider: llm.provider,
    apiKey: llm.apiKey,
    baseUrl: llm.baseUrl,
    model: llm.model,
    system: AD_CLASSIFIER_SYSTEM,
    messages: [{ role: "user", content: numbered }],
    temperature: 0,
    maxTokens: 160,
    responseFormat: "json",
    signal: llm.signal,
  });

  for (const oneBased of parseAdIndices(result.content, nonEmpty.length)) {
    verdict[nonEmpty[oneBased - 1].origIdx] = true;
  }
  return verdict;
}

/** 健壮解析 {"ads":[...]}：容忍代码块/多余文字；任何异常返回 []。 */
function parseAdIndices(content: string, max: number): number[] {
  if (!content) return [];
  try {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    const slice = start >= 0 && end > start ? content.slice(start, end + 1) : content;
    const parsed = JSON.parse(slice) as { ads?: unknown };
    if (!Array.isArray(parsed.ads)) return [];
    return parsed.ads
      .map((n) => (typeof n === "number" ? n : parseInt(String(n), 10)))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= max);
  } catch {
    return [];
  }
}
