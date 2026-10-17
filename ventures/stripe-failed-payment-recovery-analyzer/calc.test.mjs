import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeRows, buildCases, analyze, categoryOf, normalizeReason, sampleCsv } from "./calc.mjs";

const HEAD = "id,Created (UTC),Amount,Currency,Status,Customer ID,Invoice ID,Decline Reason\n";
const load = (body) => normalizeRows(parseCsv(HEAD + body));

test("parseCsv handles quotes, CRLF and BOM", () => {
  assert.deepEqual(parseCsv('﻿a,"b,c"\r\n"d""e",f\r\n'), [["a", "b,c"], ['d"e', "f"]]);
});

test("decline reasons normalise and map to an action", () => {
  assert.equal(normalizeReason("Insufficient funds"), "insufficient_funds");
  assert.equal(categoryOf("expired_card"), "update-card");
  assert.equal(categoryOf("insufficient_funds"), "retry-later");
  assert.equal(categoryOf("stolen_card"), "do-not-retry");
  assert.equal(categoryOf("something_new"), "unknown");
});

test("a failure followed by a success on the same invoice is recovered, with days", () => {
  const n = load("1,2026-01-01 09:00:00,50.00,USD,Failed,c1,in1,insufficient_funds\n2,2026-01-04 09:00:00,50.00,USD,Succeeded,c1,in1,\n");
  const [c] = buildCases(n.events, 14);
  assert.equal(c.status, "recovered");
  assert.equal(c.days, 3);
  assert.equal(c.category, "retry-later");
});

test("no success inside the window is lost; a young failure is open, not lost", () => {
  const n = load([
    "1,2026-01-01 09:00:00,50.00,USD,Failed,c1,in1,expired_card",
    "2,2026-01-01 09:00:00,10.00,USD,Failed,c2,in2,expired_card",
    "3,2026-01-20 09:00:00,10.00,USD,Succeeded,c3,in3,",
    "4,2026-01-25 09:00:00,10.00,USD,Failed,c4,in4,generic_decline",
    "5,2026-01-26 09:00:00,10.00,USD,Succeeded,c5,in5,",
  ].join("\n"));
  const cases = buildCases(n.events, 14);
  assert.deepEqual(cases.map((c) => c.status).sort(), ["lost", "lost", "open"]);
});

test("a success after the window does not count as recovery", () => {
  const n = load("1,2026-01-01 09:00:00,50.00,USD,Failed,c1,in1,insufficient_funds\n2,2026-02-05 09:00:00,50.00,USD,Succeeded,c1,in1,\n");
  assert.equal(buildCases(n.events, 14)[0].status, "lost");
});

test("without an invoice column the customer ties the retry to the failure", () => {
  const n = normalizeRows(parseCsv("Created (UTC),Amount,Status,Customer ID\n2026-01-01,20,Failed,c1\n2026-01-03,20,Succeeded,c1\n"));
  assert.equal(buildCases(n.events, 14)[0].status, "recovered");
});

test("multiple attempts before the recovery are one case", () => {
  const n = load([
    "1,2026-01-01 09:00:00,50.00,USD,Failed,c1,in1,insufficient_funds",
    "2,2026-01-03 09:00:00,50.00,USD,Failed,c1,in1,insufficient_funds",
    "3,2026-01-06 09:00:00,50.00,USD,Succeeded,c1,in1,",
  ].join("\n"));
  const cases = buildCases(n.events, 14);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].attempts, 2);
  assert.equal(cases[0].days, 5);
});

test("unusable rows are reported with line and reason, refunds ignored, other currencies excluded", () => {
  const n = load([
    "1,not-a-date,50.00,USD,Failed,c1,in1,x",
    "2,2026-01-01,abc,USD,Failed,c1,in1,x",
    "3,2026-01-01,5.00,USD,Refunded,c1,in1,",
    "4,2026-01-01,5.00,EUR,Failed,c9,in9,x",
    "5,2026-01-01,5.00,USD,Succeeded,c2,in2,",
    "6,2026-01-02,5.00,USD,Succeeded,c3,in3,",
  ].join("\n"));
  assert.deepEqual(n.skipped.map((s) => [s.line, s.reason]), [[2, "unreadable date"], [3, "unreadable amount"]]);
  assert.equal(n.ignored, 1);
  assert.equal(n.otherCurrency, 1);
  assert.equal(n.events.length, 2);
});

test("missing required columns give a specific error", () => {
  assert.match(normalizeRows(parseCsv("Amount,Status,Customer ID\n1,Failed,c\n")).error, /date/);
  assert.match(normalizeRows(parseCsv("Created (UTC),Status,Customer ID\n2026-01-01,Failed,c\n")).error, /amount/);
  assert.match(normalizeRows(parseCsv("Created (UTC),Amount,Customer ID\n2026-01-01,1,c\n")).error, /status/);
  assert.match(normalizeRows(parseCsv("Created (UTC),Amount,Status\n2026-01-01,1,Failed\n")).error, /customer or invoice/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("a file with no failures says so instead of reporting a perfect rate", () => {
  const r = analyze(load("1,2026-01-01,5.00,USD,Succeeded,c1,in1,\n").events);
  assert.match(r.invalid, /no failed payments/i);
});

test("amounts reconcile: recovered + lost = at risk, per bucket and in total", () => {
  const r = analyze(normalizeRows(parseCsv(sampleCsv())).events);
  const s = r.summary;
  assert.ok(Math.abs(s.recoveredAmount + s.lostAmount - s.atRisk) < 1e-6);
  assert.equal(s.recovered + s.lost, s.cases);
  for (const list of [r.byCategory, r.byReason, r.byMonth]) {
    assert.equal(list.reduce((t, b) => t + b.cases, 0), s.cases);
    assert.ok(Math.abs(list.reduce((t, b) => t + b.lostAmount, 0) - s.lostAmount) < 1e-6);
  }
});

test("the sample yields findings that name the action by category", () => {
  const r = analyze(normalizeRows(parseCsv(sampleCsv())).events);
  const titles = r.findings.map((f) => f.title).join("|");
  assert.match(titles, /never recovered/);
  assert.match(titles, /card that needs updating/);
  assert.ok(r.whatIf.extraPerYear > 0);
});
