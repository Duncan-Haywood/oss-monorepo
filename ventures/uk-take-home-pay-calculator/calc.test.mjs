import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse, annual } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const plain = (salary, extra = {}) => compute({ salary, pensionPct: 0, method: "none", plan: "none", pgl: "no", ...extra });

test("known salaries match the published bands", () => {
  const a = plain(30000);
  assert.equal(a.tax, 3486);
  assert.equal(a.ni, 1394.4);
  assert.equal(a.takeHome, 25119.6);
  assert.equal(plain(50270).tax, 7540);
  assert.equal(plain(60000).tax, 11432);
  assert.equal(plain(100000).tax, 27432);
  assert.equal(plain(125140).tax, 42516);
  assert.equal(plain(150000).tax, 53703);
});

test("below the personal allowance nothing is taxed", () => {
  const a = plain(12000);
  assert.equal(a.tax, 0);
  assert.equal(a.ni, 0);
  assert.equal(a.takeHome, 12000);
});

test("personal allowance tapers between 100,000 and 125,140 and marginal rate is 60% plus NI", () => {
  const a = plain(110000);
  assert.equal(a.allowance, 7570);
  assert.equal(plain(105000, { plan: "2" }).marginal, 71);
  assert.equal(plain(105000).marginal, 62);
  assert.ok(plain(110000).findings.some((f) => f.severity === "high" && f.title.includes("60%")));
});

test("student and postgraduate loans take 9% and 6% over their thresholds", () => {
  assert.equal(plain(40000, { plan: "2" }).sl, 1037.7);
  assert.equal(plain(40000, { plan: "5" }).sl, 1350);
  assert.equal(plain(40000, { pgl: "yes" }).pg, 1140);
  assert.equal(plain(20000, { plan: "1" }).sl, 0);
});

test("salary sacrifice saves tax and NI, net pay saves tax only, relief at source matches net pay for a basic rate payer", () => {
  const s = run({ salary: 45000, pensionPct: 5, method: "sacrifice", plan: "none" });
  const n = run({ salary: 45000, pensionPct: 5, method: "netpay", plan: "none" });
  const r = run({ salary: 45000, pensionPct: 5, method: "ras", plan: "none" });
  assert.equal(s.contrib, 2250);
  assert.ok(s.takeHome > n.takeHome);
  assert.equal(n.takeHome, r.takeHome);
  assert.equal(n.tax, plain(45000).tax - 450);
  assert.equal(s.ni, plain(45000).ni - 180);
});

test("higher rate payer gets 40% relief on a net pay contribution and relief at source via extended band", () => {
  const base = plain(70000);
  const n = run({ salary: 70000, pensionPct: 10, method: "netpay", plan: "none" });
  const r = run({ salary: 70000, pensionPct: 10, method: "ras", plan: "none" });
  assert.equal(n.tax, base.tax - 2800);
  assert.equal(n.pensionFromPay, 7000);
  assert.equal(r.pensionFromPay, 5600);
  assert.equal(r.tax, base.tax - 1400);
  assert.equal(n.takeHome, r.takeHome);
});

test("pension can bring adjusted net income under 100,000 and restore the allowance", () => {
  const a = run({ salary: 110000, pensionPct: 10, method: "netpay", plan: "none" });
  assert.equal(a.allowance, 12570);
});

test("compare table lists three methods when a pension is entered", () => {
  assert.equal(run({}).compare.length, 3);
  assert.equal(plain(40000).compare.length, 0);
  const c = run({}).compare;
  assert.ok(c[0].costToYou < c[1].costToYou);
});

test("monthly and weekly derive from the annual figure", () => {
  const a = plain(30000);
  assert.equal(a.monthly, 2093.3);
  assert.equal(a.weekly, 483.07);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...SAMPLE, salary: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, salary: -5 }).errors.length);
  assert.ok(compute({ ...SAMPLE, salary: "abc" }).errors.length);
  assert.ok(compute({ ...SAMPLE, pensionPct: 150 }).errors.length);
  assert.ok(compute({ ...SAMPLE, method: "x" }).errors.length);
  assert.ok(compute({ ...SAMPLE, plan: "9" }).errors.length);
  assert.ok(parse(undefined).errors.length);
  assert.equal(annual(30000, 0, "none", "none", false).takeHome, 25119.6);
});

test("summary names the source and carries the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.ok(t.includes("Not tax advice"));
  assert.ok(t.includes("Take-home pay per year: GBP"));
});
