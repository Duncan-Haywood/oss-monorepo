// Integration tests inside the real Workers runtime (workerd/Miniflare) with a local D1.
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
    // One isolate per Vitest worker, reused across its test files, instead of a fresh isolate per
    // file. Each fresh isolate re-imported the Worker's ~300-module graph on its first request
    // (~1.7 s per file, 88 files): cold suite 156 s -> 30 s on 4 cores, same 559 tests
    // (docs/history/payapps-worker-tests-perf-2026-11-27.md, "Second pass"). What this asks of a
    // test file: the D1 database and module singletons (testFakes) are shared with the files that
    // ran before it in that worker, so scope reads to rows the file created (its own org, user or
    // job ids) and never assert a global count or an empty table. Files may run in any order:
    // `--sequence.shuffle.files` must pass too.
    isolate: false,
    // Pre-bundle the heavy runtime deps once per run. Every test file gets a fresh isolate and
    // re-imports the Worker's graph; unbundled, better-auth + zod + drizzle + hono are ~3 s of
    // small-module loads per file (87 files). Bundled: suite 193-195 s -> 99-121 s on 4 cores,
    // same 552 tests (docs/history/payapps-worker-tests-perf-2026-11-27.md). The list is the bare entry
    // points src/ and test/ import; add one here when a new subpath import shows up as slow in
    // `--experimental.importDurations.print`. node:* stays external (workerd's nodejs_compat).
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
          ],
          rolldownOptions: { external: [/^node:/] },
        },
      },
    },
  },
});
