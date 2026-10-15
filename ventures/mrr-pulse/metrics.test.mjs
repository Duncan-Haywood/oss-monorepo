import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyAmount, liveMap, movements, backfill, applySync, summarize, monthEnds, mapAt } from "./metrics.mjs";

const D = (y, m, d) => Date.UTC(y, m - 1, d);

test("prices normalise to a month; unknown intervals count as zero", () => {
  assert.equal(monthlyAmount(1200, "month"), 1200);
  assert.equal(monthlyAmount(12000, "year"), 1000);
  assert.equal(monthlyAmount(3000, "month", 3), 1000);
  assert.equal(monthlyAmount(1000, "week"), 4348);
  assert.equal(monthlyAmount(100, "day"), 3044);
  assert.equal(monthlyAmount(1000, "month", 1, 5), 5000);
  assert.equal(monthlyAmount(1000, "fortnight"), 0);
  assert.equal(monthlyAmount(NaN, "month"), 0);
});

test("trials and paused subscriptions are not revenue; past_due is, unless switched off", () => {
  const subs = [{ id: "a", mrr: 100, status: "active" }, { id: "b", mrr: 200, status: "trialing" }, { id: "c", mrr: 400, status: "past_due" }, { id: "d", mrr: 800, status: "paused" }];
  assert.deepEqual(liveMap(subs), { a: 100, c: 400 });
  assert.deepEqual(liveMap(subs, { countPastDue: false }), { a: 100 });
});

test("movements splits new, expansion, contraction, churn and reactivation", () => {
  const m = movements({ a: 100, b: 100, c: 100 }, { a: 150, b: 60, d: 300, e: 50 }, { e: 1 });
  assert.equal(m.expansion, 50); assert.equal(m.contraction, 40);
  assert.equal(m.new, 300); assert.equal(m.newCount, 1);
  assert.equal(m.reactivation, 50); assert.equal(m.reactivationCount, 1);
  assert.equal(m.churn, 100); assert.equal(m.churnCount, 1);
});

test("mapAt respects start and end instants", () => {
  const subs = [{ id: "a", mrr: 100, status: "canceled", created: D(2026, 1, 10), endedAt: D(2026, 3, 5) }, { id: "b", mrr: 50, status: "active", created: D(2026, 2, 1), endedAt: null }];
  assert.deepEqual(mapAt(subs, D(2026, 1, 31)), { a: 100 });
  assert.deepEqual(mapAt(subs, D(2026, 2, 28)), { a: 100, b: 50 });
  assert.deepEqual(mapAt(subs, D(2026, 3, 31)), { b: 50 });
});

test("monthEnds ends on the last millisecond of each month and on now for the current one", () => {
  const now = D(2026, 10, 15);
  const e = monthEnds(now, 3);
  assert.deepEqual(e.map((x) => x.month), ["2026-08", "2026-09", "2026-10"]);
  assert.equal(e[0].t, D(2026, 9, 1) - 1);
  assert.equal(e[2].t, now);
});

test("backfill reconciles: start + new - churn = end, month by month", () => {
  const now = D(2026, 10, 15);
  const subs = [
    { id: "a", mrr: 1000, status: "canceled", created: D(2026, 5, 3), endedAt: D(2026, 8, 20) },
    { id: "b", mrr: 2000, status: "active", created: D(2026, 7, 1), endedAt: null },
    { id: "c", mrr: 500, status: "active", created: D(2026, 9, 9), endedAt: null },
  ];
  const { months } = backfill(subs, now, 6);
  assert.equal(months.length, 6);
  for (const m of months) assert.equal(m.startMrr + m.new + m.reactivation + m.expansion - m.contraction - m.churn, m.mrr, m.month);
  const aug = months.find((m) => m.month === "2026-08");
  assert.equal(aug.churn, 1000); assert.equal(aug.churnCount, 1);
  assert.equal(months.at(-1).mrr, 2500);
  assert.ok(months.every((m) => m.approximate));
});

test("applySync folds live changes into the current month and remembers who has been seen", () => {
  const now = D(2026, 10, 15);
  const st = { months: {}, last: { a: 100, b: 100 }, ever: { a: 1, b: 1, z: 1 }, lastSyncAt: null };
  applySync(st, { a: 150, b: 100, z: 40, n: 10 }, now);
  const r = st.months["2026-10"];
  assert.equal(r.expansion, 50); assert.equal(r.reactivation, 40); assert.equal(r.new, 10);
  assert.equal(r.mrr, 300); assert.equal(r.startMrr, 200);
  applySync(st, { a: 150, b: 100, z: 40, n: 10 }, now + 1000);
  assert.equal(st.months["2026-10"].expansion, 50, "an unchanged second sync adds nothing");
  applySync(st, { a: 150 }, now + 2000);
  assert.equal(st.months["2026-10"].churn, 150);
  assert.equal(st.months["2026-10"].churnCount, 3);
});

test("summarize computes retention from the last complete month", () => {
  const months = [
    { month: "2026-08", mrr: 1000, customers: 10, new: 0, expansion: 0, contraction: 0, churn: 0, reactivation: 0, newCount: 0, churnCount: 0, startMrr: 1000, startCustomers: 10 },
    { month: "2026-09", mrr: 1100, customers: 11, new: 200, expansion: 100, contraction: 50, churn: 150, reactivation: 0, newCount: 2, churnCount: 1, startMrr: 1000, startCustomers: 10 },
    { month: "2026-10", mrr: 1210, customers: 12, new: 110, expansion: 0, contraction: 0, churn: 0, reactivation: 0, newCount: 1, churnCount: 0, startMrr: 1100, startCustomers: 11 },
  ];
  const s = summarize(months);
  assert.equal(s.mrr, 1210); assert.equal(s.arr, 14520);
  assert.equal(s.rates.basis, "2026-09");
  assert.equal(s.rates.nrr, 0.9); assert.equal(s.rates.grr, 0.8);
  assert.equal(s.rates.logoChurn, 0.1); assert.equal(s.rates.quickRatio, 1.5);
  assert.equal(summarize([]), null);
});

test("cohorts: logo and revenue retention by signup month", async () => {
  const { cohorts } = await import("./metrics.mjs");
  const subs = [
    { id: "a", mrr: 100, status: "active", created: D(2026, 8, 5), endedAt: null },
    { id: "b", mrr: 300, status: "canceled", created: D(2026, 8, 20), endedAt: D(2026, 9, 10) },
    { id: "c", mrr: 50, status: "canceled", created: D(2026, 9, 2), endedAt: D(2026, 9, 3) },
    { id: "t", mrr: 999, status: "trialing", created: D(2026, 9, 2), endedAt: null },
    { id: "z", mrr: 0, status: "active", created: D(2026, 9, 2), endedAt: null },
  ];
  const rows = cohorts(subs, D(2026, 10, 15), 3);
  const aug = rows.find((r) => r.month === "2026-08");
  assert.equal(aug.size, 2); assert.equal(aug.mrr, 400);
  assert.deepEqual(aug.logo, [1, 0.5, 0.5]);
  assert.deepEqual(aug.revenue, [1, 0.25, 0.25]);
  const sep = rows.find((r) => r.month === "2026-09");
  assert.equal(sep.size, 1); assert.deepEqual(sep.logo, [0, 0]);
  assert.equal(rows.find((r) => r.month === "2026-10").size, 0);
});
