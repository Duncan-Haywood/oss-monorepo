// Sync an app's committed Paddle catalog file to Paddle, and print the BILLING_PRICE_IDS it implies.
//
//   BILLING_API_KEY=pdl_… node packages/billing/scripts/paddle-catalog.ts \
//     --catalog apps/grants/billing/paddle-catalog.json [--apply] [--price-ids-out FILE]
//
// Without --apply it only reads Paddle and prints the plan. The key comes from the environment and
// is never printed. Price ids are not secrets (every checkout page shows them), so FILE is plain JSON.
import { readFileSync, writeFileSync } from "node:fs";
import { PaddleCatalogClient, syncCatalog, validateCatalog } from "../src/paddle-catalog.ts";
import { describeKeyProbe, keyProbeOk, probePaddleKey } from "../src/paddle-key.ts";
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
const rawKey = process.env.BILLING_API_KEY ?? "";
// Say what kind of key this is and which catalog calls it may make, before touching the catalog
// (owner, 2026-11-27: "is it the right type or no?"). Prints only the key's public prefix.
const probe = await probePaddleKey(rawKey, {
  calls: apply
    ? ["list-products", "list-prices", "create-product", "create-price"]
    : ["list-products", "list-prices"],
});
for (const line of describeKeyProbe(probe)) console.log(line);
if (!probe.shape.usable || !probe.baseUrl) {
  console.error("BILLING_API_KEY cannot be used for the Paddle catalog (see above)");
  process.exit(2);
}
if (!keyProbeOk(probe)) {
  console.error("BILLING_API_KEY may not make every catalog call (see above); not syncing");
  process.exit(1);
}
const client = new PaddleCatalogClient(rawKey.trim(), { baseUrl: probe.baseUrl });
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
