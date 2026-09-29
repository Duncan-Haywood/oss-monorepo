import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, classifyStatus, normalizeRows, analyze, summaryText, sampleCsv, BUCKETS } from "./calc.mjs";

const HEAD = "Invoice Number,Customer,Invoice Date,Due Date,Amount,Paid Date,Balance\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const ASOF = Date.UTC(2026, 8, 30);

test("status words are classified", () => {
  assert.equal(classifyStatus("Paid"), "paid");
  assert.equal(classifyStatus("Paid in full"), "paid");
  assert.equal(classifyStatus("Unpaid"), "open");
  assert.equal(classifyStatus("Overdue"), "open");
  assert.equal(classifyStatus("Partially paid"), "open");
  assert.equal(classifyStatus("Void"), "void");
  assert.equal(classifyStatus("Draft"), "void");
  assert.equal(classifyStatus("Written off"), "void");
  assert.equal(classifyStatus(""), "unknown");
});

test("header is found; a file with no way to tell paid from open is an error", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2")).error, /No header row/);
  assert.match(normalizeRows(parseCsv("Customer,Invoice Date,Amount\nA,2026-01-01,10")).error, /no Paid Date, Balance or Status/);
  assert.match(normalizeRows([]).error, /empty/);
  assert.equal(load("1,Acme,2026-01-01,2026-01-31,500,2026-02-10,0\n").items.length, 1);
});

test("paid date wins over balance, balance over status; void rows are dropped and counted", () => {
  const n = load("1,A,2026-01-01,2026-01-31,500,2026-02-10,500\n2,A,2026-01-01,2026-01-31,500,,0\n3,A,2026-01-01,2026-01-31,500,,200\n4,A,2026-01-01,2026-01-31,500,,\n");
  assert.equal(n.items[0].state, "paid");
  assert.equal(n.items[1].state, "paid");
  assert.equal(n.items[2].state, "open");
  near(n.items[2].balance, 200);
  // Row 4 has a paid-date column but no paid date and no balance: open for the full amount.
  assert.equal(n.items[3].state, "open");
  const v = load("1,A,2026-01-01,2026-01-31,500,,500,Void\n2,A,2026-01-01,2026-01-31,500,,500,Open\n", HEAD.trim() + ",Status\n");
  assert.equal(v.items.length, 1);
  assert.equal(v.voided, 1);
});

test("unreadable and impossible rows are skipped with a reason", () => {
  const n = load("1,A,not a date,2026-01-31,500,,500\n2,A,2026-01-01,2026-01-31,abc,,500\n3,A,2026-03-01,2026-03-31,500,2026-02-01,0\n4,,2026-01-01,2026-01-31,500,,500\nTotal,,,,1500,,\n5,A,2026-01-01,2026-01-31,500,,500\n");
  assert.equal(n.items.length, 1);
  const why = n.skipped.map((s) => s.reason).join("|");
  assert.match(why, /invoice date/);
  assert.match(why, /amount/);
  assert.match(why, /paid before it was issued/);
  assert.match(why, /no client/);
  assert.match(why, /total row/);
});

test("a missing due date is derived from the terms", () => {
  const n = load("1,A,2026-01-01,,500,,500\n", HEAD, { termsDays: 45 });
  assert.equal(n.items[0].dueDerived, true);
  assert.equal(n.items[0].due, Date.UTC(2026, 0, 1) + 45 * 86400000);
});

test("aging buckets add up to the open total and use days past due", () => {
  const rows = [
    "1,A,2026-09-10,2026-10-10,100,,100", // not yet due
    "2,A,2026-08-20,2026-09-19,200,,200", // 11 late
    "3,A,2026-07-20,2026-08-19,400,,400", // 42 late
    "4,B,2026-06-20,2026-07-20,800,,800", // 72 late
    "5,B,2026-03-01,2026-03-31,1600,,1600", // 183 late
  ];
  const r = analyze(load(rows.join("\n")).items, { asOf: ASOF });
  assert.deepEqual(r.aging.map((b) => b.balance), [100, 200, 400, 800, 1600]);
  near(r.aging.reduce((s, b) => s + b.balance, 0), r.summary.openTotal);
  near(r.summary.openTotal, 3100);
  near(r.summary.overdueTotal, 3000);
  assert.equal(BUCKETS.length, 5);
});

