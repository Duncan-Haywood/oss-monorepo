import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, LIMITS } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("cumulative limits match the published totals", () => {
  const sum = (a, b) => { let t = 0; for (let y = a; y <= b; y++) t += LIMITS[y]; return t; };
  assert.equal(sum(2009, 2024), 95000);
  assert.equal(sum(2009, 2025), 102000);
  assert.equal(sum(2009, 2026), 109000);
});

test("sample: 109,000 - 98,000 + 12,000 = 23,000 room on 1 Jan; 20,000 now; 8,000 after 12,000", () => {
  const r = run({});
  assert.equal(r.cumulative, 109000);
  assert.equal(r.roomJan1, 23000);
  assert.equal(r.roomNow, 20000);
  assert.equal(r.roomAfter, 8000);
  assert.equal(r.excessAfter, 0);
});

test("over by 5,000 in April costs 50 a month, 450 to December", () => {
  const r = run({ planned: 25000 });
  assert.equal(r.excessAfter, 5000);
  assert.equal(r.monthly, 50);
  assert.equal(r.monthsLeft, 9);
  assert.equal(r.toYearEnd, 450);
});

test("contributing exactly the room is not an excess", () => {
  assert.equal(run({ planned: 20000 }).excessAfter, 0);
  assert.equal(run({ planned: 20001 }).excessAfter, 1);
});

test("room starts at 18th birthday year, not 2009, for the young", () => {
  const r = run({ birthYear: 2005, contribPrior: 0, withdrawPrior: 0, contribYtd: 0 });
  assert.equal(r.startYear, 2023);
  assert.equal(r.cumulative, 6500 + 7000 + 7000 + 7000);
});

test("residency start year pushes the start later", () => {
  assert.equal(run({ residentFrom: 2020 }).startYear, 2020);
});

test("same-year withdrawals do not restore room this year", () => {
  assert.equal(run({ withdrawYtd: 5000 }).roomNow, 20000);
});

test("already over before the planned contribution is called out", () => {
  const r = run({ contribPrior: 120000, withdrawPrior: 0, contribYtd: 0, planned: 0 });
  assert.equal(r.excessBefore, 11000 - 0);
  assert.ok(r.findings.some((f) => /already used up/.test(f.title)));
});

test("bad input is rejected with a message", () => {
  assert.ok(run({ year: 2030 }).errors.length);
  assert.ok(run({ birthYear: "" }).errors.length);
  assert.ok(run({ planned: -5 }).errors.length);
  assert.ok(run({ month: 13 }).errors.length);
  assert.ok(run({ birthYear: 2015 }).errors[0].includes("no room"));
});

test("summary carries the source and the disclaimer", () => {
  const t = summaryText(run({ planned: 25000 }));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
  assert.match(t, /Over by/);
});
