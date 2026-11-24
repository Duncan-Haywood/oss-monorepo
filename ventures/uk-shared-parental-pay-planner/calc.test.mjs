import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, toDay, fromDay, sundayOnOrBefore, SAMPLE, summaryText, POOL_WEEKS } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.011, `${a} vs ${b}`);

test("dates round trip and reject impossible ones", () => {
  assert.equal(fromDay(toDay("2026-11-20")), "2026-11-20");
  assert.equal(toDay("2026-02-30"), null);
  assert.equal(fromDay(sundayOnOrBefore(toDay("2026-11-20"))), "2026-11-15");
});

test("qualifying week and eligibility for both parents", () => {
  const r = run({});
  assert.equal(fromDay(r.qualifyingWeek), "2026-08-02");
  assert.equal(r.mother.eligible, true);
  assert.equal(r.partner.eligible, true);
});

test("pool is 39 weeks: SMP weeks plus shared weeks", () => {
  const r = run({});
  assert.equal(r.shared, POOL_WEEKS - 26);
  assert.equal(r.current.partnerWeeks + r.current.motherShared, r.shared);
});

test("worked example totals", () => {
  const r = run({ partnerWeeks: "6" });
  // SMP 26 weeks: 6 x 468 + 20 x 194.32 = 2808 + 3886.40
  near(r.current.smpTotal, 6694.4);
  // Shared 6 and 7 weeks at the standard 194.32 (90% of both earnings is higher)
  near(r.current.partnerTotal, 6 * 194.32);
  near(r.current.motherSharedTotal, 7 * 194.32);
  near(r.current.total, 6694.4 + 13 * 194.32);
});

test("shared weeks pay the lower of the standard rate and 90% of earnings", () => {
  const r = run({ partnerWeekly: "150", partnerWeeks: "10" }); // 90% = 135 < 194.32
  near(r.current.partnerTotal, 1350);
  const best = r.best;
  assert.equal(best.partnerWeeks, 0); // mother's rate is higher, so partner should take none
  assert.ok(r.findings.some((f) => /would raise household statutory pay/.test(f.title)));
});

test("equal rates make the split irrelevant", () => {
  const r = run({});
  assert.ok(r.findings.some((f) => /same weekly ShPP/.test(f.title)));
});

test("ineligible partner earns £0 shared pay", () => {
  const r = run({ partnerEmploymentStart: "2026-06-01", partnerWeeks: "13" });
  assert.equal(r.partner.eligible, false);
  assert.equal(r.current.partnerTotal, 0);
  assert.equal(r.best.partnerWeeks, 0);
});

test("taking all 39 weeks leaves nothing to share", () => {
  const r = run({ smpWeeks: "39", partnerWeeks: "5" });
  assert.equal(r.shared, 0);
  assert.equal(r.plan, 0);
  assert.ok(r.findings.some((f) => /nothing to share/.test(f.title)));
});

test("partner weeks above the pool are capped", () => {
  const r = run({ partnerWeeks: "30" });
  assert.equal(r.plan, r.shared);
  assert.ok(r.findings.some((f) => /Only 13 shared weeks remain/.test(f.title)));
});

test("rejects bad input", () => {
  assert.ok(run({ smpWeeks: "1" }).errors.length);
  assert.ok(run({ smpWeeks: "12.5" }).errors.length);
  assert.ok(run({ motherWeekly: "abc" }).errors.length);
  assert.ok(run({ expectedDate: "tomorrow" }).errors.length);
  assert.ok(run({ partnerWeeks: "-2" }).errors.length);
});

test("scenario table includes the ends and the plan, sorted", () => {
  const r = run({ partnerWeeks: "7" });
  const ps = r.scenarios.map((s) => s.partnerWeeks);
  assert.deepEqual(ps, [...ps].sort((a, b) => a - b));
  for (const p of [0, 7, r.shared]) assert.ok(ps.includes(p));
  assert.equal(r.scenarios.filter((s) => s.isPlan).length, 1);
});

