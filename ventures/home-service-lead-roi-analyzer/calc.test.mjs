import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseWhen, detectDelimiter, decodeBuffer, classifyStatus, normalizeRows, analyze, summaryText, sampleCsv } from "./calc.mjs";

const HEAD = "Lead ID,Date,Source,Service,Lead Cost,Status,Job Value,Refund\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("CSV parsing handles quoted fields, delimiters, BOM and UTF-16", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""\n')[1], ["x, y", 'say "hi"']);
  assert.equal(parseCsv("﻿x,y\r\n1,2\r\n")[0][0], "x");
  assert.equal(detectDelimiter("a;b\n1;2"), ";");
  assert.equal(parseNumber("$1,234.56"), 1234.56);
  assert.equal(parseNumber("(50)"), -50);
  assert.ok(Number.isNaN(parseNumber("abc")));
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."a,b"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16.buffer), "a,b");
  assert.ok(parseWhen("06/15/2026"));
  assert.equal(parseWhen("31/12/2026", true).t, Date.UTC(2026, 11, 31));
});

test("status words are classified", () => {
  assert.equal(classifyStatus("Booked"), "won");
  assert.equal(classifyStatus("Hired"), "won");
  assert.equal(classifyStatus("Lost - went with someone else"), "lost");
  assert.equal(classifyStatus("Spam"), "bad");
  assert.equal(classifyStatus("Wrong number"), "bad");
  assert.equal(classifyStatus("Duplicate"), "bad");
  assert.equal(classifyStatus(""), "open");
  assert.equal(classifyStatus("quoted"), "open");
});

test("header is found and a missing cost, date or outcome column is an error", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2")).error, /No header row/);
  assert.match(normalizeRows(parseCsv("Date,Source,Lead Cost\n2026-01-01,A,10")).error, /no Status column and no Job Value/);
  assert.match(normalizeRows([]).error, /empty/);
  assert.equal(load("L1,2026-01-01,Thumbtack,Drain,30,Booked,900,\n").items.length, 1);
});

test("cost per lead, close rate, cost per booked job and profit are arithmetic on the rows", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(`L${i},2026-03-0${(i % 9) + 1},Thumbtack,Drain,40,${i < 2 ? "Booked" : "Lost"},${i < 2 ? 1000 : ""},`);
  const r = analyze(load(rows.join("\n")).items, { marginPct: 40 });
  const g = r.bySource[0];
  assert.equal(g.leads, 10);
  near(g.spend, 400);
  near(g.costPerLead, 40);
  assert.equal(g.won, 2);
  near(g.closeRate, 0.2);
  near(g.costPerWon, 200);
  near(g.revenue, 2000);
  near(g.profit, 2000 * 0.4 - 400);
  near(g.breakEvenClose, 40 / (1000 * 0.4));
});

test("refunds reduce spend and cannot exceed the charge", () => {
  const t = load("L1,2026-01-01,Angi,Drain,50,Spam,,50\nL2,2026-01-02,Angi,Drain,50,Lost,,999\n");
  assert.equal(t.items[0].net, 0);
  assert.equal(t.items[1].net, 0);
  assert.equal(t.items[1].credit, 50);
});

test("rows are reported when skipped, and total rows are ignored", () => {
  const t = load("L1,not a date,A,S,10,Lost,,\nL2,2026-01-01,,S,10,Lost,,\nL3,2026-01-01,A,S,abc,Lost,,\nTotal,,,,30,,,\nL4,2026-01-01,A,S,10,Lost,,\n");
  assert.equal(t.items.length, 1);
  assert.deepEqual(t.skipped.map((x) => x.reason), ["date not readable", "no source", "cost not readable", "total row"]);
});

test("without a Status column a job value means won", () => {
  const t = normalizeRows(parseCsv("Date,Source,Cost,Job Value\n2026-01-01,A,20,500\n2026-01-02,A,20,\n"));
  assert.equal(t.statusMode, "revenue");
  assert.deepEqual(t.items.map((x) => x.outcome), ["won", "open"]);
});

