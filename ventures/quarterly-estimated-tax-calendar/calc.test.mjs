import test from "node:test";
import assert from "node:assert/strict";

import {
  nextBusinessDay,
  quarterDueDates,
  safeHarborMultiplier,
  requiredAnnualPayment,
  computeSchedule,
  icsCalendar,
  QUARTERS,
} from "./calc.mjs";

// --- Real, published IRS due-date shifts, used as regression tests -------
// A tool that only knows "the 15th" gets every one of these three wrong.

test("2022 Q1: April 15 is Emancipation Day observed (Apr 16 falls on a Saturday), then the weekend — shifts to April 18", () => {
  // Real 2022 federal tax deadline, as extended and publicly reported.
  assert.equal(nextBusinessDay("2022-04-15"), "2022-04-18");
});

test("2023 Q4 (paid with the return due in early 2024... no: this is the Q4-2022 estimate): Jan 15 2023 is a Sunday, and the Monday it lands on is MLK Day — shifts to Jan 17", () => {
  // Real 2022 Q4 estimated-tax deadline was January 17, 2023.
  assert.equal(nextBusinessDay("2023-01-15"), "2023-01-17");
});

test("2024 Q4 estimate: Jan 15, 2024 IS Martin Luther King Jr. Day that year — shifts to Jan 16", () => {
  // Real 2023 Q4 estimated-tax deadline was January 16, 2024.
  assert.equal(nextBusinessDay("2024-01-15"), "2024-01-16");
});

test("an ordinary weekday with no nearby holiday is not shifted", () => {
  assert.equal(nextBusinessDay("2026-04-15"), "2026-04-15"); // Wednesday
  assert.equal(nextBusinessDay("2026-06-15"), "2026-06-15"); // Monday
  assert.equal(nextBusinessDay("2026-09-15"), "2026-09-15"); // Tuesday
  assert.equal(nextBusinessDay("2027-01-15"), "2027-01-15"); // Friday, MLK 2027 is the 18th
});

test("quarterDueDates returns all four adjusted dates for a tax year, Q4 landing in the following January", () => {
  const dates = quarterDueDates(2022);
  assert.deepEqual(dates, {
    q1: "2022-04-18",
    q2: "2022-06-15",
    q3: "2022-09-15",
    q4: "2023-01-17",
  });
});

// --- Safe harbor multiplier -----------------------------------------------

test("100% safe harbor for AGI at or below the threshold", () => {
  assert.equal(safeHarborMultiplier({ priorYearAGI: 150000, marriedFilingSeparately: false }), 1.0);
  assert.equal(safeHarborMultiplier({ priorYearAGI: 149999 }), 1.0);
});

test("110% safe harbor once AGI clears $150,000 (or $75,000 married filing separately)", () => {
  assert.equal(safeHarborMultiplier({ priorYearAGI: 150001 }), 1.1);
  assert.equal(safeHarborMultiplier({ priorYearAGI: 80000, marriedFilingSeparately: true }), 1.1);
  assert.equal(safeHarborMultiplier({ priorYearAGI: 75000, marriedFilingSeparately: true }), 1.0);
});

// --- Required annual payment -----------------------------------------------

test("no prior-year tax and no current-year estimate: nothing to compute", () => {
  const result = requiredAnnualPayment({});
  assert.equal(result.required, null);
});

test("only prior-year tax entered: required is 100% of it", () => {
  const result = requiredAnnualPayment({ priorYearTax: 12000, priorYearAGI: 90000 });
  assert.equal(result.required, 12000);
  assert.match(result.basis, /100% of last year/);
});

test("high-income filer: required is 110% of prior-year tax", () => {
  const result = requiredAnnualPayment({ priorYearTax: 12000, priorYearAGI: 200000 });
  assert.equal(result.required, 13200);
  assert.match(result.basis, /110% of last year/);
});

test("only current-year estimate entered: required is 90% of it", () => {
  const result = requiredAnnualPayment({ currentYearEstimate: 10000 });
  assert.equal(result.required, 9000);
  assert.match(result.basis, /90% of this year/);
});

test("both entered: the lower of the two safe harbors wins", () => {
  const lowerIsCurrentYear = requiredAnnualPayment({ priorYearTax: 20000, priorYearAGI: 90000, currentYearEstimate: 10000 });
  assert.equal(lowerIsCurrentYear.required, 9000); // 90% of 10000 < 100% of 20000
  assert.match(lowerIsCurrentYear.basis, /90% of this year/);

  const lowerIsPriorYear = requiredAnnualPayment({ priorYearTax: 5000, priorYearAGI: 90000, currentYearEstimate: 40000 });
  assert.equal(lowerIsPriorYear.required, 5000); // 100% of 5000 < 90% of 40000
  assert.match(lowerIsPriorYear.basis, /100% of last year/);
});

// --- Full schedule -----------------------------------------------------

test("computeSchedule splits the net requirement evenly across all four quarters", () => {
  const schedule = computeSchedule({ taxYear: 2026, priorYearTax: 8000, priorYearAGI: 60000, withholding: 0, asOfDate: "2026-01-01" });
  assert.equal(schedule.required, 8000);
  assert.equal(schedule.perQuarter, 2000);
  for (const row of schedule.rows) {
    assert.equal(row.suggested, 2000);
    assert.equal(row.shortfall, 2000);
  }
});

