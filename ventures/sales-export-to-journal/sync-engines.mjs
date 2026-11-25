#!/usr/bin/env node
// The hub's readers are copies of the single-platform tools' calc.mjs. Copies drift: by 2026-11-25
// four had (Square booked cash and gift-card tenders into the card deposit, Gumroad could not read
// Gumroad's real exports, AdSense read an unquoted "1,842.17" as $1.00, Upwork's formula guard).
// The single-platform tool is the source of truth; this copies every source over its engine.
//
//   node ventures/sales-export-to-journal/sync-engines.mjs          copy sources -> engines
//   node ventures/sales-export-to-journal/sync-engines.mjs --check  exit 1 if any engine differs
//
// engines.test.mjs runs the --check comparison with the venture tests, so a fix to one tool that
// is not copied here fails CI instead of quietly leaving the hub behind.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SOURCES = {
  adsense: "youtube-adsense-payout-to-journal",
  airbnb: "airbnb-payout-to-journal",
  amazon: "amazon-settlement-to-journal",
  distrokid: "distrokid-royalty-to-journal",
  ebay: "ebay-payout-to-journal",
  etsy: "etsy-statement-to-journal",
  fiverr: "fiverr-earnings-to-journal",
  gumroad: "gumroad-sales-to-journal",
  kdp: "kdp-royalty-to-journal",
  kofi: "ko-fi-payout-to-journal",
  paddle: "paddle-payout-to-journal",
  patreon: "patreon-payout-to-journal",
  paypal: "paypal-activity-to-journal",
  shopify: "shopify-payout-to-journal",
  square: "square-sales-to-journal",
  stripe: "stripe-payout-to-journal",
  upwork: "upwork-earnings-to-journal",
};

const here = new URL("./", import.meta.url);
export const enginePath = (id) => new URL(`engines/${id}.mjs`, here);
export const sourcePath = (id) => new URL(`../${SOURCES[id]}/calc.mjs`, here);

// [{ id, source, state: "same" | "differs" | "no-source" }]
export function compare() {
  return Object.keys(SOURCES).map((id) => {
    const src = sourcePath(id);
    if (!existsSync(src)) return { id, source: SOURCES[id], state: "no-source" };
    const same = readFileSync(src, "utf8") === readFileSync(enginePath(id), "utf8");
    return { id, source: SOURCES[id], state: same ? "same" : "differs" };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const rows = compare();
  let bad = 0;
  for (const r of rows) {
    if (r.state === "differs" && !check) { writeFileSync(enginePath(r.id), readFileSync(sourcePath(r.id))); console.log(`copied  ${r.source}/calc.mjs -> engines/${r.id}.mjs`); continue; }
    if (r.state !== "same") bad++;
    console.log(`${r.state.padEnd(9)} engines/${r.id}.mjs  (${r.source})`);
  }
  if (check && bad) { console.error(`${bad} engine(s) out of step; run without --check to copy.`); process.exit(1); }
}
