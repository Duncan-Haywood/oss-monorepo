import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseWhen, detectDelimiter, decodeBuffer, classifyStatus, classifyFrequency, normalizeRows, analyze, sampleCsv } from "./calc.mjs";

const HEAD = "Name,Email,Patron Status,Lifetime $,Currently Paying $,Tier,Pledge,Patronage Since Date,Last Charge Date,Last Charge Status,Charge Frequency\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const row = (n, status, tier, pledge, since, last, lastStatus = "Successful", freq = "Monthly") =>
  `${n},${n}@x.invalid,${status},0,${status === "Active patron" ? pledge : 0},${tier},$${pledge},${since},${last},${lastStatus},${freq}\n`;

test("CSV parsing handles quoted fields, embedded commas, quotes and newlines", () => {
  const rows = parseCsv('a,b\n"Smith, Jo","say ""hi"""\n"line\nbreak",3\n');
  assert.deepEqual(rows[1], ["Smith, Jo", 'say "hi"']);
  assert.deepEqual(rows[2], ["line\nbreak", "3"]);
  assert.equal(parseCsv("﻿x,y\r\n1,2\r\n")[0][0], "x");
});

test("money, dates, delimiters and UTF-16 are read", () => {
  assert.equal(parseNumber("$1,234.56"), 1234.56);
  assert.equal(parseNumber("$5.00 USD"), 5);
  assert.equal(parseNumber("1.234,50", true), 1234.5);
  assert.equal(parseNumber(""), 0);
  assert.ok(Number.isNaN(parseNumber("n/a")));
  assert.equal(parseWhen("2026-06-03"), Date.UTC(2026, 5, 3));
  assert.equal(parseWhen("06/03/2026"), Date.UTC(2026, 5, 3));
  assert.equal(parseWhen("03/06/2026", true), Date.UTC(2026, 5, 3));
  assert.equal(parseWhen("02/30/2026"), null);
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."Name"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16.buffer), "Name");
});

test("status and frequency wording is classified", () => {
  assert.equal(classifyStatus("Active patron"), "active");
  assert.equal(classifyStatus("Declined patron"), "declined");
  assert.equal(classifyStatus("Former patron"), "former");
  assert.equal(classifyStatus("Free member"), "other");
  assert.equal(classifyFrequency("Monthly").perCharge, 1);
  assert.equal(classifyFrequency("Annual").perCharge, 12);
  assert.equal(classifyFrequency("Per creation").kind, "creation");
});

test("columns are found by alias and unknown ones are ignored", () => {
  const n = load("Ann,a@x.invalid,Active patron,30,5,Insider,$5.00,2026-01-01,2026-08-01,Successful,Monthly\n");
  assert.equal(n.error, undefined);
  assert.equal(n.members[0].status, "active");
  assert.equal(n.members[0].monthly, 5);
  const alt = normalizeRows(parseCsv("Patron Name,Status,Amount,Member Since\nBo,Active,7,01/02/2026\n"));
  assert.equal(alt.members[0].monthly, 7);
  assert.equal(alt.members[0].since, Date.UTC(2026, 0, 2));
});

test("no recognisable header gives a plain error; empty file too", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2\n")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("annual pledges are monthly-equivalent and per-creation ones are left out of MRR", () => {
  const n = load(row("a", "Active patron", "T", 120, "2026-01-01", "2026-08-01", "Successful", "Annual") + row("b", "Active patron", "T", 4, "2026-01-01", "2026-08-01", "Successful", "Per creation") + row("c", "Active patron", "T", 10, "2026-01-01", "2026-08-01"));
  const r = analyze(n.members);
  near(r.summary.mrr, 20);
  assert.equal(r.summary.perCreation, 1);
});

test("counts, MRR, by-tier and at-risk MRR reconcile", () => {
  let body = "";
  for (let i = 0; i < 6; i++) body += row("a" + i, "Active patron", "Basic", 5, "2026-01-01", "2026-08-15");
  for (let i = 0; i < 2; i++) body += row("b" + i, "Active patron", "Plus", 20, "2026-02-01", "2026-08-15");
  body += row("d1", "Declined patron", "Plus", 20, "2026-02-01", "2026-07-15", "Declined");
  body += row("f1", "Former patron", "Basic", 5, "2026-01-01", "2026-03-01");
  body += "Free,f@x.invalid,Free member,0,0,,$0,2026-05-01,,,\n";
  const r = analyze(load(body).members);
  const c = r.summary.counts;
  assert.deepEqual([c.active, c.declined, c.former, c.other], [8, 1, 1, 1]);
  near(r.summary.mrr, 6 * 5 + 2 * 20);
  near(r.summary.atRisk, 20);
  near(r.byTier.reduce((s, t) => s + t.mrr, 0), r.summary.mrr);
  assert.equal(r.byTier[0].tier, "Plus");
  near(r.byTier[0].share, 40 / 70);
  near(r.summary.mrrIfRecovered, 90);
  near(r.summary.churnRate, 1 / 10);
});

