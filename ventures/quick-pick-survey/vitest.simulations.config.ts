import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

// Only the measurement experiments (`*.simulation.test.ts`). They back the
// numbers in docs/INFORMATION-GAIN-SELECTOR.md, docs/CONVERGENCE.md and
// docs/POOLING.md and take minutes, so CI can run them as a separate parallel
// job from the fast suite (`npm run test:fast`). Assertions are unchanged.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.simulation.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 3_600_000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
