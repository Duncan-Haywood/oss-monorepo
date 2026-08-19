import assert from "node:assert/strict";
import { test } from "node:test";
import { insertAggregate, insertSale, openDb } from "../db.js";
import { aggregateEvent, saleEvent, withTempDb } from "./test-db.js";

test("openDb creates both tables and is idempotent", () => {
  withTempDb((dbPath) => {
    openDb(dbPath);
    // Calling again on the same file must not throw (CREATE TABLE IF NOT EXISTS).
    const db = openDb(dbPath);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    assert.deepEqual(
      tables.map((t) => t.name),
      ["aggregate_events", "sale_events"],
    );
  });
});

test("insertAggregate stores a row readable by its columns", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "agg-x", value: 7, zone_id: "zone-a" }));
    const row = db
      .prepare("SELECT * FROM aggregate_events WHERE event_id = ?")
      .get("agg-x") as Record<string, unknown>;
    assert.equal(row.metric, "entry");
    assert.equal(row.zone_id, "zone-a");
    assert.equal(row.value, 7);
    assert.equal(row.unit, "count");
    assert.deepEqual(JSON.parse(row.payload as string).event_id, "agg-x");
  });
});

test("insertAggregate defaults optional fields to null / count", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "agg-min", zone_id: undefined, sku: undefined, unit: undefined }));
    const row = db
      .prepare("SELECT zone_id, sku, unit FROM aggregate_events WHERE event_id = ?")
      .get("agg-min") as Record<string, unknown>;
    assert.equal(row.zone_id, null);
    assert.equal(row.sku, null);
    assert.equal(row.unit, "count");
  });
});

test("insertAggregate upserts on duplicate event_id (INSERT OR REPLACE)", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "agg-dup", value: 1 }));
    insertAggregate(db, aggregateEvent({ event_id: "agg-dup", value: 99 }));
    const rows = db.prepare("SELECT value FROM aggregate_events WHERE event_id = ?").all("agg-dup");
    assert.equal(rows.length, 1);
    assert.equal((rows[0] as { value: number }).value, 99);
  });
});

test("insertSale stores a row readable by its columns", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertSale(db, saleEvent({ event_id: "sale-x", total_cents: 2599, payment_class: "cash" }));
    const row = db
      .prepare("SELECT * FROM sale_events WHERE event_id = ?")
      .get("sale-x") as Record<string, unknown>;
    assert.equal(row.total_cents, 2599);
    assert.equal(row.payment_class, "cash");
    assert.equal(row.currency, "EUR");
    assert.deepEqual(JSON.parse(row.payload as string).basket_id, "basket-1");
  });
});

test("insertSale defaults optional total_cents / payment_class to null", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertSale(db, saleEvent({ event_id: "sale-min", total_cents: undefined, payment_class: undefined }));
    const row = db
      .prepare("SELECT total_cents, payment_class FROM sale_events WHERE event_id = ?")
      .get("sale-min") as Record<string, unknown>;
    assert.equal(row.total_cents, null);
    assert.equal(row.payment_class, null);
  });
});
