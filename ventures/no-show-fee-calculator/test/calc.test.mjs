import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseInputs,
  computeFeeAmount,
  computeAnnualExposure,
  computeAnnualFeeRevenue,
  computeRecovery,
  computeRecoveryEstimate,
  computeAll,
  compareFeeScenarios,
  compareCollectionPolicies,
  compareNoticeWindows,
  nearestNoticeHours,
  noticeWindowSummary,
  weeklyBook,
  annualOverbookOutcome,
  compareOverbooking,
  generatePolicyText,
  generateDepositPolicyText,
  buildShareUrl,
  readShareValues,
  policyDownloadFilename,
  DRAFT_FIELDS,
  DRAFT_STORAGE_KEY,
  saveDraft,
  readDraft,
  clearDraft,
} from "../src/calc.mjs";

test("parseInputs accepts valid numeric input", () => {
  const result = parseInputs({
    price: "75",
    bookingsPerWeek: "20",
    noShowRatePct: "8",
    noticeHours: "24",
    feePercent: "100",
    enforcementRatePct: "70",
    depositPercent: "50",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.values, {
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
    noticeHours: 24,
    feePercent: 100,
    enforcementRatePct: 70,
    depositPercent: 50,
    overflowCost: 75,
    fillSameDayPct: 10,
    fillDayAheadPct: 40,
    fillTwoDayPct: 65,
  });
});

test("parseInputs rejects negative price", () => {
  const result = parseInputs({
    price: "-10",
    bookingsPerWeek: "5",
    noShowRatePct: "5",
    noticeHours: "24",
    feePercent: "50",
    enforcementRatePct: "50",
    depositPercent: "50",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("price")));
});

test("parseInputs rejects out-of-range percentages", () => {
  const result = parseInputs({
    price: "10",
    bookingsPerWeek: "5",
    noShowRatePct: "150",
    noticeHours: "24",
    feePercent: "-5",
    enforcementRatePct: "200",
    depositPercent: "150",
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 4);
});

test("parseInputs defaults a missing deposit so older share links still parse", () => {
  const result = parseInputs({
    price: "75",
    bookingsPerWeek: "20",
    noShowRatePct: "8",
    noticeHours: "24",
    feePercent: "100",
    enforcementRatePct: "70",
  });
  assert.equal(result.ok, true);
  assert.equal(result.values.depositPercent, 50);
});

test("parseInputs rejects non-numeric input", () => {
  const result = parseInputs({
    price: "abc",
    bookingsPerWeek: "5",
    noShowRatePct: "5",
    noticeHours: "24",
    feePercent: "50",
    enforcementRatePct: "50",
    depositPercent: "50",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("price")));
});

test("computeFeeAmount computes a percentage of price", () => {
  assert.equal(computeFeeAmount({ price: 75, feePercent: 100 }), 75);
  assert.equal(computeFeeAmount({ price: 80, feePercent: 50 }), 40);
  assert.equal(computeFeeAmount({ price: 33.33, feePercent: 10 }), 3.33);
});

test("computeAnnualExposure scales bookings, rate, and 52 weeks", () => {
  const { noShowsPerYear, annualLostRevenue } = computeAnnualExposure({
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
  });
  // 20 * 0.08 * 52 = 83.2
  assert.equal(noShowsPerYear, 83.2);
  assert.equal(annualLostRevenue, 6240);
});

test("computeAnnualExposure is zero when no-show rate is zero", () => {
  const { noShowsPerYear, annualLostRevenue } = computeAnnualExposure({
    price: 100,
    bookingsPerWeek: 20,
    noShowRatePct: 0,
  });
  assert.equal(noShowsPerYear, 0);
  assert.equal(annualLostRevenue, 0);
});

test("computeAnnualFeeRevenue applies the enforcement rate", () => {
  const revenue = computeAnnualFeeRevenue({
    feeAmount: 75,
    noShowsPerYear: 83.2,
    enforcementRatePct: 70,
  });
  // 75 * 83.2 * 0.7 = 4368
  assert.equal(revenue, 4368);
});

test("computeAnnualFeeRevenue is bounded by full enforcement", () => {
  const full = computeAnnualFeeRevenue({ feeAmount: 50, noShowsPerYear: 10, enforcementRatePct: 100 });
  const half = computeAnnualFeeRevenue({ feeAmount: 50, noShowsPerYear: 10, enforcementRatePct: 50 });
  assert.equal(full, 500);
  assert.equal(half, 250);
  assert.ok(half < full);
});

test("computeRecovery reports modeled recovery and whole-fee break-even count", () => {
  assert.deepEqual(computeRecovery({ feeAmount: 75, annualLostRevenue: 6240, annualFeeRevenue: 4368 }), {
    recoveryRatePct: 70,
    collectionsToBreakEven: 84,
    monthlyExposure: 520,
    monthlyFeeRevenue: 364,
    monthlyUnrecovered: 156,
  });
});

test("computeRecovery handles zero exposure and zero fee without infinity", () => {
  assert.deepEqual(computeRecovery({ feeAmount: 0, annualLostRevenue: 0, annualFeeRevenue: 0 }), {
    recoveryRatePct: 0,
    collectionsToBreakEven: 0,
    monthlyExposure: 0,
    monthlyFeeRevenue: 0,
    monthlyUnrecovered: 0,
  });
  assert.deepEqual(computeRecovery({ feeAmount: 0, annualLostRevenue: 100, annualFeeRevenue: 0 }), {
    recoveryRatePct: 0,
    collectionsToBreakEven: null,
    monthlyExposure: 8.33,
    monthlyFeeRevenue: 0,
    monthlyUnrecovered: 8.33,
  });
});

test("computeRecoveryEstimate compares modeled collections with lost value", () => {
  assert.deepEqual(computeRecoveryEstimate({ annualFeeRevenue: 4368, annualLostRevenue: 6240 }), {
    recoveredPct: 70,
    remainingAnnualExposure: 1872,
  });
  assert.deepEqual(computeRecoveryEstimate({ annualFeeRevenue: 10, annualLostRevenue: 0 }), {
    recoveredPct: 0,
    remainingAnnualExposure: 0,
  });
});

test("computeAll composes the individual calculations consistently", () => {
  const values = {
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
    noticeHours: 24,
    feePercent: 100,
    enforcementRatePct: 70,
  };
  const result = computeAll(values);
  assert.equal(result.feeAmount, computeFeeAmount(values));
  const exposure = computeAnnualExposure(values);
  assert.equal(result.noShowsPerYear, exposure.noShowsPerYear);
  assert.equal(result.annualLostRevenue, exposure.annualLostRevenue);
  assert.equal(result.recoveredPct, 70);
  assert.equal(result.remainingAnnualExposure, 1872);
  assert.equal(
    result.annualFeeRevenue,
    computeAnnualFeeRevenue({
      feeAmount: result.feeAmount,
      noShowsPerYear: result.noShowsPerYear,
      enforcementRatePct: values.enforcementRatePct,
    }),
  );
  assert.equal(result.recoveryRatePct, 70);
  assert.equal(result.collectionsToBreakEven, 84);
});

test("compareFeeScenarios shows standard levels and preserves a custom selection", () => {
  const scenarios = compareFeeScenarios({ price: 80, bookingsPerWeek: 10, noShowRatePct: 10, feePercent: 60, enforcementRatePct: 50 });
  assert.deepEqual(scenarios.map(({ feePercent }) => feePercent), [50, 60, 75, 100]);
  assert.deepEqual(scenarios.map(({ feeAmount }) => feeAmount), [40, 48, 60, 80]);
  assert.deepEqual(scenarios.map(({ annualFeeRevenue }) => annualFeeRevenue), [1040, 1248, 1560, 2080]);
});

test("compareFeeScenarios does not duplicate a standard selected level", () => {
  const scenarios = compareFeeScenarios({ price: 100, bookingsPerWeek: 1, noShowRatePct: 10, feePercent: 75, enforcementRatePct: 100 });
  assert.deepEqual(scenarios.map(({ feePercent }) => feePercent), [50, 75, 100]);
});

test("compareCollectionPolicies ranks deposit against an after-the-fact fee", () => {
  // $80 session, 10 bookings/week, 10% no-shows = 52 no-shows/year.
  // 100% fee at 50% enforcement recovers $40 per no-show / $2,080 a year.
  // 50% deposit already in hand recovers $40 per no-show / $2,080 a year.
  // Combined keeps the $40 deposit and half of the remaining $40 = $60 / $3,120.
  const comparison = compareCollectionPolicies({
    price: 80,
    bookingsPerWeek: 10,
    noShowRatePct: 10,
    feePercent: 100,
    enforcementRatePct: 50,
    depositPercent: 50,
  });
  assert.equal(comparison.depositAmount, 40);
  assert.equal(comparison.remainderAmount, 40);
  assert.equal(comparison.noShowsPerYear, 52);
  assert.deepEqual(comparison.policies.map(({ id }) => id), [
    "after-the-fact-fee",
    "require-deposit",
    "deposit-plus-remainder",
  ]);
  assert.deepEqual(comparison.policies.map(({ recoveredPerNoShow }) => recoveredPerNoShow), [40, 40, 60]);
  assert.deepEqual(comparison.policies.map(({ annualRecovered }) => annualRecovered), [2080, 2080, 3120]);
  assert.deepEqual(comparison.policies.map(({ annualStillLost }) => annualStillLost), [2080, 2080, 1040]);
  assert.equal(comparison.recommendedId, "deposit-plus-remainder");
  assert.equal(comparison.annualAdvantage, 1040);
});

test("compareCollectionPolicies prefers a certain deposit when recoveries tie", () => {
  const comparison = compareCollectionPolicies({
    price: 80,
    bookingsPerWeek: 10,
    noShowRatePct: 10,
    feePercent: 50,
    enforcementRatePct: 100,
    depositPercent: 50,
  });
  const feeAndDeposit = comparison.policies.filter((policy) => policy.id !== "deposit-plus-remainder");
  assert.deepEqual(feeAndDeposit.map(({ annualRecovered }) => annualRecovered), [2080, 2080]);
  // Combined still wins because remainder * 100% enforcement adds another $40.
  assert.equal(comparison.recommendedId, "deposit-plus-remainder");
});

test("compareCollectionPolicies prefers the deposit when it beats a weakly enforced fee", () => {
  const comparison = compareCollectionPolicies({
    price: 100,
    bookingsPerWeek: 5,
    noShowRatePct: 10,
    feePercent: 100,
    enforcementRatePct: 30,
    depositPercent: 50,
  });
  const byId = Object.fromEntries(comparison.policies.map((policy) => [policy.id, policy]));
  assert.equal(byId["after-the-fact-fee"].annualRecovered, 780);
  assert.equal(byId["require-deposit"].annualRecovered, 1300);
  assert.ok(byId["require-deposit"].annualRecovered > byId["after-the-fact-fee"].annualRecovered);
  assert.equal(comparison.recommendedId, "deposit-plus-remainder");
  assert.equal(comparison.annualAdvantage, byId["deposit-plus-remainder"].annualRecovered - byId["require-deposit"].annualRecovered);
});

test("compareCollectionPolicies treats a zero deposit as recovering nothing by itself", () => {
  const comparison = compareCollectionPolicies({
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
    feePercent: 100,
    enforcementRatePct: 70,
    depositPercent: 0,
  });
  const byId = Object.fromEntries(comparison.policies.map((policy) => [policy.id, policy]));
  assert.equal(byId["require-deposit"].annualRecovered, 0);
  assert.equal(byId["after-the-fact-fee"].annualRecovered, 4368);
  assert.equal(byId["deposit-plus-remainder"].annualRecovered, 4368);
  assert.ok(["after-the-fact-fee", "deposit-plus-remainder"].includes(comparison.recommendedId));
});

test("generateDepositPolicyText includes the deposit, remainder, and non-warranty note", () => {
  const text = generateDepositPolicyText({
    businessName: "Riverside Training",
    serviceName: "session",
    noticeHours: 24,
    depositPercent: 50,
    depositAmount: 37.5,
    remainderAmount: 37.5,
    currencySymbol: "€",
  });
  assert.match(text, /Riverside Training/);
  assert.match(text, /50% deposit \(€37\.50\)/);
  assert.match(text, /remaining €37\.50/);
  assert.match(text, /1 day/);
  assert.match(text, /not a finished legal document/);
});

test("generateDepositPolicyText falls back to placeholders when name/service are blank", () => {
  const text = generateDepositPolicyText({
    businessName: "",
    serviceName: "",
    noticeHours: 48,
    depositPercent: 25,
    depositAmount: 20,
    remainderAmount: 60,
  });
  assert.match(text, /\[Your business name\]/);
  assert.match(text, /appointment/);
  assert.match(text, /2 days/);
});

test("compareNoticeWindows recovers more empty-slot cash at a higher fill rate", () => {
  const rows = compareNoticeWindows({
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
    noticeHours: 24,
    fillSameDayPct: 10,
    fillDayAheadPct: 40,
    fillTwoDayPct: 65,
  });
  // 20 * 0.08 * 52 = 83.2 no-shows; 83.2 * 75 = 6240 of empty-slot cash.
  assert.deepEqual(rows.map(({ hours }) => hours), [4, 24, 48]);
  assert.equal(rows[0].slotsFilled, 8.32);
  assert.equal(rows[0].recoveredByRefill, 624);
  assert.equal(rows[0].leftoverLost, 5616);
  assert.equal(rows[0].extraVsSameDay, 0);
  assert.equal(rows[1].slotsFilled, 33.28);
  assert.equal(rows[1].recoveredByRefill, 2496);
  assert.equal(rows[1].leftoverLost, 3744);
  assert.equal(rows[1].extraVsSameDay, 1872);
  assert.equal(rows[1].selected, true);
  assert.equal(rows[1].nearest, true);
  assert.equal(rows[2].slotsFilled, 54.08);
  assert.equal(rows[2].recoveredByRefill, 4056);
  assert.equal(rows[2].leftoverLost, 2184);
  assert.equal(rows[2].extraVsSameDay, 3432);
  assert.equal(rows[2].selected, false);
});

test("compareNoticeWindows does not invent a waitlist when every fill rate is zero", () => {
  const rows = compareNoticeWindows({
    price: 100,
    bookingsPerWeek: 10,
    noShowRatePct: 10,
    noticeHours: 48,
    fillSameDayPct: 0,
    fillDayAheadPct: 0,
    fillTwoDayPct: 0,
  });
  assert.ok(rows.every((row) => row.recoveredByRefill === 0 && row.extraVsSameDay === 0));
  assert.equal(rows[2].selected, true);
});

test("nearestNoticeHours picks the closest standard window", () => {
  assert.equal(nearestNoticeHours(24), 24);
  assert.equal(nearestNoticeHours(4), 4);
  assert.equal(nearestNoticeHours(36), 24);
  assert.equal(nearestNoticeHours(12), 4);
});

test("noticeWindowSummary names the extra cash a 48-hour window recovers", () => {
  const rows = compareNoticeWindows({
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
    noticeHours: 24,
    fillSameDayPct: 10,
    fillDayAheadPct: 40,
    fillTwoDayPct: 65,
  });
  const text = noticeWindowSummary(rows);
  assert.match(text, /\$3432\.00 more/);
  assert.match(text, /\$1872\.00 more/);
  assert.match(text, /does not refill the chair/);
});

test("noticeWindowSummary stays honest when a longer window does not refill more", () => {
  const rows = compareNoticeWindows({
    price: 80,
    bookingsPerWeek: 5,
    noShowRatePct: 10,
    noticeHours: 24,
    fillSameDayPct: 20,
    fillDayAheadPct: 20,
    fillTwoDayPct: 20,
  });
  assert.match(noticeWindowSummary(rows), /does not recover more/);
});

test("parseInputs rejects an out-of-range waitlist fill rate", () => {
  const result = parseInputs({
    price: "75",
    bookingsPerWeek: "20",
    noShowRatePct: "8",
    noticeHours: "24",
    feePercent: "100",
    enforcementRatePct: "70",
    depositPercent: "50",
    fillTwoDayPct: "150",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("48-hour waitlist fill rate")));
});

const DEFAULT_OVERBOOK = {
  price: 75,
  bookingsPerWeek: 20,
  noShowRatePct: 8,
  feePercent: 100,
  enforcementRatePct: 70,
  overflowCost: 75,
};

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ${expected}, got ${actual}`,
  );
}

test("weeklyBook matches capacity when nobody extra is booked", () => {
  const week = weeklyBook(DEFAULT_OVERBOOK, 0);
  assert.equal(week.booked, 20);
  assertClose(week.expectedArrivals, 18.4);
  assertClose(week.served, 18.4);
  assert.equal(week.overflow, 0);
  assertClose(week.empty, 1.6);
  assertClose(week.noShows, 1.6);
});

test("weeklyBook matching expected no-shows almost fills the mean week", () => {
  const week = weeklyBook(DEFAULT_OVERBOOK, 1.6);
  assertClose(week.booked, 21.6);
  assertClose(week.expectedArrivals, 19.872);
  assertClose(week.served, 19.872);
  assert.equal(week.overflow, 0);
  assert.ok(week.empty < 0.2);
});

test("weeklyBook at 150% of expected no-shows overflows the mean", () => {
  const week = weeklyBook(DEFAULT_OVERBOOK, 2.4);
  assert.equal(week.served, 20);
  assertClose(week.overflow, 0.608);
  assert.equal(week.empty, 0);
});

test("weeklyBook rejects a negative extra book", () => {
  assert.throws(() => weeklyBook(DEFAULT_OVERBOOK, -1), /cannot be negative/);
});

test("annualOverbookOutcome composes service, fee, and overflow cost", () => {
  const feeOnly = annualOverbookOutcome(DEFAULT_OVERBOOK, { extraBookingsPerWeek: 0, collectFee: true });
  assert.equal(feeOnly.serviceRevenue, 71760);
  assert.equal(feeOnly.feeRevenue, 4368);
  assert.equal(feeOnly.overflowCostAnnual, 0);
  assert.equal(feeOnly.netKept, 76128);

  const match = annualOverbookOutcome(DEFAULT_OVERBOOK, { extraBookingsPerWeek: 1.6, collectFee: true });
  assert.equal(match.serviceRevenue, 77500.8);
  assert.equal(match.feeRevenue, 4717.44);
  assert.equal(match.netKept, 82218.24);

  const aggressive = annualOverbookOutcome(DEFAULT_OVERBOOK, { extraBookingsPerWeek: 2.4, collectFee: true });
  assert.equal(aggressive.serviceRevenue, 78000);
  assert.equal(aggressive.overflowCostAnnual, 2371.2);
  assert.equal(aggressive.netKept, 80520.96);
});

test("compareOverbooking prefers matching the no-show rate plus the fee on the defaults", () => {
  const comparison = compareOverbooking(DEFAULT_OVERBOOK);
  assert.equal(comparison.expectedNoShowsPerWeek, 1.6);
  assert.equal(comparison.winner, "overbook_1");
  assert.equal(comparison.extraVsFeeOnly, 6090.24);
  assert.equal(comparison.rows[2].withFee.netKept, 82218.24);
  assert.equal(comparison.matchNoFee.netKept, 77500.8);
  assert.ok(comparison.matchNoFee.netKept > comparison.feeOnly.netKept);
  assert.match(comparison.summary, /\$6090\.24 more/);
});

test("compareOverbooking picks the aggressive book when overflow is priced at zero", () => {
  const comparison = compareOverbooking({ ...DEFAULT_OVERBOOK, overflowCost: 0 });
  assert.equal(comparison.winner, "overbook_1_5");
  assert.ok(comparison.rows[3].withFee.netKept > comparison.rows[2].withFee.netKept);
});

test("compareOverbooking stays on the fee-only book when nobody no-shows", () => {
  const comparison = compareOverbooking({ ...DEFAULT_OVERBOOK, noShowRatePct: 0 });
  assert.equal(comparison.expectedNoShowsPerWeek, 0);
  assert.equal(comparison.winner, "fee_only");
  assert.equal(comparison.extraVsFeeOnly, 0);
  assert.equal(comparison.rows[3].extraBookingsPerWeek, 0);
  assert.match(comparison.summary, /No-show rate is 0%/);
});

test("parseInputs defaults overflow cost to the session price", () => {
  const result = parseInputs({
    price: "80",
    bookingsPerWeek: "10",
    noShowRatePct: "10",
    noticeHours: "24",
    feePercent: "50",
    enforcementRatePct: "50",
    depositPercent: "50",
  });
  assert.equal(result.ok, true);
  assert.equal(result.values.overflowCost, 80);
});

test("parseInputs accepts an explicit zero overflow cost", () => {
  const result = parseInputs({ ...VALID_RAW, overflowCost: "0" });
  assert.equal(result.ok, true);
  assert.equal(result.values.overflowCost, 0);
});

test("parseInputs rejects a negative overflow cost", () => {
  const result = parseInputs({ ...VALID_RAW, overflowCost: "-5" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("overflow")));
});

test("generatePolicyText includes the fee, notice window, and non-warranty note", () => {
  const text = generatePolicyText({
    businessName: "Riverside Training",
    serviceName: "session",
    noticeHours: 20,
    feePercent: 100,
    feeAmount: 75,
  });
  assert.match(text, /Riverside Training/);
  assert.match(text, /20 hours/);
  assert.match(text, /100% of the session price \(\$75\.00\)/);
  assert.match(text, /not a finished legal document/);
});

test("generatePolicyText supports a selected currency symbol", () => {
  const text = generatePolicyText({
    businessName: "Riverside Training",
    serviceName: "session",
    noticeHours: 24,
    feePercent: 50,
    feeAmount: 37.5,
    currencySymbol: "€",
  });
  assert.match(text, /50% of the session price \(€37\.50\)/);
});

test("generatePolicyText includes the selected collection method", () => {
  const text = generatePolicyText({
    businessName: "Riverside Training",
    serviceName: "session",
    noticeHours: 24,
    feePercent: 50,
    feeAmount: 37.5,
    collectionMethod: "invoice",
  });
  assert.match(text, /send an invoice for the cancellation or no-show fee/);
});

test("generatePolicyText uses a safe collection fallback for unknown methods", () => {
  const text = generatePolicyText({
    noticeHours: 24,
    feePercent: 100,
    feeAmount: 10,
    collectionMethod: "unsupported-value",
  });
  assert.match(text, /contact you to arrange payment/);
});

test("generatePolicyText falls back to placeholders when name/service are blank", () => {
  const text = generatePolicyText({
    businessName: "",
    serviceName: "",
    noticeHours: 48,
    feePercent: 50,
    feeAmount: 25,
  });
  assert.match(text, /\[Your business name\]/);
  assert.match(text, /appointment/);
  assert.match(text, /2 days/);
});

test("generatePolicyText always ends with the non-warranty disclaimer", () => {
  const text = generatePolicyText({ noticeHours: 24, feePercent: 100, feeAmount: 10 });
  assert.ok(text.trim().endsWith("before publishing it to clients."));
});

test("buildShareUrl encodes supported inputs without server state", () => {
  const url = buildShareUrl({ currency: "EUR", price: "75", bookingsPerWeek: "20", noShowRatePct: "8", noticeHours: "24", feePercent: "100", enforcementRatePct: "70", depositPercent: "50", businessName: "Riverside & Co", serviceName: "training session", collectionMethod: "invoice", ignored: "secret" }, "https://example.test/calculator");
  assert.equal(url, "https://example.test/calculator?currency=EUR&price=75&bookingsPerWeek=20&noShowRatePct=8&noticeHours=24&feePercent=100&enforcementRatePct=70&depositPercent=50&businessName=Riverside+%26+Co&serviceName=training+session&collectionMethod=invoice");
  assert.equal(url.includes("ignored"), false);
});

test("readShareValues returns only supported parameters", () => {
  assert.deepEqual(readShareValues("https://example.test/?price=75&feePercent=100&unknown=bad"), { price: "75", feePercent: "100" });
});

test("index.html's embedded JSON-LD blocks are valid JSON", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(path.join(here, "..", "index.html"), "utf8");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 1, "expected at least a SoftwareApplication block");
  for (const [, json] of blocks) {
    const parsed = JSON.parse(json);
    assert.ok(parsed["@context"] === "https://schema.org");
  }
});

// The FAQ schema is *derived* from the visible questions by
// `platform/pages/build.mjs`, not hand-authored here. This page used to carry
// its own FAQPage block plus a second visible copy of the same five questions
// so the two would agree; the copies drifted apart in wording and readers saw
// the FAQ twice. Asserting the visible questions exist is the invariant that
// matters — the builder turns exactly these into schema, so they cannot drift.
test("index.html carries visible question headings for the derived FAQ schema", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(path.join(here, "..", "index.html"), "utf8");
  const questions = [...html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)]
    .map(([, text]) => text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter((text) => text.endsWith("?"));
  assert.ok(questions.length >= 4, `expected visible FAQ questions, found ${questions.length}`);
  assert.equal(new Set(questions).size, questions.length, "a question is asked twice on the page");
  assert.equal(
    (html.match(/>Common questions</g) || []).length,
    1,
    "the page should carry exactly one Common questions section",
  );
});

test("index.html contains the required disclaimer wording", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(path.join(here, "..", "index.html"), "utf8");
  assert.match(html, /No warranty\./);
  assert.match(html, /not legal, tax, or financial\s*\n?\s*advice/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("index.html explains local draft persistence and provides a reset control", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(path.join(here, "..", "index.html"), "utf8");
  assert.match(html, /id="reset-draft"/);
  assert.match(html, /saved only in this browser/);
  assert.match(html, /Reset saved numbers/);
});
// --------------------------------------------------------------------------
// Missing input is not the number zero.
//
// `Number("")` is 0, and 0 passes every range check in parseInputs, so a
// cleared field used to validate as a deliberate zero: the calculator answered
// "$0.00 suggested fee" with no error shown. Now that the page recalculates as
// the visitor types, that path is reached by anyone who clears a field to
// retype it, so it is worth pinning in both directions.
// --------------------------------------------------------------------------

const VALID_RAW = {
  price: "75",
  bookingsPerWeek: "20",
  noShowRatePct: "8",
  noticeHours: "24",
  feePercent: "100",
  enforcementRatePct: "70",
  depositPercent: "50",
};

// depositPercent is optional (defaults to 50%) so older share links still
// parse. The required-field loop covers only inputs that must be typed.
const REQUIRED_RAW = { ...VALID_RAW };
delete REQUIRED_RAW.depositPercent;

for (const field of Object.keys(REQUIRED_RAW)) {
  test(`parseInputs rejects an empty ${field} rather than reading it as zero`, () => {
    const result = parseInputs({ ...VALID_RAW, [field]: "" });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.includes("required")),
      `expected a "required" error for ${field}, got ${JSON.stringify(result.errors)}`,
    );
  });

  test(`parseInputs rejects a whitespace-only ${field}`, () => {
    assert.equal(parseInputs({ ...VALID_RAW, [field]: "   " }).ok, false);
  });

  test(`parseInputs rejects a missing ${field}`, () => {
    const raw = { ...VALID_RAW };
    delete raw[field];
    assert.equal(parseInputs(raw).ok, false);
  });
}

test("parseInputs still accepts a deliberate zero", () => {
  // The distinction being drawn is absent vs. zero, so an explicit "0" has to
  // keep working -- a business with no no-shows yet is a real case.
  const result = parseInputs({ ...VALID_RAW, noShowRatePct: "0" });
  assert.equal(result.ok, true);
  assert.equal(result.values.noShowRatePct, 0);
});

// --------------------------------------------------------------------------
// Page wiring.
//
// The cut-list optimizer shipped with an unclosed <textarea> that swallowed its
// own <script> tag, so the tool never calculated anything -- and its unit tests
// stayed green the whole time because they imported calc.mjs and never looked
// at the page. These assert that this venture's markup and its script agree.
// --------------------------------------------------------------------------

function readHtml() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, "..", "index.html"), "utf8");
}

function readApp() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, "..", "src", "app.mjs"), "utf8");
}

test("index.html loads the module script after the markup it queries", () => {
  const html = readHtml();
  const scriptIndex = html.indexOf('<script type="module" src="src/app.mjs">');
  assert.ok(scriptIndex > 0, "src/app.mjs is not loaded as a module script");
  assert.ok(html.indexOf('id="calc-form"') < scriptIndex, "the form must be parsed before the script");
});

test("every id src/app.mjs looks up exists in index.html", () => {
  const html = readHtml();
  const ids = [...readApp().matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, "expected app.mjs to query some ids");
  for (const id of new Set(ids)) {
    assert.ok(
      html.includes(`id="${id}"`),
      `src/app.mjs queries #${id}, which does not exist in index.html`,
    );
  }
});

