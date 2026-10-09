import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePoints, fitDemand, classProfit, analyze, cleanShared, EXAMPLE_PRICES, EXAMPLE_SHARED, toCsv } from "./calc.mjs";

// Independent Poisson pmf via explicit factorial, for cross-checking the iterative sum.
function slowProfit(price, lam, { capacity, minToRun, fixedCost, varCost }) {
  const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
  let total = 0;
  for (let n = 0; n <= 150; n++) {
    const p = Math.exp(-lam) * lam ** n / fact(n);
    if (n >= minToRun) total += p * ((price - varCost) * Math.min(n, capacity) - fixedCost);
  }
  return total;
}

test("parsePoints reads price:signups, marks full terms, skips junk", () => {
  assert.deepEqual(parsePoints("110:13+ $140:10 abc 170:7.5 0:4"), [
    { price: 110, enrolled: 13, full: true }, { price: 140, enrolled: 10, full: false }, { price: 170, enrolled: 7.5, full: false },
  ]);
});

test("fitDemand recovers a known constant elasticity exactly", () => {
  const pts = [100, 150, 200, 300].map((p) => ({ price: p, enrolled: 5000 * p ** -1.5, full: false }));
  const f = fitDemand(pts);
  assert.ok(Math.abs(f.elasticity - 1.5) < 1e-9);
  assert.ok(Math.abs(f.a - 5000) < 1e-6);
  assert.ok(f.r2 > 0.999999);
});

test("fitDemand ignores full terms and needs two unfilled prices", () => {
  assert.equal(fitDemand([{ price: 100, enrolled: 12, full: true }, { price: 150, enrolled: 8, full: false }]), null);
});

test("classProfit matches an independent factorial-based sum", () => {
  for (const cfg of [
    { capacity: 12, minToRun: 5, fixedCost: 520, varCost: 8 },
    { capacity: 6, minToRun: 0, fixedCost: 100, varCost: 0 },
    { capacity: 20, minToRun: 20, fixedCost: 300, varCost: 12 },
  ]) for (const lam of [0.5, 4, 9.3, 17, 40]) {
    const a = classProfit(130, lam, cfg).profit, b = slowProfit(130, lam, cfg);
    assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${JSON.stringify(cfg)} lam=${lam}: ${a} vs ${b}`);
  }
});

test("chance the class runs falls as the minimum rises", () => {
  const base = { capacity: 12, fixedCost: 0, varCost: 0 };
  const lo = classProfit(100, 6, { ...base, minToRun: 3 }).pRun;
  const hi = classProfit(100, 6, { ...base, minToRun: 8 }).pRun;
  assert.ok(lo > hi);
  assert.ok(Math.abs(classProfit(100, 6, { ...base, minToRun: 0 }).pRun - 1) < 1e-9);
});

test("the example gives a positive-profit best price at least as good as the current price", () => {
  const a = analyze(EXAMPLE_PRICES, EXAMPLE_SHARED);
  assert.equal(a.ok, true);
  assert.ok(a.best.profit > 0);
  assert.ok(a.gain >= -1e-9);
  assert.ok(a.best.price > a.shared.varCost);
});

test("best price beats every neighbour on a fine grid (grid scan is a true maximum)", () => {
  const a = analyze(EXAMPLE_PRICES, EXAMPLE_SHARED);
  for (const f of [0.97, 0.99, 1.01, 1.03]) {
    const lam = a.model.a * (a.best.price * f) ** -a.model.elasticity;
    assert.ok(classProfit(a.best.price * f, lam, a.shared).profit <= a.best.profit + 1e-6);
  }
});

test("a higher fixed cost never lowers the best price", () => {
  const lo = analyze(EXAMPLE_PRICES, { ...EXAMPLE_SHARED, fixedCost: 300 });
  const hi = analyze(EXAMPLE_PRICES, { ...EXAMPLE_SHARED, fixedCost: 800 });
  assert.ok(hi.ok && lo.ok);
  assert.ok(hi.best.price >= lo.best.price - 1e-9);
});

test("flat or rising demand is refused unless an elasticity is entered", () => {
  const flat = analyze("100:8 150:8 200:9", EXAMPLE_SHARED);
  assert.equal(flat.ok, false);
  const forced = analyze("100:8 150:8 200:9", { ...EXAMPLE_SHARED, elasticity: 1.5 });
  assert.equal(forced.ok, true);
});

test("one price point works with an entered elasticity", () => {
  const a = analyze("140:10", { ...EXAMPLE_SHARED, elasticity: 2 });
  assert.equal(a.ok, true);
  assert.ok(Math.abs(a.model.a * 140 ** -2 - 10) < 1e-9);
});

test("a class that can never cover its cost says so", () => {
  const a = analyze("100:2 150:1.2", { ...EXAMPLE_SHARED, fixedCost: 5000 });
  assert.equal(a.ok, false);
});

test("extrapolation and two-point fits are flagged", () => {
  const a = analyze("100:9 120:6", { ...EXAMPLE_SHARED, currentPrice: 100, fixedCost: 900 });
  assert.ok(a.warnings.some((w) => /no error bar/.test(w)));
});

test("cleanShared clamps bad input and CSV has a header and rows", () => {
  const s = cleanShared({ capacity: "-3", minToRun: "x", fixedCost: "-5" });
  assert.equal(s.capacity, 1);
  assert.ok(s.fixedCost === 0);
  const csv = toCsv(analyze(EXAMPLE_PRICES, EXAMPLE_SHARED));
  assert.equal(csv.trim().split("\n").length, 6);
});
