import { test } from "node:test";
import assert from "node:assert/strict";
import { billedMinutes, billedHours, parseDuration, formatDuration, formatClock, entryAmount, summarize, utilisation, unbilled, toInvoiceDraft, invoiceDraftTotal, entriesToCsv, weekStart, addDays, validateEntry, runningSeconds, toCents } from "./calc.mjs";

const client = { name: "Acme", rate: "100", taxRate: "8" };
const E = (o) => ({ id: "x", date: "2026-10-05", client: "Acme", desc: "Work", seconds: 3600, billable: true, ...o });

test("billing rounds each entry up to the increment", () => {
  assert.equal(billedMinutes(1, 15), 15);
  assert.equal(billedMinutes(900, 15), 15);
  assert.equal(billedMinutes(901, 15), 30);
  assert.equal(billedMinutes(0, 15), 0);
  assert.equal(billedMinutes(359, 6), 6);
  assert.equal(billedMinutes(361, 6), 12);
  assert.equal(billedMinutes(95, 0), 2); // exact mode: nearest minute
});

test("billed hours are two-decimal so invoice qty equals tracker amount", () => {
  assert.equal(billedHours(4000, 0), 1.12); // 67 min
  assert.equal(billedHours(800, 15), 0.25);
  assert.equal(entryAmount(E({ seconds: 4000 }), client, 0), 11200);
});

test("entry rate override beats client rate; non-billable is zero", () => {
  assert.equal(entryAmount(E({ rate: "150" }), client, 0), 15000);
  assert.equal(entryAmount(E({ billable: false }), client, 0), 0);
  assert.equal(entryAmount(E(), {}, 0), 0);
});

test("duration parsing handles common spellings and rejects junk", () => {
  assert.equal(parseDuration("1:30"), 5400);
  assert.equal(parseDuration("1.5"), 5400);
  assert.equal(parseDuration("90m"), 5400);
  assert.equal(parseDuration("1h 20m"), 4800);
  assert.equal(parseDuration("2h"), 7200);
  assert.equal(parseDuration("0:45:30"), 2730);
  assert.equal(parseDuration(""), null);
  assert.equal(parseDuration("abc"), null);
  assert.equal(parseDuration("1:75"), null);
});

test("formatting", () => {
  assert.equal(formatDuration(5400), "1:30");
  assert.equal(formatClock(3725), "1:02:05");
  assert.equal(formatClock(-5), "0:00:00");
});

test("summary totals, unbilled split, date window", () => {
  const entries = [E({ seconds: 3600 }), E({ seconds: 1800, invoiceId: "INV-1" }), E({ client: "Beta", seconds: 3600, rate: "50" }), E({ seconds: 3600, billable: false }), E({ date: "2026-09-01" })];
  const s = summarize(entries, [client, { name: "Beta", rate: "0" }], 0, { from: "2026-10-01", to: "2026-10-31" });
  const acme = s.rows.find((r) => r.client === "Acme");
  assert.equal(acme.seconds, 3600 + 1800 + 3600);
  assert.equal(acme.billableSeconds, 5400);
  assert.equal(acme.amount, 15000);
  assert.equal(acme.unbilledAmount, 10000);
  assert.equal(s.total.amount, 15000 + 5000);
  const u = utilisation(s.total);
  assert.equal(Math.round(u.billableShare * 100), 71);
  assert.equal(u.effectiveRate, Math.round(20000 / (9000 / 3600)));
});

test("unbilled excludes invoiced and non-billable", () => {
  const entries = [E(), E({ invoiceId: "I" }), E({ billable: false }), E({ client: "Beta" })];
  assert.equal(unbilled(entries, "Acme").length, 1);
});

test("invoice draft: per-entry lines, rounding, tax rate and due date", () => {
  const d = toInvoiceDraft([E({ seconds: 800, desc: "Fix nav" }), E({ date: "2026-10-04", seconds: 3600 })], client, { increment: 15, issued: "2026-10-07", number: "INV-0042" });
  assert.equal(d.lines.length, 2);
  assert.equal(d.lines[0].desc, "2026-10-04 · Work");
  assert.deepEqual([d.lines[1].qty, d.lines[1].rate], [0.25, "100.00"]);
  assert.equal(d.taxRate, "8");
  assert.equal(d.due, "2026-11-06");
  assert.equal(invoiceDraftTotal(d), 12500);
  assert.match(d.notes, /2026-10-04 to 2026-10-05/);
});

test("invoice draft grouped by day merges same-rate lines only", () => {
  const d = toInvoiceDraft([E({ seconds: 3600 }), E({ seconds: 1800 }), E({ seconds: 3600, rate: "200" })], client, { group: "day" });
  assert.equal(d.lines.length, 2);
  assert.equal(d.lines[0].qty, 1.5);
  assert.equal(invoiceDraftTotal(d), 15000 + 20000);
});

test("invoice total equals the sum of entry amounts the tracker showed", () => {
  const entries = [E({ seconds: 4000 }), E({ seconds: 777 }), E({ seconds: 12345, rate: "87.5" })];
  for (const inc of [0, 6, 15]) {
    const shown = entries.reduce((s, e) => s + entryAmount(e, client, inc), 0);
    assert.equal(invoiceDraftTotal(toInvoiceDraft(entries, client, { increment: inc })), shown, `increment ${inc}`);
  }
});

test("csv neutralises formula injection and quotes commas", () => {
  const csv = entriesToCsv([E({ desc: '=HYPERLINK("x")' }), E({ desc: "a, b" })], [client], 0);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"a, b"/);
  assert.ok(csv.startsWith("Date,Client,"));
});

test("week starts Monday", () => {
  assert.equal(weekStart("2026-10-07"), "2026-10-05");
  assert.equal(weekStart("2026-10-11"), "2026-10-05");
  assert.equal(weekStart("2026-10-05"), "2026-10-05");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
});

test("validation and running timer", () => {
  assert.equal(validateEntry(E()).length, 0);
  assert.ok(validateEntry(E({ seconds: 0 })).length);
  assert.ok(validateEntry(E({ seconds: 90000 })).some((m) => /timer left running/.test(m)));
  assert.ok(validateEntry(E({ client: "" })).length);
  assert.equal(runningSeconds({ startedAt: 1000 }, 61000), 60);
  assert.equal(runningSeconds(null, 5), 0);
  assert.equal(toCents("$1,234.50"), 123450);
});
