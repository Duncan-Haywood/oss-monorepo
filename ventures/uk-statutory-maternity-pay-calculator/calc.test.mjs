import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, toDay, fromDay, sundayOnOrBefore, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.011, `${a} vs ${b}`);

test("dates round trip and reject impossible ones", () => {
  assert.equal(fromDay(toDay("2026-11-20")), "2026-11-20");
  assert.equal(toDay("2026-02-30"), null);
});

test("weeks run Sunday to Saturday", () => {
  assert.equal(fromDay(sundayOnOrBefore(toDay("2026-11-20"))), "2026-11-15"); // Friday
  assert.equal(fromDay(sundayOnOrBefore(toDay("2026-11-15"))), "2026-11-15"); // Sunday
});

test("qualifying week is the 15th week before the expected week", () => {
  const r = run({});
  assert.equal(fromDay(r.qualifyingWeek), "2026-08-02");
  assert.equal(fromDay(r.earliestStart), "2026-08-30");
});

test("worked example: 6 weeks at 90% then the standard rate (capped by 90%)", () => {
  const r = run({});
  assert.equal(r.eligible, true);
  assert.equal(r.rows[0].weeks, 6);
  near(r.rows[0].weekly, 468);
  // 90% of 520 = 468 > standard 194.32, so weeks 7-39 are the flat rate.
  near(r.rows[1].weekly, 194.32);
  assert.equal(r.rows[1].weeks, 33);
  near(r.smpTotal, 6 * 468 + 33 * 194.32);
});

test("low earners get 90% of earnings throughout", () => {
  const r = run({ weeklyEarnings: "150" });
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].weeks + r.rows[1].weeks, 39);
  near(r.rows[0].weekly, 135);
  near(r.rows[1].weekly, 135);
  near(r.smpTotal, 39 * 135);
});

test("fewer than 26 weeks employed is not eligible", () => {
  const r = run({ employmentStart: "2026-03-01" });
  assert.equal(r.eligible, false);
  assert.equal(r.rows.length, 0);
  assert.ok(r.findings.some((f) => /26 are needed/.test(f.title)));
});

test("26 weeks into the qualifying week: the boundary is a Saturday", () => {
  // QW starts Sun 2026-08-02; the 26th week back runs Sun 2026-02-08 to Sat
  // 2026-02-14 and counts if employed on any day of it (GOV.UK calculator).
  assert.equal(run({ employmentStart: "2026-02-08" }).lengthOk, true);
  assert.equal(run({ employmentStart: "2026-02-14" }).lengthOk, true);
  assert.equal(run({ employmentStart: "2026-02-15" }).lengthOk, false);
});

test("earnings below the lower earnings limit is not eligible", () => {
  const r = run({ weeklyEarnings: "120" });
  assert.equal(r.earningsOk, false);
  assert.equal(r.eligible, false);
});

test("start before the 11-week window is moved and flagged", () => {
  const r = run({ leaveStart: "2026-06-01" });
  assert.equal(fromDay(r.start), "2026-08-30");
  assert.ok(r.findings.some((f) => f.severity === "medium" && /11 weeks/.test(f.title)));
});

test("April uprating applies to the weeks that fall after it", () => {
  const r = run({ expectedDate: "2025-12-20", employmentStart: "2023-01-01", leaveStart: "2025-11-03", weeklyEarnings: "520" });
  const weeks7to39 = r.rows.filter((x) => /Weeks 7-39/.test(x.phase));
  assert.equal(weeks7to39.length, 2);
  near(weeks7to39[0].weekly, 187.18);
  near(weeks7to39[1].weekly, 194.32);
  assert.equal(weeks7to39.reduce((a, x) => a + x.weeks, 0), 33);
});

test("SPP is two weeks at the lower of standard rate and 90%", () => {
  near(run({}).spp.total, 2 * 194.32);
  near(run({ weeklyEarnings: "150" }).spp.total, 2 * 135);
});

test("bad input returns errors, not a result", () => {
  assert.ok(compute({ ...SAMPLE, expectedDate: "soon" }).errors.length);
  assert.ok(compute({ ...SAMPLE, weeklyEarnings: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, leaveStart: "x" }).errors.length);
});

