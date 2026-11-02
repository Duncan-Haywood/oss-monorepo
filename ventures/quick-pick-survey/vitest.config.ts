import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // `*.integration.test.ts` matches the include pattern but needs a running
    // Postgres, and this suite's whole point is that it needs nothing. It runs
    // via `npm run test:integration` — see vitest.integration.config.ts.
    exclude: [
      "**/node_modules/**",
      "**/*.integration.test.ts",
      // Measurement experiments that take minutes each (one 500-item case
      // measured 165 s on 2026-11-02, the whole suite 8m20s locally). They run
      // via `npm run test:slow`, which CI does on main and on PRs that touch
      // src/lib. docs/history/ci-perf-2026-11-02-quick-pick-slow-sims.md.
      ...(process.env.QPS_SLOW ? [] : ["**/poolCap.simulation.test.ts"]),
    ],
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
