import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, extract, samplePolicy, SAMPLE_SETTINGS, summaryText, calendarIcs, findingsCsv, parseDate, iso, parseMoney } from "./calc.mjs";

const run = (s = SAMPLE_SETTINGS) => analyze(samplePolicy(), s);
const ids = (r) => r.findings.map((g) => g.id);

test("extracts limits, trigger and dates with the sentence each came from", () => {
  const { x, src } = extract(samplePolicy());
  assert.equal(iso(x.effective), "2027-03-01");
  assert.equal(iso(x.expiration), "2028-03-01");
  assert.equal(x.trigger, "claims-made");
  assert.equal(iso(x.retroDate), "2026-03-01");
  assert.equal(x.perOccurrence, 50000000);
  assert.equal(x.aggregate, 100000000);
  assert.equal(x.deductible, 2500000);
  assert.equal(x.premium, 640000);
  assert.equal(x.cancelNoticeDays, 10);
  assert.equal(x.erpDays, 60);
  assert.equal(x.waitingHours, 72);
  assert.equal(x.coinsurancePct, 90);
  assert.match(src.perOccurrence, /each occurrence/);
});

test("limits below the contract requirement are high severity and shown as failing", () => {
  const r = run();
  assert.deepEqual(r.requirement.map((q) => q.ok), [false, false]);
  assert.ok(ids(r).includes("short-occ") && ids(r).includes("short-agg"));
  assert.equal(r.verdict, "gaps");
});

test("limits that meet the requirement raise no shortfall finding", () => {
  const r = run({ ...SAMPLE_SETTINGS, requiredOccurrence: "500000", requiredAggregate: "1000000" });
  assert.deepEqual(r.requirement.map((q) => q.ok), [true, true]);
  assert.ok(!ids(r).some((i) => i.startsWith("short-o") || i.startsWith("short-a")));
});

test("the sample trips the exclusion and defense-cost rules", () => {
  const r = run();
  for (const id of ["defense-inside", "prof-excluded", "subs-excluded", "claims-made", "contractual", "acv", "coinsurance", "waiting", "short-cancel", "pollution", "deductible"]) assert.ok(ids(r).includes(id), id);
  assert.equal(r.findings[0].severity, "high");
});

test("calendar: renewal planning, bind date and tail-coverage deadline for claims-made", () => {
  const r = run();
  assert.equal(iso(r.calendar.find((c) => c.planning).date), "2027-12-02");
  const crit = r.calendar.filter((c) => c.critical).map((c) => iso(c.date));
  assert.deepEqual(crit, ["2028-01-31", "2028-04-30"]);
  assert.equal(r.upcoming.length, 3);
});

test("a clean occurrence policy raises few flags", () => {
  const t = `COMMERCIAL GENERAL LIABILITY. Policy period: January 1, 2027 to January 1, 2028. Written on an occurrence basis. Each occurrence $2,000,000; general aggregate $4,000,000. Deductible $1,000. Premium $3,200. Defense costs are paid in addition to the limit. Blanket additional insured, primary and non-contributory, and waiver of subrogation endorsements are attached when required by written contract. Cancellation requires 30 days written notice.`;
  const r = analyze(t, { requiredOccurrence: "1000000", requiredAggregate: "2000000" });
  assert.notEqual(r.verdict, "gaps");
  assert.ok(!ids(r).includes("defense-inside"));
  assert.ok(!ids(r).includes("claims-made"));
});

test("overrides are labelled as entered by the user", () => {
  const r = analyze(samplePolicy(), { expiration: "2028-06-30", premium: "9000" });
  assert.equal(iso(r.terms.expiration), "2028-06-30");
  assert.equal(r.sources.premium, "Entered by you.");
  assert.equal(r.terms.premium, 900000);
});

test("bad input returns an error, never a result", () => {
  assert.ok(analyze("too short", {}).errors.length);
  assert.ok(analyze(samplePolicy(), { today: "soon" }).errors.length);
  assert.ok(analyze(samplePolicy(), { requiredOccurrence: "lots" }).errors.length);
  assert.ok(analyze(samplePolicy(), { premium: "abc" }).errors.length);
  assert.ok(analyze(samplePolicy(), { expiration: "13/45/2027" }).errors.length);
});

test("exports: summary, ics with a 14-day alarm, csv escapes quotes", () => {
  const r = run();
  assert.match(summaryText(r, SAMPLE_SETTINGS), /BELOW/);
  assert.match(summaryText(r, SAMPLE_SETTINGS), /not insurance, legal or coverage advice/);
  const ics = calendarIcs(r, "Acme");
  assert.match(ics, /TRIGGER:-P14D/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, r.calendar.length);
  assert.match(findingsCsv(r), /^severity,finding,why,ask_broker\n"high"/);
});

test("date and money helpers", () => {
  assert.equal(iso(parseDate("March 1st, 2027")), "2027-03-01");
  assert.equal(parseDate("2027-02-30"), null);
  assert.equal(parseMoney("1,200.50"), 120050);
  assert.equal(parseMoney("x"), null);
});
