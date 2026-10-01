import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, analyze, reportCsv, sampleText, DEFAULTS } from "./calc.mjs";

const near = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const run = (text, opts) => {
  const p = parseRows(text);
  assert.ok(p.rows, p.error);
  return analyze(p.rows, opts);
};
const loaf = "Loaf,9,6,150,0.35,8";

test("parses a header, quoted names, dollar signs and optional columns", () => {
  const p = parseRows('product,ingredients,units,minutes\n"Jam, strawberry",$18,12,95\nLoaf,9,6,150,0.35,8');
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { product: "Jam, strawberry", ingredients: 18, units: 12, minutes: 95, packaging: 0, price: null });
  assert.equal(p.rows[1].price, 8);
  assert.equal(parseRows("Loaf\t9\t6\t150").rows[0].minutes, 150);
});

test("refuses empty input and counts bad rows", () => {
  assert.ok(parseRows("").error);
  assert.ok(parseRows("a,b,c,d").error);
  const p = parseRows("A,9,6,100\nB,x,6,100\nC,9,0,100\nD,9,6,-5");
  assert.equal(p.rows.length, 1);
  assert.match(p.warnings.join(" "), /3 row\(s\) skipped/);
});

test("full cost matches a hand calculation", () => {
  // labor 150/60*20 = 50; packaging 0.35*6 = 2.10; direct 11.10; overhead (11.10+50)*10% = 6.11
  // batch 67.21; sellable 6*(1-.08)=5.52; cost/unit 12.1757
  const r = run(loaf).rows[0];
  near(r.laborCost, 50);
  near(r.overhead, 6.11);
  near(r.batchCost, 67.21);
  near(r.sellable, 5.52);
  near(r.costPerUnit, 12.1757, 0.001);
  near(r.groceryOnly, 1.5);
});

test("required price treats margin as a share of price and the card fee comes out of it", () => {
  const r = run(loaf).rows[0];
  near(r.prices.online, 12.1757 / (1 - 0.4 - 0.03), 0.01);
  near(r.prices.wholesale, 12.1757 / (1 - 0.3), 0.01);
  near(r.shelfPrice, r.prices.wholesale * 2, 0.001);
  // at that price the margin really is 40% after the fee
  near(1 - r.costPerUnit / r.prices.online - 0.03, 0.4, 1e-9);
});

test("a market booth raises the market price by its per-unit share, online unchanged", () => {
  const r = run(loaf, { boothFee: 60, unitsPerMarket: 60 }).rows[0];
  near(r.prices.market - r.prices.online, 1 / (1 - 0.4 - 0.03), 0.01);
  const free = run(loaf).rows[0];
  near(free.prices.market, free.prices.online);
});

test("waste raises cost per sellable unit", () => {
  const a = run(loaf, { wastePct: 0 }).rows[0].costPerUnit;
  const b = run(loaf, { wastePct: 20 }).rows[0].costPerUnit;
  assert.ok(b > a * 1.2 - 0.001);
});

test("earned per hour matches a hand calculation and flags an underpriced item", () => {
  // net/unit 8*.97 = 7.76 x 5.52 = 42.835; cash out 11.10 + 6.11 = 17.21; earned 25.625 / 2.5h = 10.25
  const res = run(loaf);
  near(res.rows[0].earnedPerHour, 10.25, 0.005);
  assert.equal(res.rows[0].underpriced, true);
  assert.match(res.warnings[0], /below the \$20\.00 you set/);
});

test("pricing at the required online price earns at least the wage plus margin", () => {
  const base = run("Loaf,9,6,150,0.35").rows[0];
  const priced = run(`Loaf,9,6,150,0.35,${base.prices.online.toFixed(4)}`);
  assert.ok(priced.rows[0].earnedPerHour >= 20);
  assert.equal(priced.warnings.length, 0);
});

test("rejects impossible options", () => {
  const rows = parseRows(loaf).rows;
  assert.ok(analyze(rows, { wastePct: 100 }).error);
  assert.ok(analyze(rows, { marginPct: 98, cardFeePct: 5 }).error);
  assert.ok(analyze(rows, { unitsPerMarket: 0 }).error);
  assert.equal(DEFAULTS.wage, 20);
});

test("sample and csv are well formed", () => {
  const p = parseRows(sampleText());
  assert.equal(p.rows.length, 5);
  const csv = reportCsv(analyze(p.rows));
  assert.equal(csv.trim().split("\n").length, 6);
  assert.match(csv, /^product,ingredients_per_unit/);
});
