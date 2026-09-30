import { test } from "node:test";
import assert from "node:assert/strict";
import { value, factors, sampleText, reportCsv, money, multiple, pct, TYPES } from "./calc.mjs";

const base = { type: "ecommerce", revenue: 500000, sde: 100000, growth: 10, monthlyChurn: 2, topShare: 20, ownerHours: 30, ageMonths: 30, sellingFeePct: 10 };

test("neutral profile lands on the base multiple", () => {
  const r = value({ ...base, growth: 10, topShare: 20, ownerHours: 30, ageMonths: 30 });
  // growth 0, concentration 0, owner -0.2, age 0
  assert.ok(Math.abs(r.sdeMult - (TYPES.ecommerce.sde - 0.2)) < 1e-9);
  assert.equal(Math.round(r.mid), Math.round(100000 * r.sdeMult));
});

test("range brackets the midpoint symmetrically and net applies the fee", () => {
  const r = value(base);
  assert.ok(r.low < r.mid && r.mid < r.high);
  assert.ok(Math.abs((r.high - r.mid) - (r.mid - r.low)) < 1e-6);
  assert.ok(Math.abs(r.netMid - r.mid * 0.9) < 1e-6);
});

test("better fundamentals raise the value", () => {
  const weak = value({ ...base, growth: -20, topShare: 60, ownerHours: 50, ageMonths: 6 });
  const strong = value({ ...base, growth: 60, topShare: 5, ownerHours: 5, ageMonths: 60 });
  assert.ok(strong.mid > weak.mid * 1.5);
});

test("multiple never falls below the floor", () => {
  const r = value({ ...base, type: "agency", growth: -50, topShare: 90, ownerHours: 80, ageMonths: 1 });
  assert.equal(r.sdeMult, 0.8);
});

test("SaaS uses churn and blends SDE and ARR methods", () => {
  const r = value({ ...base, type: "saas", mrr: 20000 });
  assert.ok(r.factors.some((f) => f.key === "churn"));
  assert.ok(r.arrValue && r.sdeValue);
  assert.ok(Math.abs(r.mid - (r.arrValue + r.sdeValue) / 2) < 1e-6);
  assert.ok(value({ ...base, type: "saas", mrr: 20000, monthlyChurn: 8 }).mid < value({ ...base, type: "saas", mrr: 20000, monthlyChurn: 1 }).mid);
});

test("non-SaaS types have no churn factor and ignore MRR", () => {
  const r = value({ ...base, mrr: 20000 });
  assert.ok(!r.factors.some((f) => f.key === "churn"));
  assert.equal(r.arrValue, null);
});

test("levers list only penalised factors, largest first, with correct dollar gain", () => {
  const r = value({ ...base, topShare: 60, ownerHours: 50 });
  assert.deepEqual(r.levers.map((l) => l.key).slice(0, 2), ["concentration", "owner"]);
  assert.equal(r.levers[0].valueGain, Math.round(0.7 * base.sde));
  assert.ok(r.levers.every((l) => l.valueGain > 0));
});

test("SaaS with no earnings falls back to ARR; nothing to price errors", () => {
  const r = value({ ...base, type: "saas", sde: 0, mrr: 10000, revenue: 120000 });
  assert.equal(r.sdeValue, null);
  assert.ok(r.arrValue > 0);
  assert.match(value({ ...base, sde: 0 }).error, /no earnings/);
});

test("input validation", () => {
  assert.match(value({ ...base, revenue: NaN }).error, /revenue/);
  assert.match(value({ ...base, sde: NaN }).error, /profit/);
  assert.match(value({ ...base, sde: 600000 }).error, /larger than revenue/);
  assert.match(value({ ...base, topShare: 120 }).error, /0 and 100/);
  assert.match(value({ ...base, sellingFeePct: 80 }).error, /fee/);
  assert.match(value({ ...base, type: "nope" }).error, /type/);
  assert.match(value({ ...base, growth: "x" }).error, /growth/);
});

test("findings flag concentration, owner load, churn and youth", () => {
  const r = value({ ...base, type: "saas", mrr: 5000, monthlyChurn: 7, topShare: 45, ownerHours: 50, ageMonths: 6, growth: -20 });
  const titles = r.findings.map((f) => f.title).join("|");
  for (const s of [/Concentration/, /Owner dependence/, /Under a year/, /Churn/, /Shrinking/, /not an appraisal/]) assert.match(titles, s);
});

test("buyer payback is price over SDE", () => {
  const r = value(base);
  assert.ok(Math.abs(r.buyerPaybackYears - r.mid / base.sde) < 1e-9);
  assert.ok(Math.abs(r.buyerAnnualReturn * r.buyerPaybackYears - 1) < 1e-9);
});

test("factor bands at boundaries", () => {
  const f = (o) => Object.fromEntries(factors({ type: "saas", growth: 10, monthlyChurn: 2, topShare: 20, ownerHours: 30, ageMonths: 30, ...o }).map((x) => [x.key, x.delta]));
  assert.equal(f({ growth: 50 }).growth, 0.6);
  assert.equal(f({ growth: 49.9 }).growth, 0.3);
  assert.equal(f({ monthlyChurn: 3 }).churn, -0.3);
  assert.equal(f({ topShare: 15 }).concentration, 0);
  assert.equal(f({ ownerHours: 10 }).owner, 0.1);
  assert.equal(f({ ageMonths: 36 }).age, 0.2);
});

test("sample, csv and formatters", () => {
  const r = value(sampleText());
  assert.ok(!r.error && r.mid > 100000);
  const csv = reportCsv(r);
  assert.match(csv, /^metric,value\n/);
  assert.match(csv, /value_mid,\d+/);
  assert.match(csv, /factor_growth,/);
  assert.equal(money(1234567), "$1,234,567");
  assert.equal(multiple(3.256), "3.26x");
  assert.equal(pct(0.256), "25.6%");
  assert.equal(money(NaN), "n/a");
});
