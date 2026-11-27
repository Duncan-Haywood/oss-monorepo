// Integration tests inside the real Workers runtime (workerd/Miniflare) with local D1 and R2.
// External services (Anthropic, Workers AI, CAD geometry) are fakes via FAKE_EXTERNALS=true.
import { execFileSync } from "node:child_process";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { alias } from "./aliases.ts";

/** Full DDL for the current Drizzle schema, applied fresh in every test file's setup. */
function exportSchemaSql(): string {
  return execFileSync("pnpm", ["exec", "drizzle-kit", "export", "--sql"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

export default defineConfig({
  resolve: { alias },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
      remoteBindings: false,
      miniflare: {
        bindings: {
          APP_ENV: "test",
          FAKE_EXTERNALS: "true",
          AUTH_SECRET: "test-secret-test-secret-test-secret-0123456789",
          ANTHROPIC_API_KEY: "test-key",
          TEST_SCHEMA_SQL: exportSchemaSql(),
          // Platform admin API (test/worker/admin.test.ts). Test-only values, never real addresses.
          PLATFORM_ADMIN_EMAILS: "owner-admin@example.test",
          ADMIN_SERVICE_TOKEN: "test-admin-service-token-0123456789abcdef",
          ADMIN_METRICS_TOKEN: "test-admin-metrics-token-0123456789abcdef",
          OWNER_NOTIFICATIONS: "on",
        },
      },
    }),
  ],
  test: {
    include: ["test/worker/**/*.test.ts", "src/worker/**/*.worker.test.ts"],
    setupFiles: ["./test/worker/setup.ts"],
    testTimeout: 30_000,
  },
});
