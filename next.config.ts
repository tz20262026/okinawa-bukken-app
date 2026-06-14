import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // Turbopack (Next.js 16 default) では webpack config を無視するため空設定で警告を消す
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'better-sqlite3'];
    }
    return config;
  },
};

export default nextConfig;
