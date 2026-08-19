import assert from "node:assert/strict";
import { test } from "node:test";
import { insertAggregate, insertSale, openDb } from "../db.js";
import { dailySummary } from "../report.js";
import { aggregateEvent, saleEvent, withTempDb } from "./test-db.js";

test("dailySummary computes conversion_rate from entries and purchases on the same day", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "e1", metric: "entry", value: 5, bucket_start: "2026-08-19T09:00:00Z" }));
    insertAggregate(db, aggregateEvent({ event_id: "e2", metric: "entry", value: 5, bucket_start: "2026-08-19T14:00:00Z" }));
    insertAggregate(db, aggregateEvent({ event_id: "b1", metric: "bounce", value: 2, bucket_start: "2026-08-19T09:00:00Z" }));
    insertSale(db, saleEvent({ event_id: "s1", closed_at: "2026-08-19T09:30:00Z" }));
    insertSale(db, saleEvent({ event_id: "s2", closed_at: "2026-08-19T10:00:00Z" }));

    const summary = dailySummary(dbPath, "2026-08-19");
    assert.deepEqual(summary, {
      date: "2026-08-19",
      entries: 10,
      bounces: 2,
      purchases: 2,
      conversion_rate: 0.2,
    });
  });
});

test("dailySummary excludes rows from other days", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "e-today", metric: "entry", value: 3, bucket_start: "2026-08-19T09:00:00Z" }));
    insertAggregate(db, aggregateEvent({ event_id: "e-yesterday", metric: "entry", value: 100, bucket_start: "2026-08-18T09:00:00Z" }));
    insertSale(db, saleEvent({ event_id: "s-tomorrow", closed_at: "2026-08-20T09:00:00Z" }));

    const summary = dailySummary(dbPath, "2026-08-19");
    assert.equal(summary.entries, 3);
    assert.equal(summary.purchases, 0);
  });
});

test("dailySummary returns zeroed conversion_rate (not NaN) when there are no entries", () => {
  withTempDb((dbPath) => {
    openDb(dbPath);
    const summary = dailySummary(dbPath, "2026-08-19");
    assert.deepEqual(summary, {
      date: "2026-08-19",
      entries: 0,
      bounces: 0,
      purchases: 0,
      conversion_rate: 0,
    });
  });
});

test("dailySummary rounds conversion_rate to 4 decimal places", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "e1", metric: "entry", value: 3, bucket_start: "2026-08-19T09:00:00Z" }));
    insertSale(db, saleEvent({ event_id: "s1", closed_at: "2026-08-19T09:00:00Z" }));

    const summary = dailySummary(dbPath, "2026-08-19");
    // 1 / 3 = 0.3333333... -> rounded to 0.3333
    assert.equal(summary.conversion_rate, 0.3333);
  });
});
