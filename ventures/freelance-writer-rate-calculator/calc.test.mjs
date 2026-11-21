import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  writerRateOutcome,
  money,
  perWordMoney,
  LOW_RATE_FLOOR,
  GHOSTWRITING_PREMIUM_LOW,
  GHOSTWRITING_PREMIUM_HIGH,
} from "./calc.mjs";

test("a flat fee that covers heavy non-writing time beats an equivalent per-word rate", () => {
  const r = writerRateOutcome({
    wordCount: 1500,
    perWordRate: 0.20,
    flatFee: 500,
    writingWordsPerHour: 500,
    researchHours: 4,
    revisionRounds: 2,
    hoursPerRevision: 1,
  });
  // writing: 1500/500 = 3h; non-writing: 4 + 2*1 = 6h; total 9h
  assert.equal(r.writingHours, 3);
  assert.equal(r.nonWritingHours, 6);
  assert.equal(r.totalHours, 9);
  assert.equal(r.perWordTotal, 300);
  assert.ok(Math.abs(r.perWordHourly - 300 / 9) < 1e-9);
  assert.ok(Math.abs(r.flatFeeHourly - 500 / 9) < 1e-9);
  assert.equal(r.betterOption, "flat-fee");
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /flat project fee pays/);
});

test("a high per-word rate on a fast, low-revision job beats a low flat fee", () => {
  const r = writerRateOutcome({
    wordCount: 2000,
    perWordRate: 0.50,
    flatFee: 300,
    writingWordsPerHour: 1000,
    researchHours: 0,
    revisionRounds: 0,
    hoursPerRevision: 0,
  });
  // writing: 2000/1000 = 2h; total 2h; perWordTotal 1000 -> 500/hr; flat 300/2=150/hr
  assert.equal(r.totalHours, 2);
  assert.equal(r.perWordHourly, 500);
  assert.equal(r.flatFeeHourly, 150);
  assert.equal(r.betterOption, "per-word");
});

test("equal effective hourly rates report a tie and no comparison finding", () => {
  const r = writerRateOutcome({
    wordCount: 1000,
    perWordRate: 0.20,
    flatFee: 200,
    writingWordsPerHour: 500,
    researchHours: 0,
    revisionRounds: 0,
    hoursPerRevision: 0,
  });
  // writing 2h, perWordTotal 200 -> 100/hr; flat 200/2=100/hr
  assert.equal(r.betterOption, "tie");
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.doesNotMatch(titles, /pays .* more/);
});

test("a rate below the 2026 entry-level floor is flagged", () => {
  const r = writerRateOutcome({
    wordCount: 1000,
    perWordRate: 0.05,
    flatFee: 50,
    writingWordsPerHour: 500,
  });
  assert.ok(r.perWordRate < LOW_RATE_FLOOR);
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /entry-level range/);
});

test("a rate at or above the floor is never flagged as low", () => {
  const r = writerRateOutcome({
    wordCount: 1000,
    perWordRate: LOW_RATE_FLOOR,
    flatFee: 200,
    writingWordsPerHour: 500,
  });
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.doesNotMatch(titles, /entry-level range/);
});

test("heavy non-writing time (>= 25% of total hours) is flagged", () => {
  const r = writerRateOutcome({
    wordCount: 500,
    perWordRate: 0.30,
    flatFee: 300,
    writingWordsPerHour: 500, // 1h writing
    researchHours: 1, // 1h research -> 2h total, 50% non-writing
    revisionRounds: 0,
    hoursPerRevision: 0,
  });
  assert.ok(r.nonWritingShare >= 0.25);
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /research and revisions, not writing/);
});

test("light non-writing time is not flagged", () => {
  const r = writerRateOutcome({
    wordCount: 2000,
    perWordRate: 0.30,
    flatFee: 600,
    writingWordsPerHour: 500, // 4h writing
    researchHours: 0.25,
    revisionRounds: 0,
    hoursPerRevision: 0,
  });
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.doesNotMatch(titles, /research and revisions, not writing/);
});

test("ghostwriting premium note appears only when the checkbox is set", () => {
  const base = {
    wordCount: 1000, perWordRate: 0.30, flatFee: 300, writingWordsPerHour: 500,
  };
  const without = writerRateOutcome(base);
  const withGhost = writerRateOutcome({ ...base, isGhostwritten: true });
  assert.doesNotMatch(without.findings.map((f) => f.title).join(" | "), /Ghostwritten/);
  assert.match(withGhost.findings.map((f) => f.title).join(" | "), /Ghostwritten/);
  assert.ok(GHOSTWRITING_PREMIUM_LOW < GHOSTWRITING_PREMIUM_HIGH);
});

test("a target hourly rate solves for the required per-word rate and flat fee", () => {
  const r = writerRateOutcome({
    wordCount: 1000,
    perWordRate: 0.10,
    flatFee: 100,
    writingWordsPerHour: 500, // 2h writing, no research/revision -> 2h total
    targetHourlyRate: 75,
  });
  assert.equal(r.totalHours, 2);
  assert.equal(r.requiredFlatFee, 150);
  assert.equal(r.requiredPerWordRate, 0.15);
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /To hit \$75\/hr/);
});

test("no target hourly rate produces no solver finding", () => {
  const r = writerRateOutcome({
    wordCount: 1000, perWordRate: 0.10, flatFee: 100, writingWordsPerHour: 500,
  });
  assert.doesNotMatch(r.findings.map((f) => f.title).join(" | "), /To hit/);
});

