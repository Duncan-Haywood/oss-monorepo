import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, summaryText, sweepCsv, spacesFor, projectCost, payment, balanceAfter, irr, occupancyAt, SQFT_PER_ACRE } from "./calc.mjs";

// One acre at 1,089 sq ft a space is exactly 40 spaces. 40 x 50% x $100 x 12 = $24,000 of rent.
const BASE = { acres: "1", usablePct: "100", spaceSqft: "1089", land: "100000", rate: "100", stabOcc: "50", propTax: "6000", holdYears: "1", exitCap: "10" };
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("acres, usable share and space size give a whole number of spaces", () => {
  assert.equal(SQFT_PER_ACRE, 43560);
  assert.equal(spacesFor(parse(BASE)), 40);
  assert.equal(spacesFor(parse({ ...BASE, usablePct: "70" })), 28); // 43560 x .7 / 1089 = 28
  assert.equal(spacesFor(parse({ ...BASE, acres: "3", usablePct: "70", spaceSqft: "600" })), 152); // 91476 / 600 = 152.46
});

test("project cost adds land, surfaced area, fencing, permits and other", () => {
  const p = parse({ ...BASE, developedPct: "50", sitePerSqft: "2", fenceGate: "10000", permits: "5000", other: "1000" });
  const c = projectCost(p);
  near(c.siteWork, 43560);
  near(c.total, 100000 + 43560 + 10000 + 5000 + 1000);
});

test("stabilized NOI, yield on cost and break-even worked by hand", () => {
  const r = compute(BASE);
  assert.deepEqual(r.errors, []);
  near(r.steady.income, 24000);
  near(r.steady.noi, 18000);
  near(r.yieldOnCost, 0.18, 1e-9);
  near(r.beNoi, 12.5, 1e-9); // 6000 / (40 x 100 x 12 / 100)
  near(r.beCash, 12.5, 1e-9);
  near(r.rateForTarget, 16000 / 240, 1e-9);
  assert.equal(r.dscr, null);
});

test("bad debt and management fees come off rent in the right order", () => {
  const r = compute({ ...BASE, badDebtPct: "10", mgmtPct: "10", repairsPerSpace: "25", fixedMonthly: "100", insurance: "1200" });
  near(r.steady.lost, 2400);
  near(r.steady.mgmt, 21600 * 0.1);
  near(r.steady.fixed, 6000 + 1200 + 1200 + 1000);
  near(r.steady.noi, 24000 - 2400 - 2160 - 9400);
});

test("rent from the target-yield solve plugs back in to the target", () => {
  const r = compute({ ...BASE, badDebtPct: "5", mgmtPct: "8", repairsPerSpace: "30", targetYield: "12" });
  const back = compute({ ...BASE, badDebtPct: "5", mgmtPct: "8", repairsPerSpace: "30", rate: String(r.rateForTarget) });
  near(back.yieldOnCost, 0.12, 1e-9);
});

test("break-even occupancy plugs back in to zero NOI and zero cash after the loan", () => {
  const input = { ...BASE, ltcPct: "60", loanRate: "6", termYears: "20", badDebtPct: "5", mgmtPct: "8", repairsPerSpace: "30" };
  const r = compute(input);
  near(compute({ ...input, stabOcc: String(r.beNoi) }).steady.noi, 0, 1e-6);
  near(compute({ ...input, stabOcc: String(r.beCash) }).cashAfterDebt, 0, 1e-6);
});

test("loan maths: known payment, zero-rate payment and balance", () => {
  near(payment(100000, 6, 30), 599.55, 0.01);
  near(payment(100000, 0, 10), 100000 / 120, 1e-9);
  near(balanceAfter(50000, 0, 10, 60), 25000, 1e-9);
  assert.equal(balanceAfter(50000, 6, 10, 120), 0);
  const r = compute({ ...BASE, ltcPct: "50", loanRate: "0", termYears: "10" });
  near(r.loan, 50000);
  near(r.annualDebt, 5000, 1e-9);
  near(r.dscr, 3.6, 1e-9);
  near(r.cashAfterDebt, 13000);
  near(r.cashOnCash, 13000 / 50000, 1e-9);
});

