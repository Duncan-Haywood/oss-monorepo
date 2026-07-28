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
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
