import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeTranscriptInvoice,
  computeAgencyOfferCheck,
  formatInvoiceSummary,
  TURNAROUND_TIERS,
  INVOICE_DISCLAIMER,
} from "./calculator.mjs";

// --- computeTranscriptInvoice -----------------------------------------------

test("ordinary transcript: pages * rate * 1x multiplier", () => {
  const r = computeTranscriptInvoice({
    pages: 100, pageRate: 4.5, turnaroundMultiplier: 1,
    copies: 0, copyRatePerPage: 0, exhibitsCount: 0, exhibitRate: 0,
    roughDraftFee: 0, realtimeRequested: false, realtimeRatePerPage: 0,
    appearanceFee: 0, travelMiles: 0, mileageRate: 0, hoursWorked: 0,
  });
  assert.equal(r.transcriptFee, 450);
  assert.equal(r.totalInvoice, 450);
});

test("daily turnaround applies the 2x multiplier to the transcript fee only", () => {
  const daily = TURNAROUND_TIERS.find((t) => t.id === "daily");
  assert.equal(daily.multiplier, 2);
  const r = computeTranscriptInvoice({
    pages: 100, pageRate: 4.5, turnaroundMultiplier: daily.multiplier,
    copies: 0, copyRatePerPage: 0, exhibitsCount: 0, exhibitRate: 0,
    roughDraftFee: 0, realtimeRequested: false, realtimeRatePerPage: 0,
    appearanceFee: 75, travelMiles: 0, mileageRate: 0, hoursWorked: 0,
  });
  assert.equal(r.transcriptFee, 900);
  assert.equal(r.totalInvoice, 975);
});

test("every line item sums into the total: appearance, travel, copies, exhibits, rough draft, realtime", () => {
  const r = computeTranscriptInvoice({
    pages: 50, pageRate: 4, turnaroundMultiplier: 1,
    copies: 2, copyRatePerPage: 0.5, exhibitsCount: 3, exhibitRate: 10,
    roughDraftFee: 40, realtimeRequested: true, realtimeRatePerPage: 1,
    appearanceFee: 100, travelMiles: 40, mileageRate: 0.67, hoursWorked: 5,
  });
  assert.equal(r.transcriptFee, 200); // 50 * 4 * 1
  assert.equal(r.copiesFee, 50); // 2 * 0.5 * 50
  assert.equal(r.exhibitsFee, 30); // 3 * 10
  assert.equal(r.roughDraftFee, 40);
  assert.equal(r.realtimeFee, 50); // 50 * 1
  assert.equal(r.travelFee, 26.8); // 40 * 0.67
  assert.equal(r.appearanceFee, 100);
  const expectedTotal = 200 + 50 + 30 + 40 + 50 + 26.8 + 100;
  assert.equal(r.totalInvoice, Math.round(expectedTotal * 100) / 100);
  assert.equal(r.effectiveHourlyRate, Math.round((r.totalInvoice / 5) * 100) / 100);
});

test("realtime fee is zero when realtime was not requested, even with a rate entered", () => {
  const r = computeTranscriptInvoice({
    pages: 50, pageRate: 4, turnaroundMultiplier: 1,
    copies: 0, copyRatePerPage: 0, exhibitsCount: 0, exhibitRate: 0,
    roughDraftFee: 0, realtimeRequested: false, realtimeRatePerPage: 1,
    appearanceFee: 0, travelMiles: 0, mileageRate: 0, hoursWorked: 0,
  });
  assert.equal(r.realtimeFee, 0);
});

test("no hours entered leaves effectiveHourlyRate null rather than Infinity or NaN", () => {
  const r = computeTranscriptInvoice({
    pages: 10, pageRate: 4, turnaroundMultiplier: 1,
    copies: 0, copyRatePerPage: 0, exhibitsCount: 0, exhibitRate: 0,
    roughDraftFee: 0, realtimeRequested: false, realtimeRatePerPage: 0,
    appearanceFee: 0, travelMiles: 0, mileageRate: 0, hoursWorked: 0,
  });
  assert.equal(r.effectiveHourlyRate, null);
});

