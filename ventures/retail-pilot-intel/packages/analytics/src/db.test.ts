import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { AggregateEvent, SaleEvent } from "@retail-pilot/schemas";
import { insertAggregate, insertSale, openDb } from "./db.js";

function sampleAggregate(overrides: Partial<AggregateEvent> = {}): AggregateEvent {
  return {
    event_id: "agg-1",
    store_id: "store-1",
    source: "door_cv",
    metric: "entry",
    bucket_start: "2026-08-10T09:00:00Z",
    bucket_end: "2026-08-10T09:15:00Z",
    value: 5,
    ...overrides,
  };
}

function sampleSale(overrides: Partial<SaleEvent> = {}): SaleEvent {
  return {
    event_id: "sale-1",
    store_id: "store-1",
    basket_id: "basket-1",
    closed_at: "2026-08-10T09:30:00Z",
    currency: "EUR",
    line_items: [{ sku: "sku-1", quantity: 1, unit_price_cents: 4200 }],
    ...overrides,
  };
}

describe("db", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "retail-pilot-db-test-"));
    dbPath = join(dir, "pilot.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the schema on first open and is idempotent on reopen", () => {
    const db = openDb(dbPath);
    db.close();
    // Reopening an existing file must not fail on CREATE TABLE IF NOT EXISTS.
    const reopened = openDb(dbPath);
    reopened.close();
  });

  it("inserts an aggregate event with defaults applied for optional fields", () => {
    const db = openDb(dbPath);
    insertAggregate(db, sampleAggregate());
    const row = db
      .prepare("SELECT * FROM aggregate_events WHERE event_id = ?")
      .get("agg-1") as Record<string, unknown>;
    assert.equal(row.store_id, "store-1");
    assert.equal(row.metric, "entry");
    assert.equal(row.zone_id, null);
    assert.equal(row.sku, null);
    assert.equal(row.unit, "count");
    assert.equal(row.value, 5);
    assert.equal(JSON.parse(row.payload as string).event_id, "agg-1");
  });

  it("preserves an explicit unit instead of overwriting it with the default", () => {
    const db = openDb(dbPath);
    insertAggregate(db, sampleAggregate({ unit: "seconds", metric: "zone_dwell_seconds" }));
    const row = db
      .prepare("SELECT unit FROM aggregate_events WHERE event_id = ?")
      .get("agg-1") as { unit: string };
    assert.equal(row.unit, "seconds");
  });

  it("upserts an aggregate event on repeated event_id (INSERT OR REPLACE)", () => {
    const db = openDb(dbPath);
    insertAggregate(db, sampleAggregate({ value: 5 }));
    insertAggregate(db, sampleAggregate({ value: 9 }));
    const rows = db
      .prepare("SELECT value FROM aggregate_events WHERE event_id = ?")
      .all("agg-1") as { value: number }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].value, 9);
  });

  it("inserts a sale event with defaults applied for optional fields", () => {
    const db = openDb(dbPath);
    insertSale(db, sampleSale());
    const row = db
      .prepare("SELECT * FROM sale_events WHERE event_id = ?")
      .get("sale-1") as Record<string, unknown>;
    assert.equal(row.basket_id, "basket-1");
    assert.equal(row.currency, "EUR");
    assert.equal(row.total_cents, null);
    assert.equal(row.payment_class, null);
    assert.equal(JSON.parse(row.payload as string).line_items.length, 1);
  });

  it("upserts a sale event on repeated event_id (INSERT OR REPLACE)", () => {
    const db = openDb(dbPath);
    insertSale(db, sampleSale({ total_cents: 4200 }));
    insertSale(db, sampleSale({ total_cents: 8400 }));
    const rows = db
      .prepare("SELECT total_cents FROM sale_events WHERE event_id = ?")
      .all("sale-1") as { total_cents: number }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].total_cents, 8400);
  });
});
