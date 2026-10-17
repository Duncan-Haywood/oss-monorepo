import { test } from "node:test";
import assert from "node:assert/strict";
import { qsbsExclusionOutcome, exclusionPercent, money, QSBS_RULES } from "./calc.mjs";

test("old rule: 0% exclusion below 5 years, all-or-nothing", () => {
  assert.equal(exclusionPercent("old", 4.9), 0);
  assert.equal(exclusionPercent("old", 3), 0);
  assert.equal(exclusionPercent("old", 0), 0);
});

test("old rule: 100% exclusion at exactly 5 years and above", () => {
  assert.equal(exclusionPercent("old", 5), 1);
  assert.equal(exclusionPercent("old", 10), 1);
});

test("new rule: tiered 50/75/100 at 3/4/5 years", () => {
  assert.equal(exclusionPercent("new", 2), 0);
  assert.equal(exclusionPercent("new", 3), 0.5);
  assert.equal(exclusionPercent("new", 3.9), 0.5);
  assert.equal(exclusionPercent("new", 4), 0.75);
  assert.equal(exclusionPercent("new", 4.9), 0.75);
  assert.equal(exclusionPercent("new", 5), 1);
});

test("old rule caps eligible gain at $10M or 10x basis, whichever is greater", () => {
  const r = qsbsExclusionOutcome({ era: "old", yearsHeld: 5, gain: 20_000_000, basis: 500_000 });
  assert.equal(r.cap, 10_000_000, "10x basis (5M) is less than the 10M floor");
  assert.equal(r.eligibleGain, 10_000_000);
  assert.equal(r.excludedGain, 10_000_000);
  assert.equal(r.taxableGain, 10_000_000);
  assert.equal(r.disallowedByCap, 10_000_000);
});

test("new rule caps eligible gain at $15M or 10x basis, whichever is greater", () => {
  const r = qsbsExclusionOutcome({ era: "new", yearsHeld: 5, gain: 30_000_000, basis: 2_000_000 });
  assert.equal(r.cap, 20_000_000, "10x basis (20M) exceeds the 15M floor");
  assert.equal(r.eligibleGain, 20_000_000);
  assert.equal(r.excludedGain, 20_000_000);
  assert.equal(r.taxableGain, 10_000_000);
});

test("new rule at 3 years excludes exactly half the eligible gain", () => {
  const r = qsbsExclusionOutcome({ era: "new", yearsHeld: 3, gain: 4_000_000, basis: 100_000 });
  assert.equal(r.eligibleGain, 4_000_000);
  assert.equal(r.excludedGain, 2_000_000);
  assert.equal(r.taxableGain, 2_000_000);
  assert.equal(r.percent, 0.5);
});

test("old rule below 5 years excludes nothing at all, even a small gain", () => {
  const r = qsbsExclusionOutcome({ era: "old", yearsHeld: 4.5, gain: 1_000_000, basis: 50_000 });
  assert.equal(r.excludedGain, 0);
  assert.equal(r.taxableGain, 1_000_000);
});

test("nextTier is reported for the new rule below full exclusion", () => {
  const r = qsbsExclusionOutcome({ era: "new", yearsHeld: 3.2, gain: 1_000_000, basis: 50_000 });
  assert.deepEqual(r.nextTier, { years: 4, percent: 0.75 });

  const atFive = qsbsExclusionOutcome({ era: "new", yearsHeld: 5, gain: 1_000_000, basis: 50_000 });
  assert.equal(atFive.nextTier, null, "no next tier once fully excluded");
});

test("old rule reports no nextTier at all -- it is a cliff, not a ladder", () => {
  const r = qsbsExclusionOutcome({ era: "old", yearsHeld: 4, gain: 1_000_000, basis: 50_000 });
  assert.equal(r.nextTier, null);
});

test("zero gain produces zero exclusion and an info finding", () => {
  const r = qsbsExclusionOutcome({ era: "new", yearsHeld: 5, gain: 0, basis: 0 });
  assert.equal(r.excludedGain, 0);
  assert.match(r.findings[0].title, /Enter your gain/);
});

test("negative or missing inputs are treated as zero, never negative", () => {
  const r = qsbsExclusionOutcome({ era: "new", yearsHeld: -1, gain: -500, basis: -200 });
  assert.equal(r.yearsHeld, 0);
  assert.equal(r.gain, 0);
  assert.equal(r.basis, 0);
  assert.equal(r.excludedGain, 0);
});

test("an unrecognized era falls back to the new rule", () => {
  const r = qsbsExclusionOutcome({ era: "nonsense", yearsHeld: 5, gain: 1_000_000, basis: 0 });
  assert.equal(r.cap, QSBS_RULES.new.cap);
});

test("findings always flag that company-level QSB eligibility is unverified", () => {
  const r = qsbsExclusionOutcome({ era: "new", yearsHeld: 5, gain: 1_000_000, basis: 0 });
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /Company-level QSB eligibility not verified/);
});

test("money() formats negative values with a leading minus and no double sign", () => {
  assert.equal(money(1234), "$1,234");
  assert.equal(money(-1234), "-$1,234");
  assert.equal(money(0), "$0");
});

test("next tier advances exactly at the 3 and 4 year milestones", () => {
  const tier = (yearsHeld) => qsbsExclusionOutcome({ era: "new", yearsHeld, gain: 100000, basis: 1000 }).nextTier;
  assert.deepEqual(tier(2.9), { years: 3, percent: 0.5 });
  assert.deepEqual(tier(3), { years: 4, percent: 0.75 });
  assert.deepEqual(tier(4), { years: 5, percent: 1 });
  assert.equal(tier(5), null);
});

test("no per-issuer cap finding when the gain is exactly within the cap", () => {
  const r = qsbsExclusionOutcome({ era: "new", yearsHeld: 5, gain: 100000, basis: 1000 });
  assert.equal(r.disallowedByCap, 0);
  assert.ok(!r.findings.some((f) => /per-issuer cap/.test(f.title)));
});

test("non-numeric gain counts as zero, not one dollar", () => {
  const r = qsbsExclusionOutcome({ era: "new", yearsHeld: 5, gain: "abc", basis: 0 });
  assert.equal(r.taxableGain, 0);
  assert.equal(r.excludedGain, 0);
});

test("money keeps the minus sign on small negatives and drops it on rounded-to-zero", () => {
  assert.equal(money(-1), "-$1");
  assert.equal(money(-0.2), "$0");
});
