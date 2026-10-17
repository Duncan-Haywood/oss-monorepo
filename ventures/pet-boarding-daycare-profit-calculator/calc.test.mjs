import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, summaryText, sweepCsv, attendants, laborMonthly, month, startupCost, payment, scaleAt, breakEvenUtilisation } from "./calc.mjs";

// 10 runs at $50, 60% full: 180 nights. No daycare, no add-ons, no fees. 5 dogs per attendant, 10 hours, $20 an hour, minimum 1.
const BASE = { runs: "10", nightly: "50", occPct: "60", stayNights: "3", dogsPerAttendant: "5", openHours: "10", minStaff: "1", wage: "20", rentMonthly: "1000" };
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("attendants round up the ratio and never fall below the minimum", () => {
  const p = parse({ ...BASE, minStaff: "2" });
  assert.equal(attendants(p, 0), 2);
  assert.equal(attendants(p, 10), 2);
  assert.equal(attendants(p, 10.01), 3);
  assert.equal(attendants(p, 15), 3);
  assert.equal(attendants(parse(BASE), 6), 2);
});

test("labour is attendants x hours x 30 days x wage plus payroll costs", () => {
  const p = parse({ ...BASE, payrollPct: "10" });
  near(laborMonthly(p, 6), 2 * 10 * 30 * 20 * 1.1);
});

test("boarding month worked by hand", () => {
  const p = parse(BASE);
  const m = month(p, 0.6, 0);
  near(m.nights, 180); near(m.revenue, 9000); near(m.onSite, 6); assert.equal(m.staff, 2);
  near(m.labor, 2 * 10 * 30 * 20); near(m.profit, 9000 - 12000 - 1000);
});

test("daycare, add-ons, supplies and fees", () => {
  const p = parse({ ...BASE, daySpots: "10", dayRate: "30", dayFillPct: "50", daysOpen: "20", addOn: "15", suppliesPerDog: "5", feesPct: "10" });
  const m = month(p, 0.6, 0.5);
  near(m.dayDogs, 100); // 10 spots x 50% x 20 days
  near(m.gross, 180 * 50 + 100 * 30 + (180 / 3) * 15);
  near(m.lost, m.gross * 0.1); near(m.supplies, 280 * 5);
  near(m.onSite, 6 + 10 * 0.5 * 20 / 30);
});

test("startup cost and a level loan", () => {
  const c = startupCost(parse({ ...BASE, buildoutPerRun: "1000", equipmentTotal: "5000", launch: "1000", depositMonths: "2", contingencyPct: "10" }));
  near(c.buildout, 10000); near(c.deposit, 2000); near(c.contingency, 1600); near(c.total, 10000 + 5000 + 2000 + 1000 + 1600);
  near(payment(12000, 0, 1), 1000);
});

test("break-even utilisation is the first half-percent that clears the bar", () => {
  const p = parse({ ...BASE, nightly: "200", minStaff: "1", dogsPerAttendant: "20" });
  const u = breakEvenUtilisation(p, 0);
  assert.ok(month(p, u, u).profit >= 0);
  if (u > 0) assert.ok(month(p, u - 0.005, u - 0.005).profit < 0);
  assert.equal(breakEvenUtilisation(parse({ ...BASE, nightly: "1" }), 0), null);
});

test("price factor reaches the target margin", () => {
  const r = compute({ ...BASE, nightly: "120", targetMargin: "20", feesPct: "3" });
  const scaled = month(r.input, 0.6, 0, { priceScale: r.priceFactor });
  near(scaled.profit / scaled.revenue, 0.2, 1e-9);
});

test("ramp-up scale, cash trough and payback", () => {
  const p = parse({ ...BASE, startPct: "20", rampMonths: "5" });
  near(scaleAt(p, 1), 0.2); near(scaleAt(p, 3), 0.6); near(scaleAt(p, 5), 1); near(scaleAt(p, 40), 1);
  const r = compute({ ...BASE, nightly: "150", buildoutPerRun: "500", startPct: "20", rampMonths: "5", ltcPct: "50" });
  assert.deepEqual(r.errors, []);
  assert.ok(r.reserve >= 0);
  assert.equal(r.yearProfit.length, 5);
});

test("the sample runs and the summary and csv render", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.match(summaryText(r), /Break-even/);
  assert.equal(sweepCsv(r).split("\n").length, 8);
  assert.ok(r.demandSweep.every((x) => Number.isFinite(x.profit)));
});

test("bad input is rejected, not clamped", () => {
  for (const bad of [{ runs: "2.5" }, { runs: "0", daySpots: "0" }, { occPct: "120" }, { dogsPerAttendant: "" }, { dogsPerAttendant: "0" }, { openHours: "30" }, { nightly: "-5" }, { termYears: "2.5" }, { feesPct: "40" }, { minStaff: "0" }]) {
    assert.ok(compute({ ...BASE, ...bad }).errors.length > 0, JSON.stringify(bad));
  }
  assert.ok(compute({}).errors.length > 0);
});

test("occupancy is capped at full when demand is scaled up", () => {
  const r = compute({ ...BASE, occPct: "95" });
  const top = r.demandSweep.at(-1);
  const full = month(r.input, 1, 0);
  near(top.profit, full.profit);
});