test("negative and non-finite inputs are treated as zero, not subtracted or NaN'd", () => {
  const r = computeTranscriptInvoice({
    pages: -5, pageRate: NaN, turnaroundMultiplier: -1,
    copies: undefined, copyRatePerPage: null, exhibitsCount: -1, exhibitRate: Infinity,
    roughDraftFee: -10, realtimeRequested: true, realtimeRatePerPage: -1,
    appearanceFee: -50, travelMiles: -1, mileageRate: -1, hoursWorked: -1,
  });
  assert.equal(Number.isNaN(r.totalInvoice), false);
  assert.equal(r.totalInvoice, 0);
  assert.equal(r.transcriptFee, 0);
  assert.equal(r.effectiveHourlyRate, null);
});

test("missing page rate on a job with pages flags a finding, not a silent zero", () => {
  const r = computeTranscriptInvoice({
    pages: 100, pageRate: 0, turnaroundMultiplier: 1,
    copies: 0, copyRatePerPage: 0, exhibitsCount: 0, exhibitRate: 0,
    roughDraftFee: 0, realtimeRequested: false, realtimeRatePerPage: 0,
    appearanceFee: 0, travelMiles: 0, mileageRate: 0, hoursWorked: 0,
  });
  assert.ok(r.findings.some((f) => f.id === "missing-page-rate"));
});

test("realtime requested without a rate is flagged", () => {
  const r = computeTranscriptInvoice({
    pages: 10, pageRate: 4, turnaroundMultiplier: 1,
    copies: 0, copyRatePerPage: 0, exhibitsCount: 0, exhibitRate: 0,
    roughDraftFee: 0, realtimeRequested: true, realtimeRatePerPage: 0,
    appearanceFee: 0, travelMiles: 0, mileageRate: 0, hoursWorked: 0,
  });
  assert.ok(r.findings.some((f) => f.id === "realtime-without-rate"));
});

test("travel miles without a mileage rate is flagged", () => {
  const r = computeTranscriptInvoice({
    pages: 10, pageRate: 4, turnaroundMultiplier: 1,
    copies: 0, copyRatePerPage: 0, exhibitsCount: 0, exhibitRate: 0,
    roughDraftFee: 0, realtimeRequested: false, realtimeRatePerPage: 0,
    appearanceFee: 0, travelMiles: 40, mileageRate: 0, hoursWorked: 0,
  });
  assert.ok(r.findings.some((f) => f.id === "travel-without-rate"));
});

test("the jurisdiction/rate-scope note is always present", () => {
  const r = computeTranscriptInvoice({
    pages: 0, pageRate: 0, turnaroundMultiplier: 1,
    copies: 0, copyRatePerPage: 0, exhibitsCount: 0, exhibitRate: 0,
    roughDraftFee: 0, realtimeRequested: false, realtimeRatePerPage: 0,
    appearanceFee: 0, travelMiles: 0, mileageRate: 0, hoursWorked: 0,
  });
  assert.ok(r.findings.some((f) => f.id === "jurisdiction-note"));
});

// --- TURNAROUND_TIERS --------------------------------------------------------

test("turnaround tiers are ordered fastest-premium last and each has a positive multiplier", () => {
  assert.equal(TURNAROUND_TIERS.length, 4);
  assert.equal(TURNAROUND_TIERS[0].id, "ordinary");
  assert.equal(TURNAROUND_TIERS[0].multiplier, 1);
  assert.equal(TURNAROUND_TIERS.at(-1).id, "sameday");
  for (const tier of TURNAROUND_TIERS) {
    assert.ok(tier.multiplier > 0, `${tier.id} must have a positive multiplier`);
    assert.ok(tier.label.length > 0);
  }
});

// --- computeAgencyOfferCheck -------------------------------------------------

test("agency total pay is pages * rate + flat appearance fee", () => {
  const r = computeAgencyOfferCheck({
    pages: 80, agencyPageRate: 3, agencyAppearanceFee: 50, hoursWorked: 0, targetHourlyRate: 0,
  });
  assert.equal(r.agencyTotalPay, 290); // 80*3 + 50
});

