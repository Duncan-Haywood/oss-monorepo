import { test } from "node:test";
import assert from "node:assert/strict";
import { LAW_2026, averageStay, rentalActivityStatus, materialParticipation, passiveAllowance, midMonthRate, firstYearDepreciation, strTaxOutcome, money } from "./calc.mjs";

const close = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

const EXAMPLE = {
  rentalDays: 210, stays: 60, significantServices: false, personalDays: 10,
  myHours: 250, spouseHours: 0, othersTotalHours: 300, topOtherHours: 200,
  filingStatus: "single", magi: 180000, otherPassiveIncome: 0, otherBusinessIncome: 0, atRisk: "",
  purchasePrice: 600000, landPct: 20, monthPlaced: 3, recoveryYears: 27.5, reclassPct: 25, furniture: 20000,
  studyCost: 6000, noiBeforeDepreciation: 30000, fedRatePct: 32, stateRatePct: 0, activeParticipation: true,
};

test("2026 constants match the verified IRS figures", () => {
  assert.equal(LAW_2026.allowanceMax, 25000);
  assert.equal(LAW_2026.allowancePhaseStart, 100000);
  assert.equal(LAW_2026.allowancePhaseEnd, 150000);
  assert.equal(LAW_2026.eblSingle, 256000);
  assert.equal(LAW_2026.eblJoint, 512000);
  assert.equal(LAW_2026.bonusRate, 1);
});

test("average stay is total days divided by number of stays", () => {
  assert.equal(averageStay(210, 60), 3.5);
  assert.equal(averageStay(210, 0), 0);
});

test("7-day boundary is inclusive; 8 days is a rental activity", () => {
  assert.equal(rentalActivityStatus({ rentalDays: 70, stays: 10 }).isRentalActivity, false);
  const eight = rentalActivityStatus({ rentalDays: 80, stays: 10 });
  assert.equal(eight.isRentalActivity, true);
  assert.equal(eight.reason, "thirty-day-no-services");
});

test("30-day exception needs significant personal services", () => {
  assert.equal(rentalActivityStatus({ rentalDays: 300, stays: 10, significantServices: true }).isRentalActivity, false);
  assert.equal(rentalActivityStatus({ rentalDays: 310, stays: 10, significantServices: true }).isRentalActivity, true);
  assert.equal(rentalActivityStatus({ rentalDays: 300, stays: 10 }).isRentalActivity, true);
});

test("no data is treated conservatively as a rental activity", () => {
  const s = rentalActivityStatus({});
  assert.equal(s.known, false);
  assert.equal(s.isRentalActivity, true);
});

test("material participation tests 1-3", () => {
  assert.equal(materialParticipation({ myHours: 501 }).tests[0].met, true);
  assert.equal(materialParticipation({ myHours: 500 }).tests[0].met, false);
  assert.equal(materialParticipation({ myHours: 40, othersTotalHours: 0 }).tests[1].met, true);
  assert.equal(materialParticipation({ myHours: 40, othersTotalHours: 5 }).tests[1].met, false);
  assert.equal(materialParticipation({ myHours: 120, othersTotalHours: 300, topOtherHours: 120 }).tests[2].met, true);
  assert.equal(materialParticipation({ myHours: 120, othersTotalHours: 300, topOtherHours: 121 }).met, false);
  assert.equal(materialParticipation({ myHours: 100, othersTotalHours: 50, topOtherHours: 50 }).met, false);
});

test("spouse hours count toward the taxpayer's participation", () => {
  const mp = materialParticipation({ myHours: 300, spouseHours: 250 });
  assert.equal(mp.hours, 550);
  assert.equal(mp.met, true);
});

test("facts-and-circumstances is flagged but never counted as met", () => {
  const mp = materialParticipation({ myHours: 150, othersTotalHours: 400, topOtherHours: 300 });
  assert.equal(mp.met, false);
  assert.equal(mp.facts, true);
});

test("$25,000 allowance phases out 50 cents per dollar from $100k to $150k", () => {
  assert.equal(passiveAllowance({ magi: 90000 }).allowance, 25000);
  assert.equal(passiveAllowance({ magi: 100000 }).allowance, 25000);
  assert.equal(passiveAllowance({ magi: 120000 }).allowance, 15000);
  assert.equal(passiveAllowance({ magi: 150000 }).allowance, 0);
  assert.equal(passiveAllowance({ magi: 400000 }).allowance, 0);
});

test("married filing separately allowance", () => {
  assert.equal(passiveAllowance({ filingStatus: "mfs-together", magi: 0 }).allowance, 0);
  assert.equal(passiveAllowance({ filingStatus: "mfs-apart", magi: 50000 }).allowance, 12500);
  assert.equal(passiveAllowance({ filingStatus: "mfs-apart", magi: 60000 }).allowance, 7500);
  assert.equal(passiveAllowance({ filingStatus: "mfs-apart", magi: 75000 }).allowance, 0);
});

test("mid-month first-year rates match the IRS tables", () => {
  close(midMonthRate(1, 27.5), 0.03485, 0.00001);
  close(midMonthRate(12, 27.5), 0.00152, 0.00001);
  close(midMonthRate(3, 27.5), 0.02879, 0.00001);
  close(midMonthRate(12, 39), 0.00107, 0.00001);
  close(midMonthRate(7, 27.5), 0.01667, 0.00001);
});

