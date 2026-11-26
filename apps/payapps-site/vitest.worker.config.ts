// Integration tests inside workerd (Miniflare) with a real local D1; email is a fake sender.
import { readdirSync, readFileSync } from "node:fs";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { alias } from "./aliases.ts";

/** Every migration, in order, applied fresh in each test file's setup. */
function migrationsSql(): string {
  const dir = new URL("./migrations/", import.meta.url);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(new URL(f, dir), "utf8"))
    .join("\n");
}

export default defineConfig({
  resolve: { alias },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
      remoteBindings: false,
      miniflare: {
        bindings: {
          TEST_SCHEMA_SQL: migrationsSql(),
          // Owner-console token for test/worker/admin.test.ts (test-only value).
          ADMIN_SERVICE_TOKEN: "test-admin-service-token-0123456789abcdef",
          ADMIN_METRICS_TOKEN: "test-admin-metrics-token-0123456789abcdef",
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
