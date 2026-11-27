import { fileURLToPath, URL } from "node:url";

export const alias = {
  "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
  "@worker": fileURLToPath(new URL("./src/worker", import.meta.url)),
  "@client": fileURLToPath(new URL("./src/client", import.meta.url)),
  "@test": fileURLToPath(new URL("./test", import.meta.url)),
  // Shared Paddle billing (packages/billing), consumed as source: no package.json change.
  "@billing": fileURLToPath(new URL("../../packages/billing/src/index.ts", import.meta.url)),
  // The platform-admin contract (packages/admin-metrics), consumed as source the same way.
  "@admin-metrics": fileURLToPath(
    new URL("../../packages/admin-metrics/src/index.ts", import.meta.url),
  ),
  // The amount-in-words helper alone, for the browser (the index would bundle every form's text).
  // Before "@lien-waivers", which would otherwise match this prefix first.
  "@lien-waivers/words": fileURLToPath(
    new URL("../../packages/lien-waivers/src/words.ts", import.meta.url),
  ),
  // Texas lien deadlines alone (pure date math, no form text), for the browser, likewise.
  "@lien-waivers/tx-dates": fileURLToPath(
    new URL("../../packages/lien-waivers/src/tx-dates.ts", import.meta.url),
  ),
  // Lien waiver forms (packages/lien-waivers), consumed as source the same way.
  "@lien-waivers": fileURLToPath(
    new URL("../../packages/lien-waivers/src/index.ts", import.meta.url),
  ),
  // QuickBooks Online sync (packages/qbo-sync), consumed as source the same way.
  "@qbo-sync": fileURLToPath(new URL("../../packages/qbo-sync/src/index.ts", import.meta.url)),
};
