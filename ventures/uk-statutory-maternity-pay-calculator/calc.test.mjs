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

test("exactly 26 weeks ending with the qualifying week passes", () => {
  // QW ends Sat 2026-08-08; 26 weeks = 182 days, so start 2026-02-08 passes, 2026-02-09 fails.
  assert.equal(run({ employmentStart: "2026-02-08" }).lengthOk, true);
  assert.equal(run({ employmentStart: "2026-02-09" }).lengthOk, false);
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
