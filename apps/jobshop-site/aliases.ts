// Path aliases shared by tsconfig.json (paths), vitest configs and scripts/build.ts (via tsx, which
// reads tsconfig paths).
import { fileURLToPath } from "node:url";

export const alias = {
  "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
  "@site": fileURLToPath(new URL("./src/site", import.meta.url)),
  "@worker": fileURLToPath(new URL("./src/worker", import.meta.url)),
  // The platform-admin contract (packages/admin-metrics), consumed as source.
  "@admin-metrics": fileURLToPath(
    new URL("../../packages/admin-metrics/src/index.ts", import.meta.url),
  ),
};
