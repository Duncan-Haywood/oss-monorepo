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
  computeAll,
  compareFeeScenarios,
  generatePolicyText,
  buildShareUrl,
  readShareValues,
} from "../src/calc.mjs";

test("parseInputs accepts valid numeric input", () => {
  const result = parseInputs({
    price: "75",
    bookingsPerWeek: "20",
    noShowRatePct: "8",
    noticeHours: "24",
    feePercent: "100",
    enforcementRatePct: "70",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.values, {
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
    noticeHours: 24,
    feePercent: 100,
    enforcementRatePct: 70,
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
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 3);
});

test("parseInputs rejects non-numeric input", () => {
  const result = parseInputs({
    price: "abc",
    bookingsPerWeek: "5",
    noShowRatePct: "5",
    noticeHours: "24",
    feePercent: "50",
    enforcementRatePct: "50",
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
  assert.equal(
    result.annualFeeRevenue,
    computeAnnualFeeRevenue({
      feeAmount: result.feeAmount,
      noShowsPerYear: result.noShowsPerYear,
      enforcementRatePct: values.enforcementRatePct,
    }),
  );
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
  const url = buildShareUrl({ price: "75", bookingsPerWeek: "20", noShowRatePct: "8", noticeHours: "24", feePercent: "100", enforcementRatePct: "70", businessName: "Riverside & Co", serviceName: "training session", ignored: "secret" }, "https://example.test/calculator");
  assert.equal(url, "https://example.test/calculator?price=75&bookingsPerWeek=20&noShowRatePct=8&noticeHours=24&feePercent=100&enforcementRatePct=70&businessName=Riverside+%26+Co&serviceName=training+session");
  assert.equal(url.includes("ignored"), false);
});

test("readShareValues returns only supported parameters", () => {
  assert.deepEqual(readShareValues("https://example.test/?price=75&feePercent=100&unknown=bad"), { price: "75", feePercent: "100" });
});

test("index.html's embedded JSON-LD blocks are valid JSON", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(path.join(here, "..", "index.html"), "utf8");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 2, "expected at least a SoftwareApplication and a FAQPage block");
  for (const [, json] of blocks) {
    const parsed = JSON.parse(json);
    assert.ok(parsed["@context"] === "https://schema.org");
  }
});

test("index.html contains the required disclaimer wording", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(path.join(here, "..", "index.html"), "utf8");
  assert.match(html, /No warranty\./);
  assert.match(html, /not legal, tax, or financial\s*\n?\s*advice/);
});