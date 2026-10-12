import test from "node:test";
import assert from "node:assert/strict";
import { estimate, costOfWaiting, tierPct, daysToNextTier, EXAMPLE, renderText } from "./penalty.mjs";

test("tiers follow 2/5/10 percent and the 15 percent post-notice rate", () => {
  assert.equal(tierPct(0), 0);
  assert.equal(tierPct(1), 2);
  assert.equal(tierPct(5), 2);
  assert.equal(tierPct(6), 5);
  assert.equal(tierPct(15), 5);
  assert.equal(tierPct(16), 10);
  assert.equal(tierPct(40, 11), 15);
  assert.equal(tierPct(40, 10), 10);
});

test("days to next tier", () => {
  assert.equal(daysToNextTier(3), 3);
  assert.equal(daysToNextTier(6), 10);
  assert.equal(daysToNextTier(16), null);
});

test("example: a paid-late deposit and two unpaid ones", () => {
  const r = estimate(EXAMPLE);
  assert.equal(r.lines[0].daysLate, 3);
  assert.equal(r.lines[0].penalty, 128);
  assert.equal(r.lines[1].daysLate, 12);
  assert.equal(r.lines[1].penaltyPct, 5);
  assert.equal(r.lines[1].penalty, 345);
  assert.equal(r.lines[2].daysLate, 3);
  assert.equal(r.lines[2].penalty, 144);
  assert.equal(r.totalPenalty, 617);
  assert.equal(r.unpaidAmount, 14100);
  assert.equal(r.trustFundAtRisk, 10575);
  assert.equal(r.lines[0].unpaid, false);
});

test("on-time deposits cost nothing", () => {
  const r = estimate({ asOf: "2026-10-12", deposits: [{ amount: 5000, due: "2026-10-12", paid: "2026-10-12" }] });
  assert.equal(r.totalCost, 0);
  assert.equal(r.unpaidAmount, 0);
});

test("waiting pushes an unpaid deposit up a tier", () => {
  const w = costOfWaiting(EXAMPLE, 30);
  assert.ok(w.extra > 0);
  assert.equal(w.asOf, "2026-11-11");
});

test("a notice more than 10 days back moves unpaid deposits to 15 percent", () => {
  const r = estimate({ ...EXAMPLE, noticeDate: "2026-09-20" });
  assert.equal(r.lines[1].penaltyPct, 15);
});

test("bad input is rejected", () => {
  assert.throws(() => estimate({ asOf: "10/12/2026", deposits: [] }), /date/);
  assert.throws(() => estimate({ asOf: "2026-10-12", deposits: [] }), /at least one/);
  assert.throws(() => estimate({ asOf: "2026-10-12", deposits: [{ amount: -1, due: "2026-10-01" }] }), /between/);
  assert.throws(() => estimate({ asOf: "2026-10-01", deposits: [{ amount: 1, due: "2026-09-01", paid: "2026-10-05" }] }), /after the as-of/);
});

test("text output names the totals", () => {
  assert.match(renderText(estimate(EXAMPLE)), /trust-fund portion/);
});
