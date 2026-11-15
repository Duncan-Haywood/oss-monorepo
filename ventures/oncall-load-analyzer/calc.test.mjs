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

test("gini values are exact and do not depend on input order", () => {
  assert.equal(gini([0, 0, 0, 10]), 0.75);
  assert.equal(gini([10, 0, 0, 0]), 0.75);
  assert.equal(gini([3, 1, 2]), gini([1, 2, 3]));
  assert.ok(Math.abs(gini([1, 2, 3]) - 2 / 9) < 1e-12);
});

test("humanMin switches to hours at exactly 60 minutes", () => {
  assert.equal(humanMin(59), "59 min");
  assert.equal(humanMin(60), "1.0 h");
});

test("default timezone is UTC: 21:30Z on a Tuesday is off-hours, not night", () => {
  const r = run(["2026-09-01T21:30:00Z,,api,Ana,low,x"]);
  assert.equal(r.summary.kinds.offHours, 1);
  assert.equal(r.summary.kinds.night, 0);
});

test("high-urgency pages are counted per person, starting from zero", () => {
  const r = run(["2026-09-01T10:00:00Z,,api,Ana,low,a", "2026-09-01T11:00:00Z,,api,Ana,high,b"]);
  assert.equal(r.people[0].high, 1);
});

test("a resolved column that comes first in the header is still read", () => {
  const n = normalizeRows(parseCsv("resolved_at,created_at,assigned_to\n2026-09-01T10:30:00Z,2026-09-01T10:00:00Z,Ana"));
  assert.equal(n.incidents[0].resolvedMin, 30);
});

test("parseTime refuses days a month does not have, seconds past 59 and impossible offsets", () => {
  for (const s of ["2026-02-30 10:00", "2026-04-31", "2025-02-29T01:00:00Z", "2026-03-01 10:00:60", "2026-03-01T10:00+25:00", "2026-03-01T10:00+05:99", "2026-00-10"]) {
    assert.equal(parseTime(s), null, s);
  }
  assert.equal(parseTime("2028-02-29T01:00:00Z"), Date.UTC(2028, 1, 29, 1));
  assert.equal(parseTime("2026-03-01T10:00+05:30"), Date.UTC(2026, 2, 1, 4, 30));
  assert.equal(parseTime("2026-03-01T10:00:59-14:00"), Date.UTC(2026, 2, 2, 0, 0, 59));
});

// Red-team 2026-11-15. A real defect first: the header matched the leftmost
// column naming any alias, so an export with service_id before service_name
// grouped every page under an opaque id, and a `team` column beat `service`.
test("aliases are tried in priority order, not header order", () => {
  const a = normalizeRows(parseCsv("id,description,service_id,service_name,created_on,assigned_to\n1,Disk full,PX1Y2Z3,checkout-api,2026-09-01T03:00:00Z,Dana"));
  assert.equal(a.incidents[0].service, "checkout-api");
  const b = normalizeRows(parseCsv("team,service,created_at,assigned_to,title\nPlatform,checkout-api,2026-09-01T03:00:00Z,Dana,x"));
  assert.equal(b.incidents[0].service, "checkout-api");
  // a lone lower-priority alias is still read
  const c = normalizeRows(parseCsv("service_id,created_at,assigned_to\nPX1,2026-09-01T03:00:00Z,Dana"));
  assert.equal(c.incidents[0].service, "PX1");
});

// Escaped mutants from the same campaign.
test("business hours start at 09:00 local, not later", () => {
  // Tuesday 2026-01-06 09:30Z
  const r = run(["2026-01-06T09:30:00Z,,svc,A,low,t"]);
  assert.equal(r.people[0].business, 1);
  assert.equal(r.people[0].offHours, 0);
});

test("median resolve time of an even count is the mean of the middle two", () => {
  const r = run(["2026-01-06T10:00:00Z,2026-01-06T10:10:00Z,svc,A,low,a", "2026-01-06T12:00:00Z,2026-01-06T12:30:00Z,svc,A,low,b"]);
  assert.equal(r.people[0].medianResolveMin, 20);
});

test("commit hashes with a zero digit still group as one alert", () => {
  assert.equal(fingerprint("deploy 0a1b2c3d failed"), fingerprint("deploy 9f8e7d6c failed"));
});

test("the single-alert advice appears only when that alert is 30% or more of pages", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(`2026-01-06T1${i % 8}:0${i}:00Z,,svc${i},A,low,alert ${String.fromCharCode(97 + i)}`);
  const r = run(rows);
  assert.ok(!r.advice.some((x) => /One alert on/.test(x.text)), JSON.stringify(r.advice));
});
