import test from "node:test";
import assert from "node:assert/strict";

import {
  computeProjectQuote,
  computeAudiobookQuote,
  USAGE_TERMS,
  USAGE_TERM_MULTIPLIERS,
  DEFAULT_WORDS_PER_MINUTE,
  DEFAULT_WORDS_PER_FINISHED_HOUR,
} from "./calc.mjs";

function findingIds(result) {
  return result.findings.map((f) => f.id);
}

// --- computeProjectQuote -------------------------------------------------

test("zero word count or zero rate produces a zero total and a missing-input finding", () => {
  const result = computeProjectQuote({
    wordCount: 0,
    pricingMethod: "perWord",
    rate: 0.5,
    usageTerm: "web",
  });
  assert.equal(result.total, 0);
  assert.ok(findingIds(result).includes("missing-input"));
});

test("per-word pricing multiplies word count by rate before usage scaling", () => {
  const result = computeProjectQuote({
    wordCount: 500,
    pricingMethod: "perWord",
    rate: 0.4,
    usageTerm: "internal",
  });
  // internal use = 1x multiplier, no rush, no exclusivity
  assert.equal(result.baseFee, 200); // 500 * 0.4
  assert.equal(result.total, 200);
});

test("per-finished-minute pricing uses estimated finished minutes, not raw word count", () => {
  const result = computeProjectQuote({
    wordCount: 300, // at the default 150 wpm, 2 finished minutes
    pricingMethod: "perFinishedMinute",
    rate: 100,
    usageTerm: "internal",
  });
  assert.equal(result.finishedMinutes, 2);
  assert.equal(result.baseFee, 200); // 2 * 100
});

test("a custom words-per-minute value changes the finished-minute estimate", () => {
  const slow = computeProjectQuote({
    wordCount: 300,
    wordsPerMinute: 100,
    pricingMethod: "perFinishedMinute",
    rate: 50,
    usageTerm: "internal",
  });
  const fast = computeProjectQuote({
    wordCount: 300,
    wordsPerMinute: 150,
    pricingMethod: "perFinishedMinute",
    rate: 50,
    usageTerm: "internal",
  });
  assert.equal(slow.finishedMinutes, 3);
  assert.equal(fast.finishedMinutes, 2);
  assert.ok(slow.baseFee > fast.baseFee);
});

test("an unspecified words-per-minute falls back to the documented default", () => {
  const result = computeProjectQuote({
    wordCount: DEFAULT_WORDS_PER_MINUTE,
    pricingMethod: "perFinishedMinute",
    rate: 10,
    usageTerm: "internal",
  });
  assert.equal(result.finishedMinutes, 1);
});

test("each usage term scales the fee by its own multiplier, from lowest to highest", () => {
  const totals = USAGE_TERMS.map(
    (usageTerm) =>
      computeProjectQuote({ wordCount: 1000, pricingMethod: "perWord", rate: 1, usageTerm }).total,
  );
  for (let i = 1; i < totals.length; i++) {
    assert.ok(totals[i] > totals[i - 1], `${USAGE_TERMS[i]} should price above ${USAGE_TERMS[i - 1]}`);
  }
  // Sanity check against the multiplier table directly.
  assert.equal(
    computeProjectQuote({ wordCount: 1000, pricingMethod: "perWord", rate: 1, usageTerm: "buyout" }).total,
    1000 * USAGE_TERM_MULTIPLIERS.buyout,
  );
});

test("an unrecognized usage term falls back to web", () => {
  const unknown = computeProjectQuote({
    wordCount: 1000,
    pricingMethod: "perWord",
    rate: 1,
    usageTerm: "not-a-real-term",
  });
  const web = computeProjectQuote({
    wordCount: 1000,
    pricingMethod: "perWord",
    rate: 1,
    usageTerm: "web",
  });
  assert.equal(unknown.total, web.total);
});

test("rush adds the documented 50% surcharge on top of the usage-adjusted fee", () => {
  const normal = computeProjectQuote({
    wordCount: 1000,
    pricingMethod: "perWord",
    rate: 1,
    usageTerm: "internal",
  });
  const rushed = computeProjectQuote({
    wordCount: 1000,
    pricingMethod: "perWord",
    rate: 1,
    usageTerm: "internal",
    rush: true,
  });
  assert.equal(rushed.total, round2(normal.total * 1.5));
});

test("exclusivity adds the documented 25% add-on on top of the usage-adjusted fee", () => {
  const normal = computeProjectQuote({
    wordCount: 1000,
    pricingMethod: "perWord",
    rate: 1,
    usageTerm: "internal",
  });
  const exclusive = computeProjectQuote({
    wordCount: 1000,
    pricingMethod: "perWord",
    rate: 1,
    usageTerm: "internal",
    exclusive: true,
  });
  assert.equal(exclusive.total, round2(normal.total * 1.25));
});

test("rush and exclusivity compound rather than replace each other", () => {
  const both = computeProjectQuote({
    wordCount: 1000,
    pricingMethod: "perWord",
    rate: 1,
    usageTerm: "internal",
    rush: true,
    exclusive: true,
  });
  assert.equal(both.total, round2(1000 * 1.5 * 1.25));
});

