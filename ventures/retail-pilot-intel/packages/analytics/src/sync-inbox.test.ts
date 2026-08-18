import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { AggregateEvent, SaleEvent } from "@retail-pilot/schemas";
import { openDb } from "./db.js";
import { syncInbox } from "./sync-inbox.js";

describe("syncInbox", () => {
  let dir: string;
  let dbPath: string;
  let aggregatesDir: string;
  let salesDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "retail-pilot-sync-test-"));
    dbPath = join(dir, "pilot.db");
    aggregatesDir = join(dir, "aggregates", "outbox");
    salesDir = join(dir, "pos", "inbox");
    mkdirSync(aggregatesDir, { recursive: true });
    mkdirSync(salesDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeAggregate(name: string, event: AggregateEvent): void {
    writeFileSync(join(aggregatesDir, name), JSON.stringify(event));
  }

  function writeSale(name: string, event: SaleEvent): void {
    writeFileSync(join(salesDir, name), JSON.stringify(event));
  }

  it("returns zero counts and does not throw when both directories are missing", () => {
    rmSync(aggregatesDir, { recursive: true, force: true });
    rmSync(salesDir, { recursive: true, force: true });
    const result = syncInbox({ dbPath, aggregatesDir, salesDir });
    assert.deepEqual(result, { aggregates: 0, sales: 0 });
  });

  it("ignores non-JSON files in the inbox directories", () => {
    writeFileSync(join(aggregatesDir, "readme.txt"), "not an event");
    const result = syncInbox({ dbPath, aggregatesDir, salesDir });
    assert.deepEqual(result, { aggregates: 0, sales: 0 });
  });

  it("syncs aggregate and sale JSON files into the database and reports counts", () => {
    writeAggregate("a1.json", {
      event_id: "a1",
      store_id: "s1",
      source: "door_cv",
      metric: "entry",
      bucket_start: "2026-08-10T09:00:00Z",
      bucket_end: "2026-08-10T09:15:00Z",
      value: 5,
    });
    writeAggregate("a2.json", {
      event_id: "a2",
      store_id: "s1",
      source: "door_cv",
      metric: "bounce",
      bucket_start: "2026-08-10T09:00:00Z",
      bucket_end: "2026-08-10T09:15:00Z",
      value: 2,
    });
    writeSale("p1.json", {
      event_id: "p1",
      store_id: "s1",
      basket_id: "bk1",
      closed_at: "2026-08-10T10:00:00Z",
      currency: "EUR",
      line_items: [{ sku: "sku-1", quantity: 1, unit_price_cents: 1000 }],
    });

    const result = syncInbox({ dbPath, aggregatesDir, salesDir });
    assert.deepEqual(result, { aggregates: 2, sales: 1 });

    const db = openDb(dbPath);
    const aggregateCount = db
      .prepare("SELECT COUNT(*) AS c FROM aggregate_events")
      .get() as { c: number };
    const saleCount = db.prepare("SELECT COUNT(*) AS c FROM sale_events").get() as {
      c: number;
    };
    assert.equal(aggregateCount.c, 2);
    assert.equal(saleCount.c, 1);
  });
});
