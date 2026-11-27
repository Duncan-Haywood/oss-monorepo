// Integration tests inside the Workers runtime (workerd/Miniflare) with a local D1. The migrations
// in migrations/ are applied in test/worker/setup.ts. ASSETS serves a tiny fixture directory, so the
// tests don't need a build first.
import { readdirSync, readFileSync } from "node:fs";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { alias } from "./aliases.ts";

const MIGRATIONS = new URL("./migrations/", import.meta.url);
const MIGRATION_SQL = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, MIGRATIONS), "utf8"))
  .join("\n");

export default defineConfig({
  resolve: { alias },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
      remoteBindings: false,
      miniflare: {
        bindings: {
          IP_HASH_SALT: "test-salt",
          // Owner-console token for test/worker/admin.test.ts (test-only value).
          ADMIN_SERVICE_TOKEN: "test-admin-service-token-0123456789abcdef",
          ADMIN_METRICS_TOKEN: "test-admin-metrics-token-0123456789abcdef",
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
