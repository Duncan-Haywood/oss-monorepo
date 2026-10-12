import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, calculate, dueDate, federalHolidays, nextBusinessDay, isBusinessDay, nonBusinessReason,
  endOfMonthAfter, fifteenthAfter, minusYears, daysBetween, parseISO, usd, sampleInput,
  sampleMultiYearInput, resultCsv, filingSteps,
} from "./calc.mjs";

const base = (o = {}) => ({ ...sampleInput(), ...o });

test("due date is the last day of the 7th month after plan year end", () => {
  assert.equal(dueDate("2024-12-31").normalRaw, "2025-07-31");
  assert.equal(dueDate("2025-06-30").normalRaw, "2026-01-31");
  assert.equal(dueDate("2025-09-30").normalRaw, "2026-04-30");
  assert.equal(dueDate("2024-07-31").normalRaw, "2025-02-28");
  assert.equal(dueDate("2023-07-31").normalRaw, "2024-02-29");
});

test("Form 5558 extends to the 15th of the 10th month (2.5 months)", () => {
  assert.equal(dueDate("2024-12-31", { extended: true }).raw, "2025-10-15");
  assert.equal(dueDate("2025-06-30", { extended: true }).raw, "2026-04-15");
  assert.equal(dueDate("2024-12-31", { extended: false }).raw, "2025-07-31");
});

test("a due date on a weekend rolls to the next business day", () => {
  const d = dueDate("2025-06-30"); // 2026-01-31 is a Saturday
  assert.equal(d.raw, "2026-01-31");
  assert.equal(d.due, "2026-02-02");
  assert.equal(d.rolled, true);
  assert.equal(d.rolledReason, "Saturday");
  const s = dueDate("2027-12-31", { extended: true }); // 2028-10-15 is a Sunday
  assert.equal(s.raw, "2028-10-15");
  assert.equal(s.due, "2028-10-16");
  assert.equal(s.rolledReason, "Sunday");
});

test("a due date on a federal holiday rolls past it", () => {
  const mlk = dueDate("2028-03-31", { extended: true }); // 2029-01-15 is Martin Luther King Jr. Day
  assert.equal(mlk.raw, "2029-01-15");
  assert.equal(mlk.due, "2029-01-16");
  assert.equal(mlk.rolledReason, "Martin Luther King Jr. Day");
  const pres = dueDate("2026-04-30", { extended: true }); // 2027-02-15 is Washington's Birthday
  assert.equal(pres.due, "2027-02-16");
  assert.equal(pres.rolledReason, "Washington's Birthday");
});

test("a Friday or weekday due date does not roll", () => {
  const d = dueDate("2025-12-31");
  assert.equal(d.raw, "2026-07-31");
  assert.equal(d.due, "2026-07-31");
  assert.equal(d.rolled, false);
});

test("federal holidays for 2026", () => {
  const h = federalHolidays(2026);
  assert.equal(h.get("2026-01-01"), "New Year's Day");
  assert.equal(h.get("2026-01-19"), "Martin Luther King Jr. Day");
  assert.equal(h.get("2026-02-16"), "Washington's Birthday");
  assert.equal(h.get("2026-05-25"), "Memorial Day");
  assert.equal(h.get("2026-06-19"), "Juneteenth");
  assert.equal(h.get("2026-07-04"), "Independence Day"); // Saturday, stays put
  assert.equal(h.get("2026-09-07"), "Labor Day");
  assert.equal(h.get("2026-10-12"), "Columbus Day");
  assert.equal(h.get("2026-11-11"), "Veterans Day");
  assert.equal(h.get("2026-11-26"), "Thanksgiving Day");
  assert.equal(h.get("2026-12-25"), "Christmas Day");
  assert.equal(h.size, 11);
});

test("a holiday on a Sunday is observed on the Monday; on a Saturday it is not moved to Friday", () => {
  assert.equal(federalHolidays(2027).get("2027-12-27") ?? null, null); // Christmas 2027 is Saturday
  assert.ok(federalHolidays(2027).has("2027-12-25"));
  assert.equal(federalHolidays(2022).get("2022-12-26"), "Christmas Day"); // Sunday 25th
  assert.equal(isBusinessDay("2027-12-24"), true);
  assert.equal(isBusinessDay("2022-12-26"), false);
});

test("nextBusinessDay skips a weekend plus a Monday holiday", () => {
  assert.equal(nextBusinessDay("2026-05-23"), "2026-05-26"); // Sat -> Memorial Day Monday -> Tue
  assert.equal(nextBusinessDay("2026-05-27"), "2026-05-27");
  assert.equal(nonBusinessReason("2026-05-25"), "Memorial Day");
  assert.equal(nonBusinessReason("2026-05-26"), null);
});

