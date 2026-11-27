// Integration tests inside the real Workers runtime (workerd/Miniflare) with local D1 and R2.
// The LLM is replaced by FakeLlm via FAKE_EXTERNALS=true.
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
    // Pre-bundle the heavy runtime deps once per run. Every test file gets a fresh isolate and
    // re-imports the Worker's graph; unbundled, better-auth + zod + drizzle + hono are hundreds of
    // small-module loads per file. Same change as PayApps
    // (docs/history/payapps-worker-tests-perf-2026-11-27.md); CMMC's numbers are in
    // docs/history/cmmc-worker-tests-perf-2026-11-27.md. The list is the bare entry points src/ and
    // test/ import (globs pull in node-only subpaths and fail); add one when a new subpath import
    // shows up as slow in `--experimental.importDurations.print`. node:* stays external
    // (workerd's nodejs_compat).
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            "better-auth/minimal",
            "better-auth/adapters/drizzle",
            "zod",
            "drizzle-orm",
            "drizzle-orm/sqlite-core",
            "drizzle-orm/d1",
            "hono",
            "hono/factory",
            "hono/http-exception",
            "@hono/zod-validator",
          ],
          rolldownOptions: { external: [/^node:/] },
        },
      },
    },
  },
});
