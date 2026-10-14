import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, basicWeeks, claimDeadline, weeklyCapFor, SAMPLE, summaryText } from "./calc.mjs";

const d = (s) => { const [y, mo, da] = s.split("-").map(Number); return { y, mo, d: da, t: Date.UTC(y, mo - 1, da) }; };

test("basic award weeks use the age bands, counting back from the last day", () => {
  // Born 1985-05-20, ended 2026-07-31: eight complete years; aged 41 in the last one (1.5 weeks), 22-40 in the other seven.
  const b = basicWeeks(d("1985-05-20"), d("2018-03-12"), d("2026-07-31"));
  assert.equal(b.years, 8);
  assert.equal(b.weeks, 8.5);
  // Born 1970, 10 years to 2026-01-01: ages 55..46, all 41+, so 15 weeks.
  assert.equal(basicWeeks(d("1970-01-01"), d("2016-01-01"), d("2026-01-01")).weeks, 15);
  // Under 22 in the early years earns half weeks.
  assert.deepEqual(basicWeeks(d("2000-06-01"), d("2020-01-01"), d("2024-01-01")).bands, [1, 1, 0.5, 0.5]);
});

test("service over 20 years counts only 20", () => {
  assert.equal(basicWeeks(d("1960-01-01"), d("1990-01-01"), d("2026-01-01")).years, 20);
  assert.equal(basicWeeks(d("1960-01-01"), d("1990-01-01"), d("2026-01-01")).weeks, 30);
});

test("weekly cap switches on 6 April 2026", () => {
  assert.equal(weeklyCapFor(d("2026-04-05")), 719);
  assert.equal(weeklyCapFor(d("2026-04-06")), 751);
});

test("claim deadline is three months less a day", () => {
  assert.equal(claimDeadline(d("2026-07-31")), "2026-10-30");
  assert.equal(claimDeadline(d("2026-01-15")), "2026-04-14");
  assert.equal(claimDeadline(d("2026-11-30")), "2027-02-28");
  assert.equal(claimDeadline(d("2026-10-31")), "2027-01-30");
});

test("sample works through to a total", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.eligible, true);
  assert.equal(r.basic, 8.5 * 751);
  assert.equal(r.immediateLoss, 680 * 30 - 6000);
  assert.equal(r.futureLoss, 80 * 12);
  assert.equal(r.compRaw, 14400 + 960 + 500 + 1500 + 250);
  assert.equal(r.comp, r.compRaw);
  assert.equal(r.total, r.basic + r.comp);
  assert.match(summaryText(r), /Estimated total/);
});

test("adjustments apply in the stated order and the 52-week cap bites", () => {
  const r = compute({ ...SAMPLE, weeklyGross: 400, weeklyNet: 330, weeksToHearing: 200, earnedSince: 0, newWeeklyNet: 0, futureWeeks: 0, pensionLoss: 0, expenses: 0, polkey: 50, acas: 25, contributory: 20 });
  assert.equal(r.compRaw, 330 * 200 + 500);
  assert.equal(r.afterPolkey, r.compRaw / 2);
  assert.equal(r.afterAcas, Math.round(r.afterPolkey * 1.25 * 100) / 100);
  assert.equal(r.cap, 52 * 400);
  assert.equal(r.comp, 52 * 400);
  assert.equal(r.capBites, true);
});

test("automatic unfair dismissal has no cap and needs no qualifying service", () => {
  const r = compute({ ...SAMPLE, start: "2026-01-01", automatic: true, weeksToHearing: 200, earnedSince: 0 });
  assert.equal(r.eligible, false);
  assert.equal(r.cap, null);
  assert.ok(r.comp > 52 * 900 || r.comp === r.afterFault);
  assert.ok(r.total > 0);
});

test("under two years' service shows zero with a reason", () => {
  const r = compute({ ...SAMPLE, start: "2025-09-01" });
  assert.equal(r.total, 0);
  assert.match(r.findings[0].title, /under the 2 needed/);
});

test("redundancy payment offsets the basic award, never below zero", () => {
  assert.equal(compute({ ...SAMPLE, redundancyPaid: 3000 }).basic, 8.5 * 751 - 3000);
  assert.equal(compute({ ...SAMPLE, redundancyPaid: 99999 }).basic, 0);
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({ ...SAMPLE, dob: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, end: "2017-01-01" }).errors.length);
  assert.ok(compute({ ...SAMPLE, polkey: 101 }).errors.length);
  assert.ok(compute({ ...SAMPLE, acas: 40 }).errors.length);
  assert.ok(compute({ ...SAMPLE, weeklyNet: 1000 }).errors.length);
  assert.ok(compute({ ...SAMPLE, weeklyGross: "abc" }).errors.length);
  assert.ok(compute({ ...SAMPLE, compCap: "-5" }).errors.length);
});
