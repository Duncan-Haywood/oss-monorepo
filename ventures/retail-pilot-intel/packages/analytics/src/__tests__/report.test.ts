import assert from "node:assert/strict";
import { test } from "node:test";
import { insertAggregate, insertSale, openDb } from "../db.js";
import {
  dailySummary,
  latestDayWithActivity,
  localDayBoundsUtc,
  localIsoDate,
  ReportScopeError,
} from "../report.js";
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

// Store-day and store-separation checks (quality audit 2026-11-19, defect 0).
// The expected figures are worked by hand from the Europe/Rome rules
// (CET = UTC+1, CEST = UTC+2 from the last Sunday of March to the last Sunday
// of October), not from this code.

test("localDayBoundsUtc gives the Rome trading day in UTC, 23 h and 25 h on DST days", () => {
  assert.deepEqual(localDayBoundsUtc("2026-08-19"), ["2026-08-18T22:00:00.000Z", "2026-08-19T22:00:00.000Z"]);
  assert.deepEqual(localDayBoundsUtc("2026-01-15"), ["2026-01-14T23:00:00.000Z", "2026-01-15T23:00:00.000Z"]);
  // 2026-03-29: clocks go 02:00 CET -> 03:00 CEST.
  assert.deepEqual(localDayBoundsUtc("2026-03-29"), ["2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z"]);
  // 2026-10-25: clocks go 03:00 CEST -> 02:00 CET.
  assert.deepEqual(localDayBoundsUtc("2026-10-25"), ["2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"]);
  assert.deepEqual(localDayBoundsUtc("2026-08-19", "UTC"), ["2026-08-19T00:00:00.000Z", "2026-08-20T00:00:00.000Z"]);
  assert.throws(() => localDayBoundsUtc("2026-08-19", "Mars/Olympus"), RangeError);
});

test("localIsoDate reads the calendar day in the store's zone", () => {
  assert.equal(localIsoDate(new Date("2026-08-19T22:30:00Z")), "2026-08-20");
  assert.equal(localIsoDate(new Date("2026-08-19T21:59:59Z")), "2026-08-19");
  assert.equal(localIsoDate(new Date("2026-08-19T22:30:00Z"), "UTC"), "2026-08-19");
});

test("dailySummary counts a 00:30 Rome sale on the Rome day, not the UTC day", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "e1", value: 10, bucket_start: "2026-08-19T08:00:00Z" }));
    insertSale(db, saleEvent({ event_id: "s-day", closed_at: "2026-08-19T10:00:00+02:00", total_cents: 30000 }));
    // 00:30 CEST on the 20th is 22:30Z on the 19th: it belongs to the 20th.
    insertSale(db, saleEvent({ event_id: "s-late", closed_at: "2026-08-20T00:30:00+02:00", total_cents: 9000 }));
    // 23:30 CEST on the 19th, written in UTC: 21:30Z belongs to the 19th.
    insertSale(db, saleEvent({ event_id: "s-eve", closed_at: "2026-08-19T21:30:00Z", total_cents: 5000 }));

    const day = dailySummary(dbPath, "2026-08-19");
    assert.equal(day.purchases, 2);
    assert.equal(day.revenue_cents, 35000);
    const next = dailySummary(dbPath, "2026-08-20");
    assert.equal(next.purchases, 1);
    assert.equal(next.revenue_cents, 9000);
    // Reading by UTC date instead puts all three on the 19th.
    assert.equal(dailySummary(dbPath, "2026-08-19", { timeZone: "UTC" }).purchases, 3);
  });
});

test("dailySummary filters by store and refuses to add two stores together", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, aggregateEvent({ event_id: "e1", store_id: "pilot-leather-01", value: 20 }));
    insertSale(db, saleEvent({ event_id: "s1", store_id: "pilot-leather-01", total_cents: 34600 }));
    insertSale(db, saleEvent({ event_id: "s2", store_id: "pilot-leather-01", total_cents: 34600 }));
    insertAggregate(db, aggregateEvent({ event_id: "e2", store_id: "milano", value: 50 }));
    insertSale(db, saleEvent({ event_id: "s3", store_id: "milano", total_cents: 9000 }));

    const leather = dailySummary(dbPath, "2026-08-19", { storeId: "pilot-leather-01" });
    assert.equal(leather.store_id, "pilot-leather-01");
    assert.equal(leather.entries, 20);
    assert.equal(leather.purchases, 2);
    assert.equal(leather.revenue_cents, 69200);
    assert.equal(leather.conversion_rate, 0.1);
    const milano = dailySummary(dbPath, "2026-08-19", { storeId: "milano" });
    assert.equal(milano.entries, 50);
    assert.equal(milano.purchases, 1);

    assert.throws(
      () => dailySummary(dbPath, "2026-08-19"),
      (error: unknown) => error instanceof ReportScopeError && error.code === "multiple_stores",
    );
  });
});

test("dailySummary refuses to sum revenue across currencies", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertSale(db, saleEvent({ event_id: "s1", currency: "EUR", total_cents: 1000 }));
    insertSale(db, saleEvent({ event_id: "s2", currency: "USD", total_cents: 1000 }));
    assert.throws(
      () => dailySummary(dbPath, "2026-08-19"),
      (error: unknown) => error instanceof ReportScopeError && error.code === "mixed_currencies",
    );
  });
});

test("latestDayWithActivity reports the Rome day of the last event, per store", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertSale(db, saleEvent({ event_id: "s1", store_id: "a", closed_at: "2026-08-19T22:30:00Z" }));
    insertSale(db, saleEvent({ event_id: "s2", store_id: "b", closed_at: "2026-08-25T10:00:00Z" }));
    assert.equal(latestDayWithActivity(dbPath, { storeId: "a" }), "2026-08-20");
    assert.equal(latestDayWithActivity(dbPath, { storeId: "a", timeZone: "UTC" }), "2026-08-19");
    assert.equal(latestDayWithActivity(dbPath), "2026-08-25");
  });
});

// Quality audit 2026-11-19, defect 6: `pnpm bootstrap` wrote only stub events,
// which the report rightly leaves out, so its smoke test printed all zeros.
test("dailySummary counts stub sample events only when includeSynthetic is set", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(db, stubAggregateEvent({ value: 1, bucket_start: "2026-08-19T09:00:00Z" }));
    insertSale(db, stubSaleEvent({ closed_at: "2026-08-19T09:30:00Z", total_cents: 28500 }));

    const real = dailySummary(dbPath, "2026-08-19");
    assert.equal(real.entries, 0);
    assert.equal(real.purchases, 0);
    assert.equal(real.revenue_cents, 0);

    const smoke = dailySummary(dbPath, "2026-08-19", { includeSynthetic: true });
    assert.equal(smoke.store_id, "store-1");
    assert.equal(smoke.entries, 1);
    assert.equal(smoke.purchases, 1);
    assert.equal(smoke.revenue_cents, 28500);
    assert.equal(smoke.conversion_rate, 1);
  });
});
