import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, summaryText, sweepCsv, monthFactors, DAYS_PER_MONTH } from "./calc.mjs";

// Round numbers: 365/12 * 60% = 18.25 nights exactly.
const BASE = { rent: "1000", adr: "100", occ: "60", avgStay: "2", cleaningFee: "50", turnCost: "40", platformPct: "10", leaseMonths: "12" };
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("a steady month is worked out by hand", () => {
  const r = compute(BASE);
  assert.deepEqual(r.errors, []);
  near(r.steady.nights, 18.25);
  near(r.steady.stays, 9.125);
  near(r.steady.guest, 1825 + 456.25);
  near(r.steady.commission, 228.125);
  near(r.steady.variable, 365);
  near(r.steady.profit, 688.125);
  near(r.annualSteady, 688.125 * 12);
});

test("break-even occupancy is where a steady month earns exactly zero", () => {
  const r = compute(BASE);
  near(r.perNight, 92.5);
  near(r.breakEvenOcc, (1000 / 92.5 / DAYS_PER_MONTH) * 100, 1e-9);
  const back = compute({ ...BASE, occ: String(r.breakEvenOcc) });
  near(back.steady.profit, 0, 1e-6);
});

test("furnishing is earned back in the right month and the lease nets out", () => {
  const r = compute({ ...BASE, furnish: "6000" });
  assert.equal(r.paybackMonth, 9);
  near(r.netLease, 688.125 * 12 - 6000);
  const resale = compute({ ...BASE, furnish: "6000", resalePct: "50" });
  near(resale.netLease, 688.125 * 12 - 6000 + 3000);
});

test("ramp-up months run at a share of steady occupancy", () => {
  const p = parse({ ...BASE, rampMonths: "2", rampPct: "50" });
  assert.deepEqual(monthFactors(p).slice(0, 3), [0.5, 0.5, 1]);
  const r = compute({ ...BASE, furnish: "6000", rampMonths: "2", rampPct: "50" });
  near(r.netLease, 10 * 688.125 + 2 * (92.5 * 9.125 - 1000) - 6000);
});

test("occupancy needed to net zero over the lease checks out when plugged back in", () => {
  const input = { ...BASE, furnish: "6000", rampMonths: "2", rampPct: "50" };
  const r = compute(input);
  near(r.leaseOcc, (18000 / (92.5 * DAYS_PER_MONTH * 11)) * 100, 1e-9);
  near(compute({ ...input, occ: String(r.leaseOcc) }).netLease, 0, 1e-6);
});

test("rate solves check out when plugged back in", () => {
  const input = { ...BASE, furnish: "6000", rampMonths: "2", rampPct: "50" };
  const r = compute(input);
  near(compute({ ...input, adr: String(r.leaseRate) }).netLease, 0, 1e-6);
  const m = compute({ ...BASE, adr: String(compute(BASE).monthRate) });
  near(m.steady.profit, 0, 1e-6);
});

test("deposit is cash at risk but not a cost", () => {
  const a = compute({ ...BASE, furnish: "6000" });
  const b = compute({ ...BASE, furnish: "6000", deposit: "1000" });
  near(b.netLease, a.netLease);
  near(b.cashAtRisk, a.cashAtRisk + 1000);
});

test("a losing unit is flagged high and never reports payback", () => {
  const r = compute({ ...BASE, rent: "3500", furnish: "6000" });
  assert.ok(r.steady.profit < 0);
  assert.equal(r.paybackMonth, null);
  assert.ok(r.findings.some((f) => f.severity === "high"));
});

test("break-even above 100% is called unreachable", () => {
  const r = compute({ ...BASE, rent: "9000" });
  assert.equal(r.beReachable, false);
  assert.ok(r.findings.some((f) => /cannot happen/.test(f.title)));
});

test("a nightly rate below the cost of each stay is flagged", () => {
  const r = compute({ ...BASE, adr: "10", cleaningFee: "0", turnCost: "40" });
  assert.ok(r.perNight <= 0);
  assert.equal(r.breakEvenOcc, null);
  assert.ok(r.findings.some((f) => /costs more in commission/.test(f.title)));
});

test("sweeps move the right way and cap occupancy at 100", () => {
  const r = compute({ ...BASE, occ: "95" });
  assert.ok(r.sweep.every((x) => x.occ <= 100));
  for (let i = 1; i < r.sweep.length; i++) assert.ok(r.sweep[i].monthly >= r.sweep[i - 1].monthly);
  const rs = compute(BASE).rentSweep;
  for (let i = 1; i < rs.length; i++) assert.ok(rs[i].monthly < rs[i - 1].monthly);
  near(rs[2].rent, 1100);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...BASE, rent: "" }).errors.length);
  assert.ok(compute({ ...BASE, occ: "101" }).errors.length);
  assert.ok(compute({ ...BASE, leaseMonths: "0" }).errors.length);
  assert.ok(compute({ ...BASE, leaseMonths: "6", rampMonths: "7" }).errors.length);
  assert.ok(compute({ ...BASE, platformPct: "60" }).errors.length);
  assert.ok(compute({ ...BASE, avgStay: "0.5" }).errors.length);
  assert.ok(compute({ ...BASE, resalePct: "120" }).errors.length);
});

test("the worked example runs and mentions the sublet-permission check", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.ok(r.findings.some((f) => /allow short-term subletting/.test(f.title)));
  assert.match(summaryText(r), /Rental arbitrage/);
  assert.equal(sweepCsv(r).split("\n").length, 8);
});
