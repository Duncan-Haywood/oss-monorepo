import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, money2, jobCost, price, checkPrice, overrunImpact, distanceLadder, monthly, lowestSafePrice } from "./calc.mjs";

const simple = {
  ...DEFAULTS, buildHours: 4, prepHours: 1, milesOneWay: 0, mph: 40, costPerMile: 1, laborRate: 50,
  helperHours: 0, helperRate: 0, toolsPerHour: 0, consumablesPerBuildHour: 0, materials: 0, subcontract: 0, materialsMarkupPct: 0,
  fixedMonthly: 0, billableHoursPerMonth: 80, targetMarginPct: 20, cardFeePct: 0, minCallout: 0, jobsPerMonth: 10,
};

test("num parses money and percents, NaN otherwise", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("8%"), 8);
  assert.ok(Number.isNaN(num("abc")));
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
});

test("5 hours at $50 costs $250 and a 20% margin prices it at $312.50", () => {
  const c = jobCost(simple);
  assert.equal(c.total, 250);
  const p = price(simple);
  assert.equal(p.price, 312.5);
  assert.equal(p.profit, 62.5);
  assert.ok(Math.abs(p.margin - 0.2) < 1e-9);
});

test("card fee is taken out of the price, so the margin still lands on target", () => {
  const p = price({ ...simple, cardFeePct: 5 });
  assert.ok(Math.abs(p.margin - 0.2) < 1e-9);
  assert.ok(Math.abs(p.fees - p.price * 0.05) < 1e-9);
});

test("the drive is paid: two 20-mile legs at 40 mph is 1 hour and 40 miles of truck cost", () => {
  const c = jobCost({ ...simple, milesOneWay: 20 });
  assert.equal(c.travelHours, 1);
  assert.equal(c.travel, 40);
  assert.equal(c.labor, 300);
  assert.equal(c.total, 340);
});

test("overhead is spread over every hour including the drive", () => {
  const c = jobCost({ ...simple, fixedMonthly: 4000, billableHoursPerMonth: 80 });
  assert.equal(c.overheadPerHour, 50);
  assert.equal(c.overhead, 250);
});

test("materials carry their markup and are not charged the margin twice", () => {
  const p = price({ ...simple, materials: 100, materialsMarkupPct: 25 });
  assert.equal(p.price, 312.5 + 125);
});

test("an electrician subcontract is a pass-through that takes the same markup as equipment", () => {
  const p = price({ ...simple, materials: 100, subcontract: 100, materialsMarkupPct: 25 });
  assert.equal(p.materials, 200);
  assert.equal(p.price, 312.5 + 250);
});

test("a minimum job price binds on a short job and reports the real margin", () => {
  const p = price({ ...simple, buildHours: 0.5, prepHours: 0, minCallout: 200 });
  assert.equal(p.minBinds, true);
  assert.equal(p.price, 200);
  assert.ok(p.margin > 0.5);
});

test("targets that leave no room return an invalid price instead of nonsense", () => {
  const p = price({ ...simple, targetMarginPct: 98, cardFeePct: 3 });
  assert.equal(p.valid, false);
  assert.ok(Number.isNaN(p.price));
});

test("a job that runs 25% long at a fixed price loses profit; the drive does not stretch", () => {
  const o = { ...simple, milesOneWay: 20 };
  const base = price(o);
  const over = overrunImpact(o, 25);
  assert.equal(over.price, base.price);
  assert.equal(over.extraCost, 0.25 * 5 * 50);
  assert.ok(Math.abs(over.lostProfit - over.extraCost) < 1e-9);
  assert.ok(over.margin < base.margin);
});

test("price rises with distance and travel share grows", () => {
  const rows = distanceLadder(simple);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].price > rows[i - 1].price);
    assert.ok(rows[i].travelShare > rows[i - 1].travelShare);
  }
  assert.equal(rows[0].travelShare, 0);
});

test("checkPrice shows what an offered price leaves", () => {
  const r = checkPrice(simple, 250);
  assert.equal(r.profit, 0);
  assert.equal(r.gapToTarget, -62.5);
  assert.equal(checkPrice(simple, 0), null);
});

test("monthly: contribution, break-even jobs and capacity", () => {
  const o = { ...simple, fixedMonthly: 1250, jobsPerMonth: 10 };
  const m = monthly(o);
  const q = price(o);
  assert.ok(Math.abs(m.contribution - (q.price - 250)) < 1e-9);
  assert.ok(Math.abs(m.breakEvenJobs - 1250 / m.contribution) < 1e-9);
  assert.ok(Math.abs(m.profit - (10 * m.contribution - 1250)) < 1e-9);
  assert.equal(m.hours, 50);
  assert.equal(m.overCapacity, false);
  assert.equal(monthly({ ...o, jobsPerMonth: 20 }).overCapacity, true);
});

test("pricing overhead into every job means the target jobs per month just covers fixed costs plus margin", () => {
  const o = { ...simple, fixedMonthly: 1600, billableHoursPerMonth: 80, targetMarginPct: 0, jobsPerMonth: 16 };
  assert.ok(Math.abs(monthly(o).profit) < 1e-6);
});

test("no-profit floor equals total cost with fee covered", () => {
  assert.equal(lowestSafePrice(simple), 250);
  assert.ok(Math.abs(lowestSafePrice({ ...simple, cardFeePct: 10 }) - 250 / 0.9) < 1e-9);
});

test("defaults produce a coherent quote", () => {
  const p = price(DEFAULTS);
  assert.ok(p.valid && p.price > p.total && p.profit > 0);
  assert.ok(Math.abs(p.margin - 0.2) < 0.05);
  assert.ok(monthly(DEFAULTS).breakEvenJobs > 0);
});

test("junk input does not throw or produce NaN totals", () => {
  const p = price({ ...DEFAULTS, buildHours: "x", mph: 0, milesOneWay: -5 });
  assert.ok(Number.isFinite(p.price));
});