test("summary names the verify line and the disclaimer", () => {
  const s = summaryText(run({}));
  assert.match(s, /GOV\.UK/);
  assert.match(s, /No warranty/);
});

// A part week counts as a whole week (ERA 1996 s.212(1); SPM250800). GOV.UK's
// employer calculator, due 2026-11-20, asks for a contract "covering
// 14 February 2026": the Saturday of the 26th week back from the qualifying
// week (2026-08-02). Red team 2026-11-24.
test("continuous employment: a start any day of the 26th week back qualifies", () => {
  for (const d of ["2026-02-08", "2026-02-11", "2026-02-14"]) {
    const r = run({ employmentStart: d });
    assert.equal(r.lengthOk, true, d);
    assert.equal(r.employedWeeks, 26, d);
  }
  const late = run({ employmentStart: "2026-02-15" });
  assert.equal(late.lengthOk, false);
  assert.equal(late.employedWeeks, 25);
});

// Red team 2026-11-24: escaped mutants on the rates-beyond warning, money
// formatting and the 90%-below-standard note.
const hasFinding = (r, s) => r.findings.some((f) => f.title.includes(s));

test("a final SMP week starting exactly on 6 April 2027 is flagged as past the known rates", () => {
  // EWC Sun 2026-09-27, leave Tue 2026-07-14: week 39 starts 2027-04-06.
  const r = run({ expectedDate: "2026-09-29", leaveStart: "2026-07-14" });
  assert.equal(r.start, toDay("2026-07-14"));
  assert.equal(hasFinding(r, "Weeks from 6 April 2027"), true);
  const before = run({ expectedDate: "2026-09-29", leaveStart: "2026-07-13" }); // week 39 starts 2027-04-05
  assert.equal(hasFinding(before, "Weeks from 6 April 2027"), false);
});

test("a schedule ending in April 2027 (before May) is still flagged", () => {
  const r = run({ expectedDate: "2026-10-20", leaveStart: "2026-08-02" }); // week 39 starts 2027-04-25
  assert.equal(hasFinding(r, "Weeks from 6 April 2027"), true);
});

test("the summary prints pounds, never NaN", () => {
  const t = summaryText(run({}));
  assert.match(t, /£468\.00/);
  assert.doesNotMatch(t, /NaN/);
});

test("the 90%-below-standard note follows week 7's own rate", () => {
  // Week 7 starts Wed 2026-04-01, still 2025/26 (187.18); 90% of 210 = 189 is
  // above it, so week 7 is paid at the flat rate and the note must not show.
  const r = run({ expectedDate: "2026-05-05", leaveStart: "2026-02-18", weeklyEarnings: "210" });
  assert.equal(r.eligible, true);
  assert.equal(hasFinding(r, "is below the standard rate"), false);
  const later = run({ expectedDate: "2026-05-05", leaveStart: "2026-02-25", weeklyEarnings: "210" }); // week 7 = 2026-04-08
  assert.equal(hasFinding(later, "is below the standard rate"), true);
});

// Red team 2026-11-24 hunt: start dates the rules rule out were priced with no
// warning. GOV.UK: maternity leave starts the day after the birth at the
// latest; paternity leave starts on or after the birth and must finish within
// 52 weeks of it.
test("a maternity pay start after the day after the due date is flagged", () => {
  assert.equal(hasFinding(run({ leaveStart: "2026-11-21" }), "day after the birth"), false); // due 2026-11-20
  const r = run({ leaveStart: "2027-06-01" });
  assert.equal(hasFinding(r, "day after the birth"), true);
});

test("a paternity pay start before the birth or too late to finish in 52 weeks is flagged", () => {
  assert.equal(hasFinding(run({ paternityStart: "2026-11-20" }), "Paternity pay starts"), false);
  assert.equal(hasFinding(run({ paternityStart: "2026-11-05" }), "Paternity pay starts"), true);
  assert.equal(hasFinding(run({ paternityStart: "2027-11-05" }), "Paternity pay starts"), false); // 2 weeks end 2027-11-19
  assert.equal(hasFinding(run({ paternityStart: "2027-11-06" }), "Paternity pay starts"), true);
});
