import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyPlan, normalisePlan, checkPlan, dueDates, cyclePlan, summary, plansToIcs, planToMarkdown,
  addYears, addDays, daysBetween, isIsoDate, localToday, foldLine, icsText, QUOTES,
} from "./affirm.mjs";

const plan = (o) => normalisePlan({ ...emptyPlan(), ...o });
const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, r]));

test("date helpers: real dates only, 29 Feb lands a day early, never late", () => {
  assert.equal(isIsoDate("2026-02-28"), true);
  for (const bad of ["2026-02-29", "2026-13-01", "26-01-01", "", null, 7]) assert.equal(isIsoDate(bad), false, String(bad));
  assert.equal(addYears("2028-02-29", 1), "2029-02-28");
  assert.equal(addYears("2026-11-26", 3), "2029-11-26");
  assert.equal(addDays("2026-11-26", 180), "2027-05-25");
  assert.equal(daysBetween("2026-11-26", "2027-05-25"), 180);
  assert.equal(localToday(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});

test("Level 1: yearly self-assessment and yearly affirmation, never Conditional", () => {
  const p = plan({ level: "l1", status: "conditional", statusDate: "2026-03-10", lastAffirmed: "2026-03-12", closeoutDate: "2026-04-01" });
  assert.equal(p.status, "final", "Level 1 has no Conditional status");
  assert.equal(p.closeoutDate, "");
  const d = byKey(dueDates(p, "2026-11-26"));
  assert.deepEqual(Object.keys(d).sort(), ["annual_affirmation", "assessment"]);
  assert.equal(d.assessment.due, "2027-03-10");
  assert.equal(d.annual_affirmation.due, "2027-03-12");
  assert.match(d.assessment.basis, /170\.15\(a\)\(1\)/);
});

test("Level 2 (Self) Conditional: closeout 180 days out, assessment three years from the status date", () => {
  const p = plan({ level: "l2self", status: "conditional", statusDate: "2026-09-01", lastAffirmed: "2026-09-02" });
  const rows = dueDates(p, "2026-11-26");
  assert.equal(rows[0].key, "closeout", "soonest first");
  const d = byKey(rows);
  assert.equal(d.closeout.due, "2027-02-28");
  assert.equal(d.closeout.daysLeft, 94);
  assert.equal(d.closeout.state, "ok");
  assert.match(d.closeout.basis, /170\.16\(a\)\(1\)\(ii\)\(B\)/);
  assert.equal(d.assessment.due, "2029-09-01");
  assert.equal(d.annual_affirmation.due, "2027-09-02");
});

test("a recorded closeout does not restart the three years, and needs its own affirmation", () => {
  const p = plan({ level: "l2self", status: "conditional", statusDate: "2026-06-01", lastAffirmed: "2026-06-03", closeoutDate: "2026-10-15" });
  let d = byKey(dueDates(p, "2026-11-26"));
  assert.equal(d.closeout, undefined);
  assert.equal(d.assessment.due, "2029-06-01");
  assert.equal(d.closeout_affirmation.state, "overdue");
  assert.equal(d.annual_affirmation.due, "2027-06-03");
  d = byKey(dueDates({ ...p, closeoutAffirmed: "yes" }, "2026-11-26"));
  assert.equal(d.closeout_affirmation, undefined);
  assert.equal(d.annual_affirmation.due, "2027-10-15", "the year runs from the closeout's affirmation");
});

test("Level 2 (C3PAO): eMASS closeout wording and the 170.17 basis", () => {
  const d = byKey(dueDates(plan({ level: "l2c3pao", status: "conditional", statusDate: "2026-11-01", lastAffirmed: "2026-11-01" }), "2026-11-26"));
  assert.match(d.closeout.label, /C3PAO.*eMASS/);
  assert.match(d.closeout.basis, /170\.17/);
  assert.match(d.assessment.label, /certification assessment by a C3PAO/);
  assert.equal(d.assessment.due, "2029-11-01");
});

test("states: due soon inside 60 days, overdue the day after", () => {
  const p = plan({ level: "l1", statusDate: "2025-12-20", lastAffirmed: "2025-12-20" });
  assert.equal(byKey(dueDates(p, "2026-11-26")).assessment.state, "due_soon");
  assert.equal(byKey(dueDates(p, "2025-12-21")).assessment.state, "ok");
  const late = byKey(dueDates(p, "2026-12-21"));
  assert.equal(late.assessment.state, "overdue");
  assert.equal(late.assessment.daysLeft, -1);
  assert.match(summary(p, "2026-12-21"), /^2 dates passed/);
  assert.match(summary(p, "2026-11-26"), /^Next: Annual affirmation in SPRS by 2026-12-20, in 24 days\.$/);
});

test("no affirmation recorded: flagged, and the year counts from the status date", () => {
  const d = byKey(dueDates(plan({ level: "l2self", statusDate: "2026-10-01" }), "2026-11-26"));
  assert.equal(d.first_affirmation.state, "overdue");
  assert.equal(d.annual_affirmation.due, "2027-10-01");
});

test("errors stop the dates; warnings do not", () => {
  assert.deepEqual(dueDates(plan({}), "2026-11-26"), []);
  assert.match(summary(plan({}), "2026-11-26"), /Enter the CMMC Status Date/);
  assert.equal(checkPlan(plan({ statusDate: "2027-01-01" }), "2026-11-26").errors.length, 1);
  assert.equal(checkPlan(plan({ statusDate: "2026-01-01", lastAffirmed: "2026-12-01" }), "2026-11-26").errors.length, 1);
  const before = checkPlan(plan({ statusDate: "2026-05-01", lastAffirmed: "2026-04-01" }), "2026-11-26");
  assert.equal(before.errors.length, 0);
  assert.match(before.warnings[0], /before the CMMC Status Date/);
  const slow = plan({ status: "conditional", statusDate: "2026-01-01", closeoutDate: "2026-08-01", lastAffirmed: "2026-01-02" });
  assert.match(checkPlan(slow, "2026-11-26").warnings[0], /more than 180 days/);
  assert.equal(checkPlan(plan({ status: "conditional", statusDate: "2026-05-01", closeoutDate: "2026-04-01" }), "2026-11-26").errors.length, 1);
});

test("normalisePlan drops junk and caps text", () => {
  const p = normalisePlan({ level: "l9", status: "maybe", statusDate: "2026-02-30", company: "x".repeat(500), cage: 7, extra: "y" });
  assert.equal(p.level, "l2self");
  assert.equal(p.status, "final");
  assert.equal(p.statusDate, "");
  assert.equal(p.company.length, 200);
  assert.equal(p.cage, "");
  assert.equal("extra" in p, false);
  assert.deepEqual(normalisePlan(null), emptyPlan());
});

test("cycle plan: annual affirmations up to the next assessment, then the assessment", () => {
  const rows = cyclePlan(plan({ level: "l2self", statusDate: "2026-03-01", lastAffirmed: "2026-03-05" }), "2026-11-26");
  assert.deepEqual(rows.map((r) => r.date), ["2027-03-05", "2028-03-05", "2029-03-01"]);
  assert.match(rows.at(-1).what, /Next self-assessment/);
  const l1 = cyclePlan(plan({ level: "l1", statusDate: "2026-03-01", lastAffirmed: "2026-03-01" }), "2026-11-26");
  assert.deepEqual(l1.map((r) => r.date), ["2027-03-01"], "the yearly affirmation and assessment share the day");
});

test("calendar file: valid lines, one event per future date, alarms 60 and 7 days ahead", () => {
  const p = plan({ level: "l2self", status: "conditional", statusDate: "2026-09-01", lastAffirmed: "2026-09-02", company: "Acme, Inc; \"Shop\"" });
  const ics = plansToIcs(p, "2026-11-26", new Date("2026-11-26T12:00:00Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.doesNotMatch(ics.replace(/\r\n/g, ""), /\n/, "CRLF only");
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const starts = [...ics.matchAll(/DTSTART;VALUE=DATE:(\d+)/g)].map((m) => m[1]);
  assert.deepEqual(starts.sort(), ["20270228", "20270902", "20280902", "20290901"]);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 8);
  assert.match(ics, /TRIGGER;RELATED=START:-P60D/);
  assert.match(ics, /TRIGGER;RELATED=START:-P7D/);
  assert.match(ics.replace(/\r\n /g, ""), /Acme\\, Inc\\; "Shop"/);
  const uids = [...ics.matchAll(/UID:(\S+)/g)].map((m) => m[1]);
  assert.equal(new Set(uids).size, uids.length);
  assert.equal(plansToIcs(p, "2026-11-26", new Date("2026-11-26T12:00:00Z")), ics, "deterministic");
});

test("foldLine never splits a UTF-8 sequence; icsText escapes", () => {
  const line = "DESCRIPTION:" + "é".repeat(80);
  const folded = foldLine(line);
  for (const l of folded.split("\r\n")) assert.ok(new TextEncoder().encode(l).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), line);
  assert.equal(icsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
});

test("Markdown record escapes what the user typed", () => {
  const md = planToMarkdown(plan({ level: "l1", statusDate: "2026-03-01", lastAffirmed: "2026-03-01", company: "<img src=x onerror=alert(1)>", official: "J. *Doe*" }), "2026-11-26");
  assert.doesNotMatch(md, /(?<!\\)<img/);
  assert.match(md, /\\<img/);
  assert.match(md, /J\. \\\*Doe\\\*/);
  assert.match(md, /\| 2027-03-01 \|/);
});

test("quotes keep the regulation's key words", () => {
  assert.match(QUOTES.affirm, /after every assessment, including POA&M closeout, and annually thereafter/);
  assert.match(QUOTES.l1, /on an annual basis/);
  assert.match(QUOTES.l2self, /every three years/);
  assert.match(QUOTES.closeout, /^within 180 days/);
});