test("policy export control is wired to a local download", () => {
  const html = readHtml();
  const app = readApp();
  assert.match(html, /id="download-policy"/);
  assert.match(app, /downloadBtn\.addEventListener\("click"/);
  assert.match(app, /new Blob\(\[policyEl\.value\]/);
  assert.match(app, /policyDownloadFilename\(businessName\)/);
  assert.match(app, /recordEvent\("policy_downloaded"\)/);
});

test("policy download filenames are safe and always have a fallback", () => {
  assert.equal(policyDownloadFilename("Riverside Personal Training!"), "riverside-personal-training-policy.txt");
  assert.equal(policyDownloadFilename("   "), "cancellation-policy-policy.txt");
  assert.equal(policyDownloadFilename("日本語"), "cancellation-policy-policy.txt");
  assert.ok(policyDownloadFilename("x".repeat(100)).length <= 61);
});


test("raw-text elements in index.html are closed", () => {
  // The exact cut-list failure: <textarea> and <script> are raw-text elements,
  // so an unclosed one makes the browser swallow the rest of the document as
  // literal text and the page silently stops working.
  const html = readHtml();
  for (const tag of ["textarea", "script", "title"]) {
    const opens = (html.match(new RegExp(`<${tag}[\\s>]`, "gi")) || []).length;
    const closes = (html.match(new RegExp(`</${tag}>`, "gi")) || []).length;
    assert.equal(opens, closes, `<${tag}> opened ${opens} time(s) but closed ${closes}`);
  }
});

test("the results panel is revealed by script rather than shipped visible", () => {
  // It must start hidden so a visitor without JavaScript sees the form instead
  // of a row of $0.00 placeholders that will never fill in -- and app.mjs must
  // be the thing that unhides it, or the page opens showing nothing.
  assert.match(readHtml(), /<div id="results" hidden/);
  assert.match(readApp(), /resultsEl\.hidden = false/);
});

test("app.mjs computes on load instead of waiting for a submit", () => {
  // The whole point of this page is a specific number, so one should be on
  // screen before the visitor does anything. Checked structurally: the module's
  // epilogue -- everything after the last listener is registered, which is code
  // that runs at import time -- has to paint a result.
  const app = readApp();
  const epilogue = app.slice(app.lastIndexOf("addEventListener("));
  assert.ok(
    /\brender\(\);/.test(epilogue) || /\bcountCalculation\(\);/.test(epilogue),
    "nothing renders at import time, so the page would open with no result",
  );
});

test("the overbooking landing page quotes the same default arithmetic", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(path.join(here, "..", "should-i-overbook-or-charge-a-no-show-fee.html"), "utf8");
  const comparison = compareOverbooking(DEFAULT_OVERBOOK);
  assert.match(html, /\$76,128/);
  assert.match(html, /\$82,218\.24/);
  assert.match(html, /\$6,090\.24/);
  assert.equal(comparison.feeOnly.netKept, 76128);
  assert.equal(comparison.rows[2].withFee.netKept, 82218.24);
  assert.equal(comparison.extraVsFeeOnly, 6090.24);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 1);
  for (const [, json] of blocks) {
    assert.equal(JSON.parse(json)["@context"], "https://schema.org");
  }
});

