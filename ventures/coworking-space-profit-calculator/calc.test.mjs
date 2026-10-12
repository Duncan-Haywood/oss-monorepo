import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, summaryText, sweepCsv, areaFit, startupCost, payment, monthlyLease, fixedMonthly, occupancyAt } from "./calc.mjs";

// 20 dedicated desks at $100, 50% sold = $1,000 a month. Lease 1,000 sq ft x $6 / 12 = $500; staff $100 -> fixed $600; profit $400.
const BASE = { sqft: "1000", rentablePct: "50", desks: "20", deskSqft: "20", deskRate: "100", stabOcc: "50", leasePerSqft: "6", staffMonthly: "100", buildoutPerSqft: "10", furniturePerSeat: "500", depositMonths: "2", contingencyPct: "10" };
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("rooms and seats are checked against the rentable floor", () => {
  const f = areaFit(parse(BASE));
  near(f.rentable, 500); near(f.used, 400); near(f.spare, 100);
  const tight = compute({ ...BASE, desks: "30" }); // 600 needed, 500 available
  assert.ok(tight.findings.some((x) => x.severity === "high" && /rentable/.test(x.title)));
});

test("lease, fixed costs and startup cost add up by hand", () => {
  const p = parse({ ...BASE, otherLeaseCostPct: "20", utilitiesMonthly: "50", insuranceYear: "1200" });
  near(monthlyLease(p), 600); // 500 x 1.2
  near(fixedMonthly(p), 600 + 100 + 50 + 100);
  const c = startupCost(parse(BASE));
  near(c.buildout, 10000); near(c.furniture, 10000); near(c.deposit, 1000); near(c.contingency, 2000); near(c.total, 23000);
});

test("stabilized profit, margin and break-even worked by hand", () => {
  const r = compute(BASE);
  assert.deepEqual(r.errors, []);
  near(r.steady.revenue, 1000); near(r.steady.fixed, 600); near(r.steady.profit, 400);
  near(r.margin, 0.4, 1e-9);
  near(r.beOps, 30, 1e-9); // 600 / (20 x 100) = 60% of desks = 30% when plan is 50%... scale 0.6 x 50
  near(r.priceFactor, 0.75, 1e-9); // 600 / (0.8 x 1000)
  near(r.revPerSqft, 12); // 12,000 a year / 1,000 sq ft
});

test("fees and bad debt come off revenue before profit and move break-even", () => {
  const r = compute({ ...BASE, feesPct: "3", badDebtPct: "2" });
  near(r.steady.lost, 50); near(r.steady.revenue, 950); near(r.steady.profit, 350);
  near(r.beOps, (600 / (1000 * 0.95)) * 50, 1e-9);
});

test("walk-in revenue (day passes, meeting rooms) adds to revenue and scales with the ramp", () => {
  const r = compute({ ...BASE, dayPasses: "10", dayRate: "20", meetingHours: "10", meetingRate: "30" });
  near(r.steady.gross, 1000 + 200 + 300);
  const half = compute({ ...BASE, dayPasses: "10", dayRate: "20", startOcc: "25", rampMonths: "5" });
  // Month 1 is at 25/50 = half scale: (500 + 200) x 0.5 = 350 revenue, minus 600 fixed, so it loses money before month 5.
  assert.ok(half.firstProfitMonth > 1);
  assert.equal(occupancyAt(parse({ ...BASE, startOcc: "25", rampMonths: "5" }), 1), 25);
  assert.equal(occupancyAt(parse({ ...BASE, startOcc: "25", rampMonths: "5" }), 5), 50);
  near(occupancyAt(parse({ ...BASE, startOcc: "25", rampMonths: "5" }), 3), 37.5);
});

test("payback is the first month cumulative cash covers equity", () => {
  const r = compute(BASE); // equity 23,000 at $400 a month, flat
  assert.equal(r.paybackMonth, 58); // 57.5 months
  assert.equal(r.reserve, 0);
  assert.equal(r.firstProfitMonth, 1);
});

test("a slow ramp shows a cash trough below the starting equity", () => {
  const r = compute({ ...BASE, startOcc: "0", rampMonths: "12" });
  assert.ok(r.reserve > 0);
  assert.ok(r.troughMonth >= 1 && r.troughMonth < 12);
  assert.ok(r.firstProfitMonth > 1);
});

test("a loan is level payments and debt coverage divides yearly profit by yearly payments", () => {
  near(payment(12000, 0, 1), 1000);
  const r = compute({ ...BASE, ltcPct: "50", loanRate: "0", termYears: "2" }); // loan 11,500 over 24 months
  near(r.loan, 11500); near(r.pmt, 11500 / 24);
  near(r.dscr, 4800 / (11500 / 24 * 12), 1e-9);
  near(r.cashAfterDebt, 400 - 11500 / 24);
});

test("sweeps hold profit linear in occupancy and price", () => {
  const r = compute(BASE);
  const at80 = r.occSweep.find((x) => x.scale === 0.8);
  near(at80.profit, 1000 * 0.8 - 600);
  const up = r.priceSweep.find((x) => x.pct === 10);
  near(up.profit, 1100 - 600);
});

test("bad input is rejected with a message, never clamped", () => {
  for (const bad of [{ sqft: "" }, { stabOcc: "0" }, { stabOcc: "120" }, { desks: "2.5" }, { desks: "0" }, { rentablePct: "0" }, { termYears: "0" }, { targetMargin: "95" }, { feesPct: "40" }, { leasePerSqft: "-1" }]) {
    const r = compute({ ...BASE, ...bad });
    assert.ok(r.errors.length > 0, JSON.stringify(bad));
  }
});

test("the worked example computes and its summary and CSV are well formed", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.ok(r.fit.spare >= 0, "sample must fit its floor");
  assert.ok(/Coworking space/.test(summaryText(r)));
  assert.equal(sweepCsv(r).split("\n").length, 8);
  assert.ok(r.beDebt >= r.beOps);
});