test("zero words and zero writing speed never divide by zero", () => {
  const r = writerRateOutcome({ wordCount: 0, perWordRate: 0.3, flatFee: 100, writingWordsPerHour: 0 });
  assert.equal(r.totalHours, 0);
  assert.equal(r.perWordHourly, 0);
  assert.equal(r.flatFeeHourly, 0);
  assert.equal(r.betterOption, "tie");
  assert.match(r.findings[0].title, /Enter a word count/);
});

test("negative or missing inputs are treated as zero, never negative", () => {
  const r = writerRateOutcome({
    wordCount: -500, perWordRate: -0.2, flatFee: -100, writingWordsPerHour: -10,
    researchHours: -3, revisionRounds: -2, hoursPerRevision: -1, targetHourlyRate: -50,
  });
  assert.equal(r.wordCount, 0);
  assert.equal(r.perWordRate, 0);
  assert.equal(r.flatFee, 0);
  assert.equal(r.writingWordsPerHour, 0);
  assert.equal(r.researchHours, 0);
  assert.equal(r.revisionRounds, 0);
  assert.equal(r.hoursPerRevision, 0);
  assert.equal(r.targetHourlyRate, 0);
  assert.equal(r.totalHours, 0);
});

test("money() formats negative values with a leading minus, no double sign, and cents when present", () => {
  assert.equal(money(1234), "$1,234");
  assert.equal(money(-1234), "-$1,234");
  assert.equal(money(0), "$0");
  assert.equal(money(0.15), "$0.15");
});

test("the non-writing-time finding does not recommend a flat fee when the per-word rate already wins (quality audit 2026-11-13)", () => {
  const r = writerRateOutcome({
    wordCount: 1500, writingWordsPerHour: 500, researchHours: 4,
    revisionRounds: 2, hoursPerRevision: 1, perWordRate: 0.5, flatFee: 400,
  });
  assert.equal(r.betterOption, "per-word");
  assert.ok(!r.findings.some((f) => /research and revisions/.test(f.title)));
});

// Quality re-audit 2026-11-21 (portfolio/quality/audits/2026-11-21-freelance-writer-rate-calculator.json):
// tests for the defects that were still open.

test("words with a blank writing speed give no hourly figures or verdict", () => {
  const r = writerRateOutcome({ wordCount: 1500, perWordRate: 0.2, flatFee: 500, writingWordsPerHour: "", researchHours: 4, revisionRounds: 2, hoursPerRevision: 1 });
  assert.equal(r.speedMissing, true);
  assert.equal(r.totalHours, 0);
  assert.equal(r.perWordHourly, 0);
  assert.equal(r.betterOption, "tie");
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0].title, /writing speed/);
});

test("a non-writing share of exactly 25% triggers the research-time note", () => {
  // 1,000 words at 1,000 wph = 1 h writing; 1/3 h research => 25% of 4/3 h.
  const r = writerRateOutcome({ wordCount: 1000, perWordRate: 0.1, flatFee: 150, writingWordsPerHour: 1000, researchHours: 1 / 3 });
  assert.ok(Math.abs(r.nonWritingShare - 0.25) < 1e-12);
  assert.match(r.findings.map((f) => f.title).join(" | "), /research and revisions/);
});

test("a 49-cent-per-hour gap is a real difference, not a tie", () => {
  const r = writerRateOutcome({ wordCount: 1000, perWordRate: 0.1, flatFee: 100.49, writingWordsPerHour: 1000 });
  assert.equal(r.betterOption, "flat-fee");
  const tie = writerRateOutcome({ wordCount: 1000, perWordRate: 0.1, flatFee: 100.004, writingWordsPerHour: 1000 });
  assert.equal(tie.betterOption, "tie");
});

test("solved per-word rates keep sub-cent precision", () => {
  assert.equal(perWordMoney(0.0125), "$0.0125");
  assert.equal(perWordMoney(0.1), "$0.10");
  assert.equal(perWordMoney(0.45), "$0.45");
  const r = writerRateOutcome({ wordCount: 2000, perWordRate: 0.01, flatFee: 20, writingWordsPerHour: 1000, targetHourlyRate: 12.5 });
  assert.match(r.findings.map((f) => f.detail).join(" "), /\$0\.0125\/word/);
});

test("hourly after US self-employment tax matches IRS Schedule SE (15.3% on 92.35%)", () => {
  const r = writerRateOutcome({ wordCount: 1500, perWordRate: 0.2, flatFee: 500, writingWordsPerHour: 500, researchHours: 4, revisionRounds: 2, hoursPerRevision: 1 });
  // By hand: 500 / 9 = 55.556; x (1 - 0.153 x 0.9235) = 47.71.
  assert.equal(r.flatFeeHourlyAfterSeTax.toFixed(2), "47.71");
  assert.equal(r.perWordHourlyAfterSeTax.toFixed(2), "28.62");
});

test("for one job the verdict always matches the larger total, and the page says so", () => {
  for (const words of [500, 1500, 3000]) for (const rate of [0.05, 0.2, 0.5]) for (const fee of [100, 400, 900]) for (const research of [0, 4, 20]) {
    const r = writerRateOutcome({ wordCount: words, perWordRate: rate, flatFee: fee, writingWordsPerHour: 500, researchHours: research });
    const bigger = words * rate > fee ? "per-word" : words * rate < fee ? "flat-fee" : "tie";
    assert.equal(r.betterOption, bigger);
  }
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /not just which headline number looks bigger/);
  assert.doesNotMatch(html, /flat fee usually pays a higher effective hourly rate/);
});
