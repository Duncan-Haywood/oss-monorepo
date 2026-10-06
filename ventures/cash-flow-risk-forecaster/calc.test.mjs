import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parseLines, parseDate, SAMPLE, summaryText, sweepCsv, dollars } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("sample runs with no errors and gives one row per week", () => {
  const r = compute(raw());
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows.length, 13);
  assert.ok(r.pShort >= 0 && r.pShort <= 1);
});

test("same inputs give the same answer (seeded)", () => {
  assert.equal(compute(raw()).pShort, compute(raw()).pShort);
  assert.equal(summaryText(compute(raw())), summaryText(compute(raw())));
});

test("if everything is on time and cash is ample, risk is zero", () => {
  const r = compute(raw({ opening: "1000000", onTime: "100", noPay: "0" }));
  assert.equal(r.pShort, 0);
  assert.equal(r.cushion90, 0);
  assert.equal(r.reference.shortDate, null);
  assert.equal(r.levers.length, 0);
});

test("invoices that never pay and no cash on hand means certain shortfall", () => {
  const r = compute(raw({ opening: "0", buffer: "100", noPay: "100", incoming: "2026-10-20, A, 5000", outgoing: "2026-10-21, Rent, 900" }));
  assert.equal(r.pShort, 1);
  assert.ok(r.cushion90 >= 900);
});

test("later payment never improves cash: more lateness means more risk", () => {
  const fast = compute(raw({ onTime: "100", noPay: "0" }));
  const slow = compute(raw({ onTime: "0", lateDays: "45", noPay: "0" }));
  assert.ok(slow.pShort >= fast.pShort);
  assert.ok(slow.cushion90 >= fast.cushion90);
});

test("deterministic reference finds the first day below the floor", () => {
  const r = compute({ start: "2026-10-12", opening: "1000", weeks: "4", buffer: "0", incoming: "", outgoing: "2026-10-14, Bill, 1500", onTime: "100", noPay: "0" });
  assert.equal(r.reference.shortDate, "2026-10-14");
  assert.equal(r.reference.low, -500);
});

test("monthly repeats clamp to month end and weekly repeats stay in the window", () => {
  const r = compute({ start: "2026-01-01", opening: "0", weeks: "13", buffer: "0", incoming: "", outgoing: "2026-01-31, Rent, 100, monthly\n2026-01-02, Fuel, 10, weekly", onTime: "100", noPay: "0", trials: "200" });
  assert.equal(r.outTotal, 100 * 3 + 10 * 13); // Jan 31, Feb 28, Mar 31 ; 13 Fridays
});

test("an overdue invoice is collected after the start date, not dropped", () => {
  const r = compute({ start: "2026-10-12", opening: "0", weeks: "4", buffer: "0", incoming: "2026-09-01, Old invoice, 700", outgoing: "", onTime: "100", noPay: "0" });
  assert.equal(r.inTotal, 700);
  assert.equal(r.rows[0].p50, 700);
});

test("shifting the biggest bill later helps, and the lever names it", () => {
  const r = compute(raw({ opening: "6000" }));
  assert.ok(r.levers.length > 0);
  assert.ok(r.levers[0].cushionGain >= r.levers.at(-1).cushionGain);
  for (const l of r.levers) assert.ok(l.pShort <= r.pShort + 1e-9);
});

test("bad lines are reported with their line number", () => {
  const r = compute(raw({ incoming: "2026-13-40, X, 100\n2026-10-20, Y, -5\nnot a line" }));
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /Money in line 1/);
  assert.match(r.errors[1], /positive/);
});

test("parse helpers", () => {
  assert.ok(Number.isNaN(parseDate("2026-02-30")));
  assert.equal(parseLines("# note\n2026-10-20, A, 5, weekly").lines[0].repeat, "weekly");
  assert.equal(dollars(-1234.6), "-$1,235");
});

test("empty forecast is an error; outputs render", () => {
  assert.ok(compute(raw({ incoming: "", outgoing: "" })).errors.length);
  const r = compute(raw());
  assert.match(sweepCsv(r), /^week,from/);
  assert.match(summaryText(r), /Chance of dipping/);
});