test("fees: platform percent plus processing percent and fixed per charge, editable", () => {
  const r = analyze(load(row("a", "Active patron", "T", 10, "2026-01-01", "2026-08-01") + row("b", "Active patron", "T", 30, "2026-01-01", "2026-08-01")).members);
  near(r.fees.platform, 4);
  near(r.fees.processing, 40 * 0.029 + 0.6);
  near(r.net, 40 - 4 - 1.76);
  const r2 = analyze(load(row("a", "Active patron", "T", 10, "2026-01-01", "2026-08-01")).members, { platformPct: 8, processingPct: 0, processingFixed: 0 });
  near(r2.fees.total, 0.8);
  assert.match(analyze(load(row("a", "Active patron", "T", 10, "2026-01-01", "2026-08-01")).members, { platformPct: 60, processingPct: 50 }).invalid, /under 100/);
});

test("annual charges pay the fixed processing fee once a year", () => {
  const r = analyze(load(row("a", "Active patron", "T", 120, "2026-01-01", "2026-08-01", "Successful", "Annual")).members);
  near(r.fees.processing, 10 * 0.029 + 0.3 / 12);
});

test("tenure: active runs to the latest date, former to its last charge", () => {
  const body = row("a", "Active patron", "T", 5, "2025-07-15", "2026-08-01") + row("f", "Former patron", "T", 5, "2026-01-01", "2026-04-15");
  const r = analyze(load(body).members);
  near(r.summary.medianActive, 12.5, 0.2);
  near(r.summary.medianFormer, 3.4, 0.1);
  assert.equal(r.distribution[3].active, 1);
  assert.equal(r.distribution[1].former, 1);
});

test("cohort churn and survival use only patrons old enough, and small groups are flagged", () => {
  let body = "";
  for (let i = 0; i < 6; i++) body += row("k" + i, i < 4 ? "Active patron" : "Former patron", "T", 5, "2026-02-01", i < 4 ? "2026-08-01" : "2026-03-01");
  body += row("n", "Active patron", "T", 5, "2026-07-20", "2026-08-01");
  const r = analyze(load(body).members);
  const s6 = r.survival.find((x) => x.months === 6);
  assert.equal(s6.eligible, 0);
  const s3 = r.survival.find((x) => x.months === 3);
  assert.equal(s3.eligible, 6);
  near(s3.rate, 4 / 6);
  const cohort = r.cohorts.find((c) => c.label === "3 to 6 months");
  assert.equal(cohort.joined, 6);
  near(cohort.rate, 2 / 6);
  assert.equal(cohort.enough, true);
  assert.equal(r.cohorts[0].enough, false);
});

test("concentration shares", () => {
  let body = row("big", "Active patron", "Top", 100, "2026-01-01", "2026-08-01");
  for (let i = 0; i < 9; i++) body += row("s" + i, "Active patron", "Low", 10, "2026-01-01", "2026-08-01");
  const r = analyze(load(body).members);
  near(r.concentration.top1, 100 / 190);
  assert.equal(r.concentration.topTier.tier, "Top");
  assert.ok(r.findings.some((f) => /One patron is/.test(f.title)));
});

test("without a status column, status is inferred from the last charge and pledge", () => {
  const n = normalizeRows(parseCsv("Name,Pledge,Patronage Since Date,Last Charge Status\nA,5,2026-01-01,Successful\nB,5,2026-01-01,Declined\nC,0,2026-01-01,\n"));
  assert.equal(n.statusSource, "inferred");
  assert.deepEqual(n.members.map((m) => m.status), ["active", "declined", "former"]);
});

test("unreadable amounts and total rows are skipped with a reason; undated patrons are left out of tenure", () => {
  const n = load(row("a", "Active patron", "T", 5, "", "") + "b,b@x,Active patron,0,zzz,T,zzz,2026-01-01,,,\nTotal,,,,,,,,,,\n");
  assert.equal(n.members.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.reason).sort(), ["amount not a number", "total row"]);
  const r = analyze(n.members);
  assert.equal(r.summary.undated, 1);
});

test("declined payments produce a finding and the recoverable list", () => {
  const r = analyze(load(row("d", "Declined patron", "T", 20, "2026-01-01", "2026-07-01", "Declined") + row("a", "Active patron", "T", 20, "2026-01-01", "2026-08-01")).members);
  assert.equal(r.atRiskMembers.length, 1);
  assert.ok(r.findings.some((f) => /declined payment/.test(f.title) && f.severity === "high"));
});

test("the worked example loads and reconciles", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.skipped.length, 0);
  const r = analyze(n.members);
  const c = r.summary.counts;
  assert.equal(c.active + c.declined + c.former + c.other, n.members.length);
  near(r.byTier.reduce((s, t) => s + t.mrr, 0), r.summary.mrr);
  near(r.net + r.fees.total, r.summary.mrr);
  assert.ok(r.summary.atRisk > 0 && r.summary.churnRate > 0);
});
