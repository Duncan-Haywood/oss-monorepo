import assert from "node:assert/strict";
import { test } from "node:test";
import { importSaleEventsFromCsv } from "../importer.js";

const SAMPLE_CSV =
  "receipt_id,closed_at,sku,quantity,unit_price_cents\n" +
  "RCP-1,2026-08-19T10:00:00Z,LEATHER-BAG-01,1,28500\n";

test("importSaleEventsFromCsv assigns a stable event_id for the same receipt", () => {
  const first = importSaleEventsFromCsv(SAMPLE_CSV, "pilot-leather-01");
  const second = importSaleEventsFromCsv(SAMPLE_CSV, "pilot-leather-01");

  assert.equal(first.events.length, 1);
  assert.equal(second.events.length, 1);
  assert.equal(
    first.events[0].event_id,
    second.events[0].event_id,
    "re-importing the same CSV export must produce the same event_id, or a re-synced " +
      "inbox double-counts the sale instead of the INSERT OR REPLACE upsert deduping it",
  );
});

test("importSaleEventsFromCsv gives different receipts different event_ids", () => {
  const csv =
    "receipt_id,closed_at,sku,quantity,unit_price_cents\n" +
    "RCP-1,2026-08-19T10:00:00Z,LEATHER-BAG-01,1,28500\n" +
    "RCP-2,2026-08-19T10:05:00Z,LEATHER-BAG-01,1,28500\n";

  const { events } = importSaleEventsFromCsv(csv, "pilot-leather-01");
  assert.equal(events.length, 2);
  assert.notEqual(events[0].event_id, events[1].event_id);
});

test("importSaleEventsFromCsv gives the same receipt id a different event_id per store", () => {
  const a = importSaleEventsFromCsv(SAMPLE_CSV, "store-a");
  const b = importSaleEventsFromCsv(SAMPLE_CSV, "store-b");

  assert.notEqual(a.events[0].event_id, b.events[0].event_id);
});

test("importSaleEventsFromCsv keeps receipts from different stores separate within one aggregated CSV", () => {
  // Receipt/transaction numbers are commonly per-store sequential counters, so an
  // aggregated multi-store export can legitimately have the same receipt_id recur
  // across stores. Grouping on receipt_id alone would merge these into one basket,
  // dropping store-b's sale and inflating store-a's total with it.
  const csv =
    "receipt_id,closed_at,sku,quantity,unit_price_cents,store_id\n" +
    "RCP-1,2026-08-19T10:00:00Z,LEATHER-BAG-01,1,10000,store-a\n" +
    "RCP-1,2026-08-19T10:05:00Z,LEATHER-BELT-02,1,5000,store-b\n";

  const { events, issues } = importSaleEventsFromCsv(csv, "pilot-leather-01");

  assert.deepEqual(issues, []);
  assert.equal(events.length, 2, "each store's RCP-1 must become its own SaleEvent");

  const byStore = new Map(events.map((event) => [event.store_id, event]));
  const storeA = byStore.get("store-a");
  const storeB = byStore.get("store-b");

  assert.ok(storeA, "store-a's sale must not be dropped");
  assert.ok(storeB, "store-b's sale must not be dropped");
  assert.equal(storeA.line_items.length, 1);
  assert.equal(storeA.total_cents, 10000, "store-a's total must not include store-b's line item");
  assert.equal(storeB.line_items.length, 1);
  assert.equal(storeB.total_cents, 5000, "store-b's total must not include store-a's line item");
  assert.notEqual(storeA.event_id, storeB.event_id);
});
