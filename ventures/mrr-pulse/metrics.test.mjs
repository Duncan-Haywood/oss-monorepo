import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyAmount, liveMap, movements, backfill, applySync, summarize, monthEnds, mapAt, put } from "./metrics.mjs";

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

test("netNew adds new, expansion and reactivation and subtracts contraction and churn", () => {
  const cur = { month: "2026-10", mrr: 0, customers: 0, new: 100, expansion: 20, contraction: 3, churn: 5, reactivation: 40, newCount: 0, churnCount: 0, startMrr: 0, startCustomers: 0 };
  assert.equal(summarize([cur]).netNew, 152);
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

test("backfill opens each window with the MRR standing at the end of the month before it", () => {
  const now = D(2026, 10, 15);
  const subs = [
    { id: "a", mrr: 700, status: "active", created: D(2026, 7, 10), endedAt: null },
    { id: "b", mrr: 300, status: "active", created: D(2026, 3, 1), endedAt: null },
  ];
  const { months } = backfill(subs, now, 3);
  assert.deepEqual(months.map((m) => m.month), ["2026-08", "2026-09", "2026-10"]);
  assert.equal(months[0].startMrr, 1000);
  assert.equal(months[0].new, 0);
});

test("forecast defaults to six months; low takes the worst churn, high the best", () => {
  const ms = [mo("2026-01", 1000, { churn: 50 }), mo("2026-02", 1000, { churn: 200 }), mo("2026-03", 1000, { churn: 100 }), mo("2026-04", 1000)];
  const f = forecast(ms);
  assert.equal(f.months.length, 6);
  assert.equal(f.base.length, 6);
  // adds 0, exp 0: low uses the worst loss (0.2), high the best (0.05)
  assert.equal(f.low[0], Math.round(1000 * (1 - 0.2)));
  assert.equal(f.high[0], Math.round(1000 * (1 - 0.05)));
});

test("zero-decimal currencies are whole units, as Stripe sends them (red team 2026-11-17)", async () => {
  const { formatMoney, minorExponent } = await import("./metrics.mjs");
  assert.equal(formatMoney(5000, "jpy"), "¥5,000");
  assert.equal(formatMoney(5000, "usd"), "$50");
  assert.equal(minorExponent("bhd"), 3);
  const m = { month: "2026-01", mrr: 5000, customers: 1, new: 5000, expansion: 0, reactivation: 0, contraction: 0, churn: 0, approximate: false };
  assert.match(monthsCsv([m], "jpy"), /\n2026-01,5000,1,5000,0,0,0,0,no\n/);
  assert.match(monthsCsv([m], "usd"), /\n2026-01,50\.00,1,50\.00,/);
});

// Red team 2026-11-18: a trial is not revenue on the live tiles, but the
// rebuilt history counted every subscription from `created`, so a trial that
// converted showed as MRR during its free weeks, and a trial canceled before
// it ever paid showed as new MRR and then churn.
test("rebuilt history and cohorts count a subscription from the end of its trial", async () => {
  const { cohorts } = await import("./metrics.mjs");
  const subs = [
    { id: "conv", mrr: 1000, status: "active", created: D(2026, 8, 20), trialEnd: D(2026, 9, 3), endedAt: null },
    { id: "never", mrr: 500, status: "canceled", created: D(2026, 8, 25), trialEnd: D(2026, 9, 8), endedAt: D(2026, 9, 8) },
    { id: "paid", mrr: 200, status: "active", created: D(2026, 8, 1), trialEnd: null, endedAt: null },
  ];
  assert.deepEqual(mapAt(subs, D(2026, 8, 31)), { paid: 200 });
  assert.deepEqual(mapAt(subs, D(2026, 9, 30)), { paid: 200, conv: 1000 });
  const { months } = backfill(subs, D(2026, 10, 15), 3);
  const aug = months.find((m) => m.month === "2026-08"), sep = months.find((m) => m.month === "2026-09");
  assert.equal(aug.mrr, 200); assert.equal(aug.churn, 0);
  assert.equal(sep.new, 1000); assert.equal(sep.churn, 0); assert.equal(sep.churnCount, 0);
  const rows = cohorts(subs, D(2026, 10, 15), 3);
  assert.equal(rows.find((r) => r.month === "2026-08").size, 1);
  const sepC = rows.find((r) => r.month === "2026-09");
  assert.equal(sepC.size, 1); assert.equal(sepC.mrr, 1000); assert.deepEqual(sepC.logo, [1, 1]);
});

// Red team 2026-11-18 guards for mutants that escaped the suite.
test("backfill's first month counts a subscription started in it as new", () => {
  const subs = [{ id: "a", mrr: 700, status: "active", created: D(2026, 8, 10), endedAt: null }];
  const { months } = backfill(subs, D(2026, 10, 15), 3);
  assert.equal(months[0].month, "2026-08");
  assert.equal(months[0].startMrr, 0); assert.equal(months[0].new, 700); assert.equal(months[0].newCount, 1);
});

test("growth is null, not Infinity, when the prior month had no MRR", () => {
  const s = summarize([{ month: "2026-09", mrr: 0, startMrr: 0, customers: 0, new: 0, expansion: 0, contraction: 0, churn: 0, reactivation: 0, churnCount: 0, startCustomers: 0 },
    { month: "2026-10", mrr: 500, startMrr: 0, customers: 1, new: 500, expansion: 0, contraction: 0, churn: 0, reactivation: 0, churnCount: 0, startCustomers: 0 }]);
  assert.equal(s.growthPct, null);
  // A basis month that started at zero MRR has no retention rate: null, not 0/0 = NaN.
  assert.equal(s.rates.nrr, null); assert.equal(s.rates.grr, null); assert.equal(s.rates.revenueChurn, null);
});

test("breakdown counts a subscription worth one minor unit", () => {
  const b = breakdown([{ id: "s1", customer: "c1", status: "active", mrr: 1 }]);
  assert.equal(b.total, 1); assert.equal(b.plans.length, 1);
});

test("an empty cohort carries zero MRR", async () => {
  const { cohorts } = await import("./metrics.mjs");
  const rows = cohorts([], D(2026, 10, 15), 2);
  assert.deepEqual(rows.map((r) => [r.size, r.mrr]), [[0, 0], [0, 0]]);
});

test("concentration: one subscription at exactly a quarter of MRR is high risk", async () => {
  const { concentration } = await import("./metrics.mjs");
  assert.equal(concentration({ a: 25, b: 25, c: 25, d: 25 }).risk, "high");
  assert.equal(concentration({ a: 10, b: 9, c: 9, d: 9, e: 9, f: 9, g: 9, h: 9, i: 9, j: 9, k: 9 }).risk, "moderate");
});

// Red team 2026-11-18 (mrr-pulse campaign): each test below fails with one
// mutant that used to pass the whole suite.
test("summarize: ARPA is 0 with no customers, and growth is the change over last month's MRR", () => {
  const m = (month, mrr, customers) => ({ month, mrr, customers, startMrr: 1000, startCustomers: 1, new: 0, expansion: 0, contraction: 0, churn: 0, reactivation: 0, churnCount: 0 });
  assert.equal(summarize([m("2026-10", 0, 0)]).arpa, 0);
  const s = summarize([m("2026-09", 1000, 2), m("2026-10", 1100, 2)]);
  assert.ok(Math.abs(s.growthPct - 0.1) < 1e-12);
  assert.equal(s.arpa, 550);
});

test("forecast low takes the fewest adds and the least expansion of the basis months", () => {
  const ms = [mo("2026-01", 1000, { new: 100 }), mo("2026-02", 1000, { new: 300, expansion: 100 }), mo("2026-03", 1000)];
  const f = forecast(ms, { horizon: 1 });
  // low: adds min 100, exp min 0, loss 0; high: adds 300, exp 0.1
  assert.equal(f.low[0], 1100);
  assert.equal(f.high[0], Math.round(1000 * 1.1 + 300));
});

test("concentration top10 sums exactly ten subscriptions", () => {
  const c = concentration(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`s${i}`, 100])));
  assert.ok(Math.abs(c.top10 - 10 / 12) < 1e-12);
  assert.ok(Math.abs(c.top5 - 5 / 12) < 1e-12);
});

