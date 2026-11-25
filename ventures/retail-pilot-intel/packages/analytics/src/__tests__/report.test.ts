import assert from "node:assert/strict";
import { test } from "node:test";
import { insertAggregate, insertSale, openDb } from "../db.js";
import { dailySummary, latestDayWithActivity, localDayBoundsUtc, ReportScopeError } from "../report.js";
import { aggregateEvent, saleEvent, stubAggregateEvent, stubSaleEvent, withTempDb } from "./test-db.js";

test("dailySummary computes conversion_rate from entries and purchases on the same day", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "e1", metric: "entry", value: 5, bucket_start: "2026-08-19T09:00:00Z" }));
    insertAggregate(db, aggregateEvent({ event_id: "e2", metric: "entry", value: 5, bucket_start: "2026-08-19T14:00:00Z" }));
    insertAggregate(db, aggregateEvent({ event_id: "b1", metric: "bounce", value: 2, bucket_start: "2026-08-19T09:00:00Z" }));
    insertSale(db, saleEvent({ event_id: "s1", closed_at: "2026-08-19T09:30:00Z", total_cents: 1000 }));
    insertSale(db, saleEvent({ event_id: "s2", closed_at: "2026-08-19T10:00:00Z", total_cents: 2000 }));

    const summary = dailySummary(dbPath, "2026-08-19");
    assert.deepEqual(summary, {
      date: "2026-08-19",
      store_id: "store-1",
      time_zone: "Europe/Rome",
      currency: "EUR",
      entries: 10,
      bounces: 2,
      purchases: 2,
      conversion_rate: 0.2,
      revenue_cents: 3000,
      revenue_per_entrant_cents: 300,
    });
  });
});

test("dailySummary sums revenue_cents from sale_events and rounds revenue_per_entrant_cents", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "e1", metric: "entry", value: 3, bucket_start: "2026-08-19T09:00:00Z" }));
    insertSale(db, saleEvent({ event_id: "s1", closed_at: "2026-08-19T09:00:00Z", total_cents: 1000 }));

    const summary = dailySummary(dbPath, "2026-08-19");
    assert.equal(summary.revenue_cents, 1000);
    // 1000 / 3 = 333.33... -> rounded to 333
    assert.equal(summary.revenue_per_entrant_cents, 333);
  });
});

test("dailySummary treats a sale with null total_cents as zero revenue, not NaN", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "e1", metric: "entry", value: 2, bucket_start: "2026-08-19T09:00:00Z" }));
    insertSale(db, saleEvent({ event_id: "s1", closed_at: "2026-08-19T09:00:00Z", total_cents: undefined }));

    const summary = dailySummary(dbPath, "2026-08-19");
    assert.equal(summary.purchases, 1);
    assert.equal(summary.revenue_cents, 0);
    assert.equal(summary.revenue_per_entrant_cents, 0);
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
      store_id: null,
      time_zone: "Europe/Rome",
      currency: null,
      entries: 0,
      bounces: 0,
      purchases: 0,
      conversion_rate: 0,
      revenue_cents: 0,
      revenue_per_entrant_cents: 0,
    });
  });
});

test("dailySummary excludes stub sample data from a real store's KPIs", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    // Real activity for the day.
    insertAggregate(db, aggregateEvent({ event_id: "e-real", metric: "entry", value: 2, bucket_start: "2026-08-19T09:00:00Z" }));
    insertSale(db, saleEvent({ event_id: "s-real", closed_at: "2026-08-19T09:30:00Z", total_cents: 1000 }));
    // A `--sample` smoke-test run against the same day/store must not count.
    insertAggregate(db, stubAggregateEvent({ event_id: "e-stub", metric: "entry", value: 50, bucket_start: "2026-08-19T10:00:00Z" }));
    insertSale(db, stubSaleEvent({ event_id: "s-stub", closed_at: "2026-08-19T10:30:00Z", total_cents: 50000 }));

    const summary = dailySummary(dbPath, "2026-08-19");
    assert.equal(summary.entries, 2, "the stub's inflated entry count must not leak into the real total");
    assert.equal(summary.purchases, 1);
    assert.equal(summary.revenue_cents, 1000, "the stub's revenue must not leak into the real total");
  });
});

test("latestDayWithActivity ignores a day whose only rows are stub sample data", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "e-real", bucket_start: "2026-08-10T09:00:00Z" }));
    insertAggregate(db, stubAggregateEvent({ event_id: "e-stub", bucket_start: "2026-08-19T09:00:00Z" }));

    // Without the synthetic filter this would return the later stub-only day.
    assert.equal(latestDayWithActivity(dbPath), "2026-08-10");
  });
});

test("latestDayWithActivity is null when every row in the database is stub sample data", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, stubAggregateEvent({ event_id: "e-stub" }));
    insertSale(db, stubSaleEvent({ event_id: "s-stub" }));

    assert.equal(latestDayWithActivity(dbPath), null);
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

