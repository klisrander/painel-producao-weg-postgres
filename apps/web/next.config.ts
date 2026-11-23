import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  webpack(config) {
    if (process.env.WEG_DISABLE_BUILD_CACHE === "true") config.cache = false;
    return config;
  },
  output:
    process.env.WEG_BUILD_STANDALONE === "false" ? undefined : "standalone",
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  experimental: { cpus: 1 },
  transpilePackages: ["@panel/contracts", "@panel/domain"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
