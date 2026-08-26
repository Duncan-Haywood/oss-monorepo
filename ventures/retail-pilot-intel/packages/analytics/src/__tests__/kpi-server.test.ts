import assert from "node:assert/strict";
import { test } from "node:test";
import { insertAggregate, insertSale, openDb } from "../db.js";
import { kpisForDate, kpisForLatest, kpisForToday } from "../kpi.js";
import { startKpiServer } from "../kpi-server.js";
import { latestDayWithActivity, shiftIsoDate } from "../report.js";
import { aggregateEvent, saleEvent, withTempDb } from "./test-db.js";

test("shiftIsoDate moves a calendar day across month boundaries", () => {
  assert.equal(shiftIsoDate("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftIsoDate("2026-08-25", -7), "2026-08-18");
});

test("latestDayWithActivity returns the newest door or POS day", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(
      db,
      aggregateEvent({ event_id: "e-old", bucket_start: "2026-08-10T09:00:00Z" }),
    );
    insertSale(db, saleEvent({ event_id: "s-new", closed_at: "2026-08-19T11:00:00Z" }));
    assert.equal(latestDayWithActivity(dbPath), "2026-08-19");
  });
});

test("latestDayWithActivity is null when the database is empty", () => {
  withTempDb((dbPath) => {
    openDb(dbPath);
    assert.equal(latestDayWithActivity(dbPath), null);
    assert.equal(kpisForLatest(dbPath), null);
  });
});

test("live KPI payload includes avg basket and a prior-week comparison when that day has activity", () => {
  withTempDb((dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(
      db,
      aggregateEvent({
        event_id: "e-today",
        metric: "entry",
        value: 10,
        bucket_start: "2026-08-25T09:00:00Z",
      }),
    );
    insertSale(
      db,
      saleEvent({ event_id: "s-today", closed_at: "2026-08-25T10:00:00Z", total_cents: 4000 }),
    );
    insertAggregate(
      db,
      aggregateEvent({
        event_id: "e-week",
        metric: "entry",
        value: 8,
        bucket_start: "2026-08-18T09:00:00Z",
      }),
    );
    insertSale(
      db,
      saleEvent({ event_id: "s-week", closed_at: "2026-08-18T10:00:00Z", total_cents: 2000 }),
    );

    const payload = kpisForDate(dbPath, "2026-08-25");
    assert.equal(payload.source, "live");
    assert.equal(payload.resolvedFrom, "requested");
    assert.equal(payload.entries, 10);
    assert.equal(payload.purchases, 1);
    assert.equal(payload.avg_basket_cents, 4000);
    assert.deepEqual(payload.vsPriorWeek, {
      date: "2026-08-18",
      entries: 8,
      conversion_rate: 0.125,
      revenue_cents: 2000,
    });
  });
});

test("kpisForToday uses the supplied clock rather than inventing store activity", () => {
  withTempDb((dbPath) => {
    openDb(dbPath);
    const payload = kpisForToday(dbPath, new Date("2026-08-25T12:00:00Z"));
    assert.equal(payload.date, "2026-08-25");
    assert.equal(payload.entries, 0);
    assert.equal(payload.vsPriorWeek, null);
  });
});

test("KPI server serves today, latest, dated lookup, and rejects unsafe dates", async () => {
  await withTempDb(async (dbPath) => {
    const db = openDb(dbPath);
    insertAggregate(
      db,
      aggregateEvent({
        event_id: "e1",
        metric: "entry",
        value: 4,
        bucket_start: "2026-08-19T09:00:00Z",
      }),
    );
    insertSale(db, saleEvent({ event_id: "s1", closed_at: "2026-08-19T10:00:00Z", total_cents: 1500 }));

    const server = await startKpiServer({
      dbPath,
      host: "127.0.0.1",
      port: 0,
      corsOrigins: ["http://localhost:5174"],
    });
    try {
      const health = await fetch(`${server.url}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { ok: true });

      const latest = await fetch(`${server.url}/api/kpis/latest`);
      assert.equal(latest.status, 200);
      const latestBody = (await latest.json()) as { date: string; entries: number; avg_basket_cents: number };
      assert.equal(latestBody.date, "2026-08-19");
      assert.equal(latestBody.entries, 4);
      assert.equal(latestBody.avg_basket_cents, 1500);

      const dated = await fetch(`${server.url}/api/kpis?date=2026-08-19`);
      assert.equal(dated.status, 200);
      assert.equal(((await dated.json()) as { purchases: number }).purchases, 1);

      const bad = await fetch(`${server.url}/api/kpis?date=yesterday`);
      assert.equal(bad.status, 400);

      const missing = await fetch(`${server.url}/api/kpis/nope`);
      assert.equal(missing.status, 404);

      const preflight = await fetch(`${server.url}/api/kpis/latest`, {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5174" },
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:5174");

      const blocked = await fetch(`${server.url}/api/kpis/latest`, {
        headers: { Origin: "https://evil.example" },
      });
      assert.equal(blocked.status, 200);
      assert.equal(blocked.headers.get("access-control-allow-origin"), null);
    } finally {
      await server.close();
    }
  });
});