test("an offer below the target hourly rate is flagged high severity with the shortfall named", () => {
  const r = computeAgencyOfferCheck({
    pages: 40, agencyPageRate: 2, agencyAppearanceFee: 0, hoursWorked: 4, targetHourlyRate: 50,
  });
  // 40 * 2 = 80 / 4 hours = $20/hr, well under $50 target
  assert.equal(r.agencyTotalPay, 80);
  assert.equal(r.effectiveHourlyRate, 20);
  assert.equal(r.meetsTarget, false);
  assert.equal(r.hourlyShortfall, 30);
  assert.ok(r.findings.some((f) => f.id === "below-target" && f.severity === "high"));
});

test("an offer meeting or exceeding the target hourly rate is flagged as meeting it", () => {
  const r = computeAgencyOfferCheck({
    pages: 100, agencyPageRate: 3, agencyAppearanceFee: 100, hoursWorked: 4, targetHourlyRate: 50,
  });
  // 100*3 + 100 = 400 / 4 = $100/hr
  assert.equal(r.effectiveHourlyRate, 100);
  assert.equal(r.meetsTarget, true);
  assert.ok(r.findings.some((f) => f.id === "meets-target"));
});

test("no hours entered leaves the agency effectiveHourlyRate null and meetsTarget null", () => {
  const r = computeAgencyOfferCheck({
    pages: 40, agencyPageRate: 2, agencyAppearanceFee: 0, hoursWorked: 0, targetHourlyRate: 50,
  });
  assert.equal(r.effectiveHourlyRate, null);
  assert.equal(r.meetsTarget, null);
  assert.equal(r.hourlyShortfall, null);
});

test("no target rate entered leaves meetsTarget null even with hours present", () => {
  const r = computeAgencyOfferCheck({
    pages: 40, agencyPageRate: 2, agencyAppearanceFee: 0, hoursWorked: 4, targetHourlyRate: 0,
  });
  assert.equal(r.meetsTarget, null);
  assert.equal(typeof r.effectiveHourlyRate, "number");
});

test("negative agency inputs are treated as zero, never a negative total", () => {
  const r = computeAgencyOfferCheck({
    pages: -10, agencyPageRate: -5, agencyAppearanceFee: -20, hoursWorked: -1, targetHourlyRate: -1,
  });
  assert.equal(r.agencyTotalPay, 0);
  assert.equal(r.effectiveHourlyRate, null);
});

// --- formatInvoiceSummary ----------------------------------------------------

test("the invoice summary lists only non-zero line items and always includes the total and disclaimer", () => {
  const result = computeTranscriptInvoice({
    pages: 100, pageRate: 4.5, turnaroundMultiplier: 1,
    copies: 0, copyRatePerPage: 0, exhibitsCount: 0, exhibitRate: 0,
    roughDraftFee: 0, realtimeRequested: false, realtimeRatePerPage: 0,
    appearanceFee: 75, travelMiles: 0, mileageRate: 0, hoursWorked: 0,
  });
  const text = formatInvoiceSummary(result, { pages: 100, turnaroundLabel: "Ordinary (10 business days)" });
  assert.match(text, /Appearance fee: \$75\.00/);
  assert.match(text, /Transcript fee: \$450\.00/);
  assert.doesNotMatch(text, /Certified copies/);
  assert.doesNotMatch(text, /Exhibits/);
  assert.match(text, /Total: \$525\.00/);
  assert.match(text, new RegExp(INVOICE_DISCLAIMER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("the invoice summary is built from the passed-in result, never recomputed", () => {
  const fakeResult = {
    appearanceFee: 0, travelFee: 0, transcriptFee: 10, copiesFee: 0,
    exhibitsFee: 0, roughDraftFee: 0, realtimeFee: 0, totalInvoice: 10,
  };
  const text = formatInvoiceSummary(fakeResult, { pages: 1 });
  assert.match(text, /Transcript fee: \$10\.00/);
  assert.match(text, /Total: \$10\.00/);
});
