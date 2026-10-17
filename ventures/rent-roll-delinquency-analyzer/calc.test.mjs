import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseWhen, detectDelimiter, normalizeRows, analyze, summaryText, sampleCsv } from "./calc.mjs";

const HEAD = "Unit,Due Date,Amount Due,Amount Paid,Date Paid\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const AS_OF = Date.UTC(2026, 8, 15);

test("CSV parsing handles quotes, delimiters and numbers", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""\n')[1], ["x, y", 'say "hi"']);
  assert.equal(detectDelimiter("a;b\n1;2"), ";");
  assert.equal(parseNumber("$1,450.00"), 1450);
  assert.equal(parseWhen("31/08/2026", true).t, Date.UTC(2026, 7, 31));
});

test("header is found; missing columns and empty files are errors", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2")).error, /No header row/);
  assert.match(normalizeRows(parseCsv("Unit,Due Date,Amount Due\n1A,2026-01-01,900")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
  assert.equal(load("1A,2026-08-01,1500,1500,2026-08-02\n").items.length, 1);
});

test("aliases: tenant, rent, payment date", () => {
  const n = normalizeRows(parseCsv("Tenant,Date,Rent,Payment,Payment Date\nSmith,2026-08-01,1000,1000,2026-08-03"));
  assert.equal(n.items.length, 1);
  assert.equal(n.items[0].paidOn, Date.UTC(2026, 7, 3));
});

test("unreadable and total rows are skipped with line numbers", () => {
  const n = load("1A,not a date,900,900,\n,2026-08-01,900,900,\n1B,2026-08-01,abc,0,\nTotal,,1800,900,\n1C,2026-08-01,900,900,2026-08-01\n");
  assert.equal(n.items.length, 1);
  assert.deepEqual(n.skipped.map((x) => x.line), [2, 3, 4, 5]);
});

test("owed, aging buckets and collected rate are arithmetic on the rows", () => {
  const n = load([
    "1A,2026-09-01,1000,1000,2026-09-01",
    "1B,2026-08-01,1000,0,",       // 45 days as of Sep 15
    "1C,2026-07-01,1000,400,2026-07-05", // 600 owed, 76 days
    "1D,2026-05-01,1000,0,",       // 137 days
    "1E,2026-09-10,1000,0,",       // 5 days
  ].join("\n"));
  const r = analyze(n.items, { asOf: AS_OF });
  near(r.summary.billed, 5000);
  near(r.summary.collected, 1400);
  near(r.summary.owed, 3600);
  near(r.summary.collectedRate, 0.28);
  const b = Object.fromEntries(r.aging.map((x) => [x.id, x.amount]));
  assert.deepEqual(b, { d1_30: 1000, d31_60: 1000, d61_90: 600, d90p: 1000 });
  assert.equal(r.summary.agedTotal, 3600);
});

test("the unit rows and the month rows add up to the totals", () => {
  const r = analyze(load(sampleCsvBody()).items, { asOf: AS_OF });
  near(r.byUnit.reduce((s, u) => s + u.owed, 0), r.summary.owed);
  near(r.byUnit.reduce((s, u) => s + u.billed, 0), r.summary.billed);
  near(r.byMonth.reduce((s, m) => s + m.owed, 0), r.summary.owed);
  near(r.byMonth.reduce((s, m) => s + m.collected, 0), r.summary.collected);
  near(r.aging.reduce((s, b) => s + b.amount, 0) + r.current.amount, r.summary.owed);
});
function sampleCsvBody() { return sampleCsv().split("\n").slice(1).join("\n"); }

test("a charge due after the as-of date is not owed, and a later payment had not happened", () => {
  const n = load("1A,2026-10-01,1000,0,\n1B,2026-09-01,1000,1000,2026-09-20\n");
  const r = analyze(n.items, { asOf: AS_OF });
  assert.equal(r.summary.charges, 1);
  near(r.summary.owed, 1000);
  assert.equal(r.withOwed[0].label, "1B");
  assert.equal(r.withOwed[0].oldestDays, 14);
});

test("days late counts from due date to payment; grace decides what is late", () => {
  const n = load("1A,2026-08-01,1000,1000,2026-08-06\n1A,2026-09-01,1000,1000,2026-09-07\n");
  const g5 = analyze(n.items, { asOf: AS_OF, graceDays: 5 });
  assert.equal(g5.rows.filter((x) => x.late).length, 1);
  const g0 = analyze(n.items, { asOf: AS_OF, graceDays: 0 });
  assert.equal(g0.rows.filter((x) => x.late).length, 2);
  near(g5.summary.onTimeRate, 0.5);
});

test("habitually late needs three late charges and half of them", () => {
  const rows = [];
  for (let m = 1; m <= 4; m++) rows.push(`2A,2026-0${m}-01,1000,1000,2026-0${m}-12`);
  for (let m = 1; m <= 4; m++) rows.push(`2B,2026-0${m}-01,1000,1000,2026-0${m}-02`);
  rows.push("2C,2026-01-01,1000,1000,2026-01-20", "2C,2026-02-01,1000,1000,2026-02-20");
  const r = analyze(load(rows.join("\n")).items, { asOf: AS_OF });
  assert.deepEqual(r.chronic.map((u) => u.label), ["2A"]);
});

test("late fee total is reported only when a fee is typed, and is an upper bound", () => {
  const n = load("1A,2026-08-01,1000,1000,2026-08-20\n1B,2026-08-01,1000,0,\n");
  assert.ok(!analyze(n.items, { asOf: AS_OF }).findings.some((f) => /worth/.test(f.title)));
  const r = analyze(n.items, { asOf: AS_OF, lateFee: 50 });
  assert.equal(r.summary.lateFeesAllowed, 100);
  assert.match(r.findings.find((f) => /worth/.test(f.title)).detail, /local law/);
});

test("partial payments, overpayments and missing payment dates are reported", () => {
  const r = analyze(load("1A,2026-08-01,1000,500,2026-08-03\n1B,2026-08-01,1000,1200,2026-08-03\n").items, { asOf: AS_OF });
  assert.equal(r.summary.partials, 1);
  near(r.summary.overpaid, 200);
  near(r.summary.collected, 1500);
  const u = analyze(load("1A,2026-08-01,1000,1000,\n").items, { asOf: AS_OF });
  assert.ok(u.findings.some((f) => /No payment dates/.test(f.title)));
});

test("nothing owed gives a clean finding; empty range is invalid", () => {
  const r = analyze(load("1A,2026-08-01,1000,1000,2026-08-01\n").items, { asOf: AS_OF });
  assert.ok(r.findings.some((f) => /Nothing is owed/.test(f.title)));
  assert.match(analyze(load("1A,2026-08-01,1000,0,\n").items, { asOf: Date.UTC(2026, 0, 1) }).invalid, /No charges/);
});

test("the example loads, names its own trouble units, and the summary is plain text", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.ok(n.items.length >= 30);
  const r = analyze(n.items, { asOf: AS_OF, lateFee: 50 });
  assert.ok(r.summary.owed > 0);
  assert.ok(r.chronic.length >= 1);
  const t = summaryText(r);
  assert.match(t, /nothing uploaded/);
  assert.match(t, /not legal advice/);
});
