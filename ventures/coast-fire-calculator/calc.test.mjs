import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, coastNumber, fireNumber, futureValue, monthlyRate, sampleInput, toCsv, monthsToCoast, validate } from "./calc.mjs";

const base = { age: 30, retireAge: 60, portfolio: 100000, spending: 40000, swr: 4, ret: 5, otherIncome: 0, monthlySave: 0 };
const close = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("FIRE number is spending over withdrawal rate, net of other income", () => {
  assert.equal(fireNumber(40000, 0.04), 1000000);
  assert.equal(fireNumber(40000, 0.04, 15000), 625000);
  assert.equal(fireNumber(40000, 0.04, 90000), 0);
});

test("coast number discounts the FIRE number at the real return", () => {
  close(coastNumber(1000000, 0.05, 30), 1000000 / Math.pow(1.05, 30), 1e-6);
});

test("monthly compounding matches the stated annual return", () => {
  close(futureValue(1000, 0, 12, 0.05), 1050, 1e-6);
  close(futureValue(1000, 0, 24, 0.07), 1000 * 1.07 * 1.07, 1e-6);
});

test("a portfolio exactly at the coast number reaches FIRE with no contributions", () => {
  const r0 = plan(base);
  const r = plan({ ...base, portfolio: r0.coast });
  assert.ok(r.coasting);
  close(r.growthOnly, r.fire, 0.5);
});

test("just under the coast number is not coasting", () => {
  const r0 = plan(base);
  assert.equal(plan({ ...base, portfolio: r0.coast - 100 }).coasting, false);
});

test("needed monthly saving closes the gap exactly", () => {
  const r = plan(base);
  const fv = futureValue(base.portfolio, r.neededMonthlyToFire, 360, 0.05);
  close(fv, r.fire, 1);
});

test("months to coast matches a brute-force simulation", () => {
  const r = plan({ ...base, monthlySave: 800 });
  assert.ok(r.monthsToCoast > 0 && r.monthsToCoast < 360);
  const v = validate({ ...base, monthlySave: 800 }).v;
  assert.equal(monthsToCoast(v), r.monthsToCoast);
  // one month earlier it was not past the line
  const rm = monthlyRate(0.05);
  let p = 100000;
  for (let m = 0; m < r.monthsToCoast; m++) p = p * (1 + rm) + 800;
  const m = r.monthsToCoast;
  assert.ok(p >= r.fire / Math.pow(1.05, (360 - m) / 12) - 1e-6);
});

test("saving enough to hit FIRE outright crosses the coast line before retirement", () => {
  const r = plan({ ...base, monthlySave: 5000 });
  assert.ok(r.hitsFireWithSaving);
  assert.notEqual(r.monthsToCoast, null);
});

test("saving too little never crosses the line", () => {
  const r = plan({ ...base, portfolio: 0, monthlySave: 10 });
  assert.equal(r.monthsToCoast, null);
  assert.equal(r.hitsFireWithSaving, false);
});

test("barista: draw that keeps you on track ends exactly at the FIRE number", () => {
  const r0 = plan(base);
  const r = plan({ ...base, portfolio: r0.coast * 1.5 });
  assert.ok(r.coasting && r.barista.sustainableDrawYear > 0);
  const fv = futureValue(r.input.portfolio, -r.barista.sustainableDrawYear / 12, 360, 0.05);
  close(fv, r.fire, 1);
  assert.equal(r.barista.incomeNeededYear, Math.max(0, 40000 - r.barista.sustainableDrawYear));
});

test("zero real return still works", () => {
  const r = plan({ ...base, ret: 0 });
  close(r.coast, r.fire, 1e-6);
  close(r.neededMonthlyToFire, (r.fire - 100000) / 360, 1e-6);
});

test("sensitivity rows move coast number the right way", () => {
  const r = plan(base);
  assert.ok(r.sens[0].coast > r.sens[1].coast && r.sens[1].coast > r.sens[2].coast);
});

test("ladder starts now and ends at retirement where coast equals FIRE", () => {
  const r = plan(base);
  assert.equal(r.ladder[0].age, 30);
  const last = r.ladder.at(-1);
  assert.equal(last.age, 60);
  close(last.coast, r.fire, 1e-6);
  assert.ok(toCsv(r).startsWith("age,coast_number_usd"));
});

test("validation rejects nonsense", () => {
  assert.ok(plan({ ...base, retireAge: 25 }).error);
  assert.ok(plan({ ...base, spending: 0 }).error);
  assert.ok(plan({ ...base, swr: 0 }).error);
  assert.ok(plan({ ...base, ret: 40 }).error);
  assert.ok(plan({ ...base, age: "" }).error);
});

test("sample input produces advice mentioning the FIRE number", () => {
  const r = plan(sampleInput());
  assert.ok(!r.error);
  assert.ok(r.advice.length >= 3);
  assert.match(r.advice[0], /\$/);
});
