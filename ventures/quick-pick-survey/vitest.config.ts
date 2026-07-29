import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // `*.integration.test.ts` matches the include pattern but needs a running
    // Postgres, and this suite's whole point is that it needs nothing. It runs
    // via `npm run test:integration` — see vitest.integration.config.ts.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // The simulation suites drive thousands of real answering sessions to
    // produce the numbers docs/CONVERGENCE.md, docs/POOLING.md and the
    // decision records quote. The heaviest of them ran 5.1s against vitest's
    // 5s default and failed the blocking gate on this branch — on a fast
    // machine, which means it had been failing on every slower one. The run
    // itself was made ~3x cheaper rather than papered over; this margin is so
    // that a busy machine cannot fail the suite for a reason that is not a
    // regression. A genuine blow-up still trips it.
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
