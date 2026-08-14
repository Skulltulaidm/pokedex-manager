import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces the dependency graph into a self-contained bundle, so the runtime
  // image carries no node_modules.
  output: "standalone",
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
