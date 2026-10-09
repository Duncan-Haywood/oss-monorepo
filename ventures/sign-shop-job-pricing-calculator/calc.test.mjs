import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, pct, jobCost, priceFor, outcome, breakEvenPrice, quantityLadder, marginLadder, analyze, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// Round numbers: 12x12 in = 1 sq ft each, no waste, no design, no install, no fee.
const plain = { ...DEFAULTS, widthIn: 12, heightIn: 12, qty: 10, substrateCostSqft: 2, printCostSqft: 1, laminateCostSqft: 0, wastePct: 0,
  printSqftPerHour: 10, finishMinPerPiece: 0, designMinutes: 0, laborRate: 20, overheadPerHour: 10, installHours: 0, travelCost: 0,
  cardFeePct: 0, marginPct: 50, minCharge: 0, marketPerSqft: 10 };

test("cost adds material, shop labour and overhead", () => {
  const c = jobCost(plain);
  near(c.area, 10);
  near(c.material, 30);            // 10 sq ft x $3
  near(c.shopHours, 1);            // 10 sq ft at 10 per hour
  near(c.labor, 20);
  near(c.overhead, 10);
  near(c.cost, 60);
});

test("waste inflates material and print time but not the area sold", () => {
  const c = jobCost({ ...plain, wastePct: 20 });
  near(c.area, 10);
  near(c.materialArea, 12);
  near(c.material, 36);
  near(c.printHours, 1.2);
});

test("price earns the target margin after the card fee", () => {
  const o = { ...plain, cardFeePct: 5, marginPct: 40 };
  const c = jobCost(o);
  const price = priceFor(o, c);
  near(outcome(o, c, price).margin, 40);
});

test("the minimum charge floors the price and the result says so", () => {
  const a = analyze({ ...plain, qty: 1, minCharge: 100 });
  near(a.result.price, 100);
  assert.equal(a.result.floored, true);
  assert.ok(a.warnings.some((w) => /minimum charge/i.test(w)));
});

test("install adds labour and travel only when there is an install", () => {
  near(jobCost({ ...plain, installHours: 2, installRate: 50, travelCost: 15 }).install, 115);
  near(jobCost({ ...plain, installHours: 0, installRate: 50, travelCost: 15 }).install, 0);
});

test("break-even price covers cost and the card fee", () => {
  const o = { ...plain, cardFeePct: 10 };
  const c = jobCost(o);
  near(outcome(o, c, breakEvenPrice(o, c)).profit, 0);
});

test("a market rate below cost loses money and warns", () => {
  const a = analyze({ ...plain, marketPerSqft: 3 });
  assert.ok(a.result.atMarket.profit < 0);
  assert.ok(a.warnings.some((w) => /loses money/.test(w)));
});

test("price each falls as quantity rises because design is spread out", () => {
  const rows = quantityLadder({ ...plain, designMinutes: 60 });
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].each < rows[i - 1].each);
});

test("a higher target margin never lowers the price", () => {
  const o = plain, c = jobCost(o);
  const rows = marginLadder(o, c);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].price > rows[i - 1].price);
});

test("design time over 30% of cost is flagged", () => {
  const a = analyze({ ...plain, qty: 1, designMinutes: 120 });
  assert.ok(a.warnings.some((w) => /Design time/.test(w)));
});

test("bad input is reported, not computed", () => {
  assert.equal(analyze({ widthIn: 0 }).result, null);
  assert.equal(analyze({ qty: 0 }).result, null);
  assert.equal(analyze({ cardFeePct: 60, marginPct: 40 }).result, null);
  assert.equal(analyze({ laborRate: -1 }).result, null);
});

test("defaults produce a result with no warnings that matter and a CSV", () => {
  const a = analyze({});
  assert.ok(a.result);
  const csv = toCsv(a);
  assert.match(csv, /^quantity,total_price/);
  assert.match(csv, /target_margin_pct,price/);
  assert.equal(toCsv(null), "");
});

test("helpers parse and format", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(1234.5), "$1,235");
  assert.equal(pct(12.34), "12.3%");
});
