import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, amap, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("car rates: 45p to 10,000 miles, 25p after", () => {
  assert.equal(amap("car", 10000).amount, 4500);
  assert.equal(amap("car", 14000).amount, 5500);
  assert.equal(amap("car", 0).amount, 0);
});
test("motorcycle 24p and bicycle 20p flat", () => {
  assert.equal(amap("motorcycle", 5000).amount, 1200);
  assert.equal(amap("bicycle", 20000).amount, 4000);
});
test("employee shortfall relief at marginal rate", () => {
  const r = run({});
  assert.equal(r.allowance, 5500);
  assert.equal(r.paid, 4200);
  assert.equal(r.shortfall, 1300);
  assert.equal(r.relief, 260);
});
test("employer overpayment is an excess, not relief", () => {
  const r = run({ employerPence: "60", taxRate: "40" });
  assert.equal(r.shortfall, 0);
  assert.equal(r.excess, 2900);
  assert.equal(r.excessTax, 1160);
});
test("passenger payment only for cars", () => {
  assert.equal(run({ passengerMiles: "1000" }).passenger, 50);
  assert.equal(run({ vehicle: "bicycle", passengerMiles: "1000" }).passenger, 0);
});
test("self-employed saving includes Class 4", () => {
  const r = run({ status: "self-employed", miles: "10000", taxRate: "20", class4: "6" });
  assert.equal(r.saving, 1170);
});
test("actual costs comparison picks the larger deduction", () => {
  const hi = run({ status: "self-employed", miles: "8000", runningCosts: "9000", totalMiles: "10000" });
  assert.equal(hi.actual, 7200);
  assert.equal(hi.better, "actual");
  const lo = run({ status: "self-employed", miles: "8000", runningCosts: "3000", totalMiles: "10000" });
  assert.equal(lo.better, "simplified");
});
test("validation", () => {
  assert.ok(run({ miles: "" }).errors.length);
  assert.ok(run({ miles: "-1" }).errors.length);
  assert.ok(run({ taxRate: "33" }).errors.length);
  assert.ok(run({ status: "self-employed", totalMiles: "100", miles: "200" }).errors.length);
});
test("summary mentions verification", () => {
  assert.match(summaryText(run({})), /Verify rates on GOV\.UK/);
});
