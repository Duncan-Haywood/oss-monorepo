// Dogfood: run every venture's .ics generator through this checker and
// require zero RFC 5545 errors. Inputs mirror each venture's own tests; dates
// and DTSTAMPs are pinned wherever the generator accepts them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate, unfold } from "./calc.mjs";

import { taxCalendar, toIcs as bookkeeperIcs } from "../ai-bookkeeper/calendar.mjs";
import * as babysit from "../babysitting-business-kit/engine.mjs";
import * as policy from "../business-insurance-policy-reader/calc.mjs";
import { buildPlan as cardPlan, toIcs as cardIcs } from "../card-bonus-planner/plan.mjs";
import * as coi from "../coi-expiry-gap-checker/calc.mjs";
import * as lease from "../commercial-lease-abstract-reader/calc.mjs";
import { toIcs as mandateIcs } from "../einvoice-preflight/mandate-calendar.mjs";
import { summarize as grantSummarize, icsCalendar as grantIcs } from "../grant-deadline-tracker/calc.mjs";
import { deadlines as appealDeadlines, calendar as appealCalendar } from "../insurance-denial-appeal-builder/engine.mjs";
import { buildCalendar as invoiceCalendar } from "../invoice-payment-terms-calculator/calendar.mjs";
import { reminderSchedule, reminderIcs } from "../invoice-payment-terms-calculator/reminders.mjs";
import { normalizeApp, toIcs as jobIcs } from "../job-application-tracker/tracker.mjs";
import * as collections from "../late-invoice-collections-kit/calc.mjs";
import * as league from "../league-schedule-generator/calc.mjs";
import { readDivisionsSpec, buildDivisions, divisionsIcs } from "../league-schedule-generator/divisions.mjs";
import { extract as meetingExtract, actionsIcs, SAMPLE as MEETING_SAMPLE } from "../meeting-action-items/extract.mjs";
import * as patent from "../patent-maintenance-fee-planner/calc.mjs";
import { computeSchedule as qtrSchedule, icsCalendar as qtrIcs } from "../quarterly-estimated-tax-calendar/calc.mjs";
import * as saas from "../saas-renewal-planner/engine.mjs";
import { buildInvite } from "../sales-agent/invite.mjs";
import { findSlots } from "../sales-agent/slots.mjs";
import * as cadence from "../sales-cadence-builder/calc.mjs";
import { exchangeIcs } from "../secret-santa-draw/calc.mjs";
import { dates as severanceDates, calendarIcs as severanceIcs } from "../severance-package-calculator/calc.mjs";
import * as roster from "../shift-roster-builder/calc.mjs";
import { buildDays, toIcs as rotationIcs } from "../shift-rotation-schedule-generator/rotation.mjs";
import { buildIcs as slotIcs } from "../slot-keeper/slot.mjs";
import * as residency from "../state-residency-day-counter/calc.mjs";
import * as str from "../str-turnover-scheduler/calc.mjs";
import * as subs from "../subscription-audit-from-statement/calc.mjs";
import { buildSeason, planGarden, tasksIcs } from "../vegetable-garden-planting-calendar/calc.mjs";
import * as vendor from "../vendor-contract-clause-reader/calc.mjs";
import * as volunteer from "../volunteer-shift-scheduler/calc.mjs";
import * as wedding from "../wedding-day-timeline-builder/calc.mjs";

function clean(ics) {
  assert.equal(typeof ics, "string");
  assert.match(ics, /BEGIN:VEVENT/, "generator produced no events; the input is too thin to test");
  const { findings } = validate(ics);
  const errors = findings.filter((f) => f.severity === "error");
  assert.deepEqual(errors, []);
  // RFC 5545 3.1: lines SHOULD be folded at 75 octets; some importers truncate longer ones.
  const long = findings.filter((f) => f.code === "fold");
  assert.deepEqual(long, [], "unfolded line over 75 octets: fold the generator's output");
  // RFC 5545 3.3.11: ";" and "," in TEXT must be backslash-escaped. In JS, "\;" is just ";",
  // so an escaper replacing /;/g with that string silently does nothing (eleven generators, 2026-11-12).
  const bare = unfold(ics).map((l) => l.value)
    .filter((l) => /^(SUMMARY|DESCRIPTION|LOCATION|COMMENT)[;:]/.test(l))
    .map((l) => l.slice(l.indexOf(":") + 1))
    .filter((v) => /(^|[^\\])(\\\\)*[;,]/.test(v));
  assert.deepEqual(bare, [], "unescaped ';' or ',' in a TEXT value");
}

