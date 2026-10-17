import test from "node:test";
import assert from "node:assert/strict";
import { computeRoi, summarize, money, pct } from "./engine.mjs";

test("defaults: 30 leads at $50 with 10% credited, 20% close rate, $1200 jobs at 60% cost", () => {
  const r = computeRoi();
  assert.equal(r.leadCost, 45);
  assert.equal(r.spend, 1350);
  assert.equal(money(r.timeSpend), "$400.00");
  assert.equal(r.hires, 6);
  assert.equal(r.profitPerHire, 480);
  assert.equal(r.income, 2880);
  assert.equal(money(r.net), "$1,130.00");
  assert.equal(money(r.costPerHire), "$291.67");
});

test("break-even close rate is the cost per lead over the earnings per job", () => {
  const r = computeRoi();
  assert.ok(Math.abs(r.breakEvenCloseRate - r.costPerLead / 480) < 1e-12);
  const at = computeRoi({ closeRatePct: r.breakEvenCloseRate * 100 });
  assert.ok(Math.abs(at.net) < 1e-6);
});

test("max lead price puts a lead at exactly zero", () => {
  const r = computeRoi();
  const at = computeRoi({ leadPrice: r.maxLeadPrice });
  assert.ok(Math.abs(at.net) < 1e-6);
  assert.equal(Math.floor(r.maxLeadPrice), 91);
});

test("a slow-quoting low-close month loses money and says so", () => {
  const r = computeRoi({ closeRatePct: 8, minutesPerLead: 40, hourlyValue: 60 });
  assert.ok(r.net < 0);
  assert.equal(summarize(r).status, "warn");
  assert.equal(r.maxLeadPrice, 0);
});

test("zero close rate prices no job instead of dividing by zero", () => {
  const r = computeRoi({ closeRatePct: 0 });
  assert.equal(r.costPerHire, null);
  assert.match(summarize(r).text, /no jobs to price/);
});

test("the repeat multiplier scales what a job is worth", () => {
  assert.equal(computeRoi({ repeatMultiplier: 2 }).profitPerHire, 960);
});

test("full credits make leads free, so no price ceiling", () => {
  assert.equal(computeRoi({ refundPct: 100 }).maxLeadPrice, null);
});

test("scenarios keep the current close rate once and include the chosen price", () => {
  const r = computeRoi({ leadPrice: 60 });
  assert.equal(r.scenarios.filter((s) => s.current).length, 1);
  assert.deepEqual(r.priceScenarios.map((s) => s.price), [20, 35, 50, 60, 75, 100]);
  assert.equal(computeRoi().priceScenarios.filter((s) => s.current).length, 1);
});

test("bad input is named, not silently zeroed", () => {
  assert.throws(() => computeRoi({ closeRatePct: 120 }), /over 100/);
  assert.throws(() => computeRoi({ jobCostPct: 100 }), /under 100/);
  assert.throws(() => computeRoi({ refundPct: 101 }), /Credits/);
  assert.throws(() => computeRoi({ leadPrice: "abc" }), /Average price per lead/);
  assert.throws(() => computeRoi({ leadsPerMonth: -1 }), /Leads per month/);
});

test("formatters", () => {
  assert.equal(money(-5), "-$5.00");
  assert.equal(pct(5), "5.0%");
});
