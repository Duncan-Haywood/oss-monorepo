import { test } from "node:test";
import assert from "node:assert/strict";
import { priceLessons, formatPricingSummary } from "./calc.mjs";

const base = {
  lessonPrice: 50, lessonMinutes: 60, gapMinutes: 15, slotsPerWeek: 25, weeksPerYear: 46,
  cancelRate: 8, milesPerLesson: 12, mpg: 40, fuelPrice: 4, wearPerMile: 0.1,
  annualFixedCosts: 4600, weeklyFees: 0, targetAnnualProfit: 30000,
};

test("paid lessons are slots minus unpaid cancellations", () => {
  const r = priceLessons(base);
  assert.equal(r.paidLessons, 1058);
});

test("running cost is fuel plus wear for the miles driven", () => {
  const r = priceLessons(base);
  // 12/40*4 = 1.20 fuel + 12*0.10 = 1.20 wear
  assert.equal(r.runningCostPerLesson, 2.4);
});

test("fixed costs are spread over paid lessons only", () => {
  const r = priceLessons(base);
  assert.equal(r.fixedPerPaidLesson, round(4600 / 1058));
});

test("annual profit reconciles with revenue less costs", () => {
  const r = priceLessons(base);
  const expected = 1058 * 50 - 1058 * 2.4 - 4600;
  assert.equal(r.annualProfit, round(expected));
});

test("the minimum price for a target reproduces the target when used as the price", () => {
  const r = priceLessons(base);
  const again = priceLessons({ ...base, lessonPrice: r.minPriceForTarget });
  assert.ok(Math.abs(again.annualProfit - base.targetAnnualProfit) < 5);
});

test("break-even price yields zero profit", () => {
  const r = priceLessons(base);
  const again = priceLessons({ ...base, lessonPrice: r.breakEvenPrice });
  assert.ok(Math.abs(again.annualProfit) < 5);
});

test("more cancellations raise cost per paid lesson", () => {
  const low = priceLessons({ ...base, cancelRate: 0 });
  const high = priceLessons({ ...base, cancelRate: 25 });
  assert.ok(high.costPerPaidLesson > low.costPerPaidLesson);
});

test("weekly franchise fees count as fixed cost across working weeks", () => {
  const r = priceLessons({ ...base, annualFixedCosts: 0, weeklyFees: 100 });
  assert.equal(r.fixedPerPaidLesson, round((100 * 46) / 1058));
});

test("a block discount reports percent off and profit per lesson", () => {
  const r = priceLessons({ ...base, blockLessons: 10, blockPrice: 450 });
  assert.equal(r.block.perLesson, 45);
  assert.equal(r.block.discountPercent, 10);
  assert.equal(r.block.profitPerLesson, round(45 - r.costPerPaidLesson));
});

test("a loss is flagged high severity", () => {
  const r = priceLessons({ ...base, lessonPrice: 4 });
  assert.ok(r.annualProfit < 0);
  assert.equal(r.findings[0].severity, "high");
});

test("a block priced below cost is flagged", () => {
  const r = priceLessons({ ...base, blockLessons: 10, blockPrice: 40 });
  assert.ok(r.findings.some((f) => /block price is below your cost/.test(f.title)));
});

test("90-minute lessons are compared on an hourly-equivalent price", () => {
  const r = priceLessons({ ...base, lessonPrice: 75, lessonMinutes: 90 });
  assert.equal(r.hourlyEquivalentPrice, 50);
});

test("invalid inputs throw readable errors", () => {
  assert.throws(() => priceLessons({ ...base, lessonPrice: 0 }), /Lesson price/);
  assert.throws(() => priceLessons({ ...base, mpg: 0 }), /Miles per gallon/);
  assert.throws(() => priceLessons({ ...base, cancelRate: 100 }), /under 100/);
  assert.throws(() => priceLessons({ ...base, weeksPerYear: 60 }), /52 or fewer/);
  assert.throws(() => priceLessons({ ...base, fuelPrice: -1 }), /non-negative/);
});

test("the summary carries the figures and the disclaimer", () => {
  const text = formatPricingSummary(priceLessons(base));
  assert.match(text, /Annual profit before tax/);
  assert.match(text, /Not tax, legal, or financial advice/);
});

function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
