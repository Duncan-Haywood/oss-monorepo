import { test } from "node:test";
import assert from "node:assert/strict";
import { tiers, tierIndexFor, analyze, appealChecklist, LIFE_EVENTS, CHECKLIST_STEPS, lookbackExplanation, money, moneyCents, STANDARD_PART_B, FILING_STATUSES } from "./calc.mjs";

test("2026 standard Part B premium and surcharge schedule", () => {
  assert.equal(STANDARD_PART_B, 202.9);
  const t = tiers("single");
  assert.deepEqual(t.map((x) => x.partBSurcharge), [0, 81.2, 202.9, 324.6, 446.3, 487]);
  assert.deepEqual(t.map((x) => x.partDSurcharge), [0, 14.5, 37.5, 60.4, 83.3, 91]);
  assert.deepEqual(t.map((x) => x.partBPremium), [202.9, 284.1, 405.8, 527.5, 649.2, 689.9]);
});

test("single thresholds", () => {
  assert.deepEqual(tiers("single").map((x) => x.to).slice(0, 5), [109_000, 137_000, 171_000, 205_000, 499_999]);
  assert.equal(tiers("single")[1].from, 109_001);
  assert.equal(tiers("single")[5].from, 500_000);
});

test("MFJ thresholds are double the single ones for the lower tiers", () => {
  assert.deepEqual(tiers("mfj").map((x) => x.to).slice(0, 5), [218_000, 274_000, 342_000, 410_000, 749_999]);
});

test("MFS lived with spouse has three bands: 109k, then 391k", () => {
  const t = tiers("mfs");
  assert.equal(t.length, 3);
  assert.deepEqual(t.map((x) => x.to).slice(0, 2), [109_000, 390_999]);
  assert.deepEqual(t.map((x) => x.partBSurcharge), [0, 446.3, 487]);
  assert.deepEqual(t.map((x) => x.partDSurcharge), [0, 83.3, 91]);
  // $109,001 jumps straight to the fourth-tier surcharge, not the first.
  assert.equal(analyze({ filing: "mfs", lookbackMagi: 109_001 }).monthlySurcharge, 446.3 + 83.3);
  assert.equal(analyze({ filing: "mfs", lookbackMagi: 391_000 }).monthlySurcharge, 487 + 91);
});

test("at the threshold you stay in the lower tier, one dollar over is the next", () => {
  for (const f of ["single", "mfj", "mfs"]) {
    const list = tiers(f);
    for (let i = 0; i < list.length - 1; i++) {
      assert.equal(tierIndexFor(f, list[i].to), i, `${f} at ${list[i].to}`);
      assert.equal(tierIndexFor(f, list[i].to + 1), i + 1, `${f} at ${list[i].to + 1}`);
    }
  }
});

test("top tier is at or above 500,000 (single) / 750,000 (MFJ) / 391,000 (MFS)", () => {
  assert.equal(tierIndexFor("single", 499_999), 4);
  assert.equal(tierIndexFor("single", 500_000), 5);
  assert.equal(tierIndexFor("mfj", 749_999), 4);
  assert.equal(tierIndexFor("mfj", 750_000), 5);
  assert.equal(tierIndexFor("mfs", 390_999), 1);
  assert.equal(tierIndexFor("mfs", 391_000), 2);
});

test("exactly 109,000 single: no surcharge; 109,001: tier 1", () => {
  assert.equal(analyze({ filing: "single", lookbackMagi: 109_000 }).annualSurcharge, 0);
  const r = analyze({ filing: "single", lookbackMagi: 109_001 });
  assert.equal(r.tierNumber, 1);
  assert.equal(r.monthlySurcharge, 81.2 + 14.5);
  assert.equal(r.annualSurcharge, 1_148.4);
});

test("one dollar over the first cliff costs the whole first-tier surcharge", () => {
  const r = analyze({ filing: "single", lookbackMagi: 109_000 });
  assert.equal(r.next.roomUp, 0);
  assert.equal(r.oneDollarCost, 1_148.4);
  assert.equal(r.next.oneDollarMonthlyCost, 95.7);
  assert.equal(r.prev, null);
});

test("room up and drop down are measured to the last dollar of each tier", () => {
  const r = analyze({ filing: "single", lookbackMagi: 120_000 });
  assert.equal(r.next.roomUp, 17_000);
  assert.equal(r.prev.dollarsToDrop, 11_000);
  assert.equal(r.prev.annualSaving, 1_148.4);
  // Adding the room stays put; one more dollar moves up.
  assert.equal(tierIndexFor("single", 120_000 + r.next.roomUp), 1);
  assert.equal(tierIndexFor("single", 120_000 + r.next.roomUp + 1), 2);
  assert.equal(tierIndexFor("single", 120_000 - r.prev.dollarsToDrop), 0);
  assert.equal(tierIndexFor("single", 120_000 - r.prev.dollarsToDrop + 1) , 1);
});

