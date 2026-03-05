import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["telegram", "socket.io"],
  output: "standalone",
};

export default nextConfig;