test("lease-up runs linearly from the starting to the stabilized occupancy", () => {
  const p = parse({ ...BASE, stabOcc: "60", startOcc: "0", rampMonths: "4" });
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((m) => occupancyAt(p, m)), [0, 20, 40, 60, 60, 60]);
  assert.equal(occupancyAt(parse({ ...BASE, rampMonths: "0" }), 1), 50);
});

test("the sale and the IRR agree with a hand calculation", () => {
  const r = compute(BASE); // no loan, no ramp, no growth: 12 x $1,500 operating cash, sale at 18,000 / 10%
  near(r.salePrice, 180000);
  near(r.saleProceeds, 180000);
  near(r.profit, 18000 + 180000 - 100000);
  near(r.multiple, 1.98, 1e-9);
  // Discounting the flows at the reported IRR returns zero.
  const m = Math.pow(1 + r.equityIrr, 1 / 12) - 1;
  let npv = -100000;
  for (let i = 1; i <= 12; i++) npv += (1500 + (i === 12 ? 180000 : 0)) / Math.pow(1 + m, i);
  near(npv, 0, 1e-4);
  assert.equal(r.paybackMonth, null);
});

test("irr finds a known rate and refuses flows with no sign change", () => {
  near(irr([-100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 112]), 0.12, 1e-6); // 100 grows to 112 in twelve months
  assert.equal(irr([100, 10, 10]), null);
});

test("rent growth and cost growth step up each year", () => {
  const r = compute({ ...BASE, holdYears: "2", rateGrowth: "10", costGrowth: "0" });
  near(r.noiByYear[0], 18000);
  near(r.noiByYear[1], 24000 * 1.1 - 6000);
});

test("a loan that ends before the hold stops charging payments", () => {
  const r = compute({ ...BASE, holdYears: "3", ltcPct: "50", loanRate: "0", termYears: "1" });
  near(r.cfByYear[0], 18000 - 50000);
  near(r.cfByYear[1], 18000);
  near(r.payoff, 0);
});

test("sensitivity tables recompute from the inputs", () => {
  const r = compute({ ...BASE, ltcPct: "50", loanRate: "0", termYears: "10" });
  const full = r.sweep.find((x) => x.scale === 1);
  near(full.noi, 18000);
  const low = r.sweep.find((x) => x.scale === 0.6);
  near(low.noi, 40 * 0.3 * 100 * 12 - 6000);
  const up = r.rateSweep.find((x) => x.pct === 10);
  near(up.noi, 40 * 0.5 * 110 * 12 - 6000);
  assert.match(sweepCsv(r), /^occupancy_vs_plan_pct,/);
});

test("a lot that loses money is flagged and the sample runs clean", () => {
  const r = compute({ ...BASE, rate: "10" });
  assert.ok(r.findings.some((f) => f.severity === "high" && /operating costs/.test(f.title)));
  const s = compute(SAMPLE);
  assert.deepEqual(s.errors, []);
  assert.match(summaryText(s), /Debt coverage/);
  assert.ok(s.findings.some((f) => /zoning/i.test(f.title)));
});

test("bad input is rejected instead of clamped", () => {
  for (const bad of [{ acres: "0" }, { rate: "" }, { stabOcc: "101" }, { usablePct: "0" }, { spaceSqft: "50" }, { ltcPct: "95" }, { termYears: "2.5" }, { holdYears: "0" }, { exitCap: "0" }, { land: "-1" }, { rampMonths: "-1" }, { acres: "0.001" }]) {
    const r = compute({ ...BASE, ...bad });
    assert.ok(r.errors.length > 0, JSON.stringify(bad));
  }
  assert.equal(compute({ ...BASE, rate: "$1,250" }).errors.length, 0);
});