test("edge amounts and defaults (red team 2026-11-18)", async () => {
  const { cohorts } = await import("./metrics.mjs");
  const now = Date.UTC(2026, 5, 15);
  // A one-cent subscription is still revenue in the rebuilt history.
  assert.deepEqual(mapAt([{ id: "a", mrr: 1, status: "active", created: Date.UTC(2026, 0, 1) }], now), { a: 1 });
  // backfill and cohorts default to twelve months.
  assert.equal(backfill([], now).months.length, 12);
  assert.equal(cohorts([], now).length, 12);
  // A rate over a zero base is null, not NaN.
  const zero = { month: "2026-05", mrr: 0, customers: 0, new: 0, expansion: 0, contraction: 0, churn: 0, reactivation: 0, newCount: 0, churnCount: 0, reactivationCount: 0, startMrr: 0, startCustomers: 0 };
  assert.equal(summarize([zero, { ...zero, month: "2026-06" }]).rates.logoChurn, null);
  assert.equal(summarize([{ ...zero, startCustomers: 4, churnCount: 1 }]).rates.logoChurn, 0.25);
  // Concentration ranks the largest customer first whatever the input order.
  const subs = [10, 30, 20].map((mrr, i) => ({ id: `s${i}`, customer: `c${i}`, mrr, status: "active" }));
  const b = breakdown(subs);
  assert.equal(b.concentration.largest, 30);
  assert.equal(b.concentration.top1, 0.5);
});