test("index.html and app.mjs wire the notice-window comparison", () => {
  const html = readHtml();
  const app = readApp();
  assert.match(html, /id="notice-section"/);
  assert.match(html, /id="notice-body"/);
  assert.match(html, /id="notice-summary"/);
  assert.match(html, /id="fillSameDayPct"/);
  assert.match(html, /id="fillDayAheadPct"/);
  assert.match(html, /id="fillTwoDayPct"/);
  assert.match(html, /24h-vs-48h-cancellation-notice\.html/);
  assert.match(app, /compareNoticeWindows/);
  assert.match(app, /notice_windows_compared/);
});

test("index.html and app.mjs wire the overbooking table", () => {
  const html = readHtml();
  const app = readApp();
  assert.match(html, /id="overbook-section"/);
  assert.match(html, /id="overbook-body"/);
  assert.match(html, /id="overflowCost"/);
  assert.match(html, /should-i-overbook-or-charge-a-no-show-fee\.html/);
  assert.match(app, /compareOverbooking/);
  assert.match(app, /overbooking_compared/);
});

test("index.html and app.mjs wire the deposit-vs-fee comparison", () => {
  const html = readHtml();
  const app = readApp();
  assert.match(html, /id="collection-section"/);
  assert.match(html, /id="collection-body"/);
  assert.match(html, /id="depositPercent"/);
  assert.match(html, /id="deposit-policy-text"/);
  assert.match(app, /compareCollectionPolicies/);
  assert.match(app, /generateDepositPolicyText/);
  assert.match(app, /collection_policies_viewed/);
});

