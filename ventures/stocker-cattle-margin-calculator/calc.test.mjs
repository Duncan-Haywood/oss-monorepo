import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, slidePrice, sampleInput, toCsv } from "./calc.mjs";

const base = { head: 100, inWeight: 500, buyPrice: 300, days: 100, adg: 2, salePrice: 250 };

test("price slide takes dollars per cwt off for each cwt gained", () => {
  assert.equal(slidePrice(250, 500, 700, 10), 230);
  assert.equal(slidePrice(250, 700, 700, 10), 250);
});

test("worked arithmetic with no slide, no death loss, no extras", () => {
  const r = plan(base);
  assert.equal(r.outWeight, 700);
  assert.equal(r.salePrice, 250);
  assert.equal(r.grossRevenue, 175000); // 100 head x 700 lb x $2.50
  assert.equal(r.totalCost, 150000); // 100 x 500 lb x $3.00
  assert.equal(r.margin, 25000);
  assert.equal(r.marginPerHead, 250);
  assert.equal(r.breakEvenPrice, 214.29);
});

test("margin at the break-even sale price is about zero", () => {
  const input = sampleInput();
  const r = plan(input);
  const at = plan({ ...input, salePrice: r.breakEvenPrice + (input.slide * (r.outWeight - input.slideBaseWeight)) / 100 });
  assert.ok(Math.abs(at.margin) < 5, `margin ${at.margin}`);
});

test("margin at the break-even purchase price is about zero", () => {
  const input = sampleInput();
  const r = plan(input);
  const at = plan({ ...input, buyPrice: r.buyBreakEven });
  assert.ok(Math.abs(at.margin) < 5, `margin ${at.margin}`);
});

test("death loss cuts head sold and margin", () => {
  const a = plan(base);
  const b = plan({ ...base, deathLossPct: 5 });
  assert.equal(b.sold, 95);
  assert.ok(b.margin < a.margin);
});

test("interest scales with days and financed share", () => {
  const a = plan({ ...base, interestPct: 8 });
  const half = plan({ ...base, interestPct: 8, financedPct: 50 });
  const interest = (r) => r.lines.find((l) => l.label === "Interest").amount;
  assert.ok(Math.abs(interest(half) * 2 - interest(a)) < 0.05);
  assert.equal(plan({ ...base, interestPct: 0 }).lines.some((l) => l.label === "Interest"), false);
});

test("a heavy slide makes cost of gain exceed the value of gain and says so", () => {
  const r = plan({ ...base, slide: 25, slideBaseWeight: 500, feedPerDay: 3 });
  assert.ok(r.costOfGain > r.valueOfGain);
  assert.ok(r.advice.some((a) => /costs more than the market pays/.test(a)));
});

test("scenario tables are centred on the base case", () => {
  const r = plan(sampleInput());
  assert.equal(r.priceSteps[2].marginPerHead, r.marginPerHead);
  assert.equal(r.deathSteps[0].deathPct, 0);
});

test("bad input is named, not computed", () => {
  assert.match(plan({ ...base, head: 0 }).error, /head/);
  assert.match(plan({ ...base, adg: 0 }).error, /daily gain/);
  assert.match(plan({ ...base, deathLossPct: 100 }).error, /Death loss/);
  assert.match(plan({ ...base, slide: 100, slideBaseWeight: 100 }).error, /slide/);
});

test("csv carries the lines, revenue and margin", () => {
  const csv = toCsv(plan(sampleInput()));
  assert.match(csv, /^item,amount\n/);
  assert.match(csv, /margin,/);
});
