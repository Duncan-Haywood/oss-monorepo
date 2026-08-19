import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { SaleEvent } from "@retail-pilot/schemas";
import { importSaleEventsFromCsv } from "./importer.js";

const storeId = process.env.STORE_ID ?? "pilot-leather-01";
const sample = process.argv.includes("--sample");
const outDir = resolve("data/pos/inbox");

const fileFlagIndex = process.argv.indexOf("--file");
if (fileFlagIndex !== -1) {
  const filePath = process.argv[fileFlagIndex + 1];
  if (!filePath) {
    console.error("POS ingest: --file requires a path, e.g. --file export.csv");
    process.exit(1);
  }

  const csvText = readFileSync(resolve(filePath), "utf8");
  const { events, issues } = importSaleEventsFromCsv(csvText, storeId);

  for (const issue of issues) {
    console.warn(`POS ingest: skipped row ${issue.rowNumber}: ${issue.reason}`);
  }

  mkdirSync(outDir, { recursive: true });
  for (const event of events) {
    const path = resolve(outDir, `sale_${event.event_id}.json`);
    writeFileSync(path, JSON.stringify(event, null, 2));
  }

  console.log(
    `Wrote ${events.length} sale event(s) from ${filePath} (${issues.length} row(s) skipped) to ${outDir}`,
  );
  process.exit(0);
}

if (!sample) {
  console.error("POS ingest: use --sample, --file <path>, or drop JSON in data/pos/inbox");
  process.exit(0);
}

const event: SaleEvent = {
  event_id: randomUUID(),
  store_id: storeId,
  basket_id: `B-${randomUUID().slice(0, 8)}`,
  closed_at: new Date().toISOString(),
  currency: "EUR",
  line_items: [
    {
      sku: "LEATHER-BAG-01",
      quantity: 1,
      unit_price_cents: 28500,
      description: "Hand-stitched shoulder bag",
    },
  ],
  total_cents: 28500,
  payment_class: "card",
  pos_vendor: "stub",
  raw_reference: "RCP-0001",
};

mkdirSync(outDir, { recursive: true });
const path = resolve(outDir, `sale_${event.event_id}.json`);
writeFileSync(path, JSON.stringify(event, null, 2));
console.log(`Wrote sample sale: ${path}`);