test("days to pay, late share and dso are arithmetic on the rows", () => {
  const rows = [
    "1,A,2026-06-01,2026-07-01,1000,2026-06-21,0", // 20 days, on time
    "2,A,2026-06-01,2026-07-01,1000,2026-07-11,0", // 40 days, 10 late
    "3,A,2026-06-01,2026-07-01,1000,2026-07-21,0", // 50 days, 20 late
    "4,A,2026-09-20,2026-10-20,600,,600",
  ];
  const r = analyze(load(rows.join("\n")).items, { asOf: ASOF });
  const c = r.clients[0];
  assert.equal(c.paidCount, 3);
  near(c.medianDaysToPay, 40);
  near(c.lateShare, 2 / 3);
  near(c.avgDaysLate, 10);
  // Only invoice 4 was issued inside the trailing 90 days: DSO = 600 / 600 * 90.
  near(r.summary.dso, 90);
});

test("payments dated after the as-of date had not happened yet", () => {
  const r = analyze(load("1,A,2026-08-01,2026-08-31,500,2026-10-15,0\n").items, { asOf: ASOF });
  near(r.summary.openTotal, 500);
  assert.equal(r.summary.paidCount, 0);
});

test("habitual late payers need three paid invoices and half of them late by ten days", () => {
  const late = [1, 2, 3, 4].map((i) => `${i},Slow Co,2026-0${i}-01,2026-0${i}-15,500,2026-0${i}-29,0`).join("\n");
  const two = ["9,Few Co,2026-01-01,2026-01-15,500,2026-02-20,0", "10,Few Co,2026-02-01,2026-02-15,500,2026-03-20,0"].join("\n");
  const r = analyze(load(late + "\n" + two).items, { asOf: ASOF });
  const f = r.findings.find((x) => /Habitually late/.test(x.title));
  assert.ok(f);
  assert.match(f.title, /Slow Co/);
  assert.doesNotMatch(f.title, /Few Co/);
});

test("forecast uses the client's own median and never predicts a date already past", () => {
  const hist = [1, 2, 3].map((i) => `${i},A,2026-0${i}-01,2026-0${i}-15,100,2026-0${i}-21,0`).join("\n"); // 20 days each
  // Issued 2026-09-20: expected 2026-10-10, 10 days after as-of.
  // Issued 2026-08-01: expected 2026-08-21, already past.
  const open = "7,A,2026-09-20,2026-10-20,300,,300\n8,A,2026-08-01,2026-08-31,700,,700";
  const r = analyze(load(hist + "\n" + open).items, { asOf: ASOF });
  near(r.forecast.d30, 300);
  near(r.forecast.unforecast, 700);
  near(r.forecast.d30 + r.forecast.d60 + r.forecast.later + r.forecast.unforecast, r.summary.openTotal);
  assert.equal(r.chase.length, 1);
  assert.equal(r.chase[0].id, "8");
});

test("cost of waiting prices dollar-days past due at the typed rate", () => {
  // 1000 dollars, 73 days late, at 10% a year = 1000 * 73 / 365 * 0.10 = 20.
  const r = analyze(load("1,A,2026-06-01,2026-07-01,1000,2026-09-12,0\n").items, { asOf: ASOF, costOfMoneyPct: 10, lateFeePct: 1.5 });
  near(r.summary.costOfWaiting, 20, 0.01);
  near(r.summary.lateFeeWouldBe, (1000 * 73 / 30) * 0.015, 0.01);
});

test("a date range with no invoices is reported, not thrown", () => {
  assert.ok(analyze(load("1,A,2026-06-01,2026-07-01,1000,,1000\n").items, { asOf: Date.UTC(2025, 0, 1) }).invalid);
  assert.ok(analyze(load("1,A,2026-06-01,2026-07-01,1000,,1000\n").items, {}).invalid);
});

test("the example file reads cleanly and its summary names real figures", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.error, undefined);
  assert.equal(n.skipped.length, 0);
  const r = analyze(n.items, { asOf: Date.UTC(2026, 8, 28) });
  assert.ok(r.summary.openTotal > 0);
  assert.match(summaryText(r), /nothing uploaded/);
});

test("day-first files are read day-first", () => {
  const n = load("1,A,31/01/2026,28/02/2026,100,05/03/2026,0\n");
  assert.equal(n.dmy, true);
  assert.equal(n.items[0].issued, Date.UTC(2026, 0, 31));
});
