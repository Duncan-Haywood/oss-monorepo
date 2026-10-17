import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, SAMPLE, summaryText, sweepCsv } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// Round numbers so every line can be checked by hand.
const base = {
  gallons: "10000", price: "4", cost: "3.5", cardShare: "50", feePct: "2", perTxn: "0.10", avgFill: "10",
  tobacco_sales: "10000", tobacco_margin: "10", food_sales: "5000", food_margin: "40", beer_sales: "0", beer_margin: "0",
  insideCardPct: "60", shrinkPct: "2", otherIncome: "100",
  hours: "400", wage: "10", burdenPct: "10", rent: "1000", utilities: "300", insurance: "200", propTax: "100", otherFixed: "0", debt: "500",
};

test("fuel margin is gross cents less card fees", () => {
  const r = compute(base);
  assert.deepEqual(r.errors, []);
  close(r.fuelGross, 5000);
  // 20,000 of card sales at 2% = 400, plus 500 transactions at 10 cents = 50.
  close(r.fuelFees, 450);
  close(r.fuelNet, 4550);
  close(r.grossCpg, 0.5);
  close(r.netCpg, 0.455);
});

test("inside net is margin less card fees and shrink", () => {
  const r = compute(base);
  close(r.insideSales, 15000);
  close(r.insideGross, 3000);
  close(r.insideFees, 180); // 15,000 * 60% * 2%
  close(r.shrink, 300);
  close(r.insideNet, 2520);
  close(r.insideMargin, 0.2);
});

test("operating profit, debt coverage and fuel share", () => {
  const r = compute(base);
  close(r.labor, 4400);
  close(r.fixed, 1600);
  close(r.nonFuel, 2520 + 100 - 4400 - 1600);
  close(r.opProfit, 1170);
  close(r.netAfterDebt, 670);
  close(r.dscr, 2.34);
  close(r.fuelShare, 4550 / (4550 + 2520 + 100));
});

test("break-even gallons and required fuel margin", () => {
  const r = compute(base);
  close(r.beGallons, 3880 / 0.455, 1e-6);
  close(r.requiredNetCpg, 0.388);
  // At break-even gallons, profit after debt is zero.
  const at = compute({ ...base, gallons: String(r.beGallons) });
  close(at.netAfterDebt, 0, 1e-6);
});

test("sweeps start from the base profit", () => {
  const r = compute(base);
  close(r.cpgSweep.find((x) => x.cents === 0).profit, r.netAfterDebt);
  close(r.volumeSweep.find((x) => x.pct === 0).profit, r.netAfterDebt);
  close(r.cpgSweep.find((x) => x.cents === 5).profit - r.netAfterDebt, 500); // 5 cents * 10,000 gal
  close(r.volumeSweep.find((x) => x.pct === 10).profit - r.netAfterDebt, 455);
});

test("a negative net fuel margin and a loss are high findings", () => {
  const r = compute({ ...base, cost: "3.99", feePct: "3" });
  assert.ok(r.netCpg < 0);
  assert.ok(r.findings.some((f) => f.severity === "high" && /Fuel loses/.test(f.title)));
  assert.equal(r.beGallons, null);
});

test("weak debt coverage is flagged", () => {
  const r = compute({ ...base, debt: "1000" });
  assert.ok(r.dscr < 1.25);
  assert.ok(r.findings.some((f) => /Debt coverage is 1\.17x/.test(f.title)));
});

test("bad input is rejected, not clamped", () => {
  assert.match(compute({ ...base, gallons: "0" }).errors[0], /Gallons/);
  assert.match(compute({ ...base, price: "x" }).errors[0], /number/);
  assert.match(compute({ ...base, cardShare: "150" }).errors[0], /above/);
  assert.match(compute({ ...base, wage: "-1" }).errors[0], /below/);
  assert.match(compute({ ...base, avgFill: "" }).errors[0], /fill-up/);
});

test("the sample loads and the exports render", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.ok(Number.isFinite(r.netAfterDebt));
  assert.match(summaryText(r), /Convenience store and gas station profit/);
  assert.equal(sweepCsv(r).trim().split("\n").length, 14);
});
