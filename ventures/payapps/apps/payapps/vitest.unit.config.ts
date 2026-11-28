// Fast unit tests in Node/happy-dom: pure logic (pay-app math, CSV, PDF) and React components.
import { defineConfig } from "vitest/config";
import { alias } from "./aliases.ts";

export default defineConfig({
  resolve: { alias },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/unit/**/*.test.{ts,tsx}"],
    exclude: ["src/worker/**/*.worker.test.ts", "node_modules/**"],
    environment: "node",
    setupFiles: ["./test/unit/setup.ts"],
    css: false,
    // Reuse each Vitest worker (and its environment) across test files instead of spawning one per
    // file: 164 files x ~163 ms spawn + environment set-up. Cold suite 26.8 s -> 19.1 s on 4 cores,
    // same 1,576 tests (docs/history/payapps-unit-tests-perf-2026-11-28.md). What this asks of a
    // test file: undo what it changes globally (every vi.stubGlobal has a vi.unstubAllGlobals in
    // afterEach; the setup's cleanup() unmounts React trees), and pass in any order:
    // `--sequence.shuffle.files` must pass too.
    isolate: false,
  },
});
