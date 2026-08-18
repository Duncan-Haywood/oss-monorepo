import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { insertAggregate, insertSale, openDb } from "./db.js";
import { dailySummary } from "./report.js";

describe("dailySummary", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "retail-pilot-report-test-"));
    dbPath = join(dir, "pilot.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns all zeros and a zero conversion rate for a day with no events", () => {
    openDb(dbPath).close();
    const summary = dailySummary(dbPath, "2026-08-10");
    assert.deepEqual(summary, {
      date: "2026-08-10",
      entries: 0,
      bounces: 0,
      purchases: 0,
      conversion_rate: 0,
    });
  });

  it("sums entries and bounces and counts purchases only for the requested day", () => {
    const db = openDb(dbPath);
    insertAggregate(db, {
      event_id: "a1",
      store_id: "s1",
      source: "door_cv",
      metric: "entry",
      bucket_start: "2026-08-10T09:00:00Z",
      bucket_end: "2026-08-10T09:15:00Z",
      value: 4,
    });
    insertAggregate(db, {
      event_id: "a2",
      store_id: "s1",
      source: "door_cv",
      metric: "entry",
      bucket_start: "2026-08-10T14:00:00Z",
      bucket_end: "2026-08-10T14:15:00Z",
      value: 6,
    });
    // Different day — must not be counted.
    insertAggregate(db, {
      event_id: "a3",
      store_id: "s1",
      source: "door_cv",
      metric: "entry",
      bucket_start: "2026-08-11T09:00:00Z",
      bucket_end: "2026-08-11T09:15:00Z",
      value: 100,
    });
    insertAggregate(db, {
      event_id: "b1",
      store_id: "s1",
      source: "door_cv",
      metric: "bounce",
      bucket_start: "2026-08-10T09:00:00Z",
      bucket_end: "2026-08-10T09:15:00Z",
      value: 3,
    });
    insertSale(db, {
      event_id: "p1",
      store_id: "s1",
      basket_id: "bk1",
      closed_at: "2026-08-10T10:00:00Z",
      currency: "EUR",
      line_items: [{ sku: "sku-1", quantity: 1, unit_price_cents: 1000 }],
    });

    const summary = dailySummary(dbPath, "2026-08-10");
    assert.equal(summary.entries, 10);
    assert.equal(summary.bounces, 3);
    assert.equal(summary.purchases, 1);
    assert.equal(summary.conversion_rate, 0.1);
  });

  it("rounds conversion_rate to four decimal places", () => {
    const db = openDb(dbPath);
    insertAggregate(db, {
      event_id: "a1",
      store_id: "s1",
      source: "door_cv",
      metric: "entry",
      bucket_start: "2026-08-10T09:00:00Z",
      bucket_end: "2026-08-10T09:15:00Z",
      value: 3,
    });
    insertSale(db, {
      event_id: "p1",
      store_id: "s1",
      basket_id: "bk1",
      closed_at: "2026-08-10T10:00:00Z",
      currency: "EUR",
      line_items: [{ sku: "sku-1", quantity: 1, unit_price_cents: 1000 }],
    });

    const summary = dailySummary(dbPath, "2026-08-10");
    // 1/3 = 0.3333333... -> rounds to 0.3333
    assert.equal(summary.conversion_rate, 0.3333);
  });
});
