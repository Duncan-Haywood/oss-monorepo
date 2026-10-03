import test from "node:test";
import assert from "node:assert/strict";
import { computeRoi, summarize, money, pct } from "./engine.mjs";

test("defaults: 40 proposals, 12 connects at $0.15, 5% win rate, $1500 contract, 10% fee", () => {
  const r = computeRoi();
  assert.equal(r.connectCost, 1.8);
  assert.equal(r.spend, 72);
  assert.equal(r.timeCost, 12.5);
  assert.equal(r.timeSpend, 500);
  assert.equal(r.hires, 2);
  assert.equal(r.netPerHire, 1350);
  assert.equal(r.income, 2700);
  assert.equal(r.net, 2128);
  assert.equal(money(r.costPerHire), "$286.00");
});

test("break-even win rate is the cost per proposal over the net per hire", () => {
  const r = computeRoi();
  assert.ok(Math.abs(r.breakEvenWinRate - 14.3 / 1350) < 1e-12);
  const at = computeRoi({ winRatePct: r.breakEvenWinRate * 100 });
  assert.ok(Math.abs(at.net) < 1e-6);
});

test("max connects per proposal puts the proposal at exactly zero", () => {
  const r = computeRoi({ minutesPerProposal: 0 });
  const at = computeRoi({ minutesPerProposal: 0, connectsPerProposal: r.maxConnects });
  assert.ok(Math.abs(at.net) < 1e-6);
  assert.equal(Math.floor(r.maxConnects), 450);
});

test("a time-heavy low-win-rate month loses money and says so", () => {
  const r = computeRoi({ winRatePct: 0.5, minutesPerProposal: 45, hourlyValue: 80 });
  assert.ok(r.net < 0);
  assert.equal(summarize(r).status, "warn");
  assert.equal(r.maxConnects, 0);
});

test("zero win rate prices no hire instead of dividing by zero", () => {
  const r = computeRoi({ winRatePct: 0 });
  assert.equal(r.costPerHire, null);
  assert.match(summarize(r).text, /no hires to price/);
});

test("the repeat multiplier scales what a hire is worth", () => {
  assert.equal(computeRoi({ repeatMultiplier: 2 }).netPerHire, 2700);
});

test("scenarios keep the current win rate once and include the chosen connect count", () => {
  const r = computeRoi({ connectsPerProposal: 14 });
  assert.equal(r.scenarios.filter((s) => s.current).length, 1);
  assert.deepEqual(r.connectScenarios.map((s) => s.connects), [4, 8, 12, 14, 16, 20]);
  assert.equal(computeRoi().connectScenarios.filter((s) => s.current).length, 1);
});

test("bad input is named, not silently zeroed", () => {
  assert.throws(() => computeRoi({ winRatePct: 120 }), /over 100/);
  assert.throws(() => computeRoi({ feePct: 100 }), /under 100/);
  assert.throws(() => computeRoi({ connectPrice: "abc" }), /Price per Connect/);
  assert.throws(() => computeRoi({ proposalsPerMonth: -1 }), /Proposals per month/);
});

test("formatters", () => {
  assert.equal(money(-5), "-$5.00");
  assert.equal(pct(5), "5.0%");
});
