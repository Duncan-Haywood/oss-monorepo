import { test } from "node:test";
import assert from "node:assert/strict";
import { bill, normInv, lognormalPopulation, parseUsageList, normalizePlan, analyze, reportCsv, samplePlans } from "./calc.mjs";

const P = (o) => normalizePlan({ name: "P", base: 0, included: 0, rate1: 0, breakpoint: 0, rate2: "", ...o }).plan;

test("bill: platform fee only when within the included units", () => {
  assert.equal(bill(P({ base: 99, included: 10000, rate1: 0.01 }), 8000), 99);
  assert.equal(bill(P({ base: 99, included: 10000, rate1: 0.01 }), 0), 99);
});

test("bill: overage is charged per unit above the included amount", () => {
  assert.equal(bill(P({ base: 99, included: 10000, rate1: 0.01 }), 15000), 99 + 50);
});

test("bill: pure pay-as-you-go", () => {
  assert.ok(Math.abs(bill(P({ rate1: 0.006 }), 25000) - 150) < 1e-9);
});

test("bill: second rate is graduated, not retroactive", () => {
  const p = P({ base: 49, included: 2000, rate1: 0.012, breakpoint: 50000, rate2: 0.004 });
  // 48,000 units at 0.012 = 576, then 10,000 at 0.004 = 40
  assert.ok(Math.abs(bill(p, 60000) - (49 + 576 + 40)) < 1e-9);
  assert.ok(Math.abs(bill(p, 50000) - (49 + 576)) < 1e-9);
});

test("bill is continuous and non-decreasing across the breakpoint", () => {
  const p = P({ base: 10, included: 100, rate1: 0.5, breakpoint: 1000, rate2: 0.1 });
  let prev = 0;
  for (let u = 0; u <= 3000; u += 10) { const b = bill(p, u); assert.ok(b >= prev - 1e-9); prev = b; }
});

test("normInv matches known quantiles", () => {
  assert.ok(Math.abs(normInv(0.5)) < 1e-9);
  assert.ok(Math.abs(normInv(0.9) - 1.2815515655) < 1e-6);
  assert.ok(Math.abs(normInv(0.975) - 1.959963985) < 1e-6);
  assert.ok(Math.abs(normInv(0.001) + 3.090232306) < 1e-6);
});

test("lognormal population has the requested median and p90 ratio", () => {
  const pop = lognormalPopulation(400, 6000, 12);
  const at = (q) => pop.usage[Math.ceil(q * pop.usage.length) - 1];
  assert.ok(Math.abs(at(0.5) / 6000 - 1) < 0.01);
  assert.ok(Math.abs(at(0.9) / at(0.5) / 12 - 1) < 0.02);
  assert.equal(pop.weight * pop.usage.length, 400);
});

test("parseUsageList reads separators and flags junk", () => {
  const r = parseUsageList("10, 20\n30;40 abc 50 -3");
  assert.deepEqual(r.usage, [10, 20, 30, 40, 50]);
  assert.equal(r.bad, 2);
});

test("validation errors", () => {
  const pop = lognormalPopulation(100, 1000, 5);
  assert.match(analyze([{ base: "", rate1: "" }, { base: 10, rate1: 0 }], pop, 0).error, /platform fee or a price/);
  assert.match(analyze([{ base: 5, breakpoint: 100, rate2: "" }, { base: 10 }], pop, 0).error, /above the breakpoint/);
  assert.match(analyze([{ base: 5, included: 500, breakpoint: 100, rate2: 1 }, { base: 10 }], pop, 0).error, /above the included/);
  assert.match(analyze([{ base: 5 }, { base: 10 }], pop, -1).error, /Cost per unit/);
  assert.match(analyze([{ base: 5 }, { base: 10 }], { usage: [1, 2], weight: 1 }, 0).error, /at least five/);
});

test("revenue equals the sum of bills times customers, and margin subtracts cost", () => {
  const pop = { usage: [0, 1000, 2000, 3000, 4000], weight: 20 };
  const r = analyze([{ name: "A", base: 10, included: 1000, rate1: 0.01 }, { name: "B", rate1: 0.005 }], pop, 0.001);
  // A bills: 10,10,20,30,40 = 110 * 20 = 2200
  assert.equal(Math.round(r.results[0].revenue), 2200);
  // B bills: 0,5,10,15,20 = 50 * 20 = 1000
  assert.equal(Math.round(r.results[1].revenue), 1000);
  assert.equal(r.totalUnits, 10000 * 20);
  assert.equal(Math.round(r.results[0].cost), 200);
  assert.equal(Math.round(r.results[0].margin), 2000);
  assert.equal(r.customers, 100);
});

test("self-selection revenue is at most every single-plan revenue and mix sums to 1", () => {
  const s = samplePlans();
  const r = analyze(s.plans, lognormalPopulation(s.customers, s.median, s.p90ratio), s.cogs);
  for (const x of r.results) assert.ok(r.sel.revenue <= x.revenue + 1e-6);
  assert.ok(Math.abs(r.sel.mix.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("customers below cost are counted", () => {
  const pop = { usage: [100, 100, 100, 100, 100000], weight: 1 };
  const r = analyze([{ name: "A", base: 10, included: 1000000, rate1: 0 }, { name: "B", base: 20 }], pop, 0.001);
  assert.equal(r.results[0].underwater, 0.2);
  assert.ok(r.findings.some((f) => /loses money on 20%/.test(f.title)));
});

test("usage growth: revenue is monotone in the usage multiplier", () => {
  const s = samplePlans();
  const r = analyze(s.plans, lognormalPopulation(s.customers, s.median, s.p90ratio), s.cogs);
  for (const g of r.growth) for (let i = 1; i < g.length; i++) assert.ok(g[i] >= g[i - 1]);
});

test("sample scenario is valid and CSV has a header and the growth rows", () => {
  const s = samplePlans();
  const r = analyze(s.plans, lognormalPopulation(s.customers, s.median, s.p90ratio), s.cogs);
  assert.ok(!r.error);
  const csv = reportCsv(r).trim().split("\n");
  assert.match(csv[0], /^metric,"Flat \+ overage"/);
  assert.ok(csv.some((l) => l.startsWith("revenue_at_2x_usage")));
});
