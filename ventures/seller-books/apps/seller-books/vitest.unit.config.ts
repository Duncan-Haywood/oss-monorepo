// Fast unit tests in Node/happy-dom: pure logic (shared/, worker services with fakes) and React components.
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
    // Reuse each Vitest worker across test files instead of spawning one per file (41 files).
    // Cold suite 3.5 s -> 1.3 s on 4 cores, same 403 tests
    // (docs/history/payapps-unit-tests-perf-2026-11-28.md). What this asks of a test file: undo
    // what it changes globally (vi.unstubAllGlobals after vi.stubGlobal) and pass in any order:
    // `--sequence.shuffle.files` must pass too.
    isolate: false,
  },
});