// Quality audit 2026-11-19 (portfolio/quality/audits/2026-11-19-retail-pilot-intel.json#0):
// days were UTC dates and stores and currencies were summed together.

test("a sale at 00:30 in Rome counts on the Rome calendar day, not the UTC one", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    // 2026-08-19T22:30Z is 00:30 on 2026-08-20 in Rome (CEST, UTC+2).
    insertSale(db, saleEvent({ event_id: "late", closed_at: "2026-08-19T22:30:00Z", total_cents: 9000 }));
    insertSale(db, saleEvent({ event_id: "noon", closed_at: "2026-08-19T10:00:00Z", total_cents: 1000 }));
    // 2026-08-18T22:15Z is 00:15 on 2026-08-19 in Rome.
    insertAggregate(db, aggregateEvent({ event_id: "e-early", value: 3, bucket_start: "2026-08-18T22:15:00Z" }));

    const day = dailySummary(dbPath, "2026-08-19");
    assert.equal(day.purchases, 1);
    assert.equal(day.revenue_cents, 1000);
    assert.equal(day.entries, 3);
    assert.equal(dailySummary(dbPath, "2026-08-20").revenue_cents, 9000);
    // The UTC reading is still available on request.
    assert.equal(dailySummary(dbPath, "2026-08-19", { timeZone: "UTC" }).revenue_cents, 10000);
    assert.equal(latestDayWithActivity(dbPath), "2026-08-20");
  });
});

test("a timestamp written with a +02:00 offset is placed by its instant", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertSale(db, saleEvent({ event_id: "s", closed_at: "2026-08-20T00:30:00+02:00" }));
    assert.equal(dailySummary(dbPath, "2026-08-20").purchases, 1);
    assert.equal(dailySummary(dbPath, "2026-08-19").purchases, 0);
  });
});

test("Rome day bounds follow the DST change (23 h in March, 25 h in October)", () => {
  // EU rules: summer time starts the last Sunday of March, ends the last Sunday of October.
  assert.deepEqual(localDayBoundsUtc("2026-03-29"), ["2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z"]);
  assert.deepEqual(localDayBoundsUtc("2026-10-25"), ["2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"]);
  assert.deepEqual(localDayBoundsUtc("2026-01-15"), ["2026-01-14T23:00:00.000Z", "2026-01-15T23:00:00.000Z"]);
});

test("the audit's pilot-leather-01 case: 3 purchases / 103800, not 4 / 112800", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    const store = "pilot-leather-01";
    insertSale(db, saleEvent({ event_id: "a", store_id: store, closed_at: "2026-08-19T08:00:00Z", total_cents: 45000 }));
    insertSale(db, saleEvent({ event_id: "b", store_id: store, closed_at: "2026-08-19T12:00:00Z", total_cents: 38800 }));
    insertSale(db, saleEvent({ event_id: "c", store_id: store, closed_at: "2026-08-19T16:00:00Z", total_cents: 20000 }));
    // A second store's receipt the same day, and a Rome after-midnight sale.
    insertSale(db, saleEvent({ event_id: "d", store_id: "other-store", closed_at: "2026-08-19T11:00:00Z", total_cents: 5000 }));
    insertSale(db, saleEvent({ event_id: "e", store_id: store, closed_at: "2026-08-19T22:10:00Z", total_cents: 4000 }));

    const day = dailySummary(dbPath, "2026-08-19", { storeId: store });
    assert.equal(day.purchases, 3);
    assert.equal(day.revenue_cents, 103800);
    assert.equal(day.store_id, store);
  });
});

test("a database with two stores is refused without a store id, not summed", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "e1", store_id: "a", value: 10 }));
    insertAggregate(db, aggregateEvent({ event_id: "e2", store_id: "b", value: 10 }));
    insertSale(db, saleEvent({ event_id: "s1", store_id: "a" }));
    assert.throws(() => dailySummary(dbPath, "2026-08-19"), (e: unknown) => e instanceof ReportScopeError && e.code === "multiple_stores");
    assert.throws(() => latestDayWithActivity(dbPath), ReportScopeError);
    const a = dailySummary(dbPath, "2026-08-19", { storeId: "a" });
    assert.equal(a.entries, 10);
    assert.equal(a.conversion_rate, 0.1);
    assert.equal(dailySummary(dbPath, "2026-08-19", { storeId: "b" }).purchases, 0);
  });
});

test("sales in two currencies on one day are refused, not added together", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertSale(db, saleEvent({ event_id: "eur", currency: "EUR", total_cents: 1000 }));
    insertSale(db, saleEvent({ event_id: "usd", currency: "USD", total_cents: 1000 }));
    assert.throws(() => dailySummary(dbPath, "2026-08-19"), (e: unknown) => e instanceof ReportScopeError && e.code === "mixed_currency");
  });
});

test("an unknown time zone is an error, not a silent UTC fallback", () => {
  withTempDb((dbPath) => {
    openDb(dbPath);
    assert.throws(() => dailySummary(dbPath, "2026-08-19", { timeZone: "Mars/Olympus" }), ReportScopeError);
  });
});
