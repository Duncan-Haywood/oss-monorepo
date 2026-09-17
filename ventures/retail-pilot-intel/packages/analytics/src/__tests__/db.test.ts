import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { insertAggregate, insertSale, isSyntheticAggregate, isSyntheticSale, openDb } from "../db.js";
import { aggregateEvent, saleEvent, stubAggregateEvent, stubSaleEvent, withTempDb } from "./test-db.js";

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

test("isSyntheticAggregate flags only stub-model events, not real door_cv output", () => {
  assert.equal(isSyntheticAggregate(stubAggregateEvent()), true);
  assert.equal(isSyntheticAggregate(aggregateEvent()), false);
  assert.equal(
    isSyntheticAggregate(aggregateEvent({ metadata: { model: "yolo-v8-door", version: "1.2.0" } })),
    false,
    "a real model name in metadata must not be mistaken for the stub",
  );
});

test("isSyntheticSale flags only pos_vendor stub, not a real POS integration", () => {
  assert.equal(isSyntheticSale(stubSaleEvent()), true);
  assert.equal(isSyntheticSale(saleEvent()), false);
  assert.equal(isSyntheticSale(saleEvent({ pos_vendor: "lightspeed" })), false);
});

test("insertAggregate marks a stub sample event synthetic so it can be excluded from real KPIs", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, stubAggregateEvent({ event_id: "agg-stub" }));
    insertAggregate(db, aggregateEvent({ event_id: "agg-real" }));
    const rows = db
      .prepare("SELECT event_id, synthetic FROM aggregate_events ORDER BY event_id")
      .all() as { event_id: string; synthetic: number }[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.event_id, "agg-real");
    assert.equal(rows[0]!.synthetic, 0);
    assert.equal(rows[1]!.event_id, "agg-stub");
    assert.equal(rows[1]!.synthetic, 1);
  });
});

test("insertSale marks a stub sample sale synthetic so it can be excluded from real KPIs", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertSale(db, stubSaleEvent({ event_id: "sale-stub" }));
    insertSale(db, saleEvent({ event_id: "sale-real" }));
    const rows = db
      .prepare("SELECT event_id, synthetic FROM sale_events ORDER BY event_id")
      .all() as { event_id: string; synthetic: number }[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.event_id, "sale-real");
    assert.equal(rows[0]!.synthetic, 0);
    assert.equal(rows[1]!.event_id, "sale-stub");
    assert.equal(rows[1]!.synthetic, 1);
  });
});

test("openDb migrates an existing database file created before the synthetic column existed", () => {
  withTempDb((dbPath) => {
    // Simulate a pilot's pre-upgrade database: same tables, no synthetic column.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE aggregate_events (
        event_id TEXT PRIMARY KEY, store_id TEXT NOT NULL, source TEXT NOT NULL,
        metric TEXT NOT NULL, zone_id TEXT, sku TEXT, bucket_start TEXT NOT NULL,
        bucket_end TEXT NOT NULL, value REAL NOT NULL, unit TEXT DEFAULT 'count', payload JSON NOT NULL
      );
      CREATE TABLE sale_events (
        event_id TEXT PRIMARY KEY, store_id TEXT NOT NULL, basket_id TEXT NOT NULL,
        closed_at TEXT NOT NULL, currency TEXT NOT NULL, total_cents INTEGER,
        payment_class TEXT, payload JSON NOT NULL
      );
    `);
    legacy.close();

    // Opening a file whose tables predate the synthetic column must migrate
    // in place rather than throw, and inserts afterward must succeed.
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "agg-post-migration" }));
    insertSale(db, saleEvent({ event_id: "sale-post-migration" }));
    const row = db
      .prepare("SELECT synthetic FROM aggregate_events WHERE event_id = ?")
      .get("agg-post-migration") as { synthetic: number };
    assert.equal(row.synthetic, 0);
  });
});
