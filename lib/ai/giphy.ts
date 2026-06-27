/**
 * GIPHY GIF 抓取（替代已停服的 Tenor）。
 * 免费 beta key（100 次/小时），用 random 端点按情绪 tag 随机取一个 GIF。
 * best-effort：无 key / 网络错 / 没结果一律返回 null，绝不让发媒体拖垮发言。
 */

const GIPHY_RANDOM_URL = "https://api.giphy.com/v1/gifs/random";

// 币圈群常见情绪/反应。GIPHY 主要按英文索引，用英文 tag 命中率高。
const GIF_TAGS = [
  "crypto",
  "money",
  "rocket",
  "to the moon",
  "stonks",
  "crying",
  "laughing",
  "shocked",
  "facepalm",
  "celebrate",
  "rich",
  "broke",
  "panic",
  "wow",
  "dance",
  "sad",
];

/** 取该 env 名（用户 .env 用的是 GIPHY_API，对齐 GEMINI_API 命名）。 */
export function giphyKeyFromEnv(): string {
  return (process.env.GIPHY_API ?? "").trim();
}

/** 随机抓一个 GIF 的 mp4（Telegram 里 GIF=mp4+animated）。失败返回 null。 */
export async function fetchRandomGif(
  apiKey: string,
  signal?: AbortSignal
): Promise<Buffer | null> {
  if (!apiKey) return null;
  try {
    const tag = GIF_TAGS[Math.floor(Math.random() * GIF_TAGS.length)];
    const url =
      `${GIPHY_RANDOM_URL}?api_key=${encodeURIComponent(apiKey)}` +
      `&tag=${encodeURIComponent(tag)}&rating=pg-13`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        images?: {
          original?: { mp4?: string; url?: string };
          downsized_medium?: { mp4?: string; url?: string };
        };
      };
    };
    const imgs = json.data?.images;
    const mediaUrl =
      imgs?.original?.mp4 ||
      imgs?.downsized_medium?.mp4 ||
      imgs?.original?.url;
    if (!mediaUrl) return null;

    const mediaRes = await fetch(mediaUrl, { signal });
    if (!mediaRes.ok) return null;
    const buf = Buffer.from(await mediaRes.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}