test("app.mjs does not count usage on every keystroke", () => {
  // A usage log that ticks per keystroke measures typing, not calculations.
  // The `input` listener must render only; counting belongs on `change`.
  const app = readApp();
  const inputListener = app.match(/addEventListener\("input",([\s\S]*?)\);/);
  assert.ok(inputListener, "expected an input listener");
  assert.ok(
    !inputListener[1].includes("recordEvent") && !inputListener[1].includes("countCalculation"),
    "the input listener must not record usage",
  );
});

// The page saved drafts before these tests existed, but the logic lived inline
// in app.mjs where no test could reach it. These cover the extracted helpers so
// a regression in draft recovery fails here rather than silently on the page.

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    setItem: (key, value) => values.set(key, String(value)),
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    removeItem: (key) => values.delete(key),
  };
}

test("draft helpers round-trip form values and store only known fields", () => {
  const storage = fakeStorage();
  const raw = Object.fromEntries(DRAFT_FIELDS.map((field, index) => [field, String(index + 1)]));
  assert.equal(saveDraft({ ...raw, ignored: "secret" }, storage), true);
  assert.deepEqual(readDraft(storage), raw);
  assert.equal(JSON.parse(storage.values.get(DRAFT_STORAGE_KEY)).ignored, undefined);
});

