import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration, formatDuration, formatClock, roundSeconds, billableHours, entrySeconds, rateFor, entryAmount, summarize, weekDays, weekStart, invoiceLines, toInvoiceDraft, nextInvoiceNumber, warnings, entriesToCsv, utilisation, rangeFor, inRange, clientOf, toCents, effectiveRate, timesheetRows } from "./calc.mjs";

const projects = [{ id: "p1", name: "Site redesign", client: "Acme", rate: "100" }, { id: "p2", name: "Retainer", client: "Beta", rate: "" }];
const S = { rounding: "none", defaultRate: "50" };
const T0 = new Date(2026, 9, 5, 9, 0, 0).getTime(); // Mon 5 Oct 2026, local
const e = (o) => ({ id: "x" + Math.random(), project: "Site redesign", projectId: "p1", start: T0, end: T0 + 3600e3, billable: true, ...o });

test("parseDuration reads the ways people type time", () => {
  assert.equal(parseDuration("1:30"), 5400);
  assert.equal(parseDuration("1h 30m"), 5400);
  assert.equal(parseDuration("90m"), 5400);
  assert.equal(parseDuration("1.5"), 5400);
  assert.equal(parseDuration("1,5"), 5400);
  assert.equal(parseDuration("45m"), 2700);
  assert.equal(parseDuration("2h"), 7200);
  assert.equal(parseDuration("0:00:30"), 30);
  assert.equal(parseDuration(""), null);
  assert.equal(parseDuration("abc"), null);
  assert.equal(parseDuration("1:75"), null);
});

test("formatting", () => {
  assert.equal(formatDuration(5400), "1:30");
  assert.equal(formatDuration(59), "0:00");
  assert.equal(formatClock(3725), "1:02:05");
  assert.equal(formatDuration(-5), "0:00");
});

test("rounding goes up to the step and never rounds a real entry to zero", () => {
  assert.equal(roundSeconds(1, "15"), 900);
  assert.equal(roundSeconds(900, "15"), 900);
  assert.equal(roundSeconds(901, "15"), 1800);
  assert.equal(roundSeconds(0, "15"), 0);
  assert.equal(roundSeconds(1234, "none"), 1234);
  assert.equal(billableHours(4 * 60, "6"), 0.1);
  assert.equal(billableHours(3600 + 1, "60"), 2);
});

test("entrySeconds: finished, running and manual", () => {
  assert.equal(entrySeconds(e()), 3600);
  assert.equal(entrySeconds(e({ end: null }), T0 + 90e3), 90);
  assert.equal(entrySeconds({ manualSec: 1800 }), 1800);
  assert.equal(entrySeconds({ start: T0, end: T0 - 5000 }), 0);
});

test("rate precedence: entry, project, default", () => {
  assert.equal(rateFor(e({ rate: "120" }), projects, "50"), 12000);
  assert.equal(rateFor(e(), projects, "50"), 10000);
  assert.equal(rateFor(e({ project: "Retainer", projectId: "p2" }), projects, "50"), 5000);
  assert.equal(rateFor(e({ project: "Nothing", projectId: "zz" }), projects, ""), 0);
});

test("amount uses rounded hours and skips non-billable", () => {
  const ent = e({ end: T0 + 20 * 60e3 });
  assert.equal(entryAmount(ent, projects, { rounding: "15", defaultRate: "" }), 5000);
  assert.equal(entryAmount(ent, projects, { rounding: "none", defaultRate: "" }), 3300); // 0.33 h
  assert.equal(entryAmount(e({ billable: false }), projects, S), 0);
});

test("summarize groups by client and project and tracks unbilled", () => {
  const list = [e(), e({ billed: true }), e({ project: "Retainer", projectId: "p2", end: T0 + 10800e3 })];
  const s = summarize(list, projects, S);
  assert.equal(s.seconds, 3600 + 3600 + 10800);
  assert.equal(s.amount, 10000 + 10000 + 15000);
  assert.equal(s.unbilledAmount, 25000);
  assert.deepEqual(s.clients.map((c) => c.client), ["Beta", "Acme"]);
  assert.equal(s.clients[1].projects[0].project, "Site redesign");
});

test("weekDays buckets by local day and weekStart is Monday", () => {
  const start = weekStart(T0 + 3 * 864e5);
  assert.equal(start, new Date(2026, 9, 5).getTime());
  const days = weekDays([e(), e({ start: T0 + 864e5, end: T0 + 864e5 + 1800e3 })], start);
  assert.equal(days[0].seconds, 3600);
  assert.equal(days[1].seconds, 1800);
  assert.equal(days.length, 7);
});

test("ranges include and exclude the right entries", () => {
  const wk = rangeFor("week", T0);
  assert.ok(inRange(e(), wk));
  assert.ok(!inRange(e({ start: T0 - 864e5 }), wk));
  assert.ok(inRange(e({ start: -1e12 }), rangeFor("all")));
});

