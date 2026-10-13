import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parseDays, toDay, fromDay, SAMPLE, summaryText, NEW_RATE, OLD_RATE } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("parseDays reads day names and rejects junk", () => {
  assert.deepEqual(parseDays("Mon, Wed Friday"), [1, 3, 5]);
  assert.equal(parseDays("Mon Blursday"), null);
  assert.equal(parseDays(""), null);
});

test("dates round trip and reject impossible ones", () => {
  assert.equal(fromDay(toDay("2026-05-04")), "2026-05-04");
  assert.equal(toDay("2026-02-30"), null);
});

test("2026/27: 15 qualifying days at the flat rate from day one", () => {
  const r = run({});
  assert.equal(r.qualifying, 15);
  assert.equal(r.waiting, 0);
  assert.equal(r.paidDays, 15);
  assert.ok(Math.abs(r.total - 3 * NEW_RATE) < 1e-9);
});

test("2026/27: low earners get 80% of earnings, not the flat rate", () => {
  const r = run({ weeklyEarnings: "100" });
  assert.ok(Math.abs(r.weeklyRate - 80) < 1e-9);
  assert.ok(Math.abs(r.total - 3 * 80) < 1e-9);
});

test("under 4 days is not a PIW", () => {
  const r = run({ startDate: "2026-05-04", endDate: "2026-05-06" });
  assert.equal(r.isPiw, false);
  assert.equal(r.total, 0);
});

test("pre-April 2026: 3 waiting days and flat 118.75", () => {
  const r = run({ startDate: "2026-03-02", endDate: "2026-03-06" });
  assert.equal(r.waiting, 3);
  assert.equal(r.paidDays, 2);
  assert.ok(Math.abs(r.total - 2 * OLD_RATE / 5) < 1e-9);
});

test("pre-April 2026: earnings under the lower earnings limit get nothing", () => {
  const r = run({ weeklyEarnings: "100", startDate: "2026-03-02", endDate: "2026-03-13" });
  assert.equal(r.total, 0);
  assert.ok(r.findings.some((f) => /lower earnings limit/.test(f.title)));
});

test("a linked spell can pre-serve waiting days", () => {
  const r = run({ startDate: "2026-03-02", endDate: "2026-03-06", waitingServed: "3" });
  assert.equal(r.waiting, 0);
  assert.equal(r.paidDays, 5);
});

test("a spell crossing 6 April 2026 uses each era's rule", () => {
  const r = run({ startDate: "2026-03-30", endDate: "2026-04-10" });
  assert.equal(r.rows.length, 2);
  assert.equal(r.waiting, 3);
});

test("28-week cap on paid days", () => {
  const r = run({ startDate: "2026-05-04", endDate: "2027-03-01" });
  assert.equal(r.paidDays, 140);
  assert.ok(r.findings.some((f) => /28-week/.test(f.title)));
});

test("validation errors", () => {
  assert.ok(run({ weeklyEarnings: "" }).errors.length);
  assert.ok(run({ endDate: "2026-05-01" }).errors.length);
  assert.ok(run({ qualifyingDays: "xx" }).errors.length);
});

test("summary names the verify source", () => {
  assert.match(summaryText(run({})), /GOV\.UK/);
});
