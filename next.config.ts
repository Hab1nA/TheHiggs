import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * standalone output — 生成自包含的 .next/standalone/ 目录，
   * 用于 Electron 打包和 Docker 部署。
   * 不影响 npm run dev / npm run start 的行为。
   */
  output: "standalone",
};

export default nextConfig;
