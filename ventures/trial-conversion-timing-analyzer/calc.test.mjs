import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, parseDate, analyze, reportCsv, sampleText, rng, fmtDate, MIN_TRIALS } from "./calc.mjs";

const D0 = parseDate("2026-01-01");

// Build trials with a known conversion-day distribution.
function build(n, dayFor, opts = {}) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const start = D0 + Math.floor(i / 2);
    const d = dayFor(i);
    rows.push({ start, paid: d === null ? null : start + d });
  }
  return rows;
}

test("parseDate accepts ISO dates and timestamps, rejects impossible ones", () => {
  assert.equal(parseDate("2026-03-14") - parseDate("2026-03-13"), 1);
  assert.equal(parseDate("2026-03-14T10:00:00Z"), parseDate("2026-03-14"));
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("03/14/2026"), null);
  assert.equal(parseDate(""), null);
});

test("parseRows reads blanks as never-paid and reports skipped rows", () => {
  const r = parseRows("trial_start,first_paid\n2026-01-01,2026-01-05\n2026-01-02,\n2026-01-03,none\nbad,row\n2026-01-09,2026-01-01");
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows.filter((x) => x.paid === null).length, 2);
  assert.equal(r.rows[0].paid - r.rows[0].start, 4);
  assert.equal(r.warnings.length, 2);
  assert.ok(parseRows("").error);
  assert.ok(parseRows("nothing,useful").error);
});

test("conversion shares match a hand count", () => {
  // 100 trials: 30 convert. Day 1 x10, day 7 x10, day 14 x10.
  const rows = build(100, (i) => (i < 10 ? 1 : i < 20 ? 7 : i < 30 ? 14 : null));
  const r = analyze(rows, { trialDays: 14, asOf: "2026-06-01", monthlyPrice: 20, paidMonths: 10 });
  assert.equal(r.n, 100);
  assert.equal(r.conversions, 30);
  assert.equal(r.rate, 0.3);
  const s7 = r.scenarios.find((x) => x.trialDays === 7);
  assert.ok(Math.abs(s7.lostShare - 10 / 30) < 1e-12); // only day 14 is after day 7
  assert.ok(Math.abs(s7.conversionsLostPer100 - 10) < 1e-9);
  assert.ok(Math.abs(s7.valueLostPer100 - 10 * 200) < 1e-6);
  const s6 = r.scenarios.find((x) => x.trialDays === 6);
  assert.ok(Math.abs(s6.lostShare - 20 / 30) < 1e-12); // day 7 and 14
  assert.equal(r.median, 7);
});

test("pull-forward assumption scales the loss down linearly", () => {
  const rows = build(100, (i) => (i < 10 ? 1 : i < 30 ? 14 : null));
  const worst = analyze(rows, { trialDays: 14, asOf: "2026-06-01" }).scenarios.find((x) => x.trialDays === 7);
  const half = analyze(rows, { trialDays: 14, asOf: "2026-06-01", pullForward: 0.5 }).scenarios.find((x) => x.trialDays === 7);
  assert.ok(Math.abs(half.conversionsLostPer100 - worst.conversionsLostPer100 / 2) < 1e-9);
  assert.ok(Math.abs(half.lostShare - worst.lostShare) < 1e-12);
});

test("trials still inside their window are left out, not counted as never-converting", () => {
  const rows = build(80, (i) => (i % 4 === 0 ? 3 : null));
  const r = analyze(rows, { trialDays: 14, asOf: fmtDate(D0 + 39 + 10) });
  assert.ok(r.open > 0);
  assert.equal(r.n + r.open, 80);
  for (const row of rows.slice(0, r.n)) assert.ok(row.start + 14 <= D0 + 49);
});

test("refuses too little data", () => {
  assert.match(analyze(build(MIN_TRIALS - 1, () => 2), { trialDays: 14, asOf: "2026-06-01" }).error, /finished trials/);
  const few = build(60, (i) => (i < 3 ? 2 : null));
  assert.match(analyze(few, { trialDays: 14, asOf: "2026-06-01" }).error, /converted/);
  assert.ok(analyze(build(60, () => 2), { trialDays: 1 }).error);
});

test("a pile-up in the last two days is flagged as a deadline effect", () => {
  const spike = analyze(build(200, (i) => (i < 40 ? 13 : i < 50 ? 14 : i < 70 ? 2 : null)), { trialDays: 14, asOf: "2026-09-01" });
  assert.equal(spike.deadline, true);
  const flat = analyze(build(200, (i) => (i < 60 ? i % 15 : null)), { trialDays: 14, asOf: "2026-09-01" });
  assert.equal(flat.deadline, false);
});

test("bootstrap range brackets the point estimate and is reproducible", () => {
  const rows = build(300, (i) => (i < 30 ? 2 : i < 60 ? 10 : i < 75 ? 14 : null));
  const a = analyze(rows, { trialDays: 14, asOf: "2026-09-01" });
  const b = analyze(rows, { trialDays: 14, asOf: "2026-09-01" });
  assert.deepEqual(a.scenarios, b.scenarios);
  for (const s of a.scenarios) {
    assert.ok(s.lostRange80[0] <= s.lostShare + 1e-9 && s.lostShare <= s.lostRange80[1] + 1e-9, `T=${s.trialDays}`);
  }
});

test("bootstrap 80% range covers the truth at about the nominal rate", () => {
  // Truth: 40% of conversions come after day 7.
  let covered = 0;
  const trials = 60;
  const r = rng(99);
  for (let k = 0; k < trials; k++) {
    const rows = build(200, () => (r() < 0.25 ? (r() < 0.4 ? 10 : 3) : null));
    const a = analyze(rows, { trialDays: 14, asOf: "2026-09-01" });
    const s = a.scenarios.find((x) => x.trialDays === 7);
    if (s.lostRange80[0] <= 0.4 && 0.4 <= s.lostRange80[1]) covered++;
  }
  assert.ok(covered / trials > 0.65, `coverage ${covered}/${trials}`);
});

test("hold-out flags a shift in timing between early and late trials", () => {
  // Early trials convert early; later trials convert late.
  const rows = [];
  for (let i = 0; i < 200; i++) {
    const start = D0 + i;
    const late = i >= 150;
    rows.push({ start, paid: i % 4 === 0 ? start + (late ? 12 : 2) : null });
  }
  const r = analyze(rows, { trialDays: 14, asOf: "2026-12-31" });
  assert.equal(r.verdict, "unstable");
  assert.ok(r.holdout.gap > 0.15);
});

test("stable timing is judged usable", () => {
  const r = analyze(build(400, (i) => (i % 5 === 0 ? (i % 10 === 0 ? 2 : 11) : null)), { trialDays: 14, asOf: "2026-12-31" });
  assert.equal(r.verdict, "usable");
});

test("the sample data analyses and exports", () => {
  const p = parseRows(sampleText());
  assert.equal(p.rows.length, 160);
  const r = analyze(p.rows, { trialDays: 14, monthlyPrice: 29, paidMonths: 9 });
  assert.ok(!r.error, r.error);
  const csv = reportCsv(r);
  assert.equal(csv.split("\n").length, 1 + r.scenarios.length);
});