test("ai-bookkeeper", () => {
  clean(bookkeeperIcs(taxCalendar(2026, { state: "CA", estimates: [123456, 123456, 123456, 123456] }), { name: "2026, taxes" }));
});

test("babysitting-business-kit", () => {
  const desk = babysit.emptyDesk();
  desk.families = [{ id: "f", name: "Test family", kids: [{ name: "Kid", allergies: "nuts" }] }];
  desk.bookings = [
    { id: "r", familyId: "f", date: "2026-11-02", start: "15:00", end: "18:00", repeatWeeks: 3 },
    { id: "n", familyId: "f", date: "2026-11-07", start: "22:00", end: "01:00" },
  ];
  clean(babysit.toICS(desk));
});

test("business-insurance-policy-reader", () => {
  clean(policy.calendarIcs(policy.analyze(policy.samplePolicy(), policy.SAMPLE_SETTINGS), "Acme"));
});

test("card-bonus-planner", () => {
  const p = cardPlan({ wishlist: [{ name: "A", issuer: "citi", bonusCash: 1, minSpend: 100, windowDays: 90 }], monthlySpend: 1000, todayIso: "2026-10-09" });
  clean(cardIcs(p, "20261009T000000Z"));
});

test("coi-expiry-gap-checker", () => {
  const r = coi.check(coi.sampleList(), {}, coi.parseDate(coi.SAMPLE_AS_OF));
  clean(coi.expiryCalendar(r, "2026-10-05T00:00:00Z"));
});

test("commercial-lease-abstract-reader", () => {
  clean(lease.calendarIcs(lease.analyze(lease.sampleLease(), lease.SAMPLE_SETTINGS), "Bakery"));
});

test("einvoice-preflight", () => {
  clean(mandateIcs([{ date: "2027-01-01", country: "A", page: "a.html", status: "Planned", note: "x, y; z" }]));
});

test("grant-deadline-tracker", () => {
  const food = { name: "Food, Inc.", funder: 'A "quoted" funder', status: "awarded", award: 1000, spent: 250, nextDate: "2026-09-15", nextType: "Report" };
  clean(grantIcs(grantSummarize([food], "2026-08-25"), new Date("2026-08-25T12:00:00Z")));
});

test("insurance-denial-appeal-builder", () => {
  const d = appealDeadlines({ plan: "commercial", received: "2026-09-14", today: "2026-10-02" });
  clean(appealCalendar(d, { claim: "C-1", stamp: "20261002T000000Z" }));
});

test("invoice-payment-terms-calculator (payment calendar)", () => {
  clean(invoiceCalendar({ invoiceDate: "2026-08-24", dueDate: "2026-09-23", settlementDate: "2026-10-01", graceDays: 10, amount: 1200, label: "Acme" }));
});

test("invoice-payment-terms-calculator (reminders)", () => {
  const s = reminderSchedule({ invoiceDate: "2026-08-24", amount: 1200, invoiceNumber: "A,B;C" });
  clean(reminderIcs(s, { invoiceNumber: "A,B;C", now: new Date("2026-08-24T10:00:00Z") }));
});

test("job-application-tracker", () => {
  const mk = (o) => normalizeApp({ company: "Acme", role: "Dev", applied: "2026-10-01", status: "applied", ...o });
  clean(jobIcs([mk({ company: "Acme, Inc", id: "x1" }), mk({ status: "rejected", id: "x2" })], "20261001T000000Z"));
});