test("invoiceLines merges per project and rate, skips billed, running and non-billable", () => {
  const list = [
    e({ desc: "Wireframes" }), e({ desc: "Wireframes", end: T0 + 1800e3 }), e({ desc: "Handoff" }),
    e({ billed: true }), e({ billable: false }), e({ end: null }),
    e({ rate: "150", desc: "Rush" }),
  ];
  const lines = invoiceLines(list, projects, S);
  assert.equal(lines.length, 2);
  const std = lines.find((l) => l.rate === "100.00");
  assert.equal(std.qty, "2.5");
  assert.equal(std.desc, "Site redesign — Wireframes; Handoff");
  assert.equal(std.amount, 25000);
  assert.equal(std.ids.length, 3);
  assert.equal(lines.find((l) => l.rate === "150.00").amount, 15000);
});

test("invoiceLines applies rounding per entry so the invoice matches the report", () => {
  const list = [e({ end: T0 + 10 * 60e3 }), e({ end: T0 + 10 * 60e3 })];
  const lines = invoiceLines(list, projects, { rounding: "15", defaultRate: "" });
  assert.equal(lines[0].qty, "0.5");
  assert.equal(lines[0].amount, summarize(list, projects, { rounding: "15", defaultRate: "" }).amount);
});

test("invoice draft has the fields Invoice Maker reads and a collision-free number", () => {
  assert.equal(nextInvoiceNumber([{ number: "INV-0007" }, { number: "EST-9" }]), "INV-0008");
  assert.equal(nextInvoiceNumber([]), "INV-0001");
  const draft = toInvoiceDraft("Acme", [{ desc: "x", qty: "2", rate: "100.00", taxable: true, ids: ["a"] }], { number: "INV-0001", issued: "2026-10-07", profile: { fromName: "Me" } });
  assert.equal(draft.due, "2026-11-06");
  assert.equal(draft.clientName, "Acme");
  assert.equal(draft.fromName, "Me");
  assert.deepEqual(Object.keys(draft.lines[0]), ["desc", "qty", "rate", "taxable"]);
  assert.equal(toInvoiceDraft("(no client)", [], { number: "INV-2" }).clientName, "");
});

test("warnings flag a forgotten timer and an implausible entry", () => {
  assert.equal(warnings([e({ end: null })], T0 + 13 * 3600e3).length, 1);
  assert.equal(warnings([e({ end: null })], T0 + 3600e3).length, 0);
  assert.equal(warnings([e({ end: T0 + 17 * 3600e3 })]).length, 1);
});

test("utilisation and clientOf and toCents", () => {
  assert.equal(utilisation([e(), e({ billable: false })]), 0.5);
  assert.equal(utilisation([]), null);
  assert.equal(clientOf(e(), projects), "Acme");
  assert.equal(clientOf(e({ client: "Own" }), projects), "Own");
  assert.equal(toCents("$1,234.50"), 123450);
  assert.equal(toCents("-5"), 0);
});

test("CSV neutralises formulas and quotes commas", () => {
  const csv = entriesToCsv([e({ desc: '=HYPERLINK("x"), hi' })], projects, S);
  assert.match(csv, /"'=HYPERLINK\(""x""\), hi"/);
  assert.match(csv.split("\n")[0], /^Date,Client,Project/);
  assert.match(csv.split("\n")[1], /,1\.00,1\.00,100\.00,100\.00,yes,no$/);
});

test("effective rate counts non-billable time against the hour", () => {
  assert.equal(effectiveRate({ seconds: 7200, amount: 10000 }), 5000);
  assert.equal(effectiveRate({ seconds: 0, amount: 0 }), 0);
});

test("timesheet rows are oldest first, follow rounding, and skip running timers", () => {
  const day = (d) => new Date(`2026-10-${d}T10:00:00`).getTime();
  const projects = [{ id: "p1", name: "Site", client: "Acme", rate: "100" }];
  const entries = [
    { id: "b", project: "Site", projectId: "p1", start: day("06"), manualSec: 600 },
    { id: "a", project: "Site", projectId: "p1", start: day("05"), manualSec: 3600, desc: "build" },
    { id: "n", project: "Site", projectId: "p1", start: day("05"), manualSec: 1800, billable: false },
    { id: "r", project: "Site", projectId: "p1", start: day("07") },
    { id: "o", project: "Other", start: day("05"), manualSec: 60 },
  ];
  const t = timesheetRows(entries, projects, { rounding: "15", defaultRate: "" }, { client: "Acme" });
  assert.deepEqual(t.rows.map((r) => [r.date, r.seconds, r.billSeconds, r.amount]), [["2026-10-05", 3600, 3600, 10000], ["2026-10-05", 1800, 0, 0], ["2026-10-06", 600, 900, 2500]]);
  assert.equal(t.totals.amount, 12500);
  assert.equal(t.totals.billSeconds, 4500);
});
