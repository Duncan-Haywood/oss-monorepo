import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 120_000,
    pool: "forks",
    coverage: {
      provider: "v8",
      reportsDirectory: process.env.COVERAGE_LCOV_DESTINATION_DIR || "./coverage",
      reporter: ["text", "lcov", "json"],
      clean: true,
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

