import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is branded per host at request time, so pages are dynamic.
  // Cache Components stays off until there is something worth caching.
  poweredByHeader: false,
  // A self-contained server (node server.js) for the VPS, as hospio-frontend deploys.
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
