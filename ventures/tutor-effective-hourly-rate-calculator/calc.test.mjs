import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("annual net and hours follow the stated rule on the sample", () => {
  const r = compute(raw());
  const delivered = 13.5, units = 13.5 + 1.5 * 0.5;
  const hours = delivered * 80 / 60 + delivered * 0.5 * 25 / 60 + 3;
  assert.ok(Math.abs(r.weekHours - hours) < 0.01);
  assert.ok(Math.abs(r.annualNet - (units * 60 * 40 - 1440)) < 0.01);
  assert.ok(Math.abs(r.effective - r.annualNet / (hours * 40)) < 0.01);
});

test("the target rate really pays the target hourly, and the break-even rate pays nothing", () => {
  const r = compute(raw());
  assert.ok(Math.abs(compute(raw({ rate: String(r.targetRate) })).effective - 50) < 0.05);
  assert.ok(Math.abs(compute(raw({ rate: String(r.breakEvenRate) })).annualNet) < 5);
});

test("a platform fee lowers pay and raises the rate needed", () => {
  const a = compute(raw()), b = compute(raw({ platformFee: "25" }));
  assert.ok(b.annualNet < a.annualNet);
  assert.ok(b.targetRate > a.targetRate);
  assert.ok(b.platform > 0 && a.platform === 0);
});

test("a loss is flagged high with the break-even rate", () => {
  const r = compute(raw({ rate: "2" }));
  assert.ok(r.annualNet < 0);
  assert.equal(r.findings[0].severity, "high");
  assert.match(r.findings[0].title, /break even/);
});

test("unbilled time that eats the quoted rate is flagged", () => {
  const r = compute(raw({ prepMin: "60", travelMin: "45", inPerson: "100" }));
  assert.ok(r.findings.some((f) => /disappears into time/.test(f.title)));
});

test("a full late-cancel fee removes the cancellation loss", () => {
  const free = compute(raw({ lateFee: "100", cancelPct: "20" }));
  const none = compute(raw({ lateFee: "0", cancelPct: "20" }));
  assert.ok(free.annualNet > none.annualNet);
  assert.ok(Math.abs(free.gross - 15 * 60 * 40) < 0.01);
});

test("sweep is sorted, includes the current load, and has a CSV", () => {
  const r = compute(raw({ sessions: "12" }));
  assert.deepEqual(r.sweep.map((x) => x.sessions), [5, 10, 12, 15, 20, 25, 30]);
  assert.ok(r.sweep[0].annualNet < r.sweep[6].annualNet);
  const lines = sweepCsv(r).split("\n");
  assert.equal(lines[0], "sessions_per_week,hours_per_week,annual_net,effective_hourly");
  assert.equal(lines.length, 8);
});

test("optional fields may be blank", () => {
  const r = compute({ sessions: "10", rate: "50", minutes: "60", weeks: "40" });
  assert.equal(r.errors.length, 0);
  assert.ok(Math.abs(r.annualNet - 10 * 50 * 40) < 0.01);
  assert.ok(Math.abs(r.effective - 50) < 0.01);
});

test("bad input is reported, not computed", () => {
  assert.ok(compute(raw({ sessions: "0" })).errors.length);
  assert.ok(compute(raw({ rate: "abc" })).errors.length);
  assert.ok(compute(raw({ weeks: "60" })).errors.length);
  assert.ok(compute(raw({ cancelPct: "100" })).errors.length);
  assert.ok(compute(raw({ inPerson: "120" })).errors.length);
  assert.ok(compute(raw({ lateFee: "-1" })).errors.length);
});

test("summary and dollars format", () => {
  assert.equal(dollars(-1234.5), "-$1,234.50");
  assert.match(summaryText(compute(raw())), /Tutoring: 15 session slots a week at \$60\.00/);
});
