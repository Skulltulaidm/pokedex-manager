import { defineConfig } from "@kubb/core";
import { pluginClient } from "@kubb/plugin-client";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginReactQuery } from "@kubb/plugin-react-query";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";

export default defineConfig({
  root: ".",
  input: {
    path: process.env.OPENAPI_URL ?? "http://localhost:8010/openapi.json",
  },
  output: {
    path: "./lib/api",
    clean: true,
    // Kubb emits `.ts` in import paths, which TypeScript rejects unless
    // allowImportingTsExtensions is on; drop the extension instead.
    extension: { ".ts": "" },
  },
  plugins: [
    pluginOas({ validate: false }),
    pluginTs({ output: { path: "types" } }),
    pluginZod({ output: { path: "zod" } }),
    pluginClient({
      output: { path: "clients" },
      importPath: "@kubb/plugin-client/clients/fetch",
    }),
    pluginReactQuery({ output: { path: "hooks" } }),
  ],
});
