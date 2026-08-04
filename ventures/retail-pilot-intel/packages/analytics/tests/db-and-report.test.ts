import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync } from "node:fs";

import { openDb, insertAggregate, insertSale } from "../src/db.js";
import { dailySummary } from "../src/report.js";

function getTempDbPath(): string {
  return join(tmpdir(), `test_pilot_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
}

test("openDb creates tables and allows inserting aggregate and sale events", () => {
  const dbPath = getTempDbPath();
  const db = openDb(dbPath);

  try {
    insertAggregate(db, {
      event_id: "agg_001",
      store_id: "store_milan_01",
      source: "door_cv",
      metric: "entry",
      bucket_start: "2026-07-31T10:00:00Z",
      bucket_end: "2026-07-31T10:05:00Z",
      value: 15,
      unit: "count",
    });

    insertSale(db, {
      event_id: "sale_001",
      store_id: "store_milan_01",
      basket_id: "bsk_9901",
      closed_at: "2026-07-31T10:12:00Z",
      currency: "EUR",
      line_items: [{ sku: "SKU_SCARF_01", quantity: 1, unit_price_cents: 8500 }],
      total_cents: 8500,
      payment_class: "card",
    });

    const summary = dailySummary(dbPath, "2026-07-31");
    assert.equal(summary.date, "2026-07-31");
    assert.equal(summary.entries, 15);
    assert.equal(summary.purchases, 1);
    assert.equal(summary.measurable, true);
    assert.equal(summary.unmeasurable_reason, null);
    assert.equal(summary.conversion_rate, 0.0667); // 1 / 15 = 0.06666... -> 0.0667
  } finally {
    db.close();
    try {
      unlinkSync(dbPath);
    } catch {
      // best-effort cleanup of the temp database file
    }
  }
});

test("dailySummary withholds a conversion rate when the day's events are synthetic", () => {
  const dbPath = getTempDbPath();
  const db = openDb(dbPath);

  try {
    insertAggregate(db, {
      event_id: "agg_synth_001",
      store_id: "store_milan_01",
      source: "door_cv",
      metric: "entry",
      bucket_start: "2026-07-31T10:00:00Z",
      bucket_end: "2026-07-31T10:05:00Z",
      value: 1,
      unit: "count",
      synthetic: true,
    });

    insertSale(db, {
      event_id: "sale_synth_001",
      store_id: "store_milan_01",
      basket_id: "bsk_9902",
      closed_at: "2026-07-31T10:12:00Z",
      currency: "EUR",
      line_items: [{ sku: "SKU_SCARF_01", quantity: 1, unit_price_cents: 8500 }],
      total_cents: 8500,
      payment_class: "card",
      synthetic: true,
    });

    const summary = dailySummary(dbPath, "2026-07-31");
    assert.equal(summary.entries, 1);
    assert.equal(summary.purchases, 1);
    assert.equal(summary.measurable, false);
    assert.equal(
      summary.conversion_rate,
      null,
      "a 1-entry/1-sale stub day must not report 100%",
    );
    assert.match(String(summary.unmeasurable_reason), /synthetic sample events/);
  } finally {
    db.close();
    try {
      unlinkSync(dbPath);
    } catch {
      // best-effort cleanup of the temp database file
    }
  }
});

test("openDb backfills pre-provenance rows as synthetic rather than as observations", () => {
  const dbPath = getTempDbPath();

  // A database as it existed before the `synthetic` column: every row in one of
  // these was written by the stub generators.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE aggregate_events (
      event_id TEXT PRIMARY KEY, store_id TEXT NOT NULL, source TEXT NOT NULL,
      metric TEXT NOT NULL, zone_id TEXT, sku TEXT, bucket_start TEXT NOT NULL,
      bucket_end TEXT NOT NULL, value REAL NOT NULL, unit TEXT DEFAULT 'count',
      payload JSON NOT NULL
    );
    CREATE TABLE sale_events (
      event_id TEXT PRIMARY KEY, store_id TEXT NOT NULL, basket_id TEXT NOT NULL,
      closed_at TEXT NOT NULL, currency TEXT NOT NULL, total_cents INTEGER,
      payment_class TEXT, payload JSON NOT NULL
    );
    INSERT INTO aggregate_events VALUES
      ('agg_legacy', 's1', 'door_cv', 'entry', NULL, NULL,
       '2026-07-31T10:00:00Z', '2026-07-31T10:05:00Z', 1, 'count', '{}');
    INSERT INTO sale_events VALUES
      ('sale_legacy', 's1', 'bsk_legacy', '2026-07-31T10:12:00Z', 'EUR',
       8500, 'card', '{}');
  `);
  legacy.close();

  const db = openDb(dbPath);
  try {
    const summary = dailySummary(dbPath, "2026-07-31");
    assert.equal(summary.entries, 1);
    assert.equal(summary.purchases, 1);
    assert.equal(
      summary.conversion_rate,
      null,
      "rows of unrecorded provenance must not be reported as a measured 100%",
    );
    assert.equal(summary.measurable, false);
  } finally {
    db.close();
    try {
      unlinkSync(dbPath);
    } catch {
      // best-effort cleanup of the temp database file
    }
  }
});

test("dailySummary withholds a conversion rate when sales exceed door entries", () => {
  const dbPath = getTempDbPath();
  const db = openDb(dbPath);

  try {
    insertAggregate(db, {
      event_id: "agg_undercount_001",
      store_id: "store_milan_01",
      source: "door_cv",
      metric: "entry",
      bucket_start: "2026-07-31T10:00:00Z",
      bucket_end: "2026-07-31T10:05:00Z",
      value: 1,
      unit: "count",
    });

    for (const id of ["sale_u1", "sale_u2"]) {
      insertSale(db, {
        event_id: id,
        store_id: "store_milan_01",
        basket_id: `bsk_${id}`,
        closed_at: "2026-07-31T10:12:00Z",
        currency: "EUR",
        line_items: [
          { sku: "SKU_SCARF_01", quantity: 1, unit_price_cents: 8500 },
        ],
        total_cents: 8500,
        payment_class: "card",
      });
    }

    const summary = dailySummary(dbPath, "2026-07-31");
    assert.equal(summary.measurable, false);
    assert.equal(
      summary.conversion_rate,
      null,
      "a conversion rate above 100% is an under-counted door, not a measurement",
    );
    assert.match(String(summary.unmeasurable_reason), /missing entrants/);
  } finally {
    db.close();
    try {
      unlinkSync(dbPath);
    } catch {
      // best-effort cleanup of the temp database file
    }
  }
});
