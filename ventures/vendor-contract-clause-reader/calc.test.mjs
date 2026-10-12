import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, extract, costSchedule, sampleAgreement, SAMPLE_SETTINGS, summaryText, calendarIcs, findingsCsv, parseDate, iso, addMonths, parseMoney } from "./calc.mjs";

const run = (s = SAMPLE_SETTINGS) => analyze(sampleAgreement(), s);
const ids = (r) => r.findings.map((g) => g.id);

test("extracts the commercial terms with the sentence each came from", () => {
  const { x, src } = extract(sampleAgreement());
  assert.equal(iso(x.effective), "2027-03-01");
  assert.equal(x.termMonths, 36);
  assert.equal(iso(x.expiration), "2030-02-28");
  assert.equal(x.autoRenew, true);
  assert.equal(x.renewalTermMonths, 12);
  assert.equal(x.noticeDays, 90);
  assert.equal(x.annualFee, 2400000);
  assert.equal(x.upliftPct, 8);
  assert.equal(x.paymentDays, 15);
  assert.equal(x.liabilityCap.months, 3);
  assert.match(src.noticeDays, /90 days/);
});

test("the non-renewal deadline is the critical calendar entry, counted back from term end", () => {
  const r = run();
  const c = r.calendar.find((e) => e.critical);
  assert.equal(iso(c.date), "2029-11-30");
  assert.match(c.label, /90 days/);
});

test("price steps compound each anniversary and a missed deadline commits the renewal term", () => {
  const s = costSchedule({ annualFee: 2400000, upliftPct: 8, termMonths: 36, renewalTermMonths: 12 });
  assert.deepEqual(s.map((y) => y.annual), [2400000, 2592000, 2799360, 3023309]);
  assert.equal(s[3].renewal, true);
  const r = run();
  assert.equal(r.renewalTotal, 3023309);
  assert.equal(r.initialTotal, 2400000 + 2592000 + 2799360);
});

test("the sample trips the high-severity clauses", () => {
  const r = run();
  for (const id of ["long-notice", "list-price", "unilateral-change", "no-exit", "cap-no-carveouts", "one-way-indemnity"]) assert.ok(ids(r).includes(id), id);
  assert.equal(r.verdict, "negotiate");
  assert.equal(r.findings[0].severity, "high");
});

test("a fair, mutual agreement raises few flags", () => {
  const fair = `MASTER SUBSCRIPTION AGREEMENT effective as of January 1, 2027 for an initial term of 12 months. Fees are $6,000 per year, payable net 45 days. Either party may terminate for convenience on 30 days notice with a pro rata refund of prepaid fees. Fees may increase on renewal by no more than 3% with 90 days written notice. Vendor's liability shall not exceed twice the fees paid in the preceding 12 months, except for gross negligence, data breach, confidentiality breach and indemnification obligations. Each party shall defend and indemnify the other against third-party claims. Vendor shall execute a data processing addendum, maintain SOC 2 controls, and delete customer data within 30 days after termination. Availability shall be at least 99.95%.`;
  const r = analyze(fair, { today: "2027-02-01" });
  assert.notEqual(r.verdict, "negotiate");
  assert.ok(!ids(r).includes("long-notice"));
  assert.ok(!ids(r).includes("no-exit"));
});

test("auto-renewal with no stated notice window is called out as high", () => {
  const t = "SERVICES AGREEMENT. This Agreement is effective as of June 1, 2027 for an initial term of 12 months and shall automatically renew for additional 12 month terms. Fees are $1,000 per month. Customer may cancel by contacting Vendor. ".repeat(2);
  const r = analyze(t, {});
  assert.ok(ids(r).includes("renew-no-notice"));
  assert.equal(r.terms.annualFee, 1200000);
});

test("overrides replace what was read and are labelled as entered by the user", () => {
  const r = analyze(sampleAgreement(), { annualFee: "10000", upliftPct: "3", effective: "2028-01-01" });
  assert.equal(r.terms.annualFee, 1000000);
  assert.equal(r.sources.annualFee, "Entered by you.");
  assert.equal(iso(r.terms.expiration), "2030-12-31");
  assert.equal(r.schedule[1].annual, 1030000);
});

test("bad input returns an error, never a result", () => {
  assert.ok(analyze("too short", {}).errors.length);
  assert.ok(analyze(sampleAgreement(), { today: "soon" }).errors.length);
  assert.ok(analyze(sampleAgreement(), { annualFee: "abc" }).errors.length);
  assert.ok(analyze(sampleAgreement(), { upliftPct: "90" }).errors.length);
  assert.ok(analyze(sampleAgreement(), { effective: "13/45/2027" }).errors.length);
});

test("exports: summary, ics with a 30-day alarm on the deadline, csv escapes quotes", () => {
  const r = run();
  assert.match(summaryText(r, SAMPLE_SETTINGS), /Committed if the renewal deadline is missed: \$30,233\.09/);
  assert.match(summaryText(r, SAMPLE_SETTINGS), /not legal advice/);
  const ics = calendarIcs(r, "Acme");
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /TRIGGER:-P30D/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, r.calendar.length);
  assert.match(findingsCsv(r), /^severity,finding,why,ask_for\n"high"/);
});

test("date helpers", () => {
  assert.equal(iso(parseDate("March 1st, 2027")), "2027-03-01");
  assert.equal(parseDate("2027-02-30"), null);
  assert.equal(iso(addMonths(parseDate("2027-01-31"), 1)), "2027-02-28");
  assert.equal(parseMoney("1,200.50"), 120050);
  assert.equal(parseMoney("x"), null);
});
