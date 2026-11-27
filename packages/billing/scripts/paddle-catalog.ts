// Sync an app's committed Paddle catalog file to Paddle, and print the BILLING_PRICE_IDS it implies.
//
//   BILLING_API_KEY=pdl_… node packages/billing/scripts/paddle-catalog.ts \
//     --catalog apps/grants/billing/paddle-catalog.json [--apply] [--price-ids-out FILE]
//
// Without --apply it only reads Paddle and prints the plan. The key comes from the environment and
// is never printed. Price ids are not secrets (every checkout page shows them), so FILE is plain JSON.
import { readFileSync, writeFileSync } from "node:fs";
import { PaddleCatalogClient, syncCatalog, validateCatalog } from "../src/paddle-catalog.ts";
import { missingPriceIds } from "../src/price-keys.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const catalogPath = arg("--catalog");
const apply = process.argv.includes("--apply");
const out = arg("--price-ids-out");
if (!catalogPath) {
  console.error("usage: paddle-catalog.ts --catalog FILE [--apply] [--price-ids-out FILE]");
  process.exit(2);
}
const catalog = validateCatalog(JSON.parse(readFileSync(catalogPath, "utf8")));
const key = process.env.BILLING_API_KEY ?? "";
if (!/^pdl_(live|sdbx)_/.test(key)) {
  console.error("BILLING_API_KEY is missing or not a Paddle Billing key (pdl_live_… / pdl_sdbx_…)");
  process.exit(2);
}
const client = new PaddleCatalogClient(key);
console.log(
  `${catalog.app}: ${client.sandbox ? "sandbox" : "live"} Paddle account, ${apply ? "applying" : "plan only"}`,
);

const result = await syncCatalog(client, catalog, { apply, log: (l) => console.log(`  ${l}`) });
if (result.applied.length === 0) console.log("  catalog already matches Paddle");
else if (!apply)
  console.log(
    `  ${result.applied.length} change(s) planned; run with --apply (a missing product's prices are planned after it exists)`,
  );

const missing = missingPriceIds(
  result.priceIds,
  catalog.plans.map((p) => ({ key: p.key, annualPriceCents: p.annualCents })),
);
console.log(
  `price ids: ${Object.keys(result.priceIds).length} found${missing.length ? `, missing ${missing.join(", ")}` : ""}`,
);
if (out) writeFileSync(out, JSON.stringify(result.priceIds));
if (apply && missing.length) {
  console.error("after apply, price ids are still missing; check the Paddle account");
  process.exit(1);
}
