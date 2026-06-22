import "server-only";
import { headers } from "next/headers";
import { getBrandConfigFromHost, type BrandConfig } from "./branding";

/**
 * 服务端组件 / generateMetadata 里用：自动从请求头读取 host 并返回品牌配置。
 * Railway 反向代理场景优先读 x-forwarded-host。
 */
export async function getCurrentBrand(): Promise<BrandConfig> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return getBrandConfigFromHost(host);
}
