import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

// Everything except the minutes-long `*.simulation.test.ts` experiments, which
// run via vitest.simulations.config.ts. `npm test` still runs both.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts", "**/*.simulation.test.ts"],
    testTimeout: 20_000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