test("the draft field set matches the shareable field set", () => {
  // A link and a restored draft that disagree about what the user typed is the
  // bug this guards: both are derived from SHARE_FIELDS in calc.mjs.
  assert.ok(DRAFT_FIELDS.includes("currency"));
  assert.ok(DRAFT_FIELDS.includes("serviceName"));
  assert.ok(DRAFT_FIELDS.includes("collectionMethod"));
  assert.equal(new Set(DRAFT_FIELDS).size, DRAFT_FIELDS.length);
});

test("readDraft returns an empty draft for malformed or absent storage", () => {
  assert.deepEqual(readDraft(fakeStorage()), {});
  assert.deepEqual(readDraft({ getItem: () => "not json" }), {});
  assert.deepEqual(readDraft({ getItem: () => JSON.stringify([1, 2]) }), {});
  assert.deepEqual(readDraft(null), {});
});

test("readDraft drops non-string values rather than coercing them", () => {
  const draft = readDraft({ getItem: () => JSON.stringify({ price: 75, currency: "EUR" }) });
  assert.equal(draft.price, undefined);
  assert.equal(draft.currency, "EUR");
});

test("clearDraft removes the saved draft", () => {
  const storage = fakeStorage();
  saveDraft({ price: "120" }, storage);
  assert.equal(clearDraft(storage), true);
  assert.deepEqual(readDraft(storage), {});
});