test("room to the top tier is one dollar short of the threshold", () => {
  const r = analyze({ filing: "single", lookbackMagi: 300_000 });
  assert.equal(r.next.roomUp, 199_999);
  assert.equal(r.oneDollarCost, round((487 + 91 - 446.3 - 83.3) * 12));
});
const round = (x) => Math.round(x * 100) / 100;

test("two people on a joint return double the surcharge", () => {
  const one = analyze({ filing: "mfj", lookbackMagi: 250_000, people: 1 });
  const two = analyze({ filing: "mfj", lookbackMagi: 250_000, people: 2 });
  assert.equal(two.annualSurcharge, one.annualSurcharge * 2);
  assert.equal(two.oneDollarCost, one.oneDollarCost * 2);
});

test("a single filer is always one person", () => {
  assert.equal(analyze({ filing: "single", lookbackMagi: 150_000, people: 2 }).people, 1);
});

test("Part D surcharge is excluded when there is no Part D plan", () => {
  const r = analyze({ filing: "single", lookbackMagi: 120_000, hasPartD: false });
  assert.equal(r.monthlySurcharge, 81.2);
  assert.equal(r.partDMonthlyEach, null);
});

test("optional Part D plan premium gets the surcharge added", () => {
  const r = analyze({ filing: "single", lookbackMagi: 120_000, partDPlanMonthly: 40 });
  assert.equal(r.partDMonthlyEach, 54.5);
});

test("top tier has no next tier and no one-dollar cost", () => {
  const r = analyze({ filing: "single", lookbackMagi: 600_000 });
  assert.equal(r.isTopTier, true);
  assert.equal(r.next, null);
  assert.equal(r.oneDollarCost, 0);
  assert.equal(r.annualSurcharge, round((487 + 91) * 12));
});

test("planned Roth conversion that fits in the baseline tier", () => {
  const r = analyze({ filing: "single", lookbackMagi: 90_000, baselineMagi: 90_000, plannedAmount: 19_000 });
  assert.equal(r.planned.fits, true);
  assert.equal(r.planned.roomInBaselineTier, 19_000);
  assert.equal(r.planned.extraAnnualCost, 0);
});

test("one dollar too much crosses the cliff and reports the extra cost", () => {
  const r = analyze({ filing: "single", lookbackMagi: 90_000, plannedAmount: 19_001 });
  assert.equal(r.planned.fits, false);
  assert.equal(r.planned.overBy, 1);
  assert.equal(r.planned.tiersCrossed, 1);
  assert.equal(r.planned.extraAnnualCost, 1_148.4);
  assert.ok(r.findings.some((f) => /crosses 1 tier/.test(f.title)));
});

test("baseline can differ from the lookback year", () => {
  const r = analyze({ filing: "single", lookbackMagi: 200_000, baselineMagi: 80_000, plannedAmount: 10_000 });
  assert.equal(r.tierNumber, 3);
  assert.equal(r.planned.baselineTier.index, 0);
  assert.equal(r.planned.fits, true);
});

test("a large planned amount can cross several tiers", () => {
  const r = analyze({ filing: "mfj", lookbackMagi: 100_000, plannedAmount: 400_000 });
  assert.equal(r.planned.projectedTier.index, 4);
  assert.equal(r.planned.tiersCrossed, 4);
});

test("no planned amount and no baseline means no planned block", () => {
  assert.equal(analyze({ filing: "single", lookbackMagi: 100_000 }).planned, null);
});

test("lookback explanation: income in Y sets premium in Y+2", () => {
  const l = lookbackExplanation(2026);
  assert.equal(l.incomeYear, 2024);
  assert.match(l.text, /2026 Medicare premium.*2024 tax return.*2026 sets your 2028/);
});

test("unknown filing status throws", () => {
  assert.throws(() => tiers("hoh2"));
  assert.deepEqual(FILING_STATUSES, ["single", "mfj", "mfs"]);
});

test("negative and blank income are treated as zero", () => {
  assert.equal(analyze({ filing: "single", lookbackMagi: -5 }).tierNumber, 0);
  assert.equal(analyze({ filing: "single", lookbackMagi: "" }).tierNumber, 0);
});

test("cents are floored to whole dollars at the boundary", () => {
  assert.equal(tierIndexFor("single", 109_000.9), 0);
});

test("SSA-44 events and draft text", () => {
  assert.ok(LIFE_EVENTS.length >= 8);
  assert.ok(CHECKLIST_STEPS.length >= 5);
  const r = analyze({ filing: "single", lookbackMagi: 150_000 });
  const t = appealChecklist(r, "work-stopped", 60_000);
  assert.match(t, /not legal, tax or financial advice/);
  assert.match(t, /2024 MAGI used by SSA: \$150,000/);
  assert.match(t, /retirement/);
  assert.match(t, /\$60,000 \(tier 0\)/);
  assert.match(appealChecklist(r, "marriage", null), /\[fill in\]/);
});

test("money formats", () => {
  assert.equal(money(1234.5), "$1,235");
  assert.equal(money(-5), "-$5");
  assert.equal(moneyCents(81.2), "$81.20");
});
