import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces the dependency graph into a self-contained bundle, so the runtime
  // image carries no node_modules.
  output: "standalone",
  // The startup migration imports these, and tracing only follows what the app
  // itself renders, so they would be absent from the runtime image.
  outputFileTracingIncludes: {
    "/": ["../../node_modules/better-auth/dist/db/**", "../../node_modules/kysely/**"],
  },
  transpilePackages: ["@workspace/ui"],
  images: {
    // Card art and species sprites are served from their source CDNs rather
    // than mirrored: tens of thousands of images we would only be duplicating.
    remotePatterns: [
      { protocol: "https", hostname: "assets.tcgdex.net" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
    ],
  },
};

export default nextConfig;
