import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, extract, parseDate, addMonths, rentSchedule, calendarIcs, summaryText, findingsCsv, sampleLease, SAMPLE_SETTINGS } from "./calc.mjs";

test("parseDate reads common lease formats and rejects impossible dates", () => {
  assert.equal(parseDate("March 1, 2027").toISOString().slice(0, 10), "2027-03-01");
  assert.equal(parseDate("3/1/2027").toISOString().slice(0, 10), "2027-03-01");
  assert.equal(parseDate("2027-03-01").toISOString().slice(0, 10), "2027-03-01");
  assert.equal(parseDate("February 30, 2027"), null);
  assert.equal(parseDate("soon"), null);
});

test("addMonths clamps to month end", () => {
  assert.equal(addMonths(parseDate("2027-01-31"), 1).toISOString().slice(0, 10), "2027-02-28");
});

test("extract pulls the sample lease terms with sources", () => {
  const { x, src } = extract(sampleLease());
  assert.equal(x.termMonths, 60);
  assert.equal(x.monthlyRent, 600000);
  assert.equal(x.escalationPct, 3);
  assert.equal(x.deposit, 1800000);
  assert.equal(x.holdoverPct, 200);
  assert.equal(x.renewalNoticeDays, 270);
  assert.equal(x.freeRentMonths, 2);
  assert.equal(x.sqft, 2400);
  assert.match(src.renewalNoticeDays, /270 days/);
});

test("annual rent and psf are converted to monthly", () => {
  const a = extract("Base Rent shall be $72,000 per year. Commencement Date: January 1, 2026. Term of 3 years.".repeat(1)).x;
  assert.equal(a.monthlyRent, 600000);
  const b = extract("The premises contain 2,000 square feet. Base rent is $30.00 per square foot per year.").x;
  assert.equal(b.monthlyRent, 500000);
});

test("rent schedule compounds, applies free rent, and totals", () => {
  const s = rentSchedule({ monthlyRent: 100000, escalationPct: 10, termMonths: 30, freeRentMonths: 2 });
  assert.deepEqual(s.map((r) => r.monthly), [100000, 110000, 121000]);
  assert.equal(s[0].total, 1000000);
  assert.equal(s[2].months, 6);
  assert.equal(s.reduce((a, r) => a + r.total, 0), 1000000 + 1320000 + 726000);
});

test("analyze: renewal deadline is expiration minus notice days and calendar is sorted", () => {
  const r = analyze(sampleLease(), SAMPLE_SETTINGS);
  const d = r.calendar.find((c) => c.critical);
  assert.equal(d.date.toISOString().slice(0, 10), "2031-06-03");
  assert.deepEqual(r.calendar.map((c) => +c.date), r.calendar.map((c) => +c.date).sort((a, b) => a - b));
  assert.equal(r.upcoming[0].label, "Lease commencement");
});

test("analyze flags the planted problems", () => {
  const ids = analyze(sampleLease(), SAMPLE_SETTINGS).findings.map((g) => g.id);
  for (const id of ["holdover", "personal-guaranty", "pass-through", "relocation", "assignment-consent", "acceleration", "early-renewal-window", "no-audit", "late-fee", "no-exit"]) assert.ok(ids.includes(id), id);
  assert.equal(analyze(sampleLease(), SAMPLE_SETTINGS).verdict, "negotiate");
});

test("a capped, guarantor-free lease does not raise the high flags", () => {
  const lease = `OFFICE LEASE. The Commencement Date is January 1, 2026 and the Expiration Date is December 31, 2030. Base Rent is $4,000 per month, increasing 2.5% annually. Tenant has two options to renew for three years each at fair market rent, by notice not less than 90 days prior to expiration. Holdover shall be at 125% of Base Rent. Tenant has an early termination option on 180 days notice after year three. Landlord grants quiet enjoyment and an exclusive use for Tenant's business. Assignment consent shall not be unreasonably withheld. Operating expenses are capped at 4% annually and Tenant may audit the books and records.`;
  const r = analyze(lease);
  assert.equal(r.findings.filter((g) => g.severity === "high").length, 0);
  assert.equal(r.terms.holdoverPct, 125);
});

test("input errors are reported, not thrown", () => {
  assert.match(analyze("too short").errors[0], /Paste the full lease/);
  assert.match(analyze(sampleLease(), { monthlyRent: "abc" }).errors[0], /monthly rent/);
  assert.match(analyze(sampleLease(), { escalationPct: "99" }).errors[0], /escalation/);
  assert.match(analyze(sampleLease(), { today: "yesterday" }).errors[0], /date/);
});

test("overrides win over extracted values", () => {
  const r = analyze(sampleLease(), { monthlyRent: "5000", escalationPct: "0" });
  assert.equal(r.terms.monthlyRent, 500000);
  assert.equal(r.schedule[1].monthly, 500000);
});

test("outputs: summary, csv and ics are well-formed", () => {
  const r = analyze(sampleLease(), SAMPLE_SETTINGS);
  assert.match(summaryText(r, SAMPLE_SETTINGS), /KEY DATES[\s\S]*RENT SCHEDULE[\s\S]*RESULT/);
  assert.equal(findingsCsv(r).split("\n").length, r.findings.length + 1);
  const ics = calendarIcs(r, "Bakery");
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, r.calendar.length);
  assert.match(ics, /DTSTART;VALUE=DATE:20310603/);
  assert.match(ics, /^BEGIN:VCALENDAR/);
});
