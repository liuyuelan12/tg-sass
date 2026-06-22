import { getCurrentBrand } from "@/lib/branding-server";
import LandingClient from "./LandingClient";

// 按访问域名（host）选择品牌后，把品牌配置透传给客户端 landing UI。
// 读取请求头 -> 动态渲染，符合本应用一贯的有状态特性。
export default async function LandingPage() {
  const brand = await getCurrentBrand();
  return <LandingClient brand={brand} />;
}
