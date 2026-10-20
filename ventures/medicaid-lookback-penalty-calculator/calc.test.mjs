import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, parseDate, addMonths, iso, SAMPLE, summaryText, sweepCsv } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("penalty is countable transfers divided by the divisor, with partial days", () => {
  const r = compute(raw());
  assert.equal(r.errors.length, 0);
  assert.equal(r.s.gross, 95000);
  assert.equal(r.s.whole, 9);
  assert.equal(r.s.days, 1);
  assert.equal(iso(r.s.penaltyEnd), "2027-07-02");
});

test("gifts before the window do not count; the window edge is inclusive", () => {
  const r = compute(raw({ gifts: "2021-10-01, 10500\n2021-09-30, 50000" }));
  assert.equal(r.s.gross, 10500);
  assert.equal(r.s.months, 1);
});

test("exempt notes keep a transfer out of the total but are flagged for proof", () => {
  const r = compute(raw({ gifts: "2025-01-01, 100000, to spouse\n2025-02-01, 21000, nephew" }));
  assert.equal(r.s.gross, 21000);
  assert.ok(r.findings.some((f) => /exempt/.test(f.title)));
});

test("returning money reduces the penalty and never goes below zero", () => {
  assert.equal(compute(raw({ returned: 10500 })).s.total, 84500);
  assert.equal(compute(raw({ returned: 999999 })).s.total, 0);
});

test("states that ignore partial months drop the day remainder", () => {
  const r = compute(raw({ partialMonths: "no" }));
  assert.equal(r.s.days, 0);
  assert.equal(r.s.whole, 9);
});

test("a 30-month window excludes older gifts", () => {
  const r = compute(raw({ lookbackMonths: 30 }));
  assert.equal(r.s.gross, 30000);
});

test("the sweep shows the penalty falling as transfers age out", () => {
  const r = compute(raw());
  assert.equal(r.sweep[0].counted, 95000);
  assert.equal(r.sweep.at(-1).counted, 0);
  assert.equal(iso(r.lastAge), "2030-11-02");
});

test("care gap is care cost minus income over the penalty months", () => {
  const r = compute(raw({ gifts: "2025-01-01, 21000", divisor: 10500, monthlyCost: 10000, monthlyIncome: 3000 }));
  assert.equal(r.gap, 14000);
});

test("bad input is named, not guessed", () => {
  assert.match(compute(raw({ divisor: "" })).errors[0], /divisor/);
  assert.match(compute(raw({ gifts: "soon, 500" })).errors[0], /Gift line 1/);
  assert.match(compute(raw({ gifts: "2030-01-01, 500" })).errors.join(" "), /after the application/);
  assert.match(compute(raw({ gifts: "" })).errors[0], /at least one/);
  assert.match(compute(raw({ applicationDate: "2026-02-30" })).errors[0], /date/);
});

test("month arithmetic clamps to the end of a short month", () => {
  assert.equal(iso(addMonths(parseDate("2024-01-31"), 1)), "2024-02-29");
  assert.equal(iso(parseDate("3/5/2025")), "2025-03-05");
});

test("summary and csv render", () => {
  const r = compute(raw());
  assert.match(summaryText(r), /Penalty: 9\.05 months/);
  assert.match(sweepCsv(r), /^application_date,months_later/);
  assert.ok(parse(raw()).input.gifts.length === 5);
});

test("dates accept one- or two-digit month and day but not three-digit days", () => {
  assert.equal(iso(parseDate("2026-1-5")), "2026-01-05");
  assert.equal(iso(parseDate("1/5/2026")), "2026-01-05");
  assert.equal(parseDate("2026-10-001"), null);
});

test("blank monthly income is treated as zero; a gift on the application date is allowed", () => {
  const r = compute(raw({ monthlyIncome: "", gifts: "2026-10-01, 10500" }));
  assert.equal(r.errors.length, 0);
  assert.equal(r.input.monthlyIncome, 0);
  assert.equal(r.s.gross, 10500);
  assert.ok(compute(raw({ gifts: "2026-10-02, 10500" })).errors.some((e) => /after the application date/.test(e)));
});

test("non-finite or fractional figures are rejected, not turned into a zero penalty", () => {
  for (const o of [{ divisor: "Infinity" }, { monthlyCost: "Infinity" }, { monthlyIncome: "Infinity" }, { returned: "Infinity" }, { lookbackMonths: "60.5" }]) {
    assert.ok(compute(raw(o)).errors.length > 0, JSON.stringify(o));
  }
});