test("draft helpers degrade to a no-op when storage is unavailable", () => {
  // Blocked site data must never break a calculation, so these swallow rather
  // than throw -- and report that nothing was persisted.
  const throwing = {
    setItem: () => { throw new Error("blocked"); },
    getItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.equal(saveDraft({ price: "1" }, throwing), false);
  assert.deepEqual(readDraft(throwing), {});
  assert.equal(clearDraft(throwing), false);
  assert.equal(saveDraft({ price: "1" }, null), false);
});

test("computeRecovery reports the monthly slice of the annual exposure", () => {
  const result = computeRecovery({ feeAmount: 75, annualLostRevenue: 6240, annualFeeRevenue: 4368 });
  assert.equal(result.monthlyExposure, 520);
  assert.equal(result.monthlyFeeRevenue, 364);
  assert.equal(result.monthlyUnrecovered, 156);
  // The monthly view must agree with the annual rate it sits beside.
  assert.equal(result.recoveryRatePct, 70);
});

test("the monthly view is zero across the board at zero exposure", () => {
  const result = computeRecovery({ feeAmount: 0, annualLostRevenue: 0, annualFeeRevenue: 0 });
  assert.equal(result.monthlyExposure, 0);
  assert.equal(result.monthlyFeeRevenue, 0);
  assert.equal(result.monthlyUnrecovered, 0);
});

test("computeAll surfaces the monthly view alongside the annual figures", () => {
  const result = computeAll({
    price: 120, bookingsPerWeek: 40, noShowRatePct: 5, noticeHours: 24,
    feePercent: 50, enforcementRatePct: 70,
  });
  const round2 = (n) => Math.round(n * 100) / 100;
  assert.equal(result.monthlyExposure, round2(result.annualLostRevenue / 12));
  assert.equal(result.monthlyFeeRevenue, round2(result.annualFeeRevenue / 12));
  assert.equal(
    result.monthlyUnrecovered,
    round2(result.monthlyExposure - result.monthlyFeeRevenue),
  );
});
