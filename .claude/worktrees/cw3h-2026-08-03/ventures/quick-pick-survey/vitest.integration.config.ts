import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

/**
 * The integration suite: real route handlers against a real Postgres.
 *
 * Kept as a second project rather than folded into `vitest.config.ts` so that
 * `npm test` stays a pure-logic run that needs nothing installed. See
 * docs/TESTING.md and docs/decisions/0008.
 *
 * Files run one at a time: they share one database, and the interesting
 * assertions are about rows, so parallel files would see each other's writes.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["src/test/integration/globalSetup.ts"],
    setupFiles: ["src/test/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
