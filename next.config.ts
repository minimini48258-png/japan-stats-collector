import type { NextConfig } from "next";

// shiso-lab-site（chips.jp）の /tools/stats-collector/ 配下に組み込むため、
// 本番ビルド時だけ BASE_PATH=/tools/stats-collector を指定する
// （`npm run build:embed` 参照）。ローカル開発時はルート("/")のままにする。
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  basePath,
};

export default nextConfig;