test("late-invoice-collections-kit", () => {
  const i = collections.sampleInputs("2026-09-29");
  clean(collections.icsText(i, collections.buildPlan(i), "2026-09-29"));
});

test("league-schedule-generator", () => {
  const spec = { teams: ["A;1", "B,2", "C", "D"], double: false, start: league.parseDate("2026-10-06"), weekdays: [2], skipDays: [], blackouts: {}, courts: [], times: ["18:00"], seed: 1, minutes: 60 };
  const s = league.buildSchedule(spec);
  clean(league.scheduleIcs(s, null, "20261001T000000Z"));
  clean(league.scheduleIcs(s, 2, "20261001T000000Z", null, 30));
});

test("league-schedule-generator (divisions)", () => {
  const example = JSON.parse(readFileSync(new URL("../league-schedule-generator/example-divisions.json", import.meta.url), "utf8"));
  const { spec, errors } = readDivisionsSpec(example);
  assert.deepEqual(errors, []);
  clean(divisionsIcs(buildDivisions(spec), { stamp: "20261029T000000Z", alarmMinutes: 30 }));
});

test("meeting-action-items", () => {
  const r = meetingExtract(MEETING_SAMPLE, { date: "2026-10-19", attendees: ["Ana", "Ben", "Cleo", "Dev"] });
  clean(actionsIcs(r, "20261019T000000Z"));
});

test("patent-maintenance-fee-planner", () => {
  const r = patent.planPortfolio({ asOf: "2026-10-12", patents: "open, 2023-05-02, small\nlate, 2023-02-07, large\ngone, 2023-05-02, large, drop", fees: patent.DEFAULT_FEE_TEXT, warnDays: 14 });
  clean(patent.toIcs(r));
});

test("quarterly-estimated-tax-calendar", () => {
  const schedule = qtrSchedule({ taxYear: 2026, priorYearTax: 8000, priorYearAGI: 60000, asOfDate: "2026-01-01" });
  clean(qtrIcs(schedule, new Date("2026-01-01T00:00:00Z")));
});

test("saas-renewal-planner", () => {
  const fixture = readFileSync(new URL("../saas-renewal-planner/fixtures/renewals.csv", import.meta.url), "utf8");
  clean(saas.toIcs(saas.plan(saas.parseRenewals(fixture), { asOf: "2026-10-02" })));
});

test("sales-agent", () => {
  const today = "2026-11-06";
  for (const reply of ["Tuesday at 2pm works", "Thursday 10:30am is good"]) {
    const [slot] = findSlots(reply, today);
    const r = buildInvite({ email: "dana@acme.example", name: "Dana Ruiz", company: "Acme", slot, today, offer: { product: "RouteKit" } });
    assert.ok(r.ok, r.why);
    clean(r.ics);
  }
});

test("sales-cadence-builder", () => {
  const plan = cadence.buildPlan(cadence.SAMPLE_PROSPECTS, cadence.SAMPLE_SENDER, { start: "2026-10-26", sellerTz: "America/Denver" });
  clean(cadence.toIcs(plan.tasks, { now: "2026-10-20T00:00:00Z" }));
});

test("secret-santa-draw", () => {
  clean(exchangeIcs({ title: "Swap, 2026", date: "2026-12-31", stamp: "20261001T000000Z", giftee: "Ann" }));
});

test("severance-package-calculator", () => {
  const r = severanceDates({ age: 50, releaseReceived: "2026-11-06", separationDate: "2026-11-20" });
  clean(severanceIcs(r.rows));
});

test("shift-roster-builder", () => {
  const staff = roster.parseStaff("Ana, 15, 40, 0, any\nBen, 12, 40, 0, any");
  const slots = roster.parseShifts("Fri, 22, 6, 1, night\nMon, 9, 17, 1, day");
  assert.deepEqual(staff.errors, []);
  assert.deepEqual(slots.errors, []);
  const r = roster.buildRoster(staff.staff, slots.slots);
  clean(roster.rosterIcs(r, "2026-10-12", null, { stable: true }));
  clean(roster.rosterIcs(r, "2026-10-12", r.assignments[0].person, { stable: true }));
});