test("cost segregation year one: bonus on the reclassified share plus straight-line on the rest", () => {
  const plain = firstYearDepreciation({ purchasePrice: 600000, landPct: 20, monthPlaced: 3, reclassPct: 25, furniture: 20000 });
  close(plain.building, 13818.18);
  close(plain.total, 33818.18);
  const seg = firstYearDepreciation({ purchasePrice: 600000, landPct: 20, monthPlaced: 3, reclassPct: 25, furniture: 20000, costSeg: true });
  close(seg.bonus, 120000);
  close(seg.building, 10363.64);
  close(seg.total, 150363.64);
});

test("39-year recovery reduces the straight-line piece", () => {
  const a = firstYearDepreciation({ purchasePrice: 400000, landPct: 25, monthPlaced: 6, recoveryYears: 27.5 });
  const b = firstYearDepreciation({ purchasePrice: 400000, landPct: 25, monthPlaced: 6, recoveryYears: 39 });
  assert.ok(b.total < a.total);
});

test("worked example: non-passive path uses the whole cost-seg loss", () => {
  const r = strTaxOutcome(EXAMPLE);
  assert.equal(r.path, "nonpassive");
  close(r.base.paperLoss, 3818.18);
  close(r.seg.paperLoss, 120363.64);
  close(r.actual.seg.allowed, 120363.64);
  close(r.actual.seg.savings, 38516.36);
  close(r.extraSavings, 37294.55);
  close(r.netCostSegBenefit, 31294.55);
  assert.equal(r.actual.seg.suspended, 0);
});

test("same facts without material participation: passive, no $25,000 allowance for a non-rental activity", () => {
  const r = strTaxOutcome({ ...EXAMPLE, myHours: 60, topOtherHours: 200, magi: 90000 });
  assert.equal(r.path, "passive");
  assert.equal(r.seg.passive.eligibleForAllowance, false);
  assert.equal(r.actual.seg.allowed, 0);
  close(r.actual.seg.suspended, 120363.64);
});

test("longer average stay with active participation gets the phased allowance", () => {
  const r = strTaxOutcome({ ...EXAMPLE, rentalDays: 300, stays: 20, myHours: 600, magi: 120000 });
  assert.equal(r.status.isRentalActivity, true);
  assert.equal(r.path, "passive");
  assert.equal(r.actual.seg.allowed, 15000);
  close(r.actual.seg.suspended, 105363.64);
  assert.equal(r.actual.seg.savings, 15000 * 0.32);
});

test("other passive income is absorbed before the allowance", () => {
  const r = strTaxOutcome({ ...EXAMPLE, rentalDays: 300, stays: 20, myHours: 600, magi: 200000, otherPassiveIncome: 10000 });
  assert.equal(r.actual.seg.allowed, 10000);
});

test("excess business loss caps the non-passive loss and charges the excess to this rental", () => {
  const r = strTaxOutcome({ ...EXAMPLE, purchasePrice: 2000000, reclassPct: 30 });
  assert.equal(r.path, "nonpassive");
  assert.equal(r.seg.threshold, 256000);
  assert.ok(r.seg.eblExcess > 0);
  close(r.actual.seg.allowed, 256000);
  const mfj = strTaxOutcome({ ...EXAMPLE, purchasePrice: 2000000, reclassPct: 30, filingStatus: "mfj" });
  close(mfj.actual.seg.allowed, 512000 < mfj.seg.paperLoss ? 512000 : mfj.seg.paperLoss);
});

test("other business income raises room under the excess business loss limit", () => {
  const r = strTaxOutcome({ ...EXAMPLE, purchasePrice: 2000000, reclassPct: 30, otherBusinessIncome: 100000 });
  close(r.actual.seg.allowed, r.seg.paperLoss <= 356000 ? r.seg.paperLoss : 356000);
});

test("at-risk cap limits the loss on either path", () => {
  const r = strTaxOutcome({ ...EXAMPLE, atRisk: 50000 });
  assert.equal(r.actual.seg.allowed, 50000);
  close(r.seg.atRiskDisallowed, 70363.64);
  assert.ok(r.findings.some((f) => /At-risk/.test(f.title)));
});

test("a residence under Section 280A and a sub-15-day rental allow no loss", () => {
  const home = strTaxOutcome({ ...EXAMPLE, personalDays: 60 });
  assert.equal(home.usedAsHome, true);
  assert.equal(home.actual.seg.allowed, 0);
  const few = strTaxOutcome({ ...EXAMPLE, rentalDays: 10, stays: 5, personalDays: 0 });
  assert.equal(few.tooFewDays, true);
  assert.equal(few.actual.seg.allowed, 0);
});

test("state rate is added to the federal rate for tax savings", () => {
  const r = strTaxOutcome({ ...EXAMPLE, stateRatePct: 5 });
  close(r.actual.seg.savings, 120363.64 * 0.37);
});

test("findings always carry the bonus-date, state and log warnings", () => {
  const r = strTaxOutcome(EXAMPLE);
  const titles = r.findings.map((f) => f.title).join("|");
  assert.match(titles, /January 19, 2025/);
  assert.match(titles, /State tax/);
  assert.match(titles, /time log/);
  assert.match(titles, /recaptured/);
});

test("empty input does not throw or produce NaN", () => {
  const r = strTaxOutcome({});
  assert.ok(Number.isFinite(r.seg.dep.total));
  assert.equal(r.path, "passive");
});

test("money formats negatives and rounds", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-5), "-$5.00");
});
