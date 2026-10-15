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

import { breakdown } from "./metrics.mjs";
test("breakdown: plan totals equal headline MRR and concentration is by customer", () => {
  const subs = [
    { id: "a", customer: "c1", status: "active", mrr: 6000, plans: { Pro: 4000, Seats: 2000 } },
    { id: "b", customer: "c1", status: "active", mrr: 1000, plans: { Pro: 1000 } },
    { id: "c", customer: "c2", status: "past_due", mrr: 3000, plans: { Starter: 3000 } },
    { id: "d", customer: "c3", status: "canceled", mrr: 9999, plans: { Pro: 9999 } },
    { id: "e", customer: "c4", status: "trialing", mrr: 500 },
  ];
  const b = breakdown(subs);
  assert.equal(b.total, 10000);
  assert.deepEqual(b.plans.map((p) => [p.plan, p.mrr, p.subs]), [["Pro", 5000, 2], ["Starter", 3000, 1], ["Seats", 2000, 1]]);
  assert.equal(b.plans.reduce((a, p) => a + p.mrr, 0), b.total);
  assert.deepEqual(b.atRisk, { mrr: 3000, subs: 1, share: 0.3 });
  assert.equal(breakdown(subs, { countPastDue: false }).atRisk.mrr, 0);
  assert.equal(b.concentration.customers, 2);
  assert.equal(b.concentration.top1, 0.7);
  assert.equal(breakdown(subs, { countPastDue: false }).total, 7000);
  assert.equal(breakdown([]).plans.length, 0);
});

import { forecast } from "./metrics.mjs";
const mo = (month, startMrr, o = {}) => ({ month, startMrr, mrr: startMrr, new: 0, reactivation: 0, expansion: 0, contraction: 0, churn: 0, ...o });

test("forecast needs two complete months with revenue", () => {
  assert.equal(forecast([mo("2026-01", 1000)]), null);
  assert.equal(forecast([mo("2026-01", 1000), mo("2026-02", 1000)]), null);
  assert.equal(forecast([mo("2026-01", 0), mo("2026-02", 0), mo("2026-03", 1000)]), null);
});

test("forecast rolls MRR forward; low <= base <= high; months continue the calendar", () => {
  const ms = [mo("2026-10", 1000, { new: 100, churn: 50 }), mo("2026-11", 1050, { new: 200, churn: 100, expansion: 50 }), mo("2026-12", 1200, { mrr: 1300 })];
  const f = forecast(ms, { horizon: 3 });
  assert.deepEqual(f.months, ["2027-01", "2027-02", "2027-03"]);
  assert.deepEqual(f.basis, ["2026-10", "2026-11"]);
  assert.equal(f.startMrr, 1300);
  for (let i = 0; i < 3; i++) { assert.ok(f.low[i] <= f.base[i]); assert.ok(f.base[i] <= f.high[i]); }
  // base: adds avg 150, loss avg (0.05+0.0952)/2, exp avg (0+0.0476)/2
  const loss = (50 / 1000 + 100 / 1050) / 2, exp = (50 / 1050) / 2;
  assert.equal(f.base[0], Math.round(1300 * (1 + exp - loss) + 150));
});

test("forecast never goes below zero", () => {
  const ms = [mo("2026-01", 1000, { churn: 900 }), mo("2026-02", 100, { churn: 100 }), mo("2026-03", 0, { mrr: 10 })];
  const f = forecast(ms, { horizon: 12 });
  assert.ok(f.low.every((v) => v >= 0));
});

import { concentration } from "./metrics.mjs";

test("concentration reports top-N shares and a risk band, with no ids", () => {
  const c = concentration({ a: 500, b: 300, c: 100, d: 100 });
  assert.equal(c.subscriptions, 4);
  assert.equal(c.top1, 0.5);
  assert.equal(c.top5, 1);
  assert.deepEqual(c.top, [0.5, 0.3, 0.1, 0.1]);
  assert.equal(c.risk, "high");
  assert.equal(concentration(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, 100]))).risk, "low");
  assert.equal(concentration({ a: 120, ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`s${i}`, 100])) }).risk, "moderate");
  assert.equal(concentration({}), null);
  assert.ok(!JSON.stringify(c).includes('"a"'));
});

import { monthsCsv } from "./metrics.mjs";
test("monthsCsv writes major units, flags approximate months, and defuses formulas", () => {
  const m = { month: "2026-09", mrr: 123456, customers: 3, new: 1000, expansion: 0, reactivation: 0, contraction: 50, churn: 200, approximate: true };
  const csv = monthsCsv([m, { ...m, month: "=HYPERLINK(1)", approximate: false }], "eur");
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "# currency: EUR, amounts in major units");
  assert.equal(lines[2], "2026-09,1234.56,3,10.00,0.00,0.00,0.50,2.00,yes");
  assert.ok(lines[3].startsWith("'=HYPERLINK(1)"));
});