test("a job value on a row whose status says lost is ignored and flagged", () => {
  const t = load("L1,2026-01-01,A,S,10,Lost,500,\n");
  assert.equal(t.items[0].revenue, null);
  const r = analyze(t.items);
  assert.ok(r.findings.some((f) => /carry a job value but a status that is not won/.test(f.title)));
});

test("a source that loses money after lead cost is named, once it has enough leads", () => {
  const mk = (src, n, won) => Array.from({ length: n }, (_, i) => `${src}${i},2026-02-01,${src},S,50,${i < won ? "Booked" : "Lost"},${i < won ? 300 : ""},`).join("\n");
  const r = analyze(load([mk("Bad", 10, 1), mk("Good", 10, 5), mk("Tiny", 2, 0)].join("\n")).items, { marginPct: 35 });
  assert.deepEqual(r.losing.map((g) => g.label), ["Bad"]);
  assert.ok(!r.findings.some((f) => /Tiny/.test(f.title)));
  assert.equal(r.bySource.find((g) => g.label === "Tiny").leads, 2);
});

test("paid leads that never booked are named only when outcomes are mostly known", () => {
  const lost = Array.from({ length: 6 }, (_, i) => `a${i},2026-02-01,Ads,S,20,Lost,,`).join("\n");
  const open = Array.from({ length: 6 }, (_, i) => `b${i},2026-02-01,Fresh,S,20,Open,,`).join("\n");
  const r = analyze(load(lost + "\n" + open).items);
  assert.deepEqual(r.zeroWon.map((g) => g.label), ["Ads"]);
});

test("free sources are never called money-losers", () => {
  const rows = Array.from({ length: 8 }, (_, i) => `r${i},2026-02-01,Referral,S,0,Lost,,`).join("\n");
  const r = analyze(load(rows).items);
  assert.equal(r.losing.length, 0);
  assert.equal(r.zeroWon.length, 0);
});

test("charged bad leads and repeat charges are found", () => {
  const r = analyze(load("Bob,2026-01-01,T,S,30,Spam,,\nBob,2026-01-09,T,S,30,Lost,,\nAnn,2026-01-02,T,S,30,Wrong number,,30\n").items);
  assert.equal(r.summary.badUncredited, 1);
  near(r.summary.badSpend, 30);
  assert.equal(r.summary.dupes, 1);
});

test("won jobs without a value are counted and flagged", () => {
  const r = analyze(load("L1,2026-01-01,A,S,10,Booked,,\nL2,2026-01-02,A,S,10,Booked,400,\n").items);
  assert.equal(r.summary.wonNoValue, 1);
  assert.ok(r.findings.some((f) => /no job value/.test(f.title)));
});

test("source, service and month rows each reconcile to the totals", () => {
  const t = normalizeRows(parseCsv(sampleCsv()));
  const r = analyze(t.items);
  for (const key of ["bySource", "byService", "byMonth"]) {
    near(r[key].reduce((s, g) => s + g.spend, 0), r.summary.spend, 0.02);
    near(r[key].reduce((s, g) => s + g.revenue, 0), r.summary.revenue, 0.02);
    assert.equal(r[key].reduce((s, g) => s + g.leads, 0), r.summary.leads);
    assert.equal(r[key].reduce((s, g) => s + g.won, 0), r.summary.won);
  }
});

test("date range filters and an empty range is reported", () => {
  const t = load("L1,2026-01-01,A,S,10,Lost,,\nL2,2026-03-01,A,S,10,Lost,,\n");
  assert.equal(analyze(t.items, { from: Date.UTC(2026, 2, 1) }).summary.leads, 1);
  assert.match(analyze(t.items, { from: Date.UTC(2027, 0, 1) }).invalid, /No leads fall/);
});

test("the sample loads with no skipped rows and produces findings and a summary", () => {
  const t = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(t.skipped.length, 0);
  const r = analyze(t.items);
  assert.ok(r.findings.length >= 2);
  assert.match(summaryText(r), /Lead sources .* to .*: 90 leads/);
});
