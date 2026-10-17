import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, retirementFra, ownFactor, spousalFactor, survivorFactor, survivorBase, SAMPLE, summaryText } from "./calc.mjs";

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

test("survivor base: early claimer is floored at 82.5% of PIA, late claimer carries credits", () => {
  near(survivorBase(3000, 804, 744), 0.825 * 3000); // 70% reduced -> floor
  near(survivorBase(3000, 804, 804), 3000);
  near(survivorBase(3000, 804, 840), 3000 * 1.24);
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
