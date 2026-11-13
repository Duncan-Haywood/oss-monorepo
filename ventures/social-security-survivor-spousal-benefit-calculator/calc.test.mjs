import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, retirementFra, ownFactor, spousalFactor, survivorFactor, survivorBase, survivorAmount, strategyTotal, SAMPLE, summaryText } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("full retirement age table", () => {
  assert.equal(retirementFra(1954), 66 * 12);
  assert.equal(retirementFra(1957), 66 * 12 + 6);
  assert.equal(retirementFra(1959), 66 * 12 + 10);
  assert.equal(retirementFra(1960), 67 * 12);
});

test("own benefit: 70% at 62 with FRA 67, 124% at 70", () => {
  near(ownFactor(62 * 12, 67 * 12), 0.7, 1e-9);
  near(ownFactor(70 * 12, 67 * 12), 1.24, 1e-9);
  near(ownFactor(67 * 12, 67 * 12), 1, 1e-9);
});

test("spousal benefit: 32.5% of PIA at 62 with FRA 67, 50% at FRA, no credits after", () => {
  near(spousalFactor(62 * 12, 67 * 12), 0.325, 1e-9);
  near(spousalFactor(67 * 12, 67 * 12), 0.5, 1e-9);
  near(spousalFactor(70 * 12, 67 * 12), 0.5, 1e-9);
});

test("survivor benefit: 71.5% at 60, 100% at FRA, linear between", () => {
  near(survivorFactor(720, 804), 0.715, 1e-9);
  near(survivorFactor(804, 804), 1, 1e-9);
  near(survivorFactor(762, 804), 0.715 + 0.285 / 2, 1e-9);
  assert.equal(survivorFactor(840, 804), 1);
});

test("survivor base: early claimer's limit is the larger of RIB and 82.5% of PIA, late claimer carries credits", () => {
  near(survivorBase(3000, 804, 744), 0.825 * 3000); // RIB 2100 < 2475
  near(survivorBase(3000, 804, 804), 3000);
  near(survivorBase(3000, 804, 840), 3000 * 1.24);
  near(survivorBase(3000, 804, 756, false), 3000); // died at 63 without claiming: no limit
});

// Hand figures from the widow(er)'s limit (SSA s.202(e)(2)(D), POMS RS 00615.320): the limit caps the age-reduced
// survivor benefit; it is not reduced again. Round 63 audit, portfolio/quality/audits/2026-11-13-social-security-*.
test("widow(er)'s limit caps the age-reduced benefit, it is not reduced twice", () => {
  // PIA 3000, worker FRA 67 claimed at 62 (RIB 2100), survivor FRA 67 claims at 60: min(0.715*3000, max(2100, 2475)) = 2145
  near(survivorAmount(3000, 804, 744, 720, 804), 2145);
  // worker claimed at 66 (RIB 2800); survivor at 63: min(3000*(0.715+0.285*36/84), 2800) = 2511.43
  near(survivorAmount(3000, 804, 792, 756, 804), 3000 * (0.715 + 0.285 * 36 / 84));
  // at survivor FRA the limit binds: 2475
  near(survivorAmount(3000, 804, 744, 804, 804), 2475);
  // through compute: died at 63 never having claimed, survivor at FRA gets the full PIA
  const r = compute({ ...SAMPLE, deceasedPia: 3000, deceasedClaimed: "no", deceasedClaimAge: 63 });
  assert.deepEqual(r.errors, []);
  near(r.table.find((t) => t.age === 67).survivor, 3000);
  // death before 62 is accepted when the worker never claimed
  assert.deepEqual(compute({ ...SAMPLE, deceasedClaimed: "no", deceasedClaimAge: 55 }).errors, []);
});

test("spousal top-up: the excess over own PIA is what gets reduced for age", () => {
  // worker PIA 3000, own PIA 1000, FRA 67, spousal at 62: (1500 - 1000) * 0.65 = 325; own 700; total 1025
  const at62 = compute({ ...SAMPLE, ownPia: 1000, spousePia: 3000, spousalClaimAge: 62, birthYear: 1962 });
  near(at62.spousal.excess, 325);
  near(at62.spousal.total, 1025);
  const at64 = compute({ ...SAMPLE, ownPia: 1000, spousePia: 3000, spousalClaimAge: 64, birthYear: 1962 });
  near(at64.spousal.excess, 375); // 36 months early: 25% off
});

test("sample computes and strategies are internally consistent", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  near(r.base, 3200);
  const top = r.strategies[0];
  for (const s of r.strategies.slice(1)) assert.ok(top.total >= s.total - 1e-6, s.label);
  assert.match(summaryText(r), /Strategies/);
  assert.equal(r.table[0].own, null);
});

test("spousal top-up only when worker's half exceeds own benefit", () => {
  const hi = compute({ ...SAMPLE, ownPia: 1000, spousePia: 3000, spousalClaimAge: 67, birthYear: 1962 });
  near(hi.spousal.excess, 500);
  const lo = compute({ ...SAMPLE, ownPia: 2400, spousePia: 3200 });
  assert.equal(lo.spousal.excess, 0);
});

test("bad input is rejected, not clamped", () => {
  assert.ok(parse({}).errors.length > 5);
  assert.ok(compute({ ...SAMPLE, deceasedClaimAge: 55 }).errors.length === 1);
  assert.ok(compute({ ...SAMPLE, planAge: "" }).errors.length === 1);
});

test("strategy total pays the larger benefit each month, never both", () => {
  // survivor 1000 from 60 (720), own 1500 from 70 (840), plan to 72 (864): 120 * 1000 + 24 * 1500
  const total = strategyTotal({ sa: 720, oa: 840, survivorAmt: () => 1000, ownAmt: () => 1500, planMonths: 864 });
  assert.equal(total, 120 * 1000 + 24 * 1500);
});
