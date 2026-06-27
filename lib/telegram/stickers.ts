import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import bigInt from "big-integer";

/**
 * 解析一批可发送的 Telegram 贴纸 document（无需外部 API / 不用猜贴纸包短名）。
 * 取 Telegram 当前的 featured（精选/热门）贴纸：先收每个集合的封面 document，
 * 再展开前几个集合的全部贴纸增加多样性。document 自带 fileReference，可直接
 * 通过 `client.sendMessage(entity, { file: document })` 发出去（FileLike 接受 TypeDocument）。
 *
 * best-effort：任何一步失败就跳过，最终返回能拿到的去重 document 列表（可能为空）。
 */
export async function resolveStickers(
  client: TelegramClient,
  maxExpand = 6
): Promise<Api.Document[]> {
  const docs: Api.Document[] = [];

  let featured: Api.messages.TypeFeaturedStickers;
  try {
    featured = await client.invoke(
      new Api.messages.GetFeaturedStickers({ hash: bigInt(0) })
    );
  } catch {
    return docs;
  }
  if (!(featured instanceof Api.messages.FeaturedStickers)) return docs;

  const sets = featured.sets;
  const pushDoc = (d: Api.TypeDocument) => {
    if (d instanceof Api.Document) docs.push(d);
  };

  // 1) 封面（每个集合至少 1 张，最稳）
  for (const s of sets) {
    if (s instanceof Api.StickerSetFullCovered) s.documents.forEach(pushDoc);
    else if (s instanceof Api.StickerSetCovered) pushDoc(s.cover);
    else if (s instanceof Api.StickerSetMultiCovered) s.covers.forEach(pushDoc);
  }

  // 2) 展开前几个集合的全部贴纸，增加多样性
  for (const s of sets.slice(0, maxExpand)) {
    const set = s.set;
    try {
      const full = await client.invoke(
        new Api.messages.GetStickerSet({
          stickerset: new Api.InputStickerSetID({
            id: set.id,
            accessHash: set.accessHash,
          }),
          hash: 0,
        })
      );
      if (full instanceof Api.messages.StickerSet) full.documents.forEach(pushDoc);
    } catch {
      // 跳过这个集合
    }
  }

  // 去重（按 document id）
  const seen = new Set<string>();
  return docs.filter((d) => {
    const k = d.id.toString();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 从已解析的贴纸里随机挑一个。空列表返回 null。 */
export function pickRandomSticker(docs: Api.Document[]): Api.Document | null {
  if (docs.length === 0) return null;
  return docs[Math.floor(Math.random() * docs.length)];
}
