import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, exciseTax, categoryGallons, gallonsPerBottle, filingFrequency, toCsv, sampleInput, CATEGORIES } from "./calc.mjs";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const g = (o) => Object.fromEntries(CATEGORIES.map((c) => [c.id, o[c.id] || 0]));

test("a 750 mL bottle is about 0.1981 wine gallons", () => near(gallonsPerBottle(), 0.19813, 1e-4));

test("cases, bottles and bulk gallons add up", () => {
  near(categoryGallons({ stillCases: 1, stillBottles: 2, stillBulk: 3 }, "still"), 14 * 750 / 3785.411784 + 3);
});

test("the first 30,000 gallons of still wine pay $0.07 after the $1.00 credit", () => {
  const r = exciseTax(g({ still: 30000 }));
  near(r.gross, 32100);
  near(r.credit, 30000);
  near(r.tax, 2100);
});

test("the second tier credits $0.90 on the next 100,000 gallons", () => near(exciseTax(g({ still: 130000 })).tax, 19100));

test("the third tier credits $0.535 on the next 620,000 and nothing past 750,000", () => {
  near(exciseTax(g({ still: 800000 })).tax, 404300);
});

test("sparkling wine at $3.40 gets the same dollar credit", () => near(exciseTax(g({ sparkling: 1000 })).tax, 1000 * 2.4));

test("hard cider is taxed at $0.226 less $0.062 on the first tier, $0.164 net", () => near(exciseTax(g({ cider: 1000 })).tax, 164));

test("cider credit steps to $0.056 then $0.033", () => {
  near(exciseTax(g({ cider: 130000 })).tax, 30000 * 0.164 + 100000 * 0.17);
  near(exciseTax(g({ cider: 750000 })).tax, 30000 * 0.164 + 100000 * 0.17 + 620000 * 0.193);
});

test("credit tiers are shared across categories", () => {
  const r = exciseTax(g({ still: 30000, sparkling: 1000 }));
  near(r.credit, 30000 + 1000 * 0.9);
});

test("a controlled-group share shrinks every tier", () => {
  near(exciseTax(g({ still: 15000 }), 50).tax, 15000 * 0.07);
  near(exciseTax(g({ still: 15001 }), 50).tax, 15000 * 0.07 + 1 * 0.17);
});

test("filing period hints", () => {
  assert.match(filingFrequency(900), /Annual/);
  assert.match(filingFrequency(20000), /Quarterly/);
  assert.match(filingFrequency(60000), /semi-monthly/);
});

test("plan rejects empty, negative and absurd input", () => {
  assert.ok(plan({}).error);
  assert.ok(plan({ stillCases: -1 }).error);
  assert.ok(plan({ stillBulk: 1e9 }).error);
  assert.ok(plan({ stillBulk: 10, share: 0 }).error);
  assert.ok(plan({ stillBulk: 10, share: 150 }).error);
});

test("plan reports per-bottle tax, growth and advice", () => {
  const r = plan({ stillCases: 20000 });
  near(r.gallons, 240000 * 750 / 3785.411784);
  assert.equal(r.growth.length, 6);
  assert.ok(r.growth[5].effective > r.growth[0].effective);
  assert.ok(r.perBottleRows[0].net < r.perBottleRows[0].gross);
  assert.ok(r.advice.length >= 3);
});

test("sample input and CSV", () => {
  const r = plan(sampleInput());
  assert.ok(!r.error);
  const csv = toCsv(r).split("\n");
  assert.equal(csv[0], "category,wine_gallons,tax_before_credit,credit,tax");
  assert.match(csv[csv.length - 1], /^total,/);
});