test("date helpers reject impossible dates and clamp leap days", () => {
  assert.equal(parseISO("2025-02-30"), null);
  assert.equal(parseISO("2025-13-01"), null);
  assert.equal(parseISO("garbage"), null);
  assert.equal(minusYears("2024-02-29", 1), "2023-02-28");
  assert.equal(endOfMonthAfter("2025-11-30", 3), "2026-02-28");
  assert.equal(fifteenthAfter("2025-11-30", 3), "2026-02-15");
  assert.equal(daysBetween("2025-07-31", "2025-10-06"), 67);
  assert.throws(() => dueDate("nope"), RangeError);
});

test("small plan, one report, 67 days late: DFVC is $10 a day below the cap", () => {
  const r = calculate(base());
  assert.equal(r.ok, true);
  assert.equal(r.due.due, "2025-07-31");
  assert.equal(r.isLate, true);
  assert.equal(r.daysLate, 67);
  assert.equal(r.dfvc.total, 670);
  assert.equal(r.dfvc.planCapApplied, false);
  assert.equal(r.irs.total, 67 * 250);
  assert.equal(r.dol.total, 67 * DEFAULTS.dolMaxPerDay);
  assert.equal(r.dfvc.savingsVsDol, 67 * DEFAULTS.dolMaxPerDay - 670);
  assert.equal(r.dfvc.savingsVsCombined, 67 * 250 + 67 * DEFAULTS.dolMaxPerDay - 670);
});

test("DFVC per-report cap: small $750, large $2,000", () => {
  const small = calculate(base({ filingDate: "2026-03-01" }));
  assert.equal(small.dfvc.total, 750);
  const large = calculate(base({ planType: "large", participants: 250, filingDate: "2026-03-01" }));
  assert.equal(large.dfvc.perReportCap, 2000);
  assert.equal(large.dfvc.total, 2000);
  assert.equal(large.dfvc.bucket, "large");
});

test("multiple years: each earlier year adds its own report, bounded by the per-plan cap", () => {
  const small = calculate(sampleMultiYearInput());
  assert.equal(small.reports.length, 2);
  assert.equal(small.reports[1].planYearEnd, "2023-12-31");
  assert.equal(small.reports[1].dueDate, "2024-07-31");
  assert.equal(small.reports[0].dfvc, 750);
  assert.equal(small.reports[1].dfvc, 750);
  assert.equal(small.dfvc.sumBeforePlanCap, 1500);
  assert.equal(small.dfvc.total, 1500);
  const three = calculate({ ...sampleMultiYearInput(), yearsLate: 3 });
  assert.equal(three.dfvc.sumBeforePlanCap, 2250);
  assert.equal(three.dfvc.total, 1500);
  assert.equal(three.dfvc.planCapApplied, true);
  const large = calculate({ ...sampleMultiYearInput(), planType: "large", participants: 150, yearsLate: 3 });
  assert.equal(large.dfvc.sumBeforePlanCap, 6000);
  assert.equal(large.dfvc.total, 4000);
});

test("IRS penalty is $250 a day per return, capped at $150,000 per return", () => {
  const r = calculate(base({ filingDate: "2027-07-31" })); // 730 days late: 182,500 uncapped
  assert.equal(r.daysLate, 730);
  assert.equal(r.reports[0].irsUncapped, 182500);
  assert.equal(r.reports[0].irs, 150000);
  assert.equal(r.irs.total, 150000);
  const two = calculate({ ...base({ filingDate: "2027-07-31" }), yearsLate: 2 });
  assert.equal(two.irs.total, 150000 + 150000);
});

test("filing on the due date, or early, is not late and costs nothing", () => {
  const onDay = calculate(base({ filingDate: "2025-07-31" }));
  assert.equal(onDay.isLate, false);
  assert.equal(onDay.daysLate, 0);
  assert.equal(onDay.dfvc.total, 0);
  assert.equal(onDay.irs.total, 0);
  assert.equal(onDay.dol.total, 0);
  const early = calculate(base({ filingDate: "2025-06-01" }));
  assert.equal(early.daysLate, 0);
  assert.ok(early.notes.some((n) => /no late-filing penalty/.test(n)));
});

test("an extension filed moves the due date and shortens the lateness", () => {
  const r = calculate(base({ extensionFiled: true }));
  assert.equal(r.due.due, "2025-10-15");
  assert.equal(r.isLate, false);
  const late = calculate(base({ extensionFiled: true, filingDate: "2025-11-14" }));
  assert.equal(late.daysLate, 30);
  assert.equal(late.dfvc.total, 300);
});