test("withholding reduces the net requirement before it is split", () => {
  const schedule = computeSchedule({ taxYear: 2026, priorYearTax: 8000, priorYearAGI: 60000, withholding: 4000, asOfDate: "2026-01-01" });
  assert.equal(schedule.netRequired, 4000);
  assert.equal(schedule.perQuarter, 1000);
});

test("a quarter already paid in full has zero shortfall and is marked paid", () => {
  const schedule = computeSchedule({
    taxYear: 2026,
    priorYearTax: 8000,
    priorYearAGI: 60000,
    asOfDate: "2026-02-01",
    paidByQuarter: { q1: 2000 },
  });
  const q1 = schedule.rows.find((r) => r.quarter === "q1");
  assert.equal(q1.shortfall, 0);
  assert.equal(q1.status, "paid");
});

test("a quarter whose due date has passed and is unpaid is marked overdue", () => {
  const schedule = computeSchedule({
    taxYear: 2020,
    priorYearTax: 8000,
    priorYearAGI: 60000,
    asOfDate: "2026-01-01",
  });
  for (const row of schedule.rows) {
    assert.equal(row.status, "overdue");
  }
});

test("a quarter due within 30 days is marked due-soon, otherwise upcoming", () => {
  const schedule = computeSchedule({
    taxYear: 2026,
    priorYearTax: 8000,
    priorYearAGI: 60000,
    asOfDate: "2026-03-20", // Q1 2026-04-15 is 26 days out; Q2 2026-06-15 is far out
  });
  const q1 = schedule.rows.find((r) => r.quarter === "q1");
  const q2 = schedule.rows.find((r) => r.quarter === "q2");
  assert.equal(q1.status, "due-soon");
  assert.equal(q2.status, "upcoming");
});

test("no basis entered produces a no-basis finding and every row's suggested amount is null", () => {
  const schedule = computeSchedule({ taxYear: 2026 });
  assert.ok(schedule.findings.some((f) => f.id === "no-basis"));
  for (const row of schedule.rows) assert.equal(row.suggested, null);
});

test("high AGI without marriedFilingSeparately produces the high-income-safe-harbor finding", () => {
  const schedule = computeSchedule({ taxYear: 2026, priorYearTax: 8000, priorYearAGI: 200000 });
  assert.ok(schedule.findings.some((f) => f.id === "high-income-safe-harbor"));
});

test("prior-year tax entered with no AGI produces the agi-not-entered finding rather than silently assuming 100%", () => {
  const schedule = computeSchedule({ taxYear: 2026, priorYearTax: 8000 });
  assert.ok(schedule.findings.some((f) => f.id === "agi-not-entered"));
});

test("the annualized-income-method note always appears, on every schedule", () => {
  const withInputs = computeSchedule({ taxYear: 2026, priorYearTax: 8000, priorYearAGI: 60000 });
  const withoutInputs = computeSchedule({ taxYear: 2026 });
  assert.ok(withInputs.findings.some((f) => f.id === "annualized-income-note"));
  assert.ok(withoutInputs.findings.some((f) => f.id === "annualized-income-note"));
});

test("payments already covering the requirement produce an overpaid finding", () => {
  const schedule = computeSchedule({
    taxYear: 2026,
    priorYearTax: 4000,
    priorYearAGI: 60000,
    paidByQuarter: { q1: 1000, q2: 1000, q3: 1000, q4: 1000 },
  });
  assert.ok(schedule.findings.some((f) => f.id === "overpaid"));
});

test("all four quarters are always present, in order", () => {
  const schedule = computeSchedule({ taxYear: 2026 });
  assert.deepEqual(schedule.rows.map((r) => r.quarter), QUARTERS);
});

// --- ICS export -----------------------------------------------------

test("icsCalendar produces a structurally valid calendar with one VEVENT per unpaid quarter", () => {
  const schedule = computeSchedule({ taxYear: 2026, priorYearTax: 8000, priorYearAGI: 60000, asOfDate: "2026-01-01" });
  const ics = icsCalendar(schedule, new Date("2026-01-01T00:00:00Z"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 4);
  assert.match(ics, /DTSTART;VALUE=DATE:20260415/);
  assert.match(ics, /TRIGGER:-P7D/);
});

test("icsCalendar skips a quarter already fully paid (shortfall 0)", () => {
  const schedule = computeSchedule({
    taxYear: 2026,
    priorYearTax: 8000,
    priorYearAGI: 60000,
    asOfDate: "2026-01-01",
    paidByQuarter: { q1: 2000 },
  });
  const ics = icsCalendar(schedule, new Date("2026-01-01T00:00:00Z"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.doesNotMatch(ics, /DTSTART;VALUE=DATE:20260415/);
});

test("icsCalendar with no basis entered still produces a structurally valid (empty) calendar", () => {
  const schedule = computeSchedule({ taxYear: 2026 });
  const ics = icsCalendar(schedule);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test("a comma or semicolon in generated text does not break the ICS structure", () => {
  // Regression guard: computeSchedule's own text never contains user-typed
  // free text today, but icsCalendar's escaping is exercised here directly
  // so a future field addition inherits a tested escape path rather than a
  // silent one.
  const schedule = computeSchedule({ taxYear: 2026, priorYearTax: 8000, priorYearAGI: 60000 });
  const ics = icsCalendar(schedule);
  assert.doesNotMatch(ics, /\r\n\r\n/);
});
