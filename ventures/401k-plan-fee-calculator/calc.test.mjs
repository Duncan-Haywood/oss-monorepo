import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBenchmarks, parseFunds, plan, sampleInput, toCsv, DEFAULT_BENCHMARK_TEXT } from "./calc.mjs";

test("benchmark table parses, sorts and rejects overlaps and junk", () => {
  const { rows, errors } = parseBenchmarks(DEFAULT_BENCHMARK_TEXT);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 5);
  assert.equal(rows[4].max, Infinity);
  assert.ok(parseBenchmarks("0-10: 1\n5-20: 1").errors.length);
  assert.ok(parseBenchmarks("cheap").errors.length);
});

test("funds parse and an expense ratio typed as a fraction is caught", () => {
  assert.equal(parseFunds("A, 1000, 0.5").funds[0].er, 0.5);
  assert.match(parseFunds("A, 1000, 45").errors[0], /looks wrong/);
  assert.ok(parseFunds("A, 1000").errors.length);
});

test("worked arithmetic: $1M plan, 10 participants", () => {
  const r = plan({
    participants: 10, recordkeeperBps: 10, recordkeeperFlat: 1000, perParticipant: 50, advisorBps: 50, otherFlat: 500,
    funds: "Fund, 1000000, 0.50", years: 10, grossReturn: 6,
  });
  // 5000 funds + 1000 rk bps + 1000 rk flat + 500 per-participant + 5000 advisor + 500 other
  assert.equal(r.total, 13000);
  assert.equal(r.totalPct, 1.3);
  assert.equal(r.targetPct, 1.35);
  assert.equal(r.excess, 0);
  assert.equal(r.avgBalance, 100000);
});

test("over-benchmark plan reports the excess dollars and a lower participant balance", () => {
  const r = plan(sampleInput());
  assert.ok(r.totalPct > r.targetPct);
  assert.ok(r.excess > 0);
  assert.equal(r.excessPerParticipant, Math.round((r.excess / 42 + Number.EPSILON) * 100) / 100);
  assert.ok(r.atTarget > r.atCurrent);
  assert.equal(r.drag, Math.round((r.atTarget - r.atCurrent + Number.EPSILON) * 100) / 100);
});

test("employer-paid fees reduce what participants bear but never exceed non-fund fees", () => {
  const base = { participants: 10, recordkeeperFlat: 2000, funds: "F, 500000, 0.4" };
  const a = plan({ ...base, employerPaid: 0 });
  const b = plan({ ...base, employerPaid: 999999 });
  assert.equal(a.total, b.total);
  assert.equal(b.participantPaid, 2000);
  assert.ok(b.allInPct < a.allInPct);
});

test("band edges: a plan over $5M uses the next target", () => {
  assert.equal(plan({ participants: 5, funds: "F, 5000000, 0.1" }).targetPct, 1.05);
  assert.equal(plan({ participants: 5, funds: "F, 5000001, 0.1" }).targetPct, 0.85);
});

test("errors: no funds, zero balances, bad benchmark", () => {
  assert.ok(plan({ participants: 3, funds: "" }).error);
  assert.ok(plan({ participants: 3, funds: "F, 0, 0.1" }).error);
  assert.ok(plan({ participants: 3, funds: "F, 100, 0.1", benchmarks: "nope" }).error);
});

test("high expense-ratio funds are named and CSV totals match", () => {
  const r = plan(sampleInput());
  assert.ok(r.advice.some((a) => /Target Date 2045/.test(a)));
  const csv = toCsv(r);
  assert.match(csv, new RegExp(`total,${r.total.toFixed(2)},`));
});