// Red team 2026-11-18: every concentration test fed subscriptions already in
// descending order, so a broken sort (`b + a`) still passed. Shuffled input.
test("concentration ranks subscriptions largest first whatever order they arrive in", () => {
  const c = concentration({ a: 100, b: 500, c: 300, d: 100 });
  assert.equal(c.top1, 0.5);
  assert.deepEqual(c.top, [0.5, 0.3, 0.1, 0.1]);
  assert.equal(c.risk, "high");
});

// Stripe gives an incomplete_expired subscription an ended_at about 23 hours
// after creation. Straddling a month end, it read as new MRR then churn.
test("incomplete_expired from the API is neither new MRR nor churn, nor a cohort member", async () => {
  const { cohorts } = await import("./metrics.mjs");
  const s = { id: "x", mrr: 5000, status: "incomplete_expired", created: D(2026, 3, 31) + 12 * 3600e3, endedAt: D(2026, 4, 1) + 11 * 3600e3 };
  assert.deepEqual(mapAt([s], D(2026, 4, 1) - 1), {});
  const { months } = backfill([s], D(2026, 6, 15), 4);
  assert.ok(months.every((m) => m.new === 0 && m.churn === 0 && m.mrr === 0));
  assert.ok(cohorts([s], D(2026, 6, 15), 4).every((r) => r.size === 0));
});

test("backfill counts a subscription paid from the last millisecond before the window as standing, not new (red team 2026-11-19)", () => {
  const edge = D(2026, 8, 1) - 1; // 2026-07-31T23:59:59.999Z, the instant the window opens from
  const subs = [{ id: "a", mrr: 500, status: "active", created: edge, endedAt: null }];
  const { months } = backfill(subs, D(2026, 10, 15), 3);
  assert.equal(months[0].month, "2026-08");
  assert.equal(months[0].startMrr, 500);
  assert.equal(months[0].new, 0);
});

test("logo churn is a rate with a single starting customer, not null (red team 2026-11-19)", () => {
  const row = { mrr: 0, customers: 0, new: 0, expansion: 0, contraction: 0, churn: 900, reactivation: 0, newCount: 0, churnCount: 1, reactivationCount: 0, startMrr: 900, startCustomers: 1 };
  const s = summarize([{ ...row, month: "2026-09" }, { ...row, month: "2026-10", churn: 0, churnCount: 0, startMrr: 0, startCustomers: 0 }]);
  assert.equal(s.rates.logoChurn, 1);
  assert.equal(s.rates.revenueChurn, 1);
});

test("concentration: the largest subscription decides 'high', not the top two together", () => {
  // top1 = 20% (moderate), top2 = 40%: a mutant reading share(2) said high.
  assert.equal(concentration({ a: 200, b: 200, ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`s${i}`, 100])) }).risk, "moderate");
});

test("breakdown of no paying subscriptions reports nothing, not a phantom largest customer", () => {
  const b = breakdown([{ id: "t", status: "trialing", mrr: 500, created: 1 }]);
  assert.deepEqual(b.concentration, { customers: 0, top1: 0, top5: 0, topN: 5, largest: 0 });
  assert.equal(b.total, 0);
});

