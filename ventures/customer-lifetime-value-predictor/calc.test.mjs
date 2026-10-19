import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lgamma, hyp2f1, parseOrders, parseDay, summarize, fitBgnbd, fitGammaGamma, probAlive,
  expectedPurchases, expectedNewCustomer, backtest, analyze, reportCsv, simulateOrders, sampleText, dayToIso, cohortRetention,
} from "./calc.mjs";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b}`);

test("lgamma matches known values", () => {
  near(lgamma(5), Math.log(24), 1e-12);
  near(lgamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-12);
  near(lgamma(0.1), 2.252712651734206, 1e-10);
  near(lgamma(31), 74.65823634883016, 1e-9);
});

test("hyp2f1 matches closed forms", () => {
  near(hyp2f1(1, 1, 2, 0.5), -Math.log(0.5) / 0.5, 1e-12);
  near(hyp2f1(2.5, 3, 3, 0.4), Math.pow(0.6, -2.5), 1e-10);
  near(hyp2f1(0.7, 1.3, 2.2, 0), 1, 0);
});

test("dates: ISO, US and day-first when unambiguous", () => {
  assert.equal(dayToIso(parseDay("2025-03-09")), "2025-03-09");
  assert.equal(dayToIso(parseDay("3/9/2025")), "2025-03-09");
  assert.equal(dayToIso(parseDay("25/03/2025")), "2025-03-25");
  assert.equal(dayToIso(parseDay("2025-03-09T14:22:01Z")), "2025-03-09");
  assert.ok(Number.isNaN(parseDay("soon")));
});

test("parseOrders finds columns in a store-style export, drops refunds and junk", () => {
  const csv = 'Name,Email,Created at,Total,Currency\n#1,a@x.com,2025-01-02 10:00:00 -0500,"$1,200.50",USD\n#2,a@x.com,2025-02-02,30,USD\n#3,b@x.com,2025-02-03,-30,USD\n#4,,2025-02-03,10,USD\n#5,c@x.com,not a date,10,USD';
  const r = parseOrders(csv);
  assert.equal(r.orders.length, 2);
  assert.equal(r.orders[0].amount, 1200.5);
  assert.equal(r.refunds, 1);
  assert.equal(r.skipped, 2);
  assert.equal(r.columns.customer, "email");
  assert.equal(r.columns.date, "created at");
});

test("parseOrders accepts a headerless three-column list and reports missing columns", () => {
  const r = parseOrders("u1,2025-01-01,10\nu1,2025-02-01,12\nu2,2025-02-05,8");
  assert.equal(r.orders.length, 3);
  const bad = parseOrders("foo,bar\n1,2");
  assert.match(bad.error, /Could not find the columns/);
  assert.match(parseOrders("").error, /order list/);
});

test("summarize counts repeat purchase days, merges same-day orders", () => {
  const d = parseDay("2025-01-01");
  const orders = [
    { id: "a", day: d, amount: 10 }, { id: "a", day: d, amount: 5 },
    { id: "a", day: d + 14, amount: 20 }, { id: "a", day: d + 35, amount: 40 },
    { id: "b", day: d + 7, amount: 9 },
  ];
  const rows = summarize(orders);
  const a = rows.find((r) => r.id === "a"), b = rows.find((r) => r.id === "b");
  assert.equal(a.x, 2);
  assert.equal(a.tx, 5);
  assert.equal(a.T, 5);
  assert.equal(a.m, 30);
  assert.equal(a.firstOrder, 15);
  assert.equal(b.x, 0);
  assert.equal(b.T, 4);
});

const truth = { r: 0.25, alpha: 4.4, a: 0.8, b: 2.4 };

test("BG/NBD fit recovers the parameters that generated the data", () => {
  const rows = summarize(simulateOrders({ n: 6000, seed: 11 }));
  const f = fitBgnbd(rows);
  near(f.r / truth.r, 1, 0.12, "r");
  near(f.alpha / truth.alpha, 1, 0.2, "alpha");
  // a and b are only weakly identified on their own; their mean a/(a+b) is not.
  near(f.a / (f.a + f.b), truth.a / (truth.a + truth.b), 0.06, "a/(a+b)");
});

test("expected purchases with the true parameters match a simulated holdout", () => {
  const o = simulateOrders({ n: 20000, seed: 3 });
  const end = Math.max(...o.map((x) => x.day)), cal = end - 182;
  const rows = summarize(o, cal);
  const actual = new Set(), byId = new Map();
  for (const x of o) if (x.day > cal) { const k = x.id + "|" + x.day; if (!actual.has(k)) { actual.add(k); byId.set(x.id, (byId.get(x.id) || 0) + 1); } }
  let pred = 0, real = 0;
  for (const r of rows) { pred += expectedPurchases(truth, r.x, r.tx, r.T, 26); real += byId.get(r.id) || 0; }
  near(pred / real, 1, 0.03);
});

test("probability alive rises with recency and falls with idle time", () => {
  const p = truth;
  assert.equal(probAlive(p, 0, 0, 30), 1);
  assert.ok(probAlive(p, 3, 50, 52) > probAlive(p, 3, 20, 52));
  assert.ok(probAlive(p, 3, 20, 52) > probAlive(p, 3, 20, 104));
  for (const v of [probAlive(p, 1, 1, 100), probAlive(p, 9, 90, 91)]) assert.ok(v > 0 && v <= 1);
});

test("expected purchases grow with the horizon and never go negative", () => {
  let prev = 0;
  for (const t of [1, 4, 13, 26, 52, 104]) {
    const e = expectedPurchases(truth, 2, 10, 40, t);
    assert.ok(e >= prev && e >= 0);
    prev = e;
  }
  assert.ok(expectedNewCustomer(truth, 52) > expectedNewCustomer(truth, 13));
  assert.ok(Number.isFinite(expectedPurchases({ ...truth, a: 1 }, 1, 5, 20, 10)));
});

test("Gamma-Gamma fit recovers mean spend", () => {
  const o = simulateOrders({ n: 6000, seed: 5, params: { r: 0.6, alpha: 5, a: 1.2, b: 3 } });
  const rows = summarize(o);
  const gg = fitGammaGamma(rows);
  const truthMean = (6 * 15) / (4 - 1);
  near((gg.p * gg.gamma) / (gg.q - 1) / truthMean, 1, 0.2);
});

test("backtest on simulated data is within 15% and buckets add up", () => {
  const bt = backtest(simulateOrders({ n: 5000, seed: 9 }), 26);
  assert.ok(Math.abs(bt.errorPct) < 0.15, String(bt.errorPct));
  near(bt.buckets.reduce((s, b) => s + b.predicted, 0), bt.predicted, 1e-6);
  assert.equal(bt.buckets.reduce((s, b) => s + b.customers, 0), bt.customers);
});

test("analyze: value is positive, margin scales it, discounting shrinks it", () => {
  const o = simulateOrders({ n: 1200, seed: 2 });
  const base = analyze(o, { margin: 1, annualDiscount: 0 });
  const half = analyze(o, { margin: 0.5, annualDiscount: 0 });
  const disc = analyze(o, { margin: 1, annualDiscount: 0.3 });
  assert.ok(base.summary.totalClv > 0);
  near(half.summary.totalClv / base.summary.totalClv, 0.5, 1e-9);
  assert.ok(disc.summary.totalClv < base.summary.totalClv);
  const longer = analyze(o, { horizonMonths: 24, annualDiscount: 0 });
  assert.ok(longer.summary.totalClv > base.summary.totalClv);
  assert.equal(base.customers.length, base.summary.customers);
  assert.ok(base.summary.topShare > 0.2 && base.summary.topShare <= 1);
  assert.ok(base.newCustomer.value > 0);
});

test("analyze refuses inputs it cannot model, with a reason", () => {
  assert.match(analyze([{ id: "a", day: 1, amount: 1 }]).error, /at least 30/);
  const one = Array.from({ length: 40 }, (_, i) => ({ id: "c" + i, day: 20000 + i, amount: 10 }));
  assert.match(analyze(one).error, /bought more than once/);
  const o = simulateOrders({ n: 300, seed: 1 });
  assert.match(analyze(o, { horizonMonths: 0 }).error, /horizon/);
  assert.match(analyze(o, { margin: 0 }).error, /Margin/);
});

test("segments partition the customers", () => {
  const r = analyze(simulateOrders({ n: 800, seed: 4 }));
  const total = Object.values(r.segments).reduce((s, x) => s + x.customers, 0);
  assert.equal(total, r.summary.customers);
});

test("csv export is spreadsheet-safe and has one row per customer", () => {
  const r = analyze(simulateOrders({ n: 400, seed: 6 }));
  r.sorted[0].id = "=HYPERLINK(\"http://x\")";
  const csv = reportCsv(r);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, r.summary.customers + 1);
  assert.match(lines[1], /^"'=HYPERLINK/);
  assert.match(lines[0], /^customer,repeat_orders/);
});

test("sample data parses and analyzes end to end", () => {
  const p = parseOrders(sampleText());
  assert.ok(!p.error);
  const r = analyze(p.orders);
  assert.ok(!r.error);
  assert.ok(r.backtest);
  assert.ok(r.findings.length >= 2);
});

test("paybackCurve: month-by-month return on an acquisition cost", async () => {
  const { paybackCurve } = await import("./calc.mjs");
  const res = analyze(simulateOrders({ n: 1200, seed: 2 }), { horizonMonths: 12, margin: 0.5, annualDiscount: 0.1 });
  const pb = paybackCurve(res, 20);
  // the curve at the horizon is the new-customer value shown elsewhere
  near(pb.ltv, res.newCustomer.value, 1e-6);
  near(pb.ltvToCac, res.newCustomer.value / 20, 1e-9);
  near(pb.maxCacForTarget * pb.target, pb.ltv, 1e-9);
  for (let i = 1; i < pb.months.length; i++) assert.ok(pb.months[i].cumulative >= pb.months[i - 1].cumulative);
  // a cost under the first order's margin pays back immediately; an absurd one never does
  assert.equal(paybackCurve(res, res.newCustomer.firstOrder * 0.5 * 0.9).paybackMonth, 0);
  assert.equal(paybackCurve(res, 1e9).paybackMonth, null);
  const mid = paybackCurve(res, res.newCustomer.value * 0.9).paybackMonth;
  assert.ok(mid > 0 && mid <= 12);
  assert.match(paybackCurve(res, 0).error, /above zero/);
});

test("cohortRetention: repeat share and revenue by first-order month, unobserved windows are null", () => {
  const d = (s) => parseDay(s);
  const orders = [
    { id: "a", day: d("2025-01-02"), amount: 10 }, { id: "a", day: d("2025-01-20"), amount: 20 },
    { id: "b", day: d("2025-01-10"), amount: 30 },
    { id: "c", day: d("2025-03-01"), amount: 50 }, { id: "c", day: d("2025-06-01"), amount: 5 },
    { id: "z", day: d("2025-06-30"), amount: 1 },
  ];
  const { cohorts } = cohortRetention(orders);
  assert.deepEqual(cohorts.map((c) => c.month), ["2025-01", "2025-03", "2025-06"]);
  const jan = cohorts[0];
  assert.equal(jan.customers, 2);
  assert.equal(jan.firstOrder, 20);
  assert.equal(jan.repeat[30], 0.5);
  assert.equal(jan.revenue[30], 30);
  assert.equal(jan.repeat[90], 0.5);
  assert.equal(jan.repeat[180], null);
  assert.equal(jan.repeat[365], null);
  assert.equal(cohorts[1].repeat[90], 1);
  assert.equal(cohorts[1].repeat[30], 0);
  assert.equal(cohorts[2].repeat[30], null);
  assert.deepEqual(cohortRetention([]).cohorts, []);
});