test("extra revision rounds add a flat fee per round on top of the license fee", () => {
  const result = computeProjectQuote({
    wordCount: 1000,
    pricingMethod: "perWord",
    rate: 1,
    usageTerm: "internal",
    extraRevisions: 2,
    extraRevisionFee: 25,
  });
  assert.equal(result.revisionFee, 50);
  assert.equal(result.total, result.licenseFee + 50);
});

test("a fractional or negative revision count is sanitized to a non-negative whole number", () => {
  const result = computeProjectQuote({
    wordCount: 1000,
    pricingMethod: "perWord",
    rate: 1,
    usageTerm: "internal",
    extraRevisions: -3,
    extraRevisionFee: 25,
  });
  assert.equal(result.revisionRounds, 0);
  assert.equal(result.revisionFee, 0);
});

test("a very short per-finished-minute script is flagged for a minimum project fee", () => {
  const result = computeProjectQuote({
    wordCount: 20, // well under a quarter finished minute at 150 wpm
    pricingMethod: "perFinishedMinute",
    rate: 100,
    usageTerm: "internal",
  });
  assert.ok(findingIds(result).includes("very-short-script"));
});

test("a very small per-word count is flagged for a minimum project fee", () => {
  const result = computeProjectQuote({
    wordCount: 10,
    pricingMethod: "perWord",
    rate: 1,
    usageTerm: "internal",
  });
  assert.ok(findingIds(result).includes("very-short-word-count"));
});

test("negative or non-numeric input does not throw and yields a zero total", () => {
  assert.doesNotThrow(() =>
    computeProjectQuote({ wordCount: -50, pricingMethod: "perWord", rate: 1, usageTerm: "web" }),
  );
  assert.doesNotThrow(() =>
    computeProjectQuote({ wordCount: NaN, pricingMethod: "perWord", rate: 1, usageTerm: "web" }),
  );
  const result = computeProjectQuote({
    wordCount: -50,
    pricingMethod: "perWord",
    rate: 1,
    usageTerm: "web",
  });
  assert.equal(result.total, 0);
});

// --- computeAudiobookQuote -------------------------------------------------

test("zero word count or zero rate produces a zero total and a missing-input finding", () => {
  const result = computeAudiobookQuote({ wordCount: 0, ratePerFinishedHour: 300 });
  assert.equal(result.total, 0);
  assert.ok(findingIds(result).includes("missing-input"));
});

test("finished hours are estimated from word count using the documented default conversion", () => {
  const result = computeAudiobookQuote({
    wordCount: DEFAULT_WORDS_PER_FINISHED_HOUR * 10,
    ratePerFinishedHour: 250,
  });
  assert.equal(result.finishedHours, 10);
  assert.equal(result.narrationFee, 2500);
  assert.equal(result.total, 2500);
});

test("a custom words-per-finished-hour value changes the estimate", () => {
  const result = computeAudiobookQuote({
    wordCount: 10000,
    wordsPerFinishedHour: 10000,
    ratePerFinishedHour: 300,
  });
  assert.equal(result.finishedHours, 1);
  assert.equal(result.narrationFee, 300);
});

test("editing/proofing/mastering is billed separately from narration and added to the total", () => {
  const result = computeAudiobookQuote({
    wordCount: DEFAULT_WORDS_PER_FINISHED_HOUR * 5,
    ratePerFinishedHour: 250,
    epmRatePerFinishedHour: 30,
  });
  assert.equal(result.finishedHours, 5);
  assert.equal(result.narrationFee, 1250);
  assert.equal(result.epmFee, 150);
  assert.equal(result.total, 1400);
});

test("effective per-word rate is total divided by manuscript word count", () => {
  const result = computeAudiobookQuote({
    wordCount: 10000,
    wordsPerFinishedHour: 10000,
    ratePerFinishedHour: 300,
  });
  assert.equal(result.effectivePerWord, 0.03); // 300 / 10000
});

test("a short audiobook under one estimated finished hour is flagged", () => {
  const result = computeAudiobookQuote({
    wordCount: 1000,
    wordsPerFinishedHour: DEFAULT_WORDS_PER_FINISHED_HOUR,
    ratePerFinishedHour: 300,
  });
  assert.ok(result.finishedHours < 1);
  assert.ok(findingIds(result).includes("short-audiobook"));
});

test("a long audiobook over 20 estimated finished hours suggests milestone payments", () => {
  const result = computeAudiobookQuote({
    wordCount: DEFAULT_WORDS_PER_FINISHED_HOUR * 25,
    ratePerFinishedHour: 300,
  });
  assert.ok(findingIds(result).includes("large-audiobook"));
});

test("a mid-length audiobook is flagged neither short nor long", () => {
  const result = computeAudiobookQuote({
    wordCount: DEFAULT_WORDS_PER_FINISHED_HOUR * 8,
    ratePerFinishedHour: 300,
  });
  assert.ok(!findingIds(result).includes("short-audiobook"));
  assert.ok(!findingIds(result).includes("large-audiobook"));
});

test("negative or non-numeric audiobook input does not throw and yields a zero total", () => {
  assert.doesNotThrow(() => computeAudiobookQuote({ wordCount: -50, ratePerFinishedHour: 300 }));
  assert.doesNotThrow(() => computeAudiobookQuote({ wordCount: NaN, ratePerFinishedHour: 300 }));
  const result = computeAudiobookQuote({ wordCount: -50, ratePerFinishedHour: 300 });
  assert.equal(result.total, 0);
});

function round2(n) {
  return Math.round(n * 100) / 100;
}
