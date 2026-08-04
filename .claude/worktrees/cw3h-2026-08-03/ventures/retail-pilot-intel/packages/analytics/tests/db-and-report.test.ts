import assert from "node:assert/strict";
import { test } from "node:test";
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
