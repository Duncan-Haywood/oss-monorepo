import test from "node:test";
import assert from "node:assert/strict";
import { computeBreakeven, summarize, money, pct } from "./engine.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("defaults: $830 a cow, 88% weaned at 550 lb and $250", () => {
  const r = computeBreakeven();
  close(r.costPerCow, 830);
  close(r.revenuePerCow, 1210);
  close(r.netPerCow, 380);
  close(r.netHerd, 38000);
  assert.equal(money(r.breakevenPrice), "$171.49");
  assert.equal(Math.round(r.breakevenWeight), 377);
  assert.equal(r.biggest.key, "hay");
});

test("replacement cost is the cull-cow gap spread over the herd", () => {
  const r = computeBreakeven({ replacePct: 10, replaceCost: 2000, cullWeight: 1000, cullPrice: 100 });
  close(r.lines.find((l) => l.key === "replacement").value, 100);
});

test("breakeven price and weight put margin at zero", () => {
  const r = computeBreakeven();
  const atPrice = computeBreakeven({ calfPrice: r.breakevenPrice });
  close(atPrice.netPerCow, 0, 1e-6);
  const atWeight = computeBreakeven({ weanWeight: r.breakevenWeight });
  close(atWeight.netPerCow, 0, 1e-6);
  const atRate = computeBreakeven({ weanPct: r.breakevenWeanPct });
  close(atRate.netPerCow, 0, 1e-6);
});

test("hay: every $10 a ton at 2 tons is $20 a cow", () => {
  const a = computeBreakeven({ hayPrice: 140 }), b = computeBreakeven({ hayPrice: 150 });
  close(b.costPerCow - a.costPerCow, 20);
});

test("a dry year loses money and says so", () => {
  const r = computeBreakeven({ hayPrice: 220, calfPrice: 200, weanPct: 82 });
  close(r.netPerCow, -88);
  assert.equal(summarize(r).status, "warn");
  assert.match(summarize(r).text, /a loss of \$88\.00 per cow/);
});

test("per-unit values and scenarios", () => {
  const r = computeBreakeven();
  close(r.perPoundOfWeight, 2.2);
  close(r.perPointOfWeaning, 13.75);
  assert.equal(r.priceScenarios.filter((s) => s.current).length, 1);
  assert.equal(r.hayScenarios.filter((s) => s.current).length, 1);
  assert.equal(computeBreakeven({ weanPct: 100 }).weanScenarios.every((s) => s.weanPct <= 100), true);
});

test("bad input is named, not silently zeroed", () => {
  assert.throws(() => computeBreakeven({ weanPct: 0 }), /over 0/);
  assert.throws(() => computeBreakeven({ weanPct: 120 }), /over 100/);
  assert.throws(() => computeBreakeven({ weanWeight: 0 }), /Weaning weight/);
  assert.throws(() => computeBreakeven({ hayPrice: "abc" }), /Hay price/);
  assert.throws(() => computeBreakeven({ cows: 0 }), /Cows exposed/);
});

test("formatters", () => {
  assert.equal(money(-5), "-$5.00");
  assert.equal(pct(5), "5.0%");
});
