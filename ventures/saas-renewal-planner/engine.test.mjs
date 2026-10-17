import test from "node:test";
import assert from "node:assert/strict";
import { parseRenewals, parseDate, plan, summarize, emailDraft, toIcs, money } from "./engine.mjs";
import { readFileSync } from "node:fs";

const fixture = readFileSync(new URL("./fixtures/renewals.csv", import.meta.url), "utf8");
const AS_OF = "2026-10-02";
const row = (p, v) => p.rows.find((r) => r.vendor === v);

test("parseDate accepts ISO and US dates and rejects impossible ones", () => {
  assert.equal(parseDate("2026-11-30"), Date.UTC(2026, 10, 30));
  assert.equal(parseDate("11/30/2026"), Date.UTC(2026, 10, 30));
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("soon"), null);
});

test("parse reports row-specific errors", () => {
  assert.match(parseRenewals("A,100,2026-01-01,30,yes,5,6,0").errors[0], /seats used \(6\)/);
  assert.match(parseRenewals("A,100,2026-01-01,30,maybe,5,4,0").errors[0], /auto-renews/);
  assert.match(parseRenewals("A,-5,2026-01-01,30,yes,5,4,0").errors[0], /annual cost/);
  assert.match(parseRenewals("A,100,01-01,30,yes,5,4,0").errors[0], /renewal date/);
  assert.match(parseRenewals("A,100,2026-01-01,30").errors[0], /expected vendor/);
  assert.equal(parseRenewals(fixture).errors.length, 0);
  assert.equal(parseRenewals(fixture).renewals.length, 8);
});

test("notice deadline, status and savings for a right-sizable vendor", () => {
  const p = plan(parseRenewals(fixture), { asOf: AS_OF });
  const s = row(p, "Salesforce");
  assert.equal(s.noticeDeadline, "2026-10-16");
  assert.equal(s.daysToDeadline, 14);
  assert.equal(s.status, "urgent");
  assert.equal(s.seatsNeeded, 57); // ceil(51 * 1.1)
  assert.equal(money(s.doNothing), "$104,640.00"); // 96,000 * 1.09
  assert.equal(money(s.floorTarget), "$68,400.00"); // 57 * 1200
  assert.equal(money(s.floorSavings), "$36,240.00");
  assert.equal(money(s.stretchTarget), "$61,560.00");
  assert.equal(money(s.stretchSavings), "$43,080.00");
});

test("a passed notice date on an auto-renewal is locked-in; a non-auto-renewal lapses", () => {
  const p = plan(parseRenewals(fixture), { asOf: AS_OF });
  assert.equal(row(p, "Figma").status, "locked-in");
  assert.equal(row(p, "Asana").status, "lapses");
  assert.ok(p.findings.some((f) => f.rule === "locked-in" && f.vendor === "Figma"));
});

test("no-seat products count only uplift; seats needed never exceed seats paid", () => {
  const p = plan(parseRenewals(fixture), { asOf: AS_OF });
  const d = row(p, "Datadog");
  assert.equal(d.seatWaste, 0);
  assert.equal(money(d.floorSavings), "$5,400.00");
  const q = plan(parseRenewals("A,1000,2027-01-01,30,yes,10,10,0"), { asOf: AS_OF, bufferPct: 50 });
  assert.equal(q.rows[0].seatsNeeded, 10);
  assert.equal(q.rows[0].floorSavings, 0);
});

test("ordering: urgent by days left, then upcoming by savings, then the rest", () => {
  const p = plan(parseRenewals(fixture), { asOf: AS_OF });
  assert.deepEqual(p.rows.map((r) => r.vendor), ["Salesforce", "Slack", "Datadog", "Notion", "Figma", "Zoom", "Asana", "DocuSign"]);
});

test("a renewal already past is excluded from savings totals", () => {
  const p = plan(parseRenewals("A,1000,2026-09-01,30,yes,10,5,10\nB,1000,2027-03-01,30,yes,10,5,10"), { asOf: AS_OF });
  assert.equal(row(p, "A").status, "renewed");
  assert.equal(p.totals.floorSavings, row(p, "B").floorSavings);
});

test("totals and summary agree with the rows", () => {
  const p = plan(parseRenewals(fixture), { asOf: AS_OF });
  assert.equal(money(p.totals.spend), "$228,600.00");
  assert.equal(p.totals.urgent, 2);
  assert.equal(p.totals.lockedIn, 3);
  assert.equal(money(p.totals.floorSavings), "$65,070.00");
  assert.equal(money(p.totals.stretchSavings), "$83,250.00");
  assert.equal(summarize(p).status, "urgent");
  assert.equal(summarize(plan({ renewals: [] }, { asOf: AS_OF })).status, "none");
});

test("invalid options throw", () => {
  assert.throws(() => plan(parseRenewals(fixture), { asOf: AS_OF, askPct: 95 }), /askPct/);
  assert.throws(() => plan(parseRenewals(fixture), { asOf: "nope" }), /asOf/);
});

test("email draft carries the numbers the plan computed", () => {
  const p = plan(parseRenewals(fixture), { asOf: AS_OF });
  const e = emailDraft(row(p, "Salesforce"), { from: "Pat" });
  for (const s of ["51 of our 80", "57 seats", "9%", "$68,400.00", "2026-10-16", "Pat"]) assert.ok(e.includes(s), s);
});

test("ics lists only future notice and start dates of auto-renewals", () => {
  const ics = toIcs(plan(parseRenewals(fixture), { asOf: AS_OF }));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261016"));
  assert.ok(!ics.includes("Figma"), "locked-in notice date is in the past");
  assert.ok(!ics.includes("Asana"), "non-auto-renewal needs no notice");
  assert.ok(!ics.includes("DTSTART;VALUE=DATE:20260916"), "start date already passed");
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
});
