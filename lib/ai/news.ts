import { llmChat, type LlmCallOpts } from "./llm";

export interface NewsItem {
  title: string;
  description: string;
}

// Ordered fallback list. cn.cointelegraph.com died (410); these are all live
// English crypto-news feeds. The runner passes the whole list to
// fetchCryptoNews(); it walks them in order until one returns >=1 items.
export const DEFAULT_NEWS_RSS_URLS: readonly string[] = [
  "https://cointelegraph.com/rss",
  "https://decrypt.co/feed",
  "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml",
  "https://www.theblock.co/rss.xml",
];

// Backwards-compatible single-URL export. Prefer DEFAULT_NEWS_RSS_URLS.
export const DEFAULT_NEWS_RSS = DEFAULT_NEWS_RSS_URLS[0];

// Parse RSS XML without external dependencies using regex
function parseRssItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const descMatch = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
    const title = titleMatch?.[1]?.trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") ?? "";
    const desc = descMatch?.[1]?.trim().replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") ?? "";
    if (title) items.push({ title, description: desc.slice(0, 200) });
  }
  return items;
}

async function fetchOneRss(rssUrl: string): Promise<NewsItem[]> {
  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RSSReader/1.0)" },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml).slice(0, 10);
  if (items.length === 0) throw new Error("zero items parsed");
  return items;
}

/**
 * Fetch crypto news from one URL or a fallback chain of URLs. With an array
 * we try each in order and return the first that yields >=1 items, so a single
 * dead feed (404/410/timeout/redirect-loop/etc.) doesn't kill the news
 * feature. Throws an aggregated error only when all sources fail.
 */
export async function fetchCryptoNews(
  rssUrl: string | readonly string[]
): Promise<NewsItem[]> {
  const urls = Array.isArray(rssUrl) ? rssUrl : [rssUrl as string];
  const errors: string[] = [];
  for (const url of urls) {
    try {
      return await fetchOneRss(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${url} → ${msg}`);
    }
  }
  throw new Error(`All RSS sources failed: ${errors.join(" | ")}`);
}

export async function pickHotTopic(
  items: NewsItem[],
  llmOpts: Omit<LlmCallOpts, "system" | "messages" | "maxTokens" | "responseFormat">
): Promise<string> {
  const numbered = items
    .map((item, i) => `${i + 1}. ${item.title}${item.description ? `\n   ${item.description}` : ""}`)
    .join("\n\n");

  const result = await llmChat({
    ...llmOpts,
    system: `你是一个活跃在币圈 Telegram 群的普通群友，说话随意接地气，不像机器人。
你的任务：从以下新闻里挑一条最适合在群里引起讨论的，然后把它改编成一句群友会说的话，
像真人随口提起这个话题，不要复制标题，控制在25字以内，直接输出那句话，不要加任何解释。`,
    messages: [
      {
        role: "user",
        content: `今天的币圈新闻：\n\n${numbered}\n\n挑一条，用群友语气说出来（25字以内）：`,
      },
    ],
    maxTokens: 80,
    temperature: 0.9,
  });

  return result.content.trim().replace(/^["「『]|["」』]$/g, "");
}
