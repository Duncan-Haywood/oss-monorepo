import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, carSimplified, homeFlatMonthly, SAMPLE, summaryText } from "./calc.mjs";

test("car mileage: 45p to 10,000 miles then 25p", () => {
  assert.equal(carSimplified(0), 0);
  assert.equal(carSimplified(10000), 4500);
  assert.equal(carSimplified(12000), 5000);
});

test("home flat rate bands", () => {
  assert.equal(homeFlatMonthly(24), 0);
  assert.equal(homeFlatMonthly(25), 10);
  assert.equal(homeFlatMonthly(50), 10);
  assert.equal(homeFlatMonthly(51), 18);
  assert.equal(homeFlatMonthly(100), 18);
  assert.equal(homeFlatMonthly(101), 26);
  assert.equal(homeFlatMonthly(50.5), 18);
});

test("sample: actual car costs beat 45p, flat home rate beats a share of costs", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  const car = r.rows.find((x) => x.key === "vehicle");
  assert.equal(car.simplified, 3240); // 7200 x 45p
  assert.equal(car.actual, 3600); // (3100+1400) x 80%
  assert.equal(car.better, "actual");
  const home = r.rows.find((x) => x.key === "home");
  assert.equal(home.simplified, 312); // 26 x 12
  assert.equal(home.actual, 138.08); // 4200 x 1/5 x 120/730
  assert.equal(home.better, "simplified");
  assert.equal(r.totalBest, 3912);
  assert.equal(r.extra, 360);
  assert.equal(r.taxSaved, 1134.48);
});

test("without actual costs only the simplified figure is shown", () => {
  const r = compute({ carMiles: "5000", taxRate: "20" });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].actual, null);
  assert.equal(r.rows[0].better, "simplified");
  assert.equal(r.totalBest, 2250);
});

test("under 25 hours at home gets no flat rate", () => {
  const r = compute({ homeHours: "20", homeMonths: "12", householdCosts: "3000", roomsUsed: "1", roomsTotal: "4" });
  assert.equal(r.rows[0].simplified, 0);
  assert.equal(r.rows[0].better, "actual");
  assert.ok(r.findings.some((f) => /Fewer than 25 hours/.test(f.title)));
});

test("bad input is refused", () => {
  assert.ok(compute({}).errors.length);
  assert.ok(compute({ carMiles: "-1" }).errors.length);
  assert.ok(compute({ carMiles: "5000", totalCarMiles: "4000" }).errors.length);
  assert.ok(compute({ homeHours: "30", homeMonths: "13" }).errors.length);
  assert.ok(compute({ carMiles: "100", taxRate: "90" }).errors.length);
});

test("summary names the totals and the verify line", () => {
  const t = summaryText(compute(SAMPLE));
  assert.match(t, /Total simplified/);
  assert.match(t, /GOV\.UK/);
});
