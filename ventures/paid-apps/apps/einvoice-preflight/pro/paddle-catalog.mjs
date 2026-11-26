// @ts-check
// The Paddle catalog as code (packages/billing "Products and prices as code"): built from plans.mjs,
// committed as billing/paddle-catalog.json, synced by the deploy with
//   BILLING_API_KEY=... node packages/billing/scripts/paddle-catalog.ts \
//     --catalog apps/einvoice-preflight/billing/paddle-catalog.json --apply --price-ids-out price-ids.json
// Regenerate after a price change: `node pro/paddle-catalog.mjs --write` (plans.test.mjs fails when stale).
// Proprietary (see ../LICENSE, part 2).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogFromPlans } from "../../../packages/billing/src/index.ts";
import { catalog } from "./plans.mjs";

export const CATALOG_FILE = new URL("../billing/paddle-catalog.json", import.meta.url);

export const buildCatalog = () =>
  catalogFromPlans({ app: "einvoice-preflight", productName: "E-invoice Fix & Explain", currency: "EUR", taxCategory: "saas" }, catalog.plans);

export const catalogJson = () => `${JSON.stringify(buildCatalog(), null, 2)}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--write")) writeFileSync(CATALOG_FILE, catalogJson());
  else process.stdout.write(catalogJson());
}
