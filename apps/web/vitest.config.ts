import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // The app's tsconfig leaves JSX for Next to transform; nothing does that here.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      // next/image resolves its loader against build-time config that no unit
      // test has, and rejects the CDN hosts outright without it.
      "next/image": fileURLToPath(new URL("./test/next-image.tsx", import.meta.url)),
    },
  },
  test: {
    environment: "./test/jsdom-native-abort.ts",
    setupFiles: ["./test/setup.ts"],
    env: { NEXT_PUBLIC_API_URL: "http://api.test" },
    include: ["{app,components,hooks,lib}/**/*.test.{ts,tsx}"],
    exclude: ["lib/api/**", "node_modules/**", ".next/**"],
  },
});
