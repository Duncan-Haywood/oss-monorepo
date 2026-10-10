import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCake, sampleInput, toCsv } from "./calc.mjs";

const base = { servings: 10, ingredientPerServing: 2, decor: 10, packaging: 5, bakeHours: 1, decorateHours: 1, otherHours: 0, wage: 20, miles: 0, perMile: 0, driveHours: 0, overheadPct: 0, feePct: 0, marginPct: 0 };

test("cost adds materials and labor; zero margin and fee price equals cost", () => {
  const r = priceCake(base);
  assert.equal(r.breakdown.materials, 35);
  assert.equal(r.breakdown.labor, 40);
  assert.equal(r.breakdown.cost, 75);
  assert.equal(r.price, 75);
  assert.equal(r.perServing, 7.5);
});

test("fee and margin come out of the price, not on top of cost", () => {
  const r = priceCake({ ...base, feePct: 10, marginPct: 20 });
  assert.equal(r.price, 107.14);
  assert.equal(r.fee, 10.71);
  assert.equal(r.profit, 21.43);
  assert.ok(Math.abs(r.price - r.fee - r.profit - r.breakdown.cost) < 0.05);
});

test("delivery counts mileage and drive time at the wage; overhead applies to materials and labor", () => {
  const r = priceCake({ ...base, miles: 10, perMile: 0.5, driveHours: 0.5, overheadPct: 10 });
  assert.equal(r.breakdown.delivery, 15);
  assert.equal(r.breakdown.overhead, 7.5);
  assert.equal(r.breakdown.cost, 97.5);
  assert.equal(r.hours, 2.5);
});

test("a quoted price below cost is flagged and gives the break-even", () => {
  const r = priceCake({ ...base, quoted: 50 });
  assert.equal(r.quoted.profitAfterWage, -25);
  assert.match(r.advice[0], /lose \$25\.00/);
  assert.match(r.advice[0], /break-even price is \$75\.00/);
});

test("take-home per hour excludes the wage already paid to yourself", () => {
  const r = priceCake({ ...base, quoted: 75 });
  assert.equal(r.quoted.perHour, 20);
});

test("tiers rise with margin", () => {
  const r = priceCake({ ...base, marginPct: 20 });
  assert.equal(r.tiers.length, 3);
  assert.ok(r.tiers[0].price < r.tiers[1].price && r.tiers[1].price < r.tiers[2].price);
});

test("bad input is refused", () => {
  assert.ok(priceCake({ ...base, servings: 0 }).error);
  assert.ok(priceCake({ ...base, wage: -1 }).error);
  assert.ok(priceCake({ ...base, wage: "abc" }).error);
  assert.ok(priceCake({ ...base, feePct: 50, marginPct: 50 }).error);
});

test("zero wage warns that time is unpaid", () => {
  assert.ok(priceCake({ ...base, wage: 0 }).advice.some((a) => /wage is zero/.test(a)));
});

test("sample runs and CSV has a header and the total", () => {
  const r = priceCake(sampleInput());
  assert.ok(!r.error);
  const csv = toCsv(r);
  assert.match(csv, /^item,amount\n/);
  assert.match(csv, /total_cost,/);
});
