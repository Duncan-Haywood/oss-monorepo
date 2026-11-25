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

test("importSaleEventsFromCsv rejects a fractional quantity instead of silently truncating it", () => {
  // parseInt("2.5", 10) === 2, so a naive integer parse would drop the row's
  // true quantity to 2 and under-report revenue with no issue reported at all.
  const csv =
    "receipt_id,closed_at,sku,quantity,unit_price_cents\n" +
    "RCP-1,2026-08-19T10:00:00Z,LEATHER-BAG-01,2.5,10000\n";

  const { events, issues } = importSaleEventsFromCsv(csv, "pilot-leather-01");

  assert.equal(events.length, 0, "a row with a fractional quantity must not become a SaleEvent");
  assert.equal(issues.length, 1);
  assert.match(issues[0].reason, /quantity must be a positive integer/);
});

test("importSaleEventsFromCsv rejects a fractional unit_price_cents instead of silently truncating it", () => {
  const csv =
    "receipt_id,closed_at,sku,quantity,unit_price_cents\n" +
    "RCP-1,2026-08-19T10:00:00Z,LEATHER-BAG-01,1,999.9\n";

  const { events, issues } = importSaleEventsFromCsv(csv, "pilot-leather-01");

  assert.equal(events.length, 0, "a row with a fractional unit_price_cents must not become a SaleEvent");
  assert.equal(issues.length, 1);
  assert.match(issues[0].reason, /unit_price_cents must be an integer number of cents/);
});

test("importSaleEventsFromCsv rejects a non-numeric quantity with trailing garbage instead of truncating it", () => {
  // parseInt("5abc", 10) === 5, another silent-corruption path a naive integer parse allows.
  const csv =
    "receipt_id,closed_at,sku,quantity,unit_price_cents\n" +
    "RCP-1,2026-08-19T10:00:00Z,LEATHER-BAG-01,5abc,10000\n";

  const { events, issues } = importSaleEventsFromCsv(csv, "pilot-leather-01");

  assert.equal(events.length, 0);
  assert.equal(issues.length, 1);
  assert.match(issues[0].reason, /quantity must be a positive integer/);
});

// Quality audit 2026-11-19 (defects 4 and 5): a rejected discount line left the
// basket stored at full price, and no test pinned quantity, currency or zero
// quantities.
const HEADER = "receipt_id,closed_at,sku,quantity,unit_price_cents,currency\n";

test("importSaleEventsFromCsv nets a discount line into the receipt total", () => {
  const csv =
    HEADER +
    "R-4,2026-08-19T10:00:00Z,LEATHER-BAG-01,1,30000,EUR\n" +
    "R-4,2026-08-19T10:00:00Z,DISCOUNT-10PCT,1,-3000,EUR\n";
  const { events, issues } = importSaleEventsFromCsv(csv, "pilot-leather-01");
  assert.deepEqual(issues, []);
  assert.equal(events.length, 1);
  assert.equal(events[0].total_cents, 27000);
  assert.equal(events[0].line_items.length, 2);
});

test("importSaleEventsFromCsv drops the whole receipt when one of its rows is rejected", () => {
  const csv =
    HEADER +
    "R-4,2026-08-19T10:00:00Z,LEATHER-BAG-01,1,30000,EUR\n" +
    "R-4,2026-08-19T10:00:00Z,DISCOUNT,1,-3000.5,EUR\n" +
    "R-5,2026-08-19T11:00:00Z,BELT-02,1,9000,EUR\n";
  const { events, issues } = importSaleEventsFromCsv(csv, "pilot-leather-01");
  assert.deepEqual(
    events.map((event) => [event.basket_id, event.total_cents]),
    [["R-5", 9000]],
    "R-4 must not be imported at its 30000 gross when its discount row was rejected",
  );
  assert.equal(issues.length, 2);
  assert.equal(issues[0].rowNumber, 3);
  assert.match(issues[1].reason, /receipt R-4 not imported/);
});

test("importSaleEventsFromCsv reports a refund receipt instead of importing it as a purchase", () => {
  const csv = HEADER + "R-9,2026-08-19T12:00:00Z,LEATHER-BAG-01,1,-28500,EUR\n";
  const { events, issues } = importSaleEventsFromCsv(csv, "pilot-leather-01");
  assert.deepEqual(events, []);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rowNumber, 2);
  assert.match(issues[0].reason, /refund/);
});

test("importSaleEventsFromCsv multiplies unit price by quantity", () => {
  const csv = HEADER + "R-1,2026-08-19T10:00:00Z,WALLET-03,3,4500,EUR\n";
  const { events } = importSaleEventsFromCsv(csv, "pilot-leather-01");
  assert.equal(events[0].total_cents, 13500);
});

test("importSaleEventsFromCsv rejects a zero quantity", () => {
  const csv = HEADER + "R-1,2026-08-19T10:00:00Z,WALLET-03,0,4500,EUR\n";
  const { events, issues } = importSaleEventsFromCsv(csv, "pilot-leather-01");
  assert.deepEqual(events, []);
  assert.match(issues[0].reason, /positive integer/);
});

test("importSaleEventsFromCsv keeps a valid currency and defaults a missing one to EUR", () => {
  const csv =
    HEADER +
    "R-1,2026-08-19T10:00:00Z,WALLET-03,1,4500,CHF\n" +
    "R-2,2026-08-19T10:00:00Z,WALLET-03,1,4500,\n";
  const { events } = importSaleEventsFromCsv(csv, "pilot-leather-01");
  assert.deepEqual(
    events.map((event) => [event.basket_id, event.currency]),
    [["R-1", "CHF"], ["R-2", "EUR"]],
  );
});