test("weeks beyond the last known rate are flagged", () => {
  const r = run({ expectedDate: "2027-02-10", smpWeeks: "39", partnerWeeks: "" });
  assert.ok(r.findings.some((f) => /6 April 2027/.test(f.title)));
});

test("dates before the first known rate year are flagged (red team 2026-11-24)", () => {
  const early = run({ expectedDate: "2024-09-01", motherEmploymentStart: "2020-01-01", partnerEmploymentStart: "2020-01-01" });
  assert.ok(early.findings.some((f) => /before 6 April 2025/.test(f.title)));
  // A qualifying week before 6 April 2025 with all paid weeks after it still warns.
  const qwOnly = run({ expectedDate: "2025-07-15", motherEmploymentStart: "2020-01-01", partnerEmploymentStart: "2020-01-01" });
  assert.equal(qwOnly.current.before, false);
  assert.ok(qwOnly.findings.some((f) => /before 6 April 2025/.test(f.title)));
  assert.ok(!run({}).findings.some((f) => /before 6 April 2025/.test(f.title)));
});

test("each SMP week takes the standard rate in force on its own date (red team 2026-11-24)", () => {
  // Due week starts 2026-01-11: SMP weeks 7-12 fall before 6 April 2026, the rest after.
  const r = run({ expectedDate: "2026-01-15", motherEmploymentStart: "2020-01-01", smpWeeks: "39", partnerWeeks: "" });
  const smp = r.current.rows.filter((x) => /SMP at the lower/.test(x.phase));
  assert.deepEqual(smp.map((x) => [x.weekly, x.weeks]), [[187.18, 7], [194.32, 26]]);
});

test("the scenario table steps the partner's share by 4 weeks from 0 (red team 2026-11-24)", () => {
  const r = run({});
  assert.deepEqual(r.scenarios.map((s) => s.partnerWeeks), [0, 4, 8, 12, 13]);
});

test("summary names the verify line and the disclaimer", () => {
  const t = summaryText(run({}));
  assert.match(t, /GOV\.UK/);
  assert.match(t, /Not legal, payroll or employment advice/);
  assert.match(t, /<- your plan/);
});

// A part week counts as a whole week (ERA 1996 s.212(1); ShPP (General)
// Regs 2014 reg 34; SPM250800). GOV.UK's employer calculator, due 2026-11-20,
// asks for a contract "covering 14 February 2026": the Saturday of the 26th
// week back from the qualifying week (2026-08-02). Red team 2026-11-24.
test("continuous employment: a start any day of the 26th week back qualifies", () => {
  for (const d of ["2026-02-08", "2026-02-11", "2026-02-14"]) {
    const r = run({ motherEmploymentStart: d, partnerEmploymentStart: d });
    assert.equal(r.mother.lengthOk, true, d);
    assert.equal(r.partner.lengthOk, true, d);
    assert.equal(r.mother.employedWeeks, 26, d);
  }
  const late = run({ motherEmploymentStart: "2026-02-15" });
  assert.equal(late.mother.lengthOk, false);
  assert.equal(late.mother.employedWeeks, 25);
});

// Red team 2026-11-24: escaped mutants on row grouping and the same-rate note.
test("rows keep SMP, partner and mother weeks apart even at the same weekly amount", () => {
  const r = run({ partnerWeeks: "6" }); // both parents' ShPP and late SMP are all 194.32
  const rows = r.current.rows;
  assert.deepEqual(rows.map((x) => [x.phase.split(":")[0], x.weeks]), [["Mother", 6], ["Mother", 20], ["Partner", 6], ["Mother", 7]]);
});

test("the same-weekly-ShPP note needs equal rates, not just two eligible parents", () => {
  const same = run({});
  assert.equal(same.findings.some((f) => f.title.startsWith("Both parents get the same weekly ShPP")), true);
  const diff = run({ motherWeekly: "150" }); // 90% = 135, below the standard rate
  assert.equal(diff.mother.eligible && diff.partner.eligible, true);
  assert.equal(diff.findings.some((f) => f.title.startsWith("Both parents get the same weekly ShPP")), false);
});