// Red team 2026-11-19: three mutants escaped this file's tests.
test("applySync opens a new month with every movement at zero before folding the sync in", () => {
  const st = { months: {}, last: { a: 100 }, ever: { a: 1 }, lastSyncAt: null };
  applySync(st, { a: 100, n: 10 }, D(2026, 10, 15));
  const r = st.months["2026-10"];
  for (const k of ["expansion", "contraction", "churn", "reactivation", "churnCount", "reactivationCount"]) assert.equal(r[k], 0, k);
  assert.equal(r.new, 10); assert.equal(r.newCount, 1);
});

test("forecast reads the last three complete months by default", () => {
  const ms = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"].map((m) => mo(m, 1000));
  assert.deepEqual(forecast(ms).basis, ["2026-03", "2026-04", "2026-05"]);
  assert.deepEqual(forecast(ms, { window: 5 }).basis, ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
});

test("concentration leaves out zero-MRR subscriptions", () => {
  const c = concentration({ a: 300, b: 100, free: 0 });
  assert.equal(c.subscriptions, 2);
  assert.deepEqual(c.top, [0.75, 0.25]);
});

test("ids and plan names like toString, constructor or __proto__ are ordinary keys (red team 2026-11-19)", () => {
  const now = Date.UTC(2026, 5, 15);
  const subs = ["toString", "constructor", "__proto__", "hasOwnProperty"].map((id, i) => ({ id, customer: id, status: "active", mrr: 1000 * (i + 1), created: Date.UTC(2026, 4, 2), endedAt: null, plans: { [id]: 1000 * (i + 1) } }));
  subs.forEach((s) => { s.plans = put({}, s.id, s.mrr); });
  const live = liveMap(subs);
  assert.deepEqual(Object.keys(live).sort(), ["__proto__", "constructor", "hasOwnProperty", "toString"]);
  assert.equal(Object.values(live).reduce((a, b) => a + b, 0), 10000);
  // New MRR, not reactivation or nothing: an unseen "toString" is new.
  const m = movements({}, live, {});
  assert.equal(m.new, 10000); assert.equal(m.newCount, 4); assert.equal(m.reactivation, 0);
  assert.equal(movements(live, {}, {}).churn, 10000);
  const h = backfill(subs, now, 3);
  assert.equal(h.months.at(-2).new, 10000); assert.equal(h.months.at(-1).mrr, 10000);
  const b = breakdown(subs);
  assert.deepEqual(b.plans.map((p) => p.plan).sort(), ["__proto__", "constructor", "hasOwnProperty", "toString"]);
  assert.equal(b.plans.reduce((a, p) => a + p.mrr, 0), 10000);
  assert.equal(b.concentration.customers, 4);
  assert.equal({}.mrr, undefined, "Object.prototype was not written to");
  // State read back from JSON (plain objects) folds the same way.
  const st = JSON.parse(JSON.stringify({ months: {}, last: {}, ever: {} }));
  applySync(st, live, now);
  assert.equal(st.months["2026-06"].new, 10000);
  assert.ok(Object.hasOwn(st.ever, "__proto__") && Object.hasOwn(st.ever, "toString"));
  assert.equal(applySync(st, live, now + 1000).new, 0);
});

test("forecast keeps a complete month with any positive starting MRR, however small", () => {
  const f = forecast([mo("2026-01", 1), mo("2026-02", 1), mo("2026-03", 1)], { horizon: 1 });
  assert.ok(f);
  assert.deepEqual(f.basis, ["2026-01", "2026-02"]);
});

test("formatMoney never shows a negative zero for a change that rounds to nothing", async () => {
  const { formatMoney } = await import("./metrics.mjs");
  assert.equal(formatMoney(-30, "usd"), "$0");
  assert.equal(formatMoney(-150, "usd"), "-$2");
  assert.equal(formatMoney(-0.4, "jpy"), "¥0");
});

test("forecast counts contraction as a loss alongside churn (red team 2026-11-20)", () => {
  // Contraction only: 100 of 1000 lost each month, so base rolls 1000 -> 900.
  const ms = [mo("2026-01", 1000, { contraction: 100 }), mo("2026-02", 1000, { contraction: 100 }), mo("2026-03", 1000)];
  assert.equal(forecast(ms, { horizon: 1 }).base[0], 900);
  // Churn and contraction add: 50 + 50 of 1000.
  const both = [mo("2026-01", 1000, { churn: 50, contraction: 50 }), mo("2026-02", 1000, { churn: 50, contraction: 50 }), mo("2026-03", 1000)];
  assert.equal(forecast(both, { horizon: 1 }).base[0], 900);
});