test("shift-rotation-schedule-generator", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  clean(rotationIcs(buildDays("4on4off", "C", "2026-10-12", "2026-10-12", 3), { patternKey: "4on4off", crewName: "C", now }));
  clean(rotationIcs(buildDays("24-48", "A", "2026-10-12", "2026-10-12", 3), { patternKey: "24-48", crewName: "A", now }));
});

test("slot-keeper", () => {
  const base = { uid: "b1@slot", start: Date.UTC(2026, 9, 14, 13), end: Date.UTC(2026, 9, 14, 13, 30), summary: "Intro; with, Ann", description: "Line1\nLine2 " + "x".repeat(200), location: "https://meet.example/abc", organizer: { name: 'Host "H"', email: "h@x.test" }, attendee: { name: "Ann", email: "a@x.test" }, now: Date.UTC(2026, 9, 1) };
  clean(slotIcs(base));
  clean(slotIcs({ ...base, method: "CANCEL", sequence: 1 }));
});

test("state-residency-day-counter", () => {
  const Y = 2025;
  const spec = { year: Y, stays: residency.parseStays("2025-01-01 to 2025-03-31 NY", Y).stays, abode: { NY: true }, overrides: {}, asOf: residency.toDay(Y, 3, 31) };
  const { ics, count } = residency.deadlinesIcs(residency.analyze(spec));
  assert.ok(count > 0);
  clean(ics);
});

test("str-turnover-scheduler", () => {
  clean(str.icsExport(str.analyze(str.sampleBookings(), str.DEFAULT_PROPS, { cleaners: 2 })));
});

test("subscription-audit-from-statement", () => {
  const a = subs.analyze(subs.normalizeStatement(subs.parseCsv(subs.sampleCsv())).rows);
  clean(subs.renewalsIcs(a, { leadDays: 5, stamp: "20260101T000000Z" }));
});

test("vegetable-garden-planting-calendar", () => {
  const g = planGarden(["tomato", "summersquash"], buildSeason({ lastFrost: "2026-05-01", firstFrost: "2026-10-10" }));
  clean(tasksIcs(g, "20260101T000000Z"));
});

test("vendor-contract-clause-reader", () => {
  clean(vendor.calendarIcs(vendor.analyze(vendor.sampleAgreement(), vendor.SAMPLE_SETTINGS), "Acme"));
});

test("volunteer-shift-scheduler", () => {
  const { spec, errors } = volunteer.readSpec(volunteer.sampleFields());
  assert.deepEqual(errors, []);
  const r = volunteer.buildRoster(spec);
  clean(volunteer.rosterIcs(r, null, "20261001T000000Z"));
  clean(volunteer.rosterIcs(r, 0, "20261001T000000Z"));
});

test("wedding-day-timeline-builder", () => {
  const f = wedding.sampleFields(2026);
  const c = wedding.CITIES.find((x) => x.name === f.city);
  const n = wedding.normalize({ ...f, lat: c.lat, lon: c.lon, offset: wedding.tzOffsetHours(f.date, c.tz) });
  assert.ok(n.ok, (n.errors || []).join());
  clean(wedding.timelineIcs(wedding.buildDay(n.p), n.p, "all", "20261001T000000Z"));
});

// Source lint for the same footgun outside the generators listed above (vCard, CSV, any new
// calendar): in JS source, a replacement string of one backslash then ";" or "," is just
// ";" or ",", so an escaper using it is a no-op. Write two backslashes.
test("no venture escapes TEXT with a no-op backslash string", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = new URL("..", import.meta.url).pathname;
  const noop = /\.replace\([^)]*,\s*(["'`])\\[;,]\1\s*\)/;
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(mjs|js|cjs|html)$/.test(name)) {
        readFileSync(p, "utf8").split("\n").forEach((line, i) => { if (noop.test(line)) hits.push(`${p.slice(root.length)}:${i + 1}`); });
      }
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
});