test("lateness is counted from the rolled due date, not the raw one", () => {
  const r = calculate({ planYearEnd: "2025-06-30", planType: "small", assets: 1, participants: 3, extensionFiled: false, filingDate: "2026-02-05", yearsLate: 1 });
  assert.equal(r.due.raw, "2026-01-31");
  assert.equal(r.due.due, "2026-02-02");
  assert.equal(r.daysLate, 3);
  assert.equal(r.dfvc.total, 30);
});

test("one-participant plan at or under the asset threshold has no filing and no penalty", () => {
  const r = calculate(base({ planType: "one", assets: 250000, participants: 1 }));
  assert.equal(r.exempt, true);
  assert.equal(r.irs.total, 0);
  assert.equal(r.dol.total, 0);
  assert.equal(r.dfvc, null);
  assert.ok(r.notes[0].includes("$250,000"));
});

test("one-participant plan over the threshold: IRS exposure, no DFVC figure", () => {
  const r = calculate(base({ planType: "one", assets: 250001, participants: 1 }));
  assert.equal(r.exempt, false);
  assert.equal(r.dfvc, null);
  assert.equal(r.irs.total, 67 * 250);
  assert.ok(r.notes.some((n) => /5500-EZ goes to the IRS/.test(n)));
});

test("constants are editable and the call does not mutate the defaults", () => {
  const r = calculate(base(), { dfvcPerDay: 5, dolMaxPerDay: 3000, onePlanAssetThreshold: 100 });
  assert.equal(r.dfvc.total, 335);
  assert.equal(r.dol.total, 67 * 3000);
  assert.equal(DEFAULTS.dfvcPerDay, 10);
  const caps = calculate(base({ filingDate: "2026-03-01" }), { dfvcCaps: { small: { perReport: 500, perPlan: 900 } } });
  assert.equal(caps.dfvc.total, 500);
  assert.equal(DEFAULTS.dfvcCaps.small.perReport, 750);
  const ex = calculate(base({ planType: "one", assets: 150000 }), { onePlanAssetThreshold: 100000 });
  assert.equal(ex.exempt, false);
});

test("participant count that disagrees with the plan type is flagged", () => {
  assert.ok(calculate(base({ planType: "small", participants: 140 })).notes.some((n) => /chose a small plan/.test(n)));
  assert.ok(calculate(base({ planType: "large", participants: 30 })).notes.some((n) => /chose a large plan/.test(n)));
  assert.ok(!calculate(base()).notes.some((n) => /chose a/.test(n)));
});

test("bad input is rejected with readable messages, never a throw", () => {
  assert.equal(calculate(base({ planYearEnd: "" })).ok, false);
  assert.equal(calculate(base({ filingDate: "2025-02-31" })).ok, false);
  assert.equal(calculate(base({ planType: "jumbo" })).ok, false);
  assert.equal(calculate(base({ assets: -5 })).ok, false);
  assert.equal(calculate(base({ participants: 2.5 })).ok, false);
  assert.equal(calculate(base({ yearsLate: 0 })).ok, false);
  assert.equal(calculate(base({ yearsLate: 11 })).ok, false);
  assert.equal(calculate(null).ok, false);
  assert.ok(calculate(base({ planYearEnd: "" })).errors.length >= 1);
});

test("the result is deterministic and the constants are labelled in the result", () => {
  assert.deepEqual(calculate(base()), calculate(base()));
  assert.equal(calculate(base()).constants.irsMaxPerReturn, 150000);
});

test("steps differ by plan type and mention EFAST2 where it applies", () => {
  assert.ok(filingSteps({ planType: "small", exempt: false }).some((s) => /EFAST2/.test(s)));
  assert.ok(filingSteps({ planType: "large", exempt: false }).some((s) => /Form 5500 with its schedules/.test(s)));
  assert.ok(filingSteps({ planType: "one", exempt: false }).some((s) => /5500-EZ/.test(s)));
  assert.equal(filingSteps({ planType: "one", exempt: true }).length, 2);
});

test("usd and csv formatting", () => {
  assert.equal(usd(1234567), "$1,234,567");
  assert.equal(usd(0), "$0");
  assert.equal(usd(-1500), "-$1,500");
  const csv = resultCsv(calculate(base()));
  assert.match(csv, /^plan_year_end,due_date,days_late/);
  assert.match(csv, /2024-12-31,2025-07-31,67,670,16750,/);
});
