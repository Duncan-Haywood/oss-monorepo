import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseTime, normalizeRows, fingerprint, gini, analyze, toCsv, sampleCsv, humanMin } from "./calc.mjs";

const HEAD = "created_at,resolved_at,service,assigned_to,urgency,title";
const run = (rows, opts) => {
  const n = normalizeRows(parseCsv([HEAD, ...rows].join("\n")));
  assert.ok(!n.error, n.error);
  return analyze(n.incidents, opts);
};

test("parseTime reads ISO with zone, naive UTC, offsets and epoch seconds", () => {
  assert.equal(parseTime("2026-01-05T03:00:00Z"), Date.UTC(2026, 0, 5, 3));
  assert.equal(parseTime("2026-01-05 03:00:00"), Date.UTC(2026, 0, 5, 3));
  assert.equal(parseTime("2026-01-05T03:00:00-05:00"), Date.UTC(2026, 0, 5, 8));
  assert.equal(parseTime("1767582000"), 1767582000000);
  assert.equal(parseTime("garbage"), null);
  assert.equal(parseTime("2026-13-40"), null);
});

test("missing columns are named errors, not an empty report", () => {
  assert.match(normalizeRows(parseCsv("a,b\n1,2")).error, /No timestamp column/);
  assert.match(normalizeRows(parseCsv("created_at,title\n2026-01-05,x")).error, /No responder column/);
  assert.match(normalizeRows([]).error, /No rows/);
});

test("bad rows are skipped with a line number and reason", () => {
  const n = normalizeRows(parseCsv([HEAD, "nope,,svc,A,low,t", "2026-01-05T10:00:00Z,,svc,,low,t", "2026-01-05T10:00:00Z,,svc,A,low,t"].join("\n")));
  assert.equal(n.incidents.length, 1);
  assert.deepEqual(n.skipped.map((s) => [s.line, s.reason]), [[2, "unreadable timestamp"], [3, "no responder"]]);
});

test("fingerprint groups the same alert across hosts, ids and numbers", () => {
  assert.equal(fingerprint("Disk 91% on i-0abc123def"), fingerprint("Disk 87% on i-9fffeee1"));
  assert.equal(fingerprint("down 10.0.0.1"), fingerprint("down 192.168.4.22"));
  assert.notEqual(fingerprint("disk full"), fingerprint("cpu high"));
  assert.equal(fingerprint(""), "(untitled)");
});

test("gini is 0 for an even split and approaches 1 for one person", () => {
  assert.equal(gini([5, 5, 5, 5]), 0);
  assert.ok(gini([0, 0, 0, 100]) > 0.7);
  assert.equal(gini([4]), 0);
});

test("night, off-hours and business pages are split by local time and the offset option", () => {
  const rows = ["2026-01-07T03:00:00Z,,s,A,low,a", "2026-01-07T12:00:00Z,,s,A,low,b", "2026-01-10T12:00:00Z,,s,A,low,c"];
  const utc = run(rows);
  assert.deepEqual(utc.summary.kinds, { night: 1, offHours: 1, business: 1 });
  // 12:00 UTC is 04:00 at UTC-8, which is night
  const west = run(rows, { tzOffsetHours: -8 });
  assert.equal(west.summary.kinds.night, 2);
});

test("a page after midnight belongs to the night that began the evening before", () => {
  const r = run(["2026-01-07T23:30:00Z,,s,A,low,a", "2026-01-08T02:00:00Z,,s,A,low,b", "2026-01-08T04:00:00Z,,s,B,low,c"]);
  assert.equal(r.nights.length, 1);
  assert.equal(r.nights[0].night, "2026-01-07");
  assert.equal(r.nights[0].pages, 3);
  assert.equal(r.badNights.length, 1);
});

test("flaps and repeats are each counted once and never together", () => {
  const r = run([
    "2026-01-07T10:00:00Z,2026-01-07T10:02:00Z,s,A,low,Disk 90% on i-aaaaaaa1",
    "2026-01-07T10:10:00Z,2026-01-07T10:12:00Z,s,A,low,Disk 91% on i-bbbbbbb2",
    "2026-01-07T10:20:00Z,2026-01-07T11:20:00Z,s,A,low,Disk 92% on i-ccccccc3",
    "2026-01-08T10:20:00Z,2026-01-08T11:20:00Z,s,A,low,Disk 92% on i-ccccccc3",
  ]);
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].flaps, 2);
  assert.equal(r.alerts[0].repeats, 1);
  assert.equal(r.summary.avoidable, 3);
});

test("the report reconciles: people, kinds and alerts all add to the page total", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  const r = analyze(n.incidents);
  const total = r.summary.pages;
  assert.equal(total, n.incidents.length);
  assert.equal(r.people.reduce((s, p) => s + p.pages, 0), total);
  assert.equal(r.alerts.reduce((s, a) => s + a.pages, 0), total);
  assert.equal(r.services.reduce((s, a) => s + a.pages, 0), total);
  assert.equal(r.summary.kinds.night + r.summary.kinds.offHours + r.summary.kinds.business, total);
  assert.equal(r.people.reduce((s, p) => s + p.avoidable, 0), r.summary.avoidable);
  assert.ok(Math.abs(r.people.reduce((s, p) => s + p.share, 0) - 1) < 1e-9);
});

test("the sample surfaces an overloaded responder and a noisy alert", () => {
  const r = analyze(normalizeRows(parseCsv(sampleCsv())).incidents);
  assert.equal(r.people[0].person, "Priya");
  assert.ok(r.people[0].overloaded);
  assert.ok(r.advice.some((a) => /Fix or silence/.test(a.text)));
  assert.ok(r.summary.avoidableHours > 0 && r.summary.avoidableHours < r.summary.hours);
});

test("a single responder is never called overloaded", () => {
  const r = run(["2026-01-07T03:00:00Z,,s,A,low,a"]);
  assert.equal(r.people[0].overloaded, false);
});

test("toCsv quotes names with commas and humanMin handles null", () => {
  assert.match(toCsv([{ person: "Lee, Sam", pages: 1, night: 0, offHours: 0, business: 1, high: 0, weighted: 1, share: 1, ratio: 1, avoidable: 0 }]), /"Lee, Sam"/);
  assert.equal(humanMin(null), "n/a");
  assert.equal(humanMin(90), "1.5 h");
});
