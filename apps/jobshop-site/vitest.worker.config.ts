// Integration tests inside the Workers runtime (workerd/Miniflare) with a local D1. The migrations
// in migrations/ are applied in test/worker/setup.ts. ASSETS serves a tiny fixture directory, so the
// tests don't need a build first.
import { readFileSync } from "node:fs";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { alias } from "./aliases.ts";

const MIGRATION_SQL = readFileSync(
  new URL("./migrations/0001_early_access.sql", import.meta.url),
  "utf8",
);

export default defineConfig({
  resolve: { alias },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
      remoteBindings: false,
      miniflare: {
        bindings: {
          IP_HASH_SALT: "test-salt",
          MIGRATION_SQL,
        },
      },
    }),
  ],
  test: {
    include: ["test/worker/**/*.test.ts"],
    setupFiles: ["./test/worker/setup.ts"],
    testTimeout: 30_000,
  },
});
