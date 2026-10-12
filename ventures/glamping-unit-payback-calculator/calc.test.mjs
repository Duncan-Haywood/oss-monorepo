import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, annualPayment, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });
const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

// Hand-worked from SAMPLE: peak 6 units x 100 days = 600 nights at 55% = 330 sold at $225;
// shoulder 6 x 120 = 720 at 35% = 252 sold at $160. 582 nights, 582 / 2.2 stays.
const LODGING = 330 * 225 + 252 * 160;
const STAYS = 582 / 2.2;
const GUEST = LODGING + STAYS * 85;
const VARIABLE = 582 * 9 + STAYS * 55;
const RESERVE = 6 * 45000 * 0.03;
const NOI = GUEST * 0.88 - VARIABLE - 54000 - RESERVE;
const DEBT = (252000 * 0.08) / (1 - Math.pow(1.08, -20));

test("operating income follows the stated rule on the sample", () => {
  const r = compute(raw());
  near(r.totals.lodging, LODGING);
  near(r.totals.guest, GUEST);
  near(r.totals.commission, GUEST * 0.12);
  near(r.totals.variable, VARIABLE);
  near(r.totals.reserve, RESERVE);
  near(r.totals.noi, NOI);
  near(r.base.nights, 582);
});

test("loan payment is the level amortising payment and debt coverage divides by it", () => {
  const r = compute(raw());
  near(r.totals.loan, 252000);
  near(r.totals.equity, 108000);
  near(r.totals.debt, DEBT);
  near(r.dscr, NOI / DEBT, 1e-4);
  near(r.totals.cashFlow, NOI - DEBT);
  near(r.paybackEquity, 108000 / (NOI - DEBT), 1e-4);
  near(r.paybackAll, 360000 / NOI, 1e-4);
  near(r.yieldOnCost, NOI / 360000, 1e-6);
});

test("a zero rate loan is straight-line and no loan means no debt", () => {
  near(annualPayment(100000, 0, 20), 5000);
  assert.equal(annualPayment(0, 8, 20), 0);
  const r = compute(raw({ loanPct: "0" }));
  assert.equal(r.dscr, null);
  near(r.totals.cashFlow, NOI);
  near(r.paybackEquity, 360000 / NOI, 1e-4);
});

test("pricing at the break-even rate multiplier leaves zero cash after the loan", () => {
  const r = compute(raw({ peakAdr: "60", shoulderAdr: "45" }));
  assert.ok(r.totals.cashFlow < 0);
  const f = r.beRateScale;
  const back = compute(raw({ peakAdr: String(60 * f), shoulderAdr: String(45 * f) }));
  near(back.totals.cashFlow, 0, 0.5);
});

test("pricing at the target-payback multiplier pays back on equity in exactly the target years", () => {
  const r = compute(raw());
  const f = r.targetRateScale;
  const back = compute(raw({ peakAdr: String(225 * f), shoulderAdr: String(160 * f) }));
  near(back.paybackEquity, 7, 1e-3);
});

test("break-even occupancy gives zero cash after the loan when no season caps", () => {
  const r = compute(raw());
  assert.ok(r.beReachable);
  const scale = r.breakEvenOcc / r.blendedOcc;
  const back = compute(raw({ peakOcc: String(55 * scale), shoulderOcc: String(35 * scale) }));
  near(back.totals.cashFlow, 0, 0.5);
});

test("occupancy sweep includes the plan at 100% and caps a season at 100", () => {
  const r = compute(raw());
  const plan = r.sweep.find((x) => x.scale === 1);
  near(plan.noi, NOI);
  near(plan.cashFlow, NOI - DEBT);
  const hot = compute(raw({ peakOcc: "95" }));
  const top = hot.sweep.find((x) => x.scale === 1.2);
  const flat = compute(raw({ peakOcc: "100", shoulderOcc: String(35 * 1.2) }));
  near(top.noi, flat.totals.noi);
});

test("unit-count sweep spreads shared and fixed costs and includes the entered count", () => {
  const r = compute(raw());
  const six = r.unitSweep.find((x) => x.units === 6);
  near(six.noi, NOI);
  near(six.investment, 360000);
  const one = r.unitSweep.find((x) => x.units === 1);
  const one6 = (GUEST / 6) * 0.88 - VARIABLE / 6 - 54000 - RESERVE / 6;
  near(one.noi, one6);
  assert.ok(r.unitSweep.find((x) => x.units === 12).noiPerUnit > one.noiPerUnit);
});

test("unit-count sweep stops at twice the entered count", () => {
  const r = compute(raw());
  assert.equal(Math.max(...r.unitSweep.map((x) => x.units)), 12);
  assert.ok(compute(raw({ units: "1" })).unitSweep.every((x) => x.units <= 4));
});

test("a loss is flagged high and names the rate change that covers it", () => {
  const r = compute(raw({ peakOcc: "25", shoulderOcc: "15" }));
  assert.ok(r.totals.cashFlow < 0);
  const f = r.findings[0];
  assert.equal(f.severity, "high");
  assert.match(f.title, /loses about/);
  assert.ok(r.dscr < 1);
});

test("peak-heavy income, optimistic occupancy and slow payback are each flagged", () => {
  const r = compute(raw({ shoulderOcc: "10", peakOcc: "85" }));
  const t = r.findings.map((f) => f.title).join("\n");
  assert.match(t, /peak season/);
  assert.match(t, /above 80% is an optimistic/);
  const slow = compute(raw());
  assert.ok(slow.paybackEquity > 7);
  assert.match(slow.findings.map((f) => f.title).join("\n"), /past your 7-year target/);
});

test("single season works and an unused season needs no rate", () => {
  const r = compute(raw({ shoulderDays: "0", shoulderAdr: "", shoulderOcc: "", offDays: "" }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.seasons.length, 1);
  near(r.base.nights, 330);
});

test("bad input is rejected with plain messages and never clamped", () => {
  assert.match(compute(raw({ units: "0" })).errors[0], /number of units/);
  assert.match(compute(raw({ units: "2.5" })).errors[0], /number of units/);
  assert.match(compute(raw({ unitCost: "" })).errors[0], /cost of one unit/);
  assert.match(compute(raw({ peakOcc: "120" })).errors.join(" "), /peak season occupancy/);
  assert.match(compute(raw({ peakAdr: "" })).errors.join(" "), /nightly rate for the peak/);
  assert.match(compute(raw({ peakDays: "300", shoulderDays: "120" })).errors.join(" "), /more than a year/);
  assert.match(compute(raw({ platformPct: "60" })).errors.join(" "), /commission/);
  assert.match(compute(raw({ loanPct: "120" })).errors.join(" "), /financed/);
  assert.match(compute(raw({ peakDays: "0", shoulderDays: "0" })).errors.join(" "), /at least one season/);
});

test("summary text and CSV carry the headline figures", () => {
  const r = compute(raw());
  const s = summaryText(r);
  assert.match(s, /6 unit\(s\)/);
  assert.match(s, /\$360,000 invested/);
  assert.match(s, /Debt coverage/);
  const csv = sweepCsv(r).split("\n");
  assert.equal(csv.length, 8);
  assert.match(csv[0], /^occupancy_vs_plan_pct/);
  assert.equal(dollars(-1234.5), "-$1,234.50");
});
