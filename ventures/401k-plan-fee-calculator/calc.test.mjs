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

// Red team 2026-11-14: "[\d,]+" read "$,-$,: 1" as a 0-0 band and "1.2.3%" as NaN, with no error.
test("benchmark bands need real numbers: commas only between thousands", () => {
  for (const bad of ["$,-$,: 1", "1,,000-5000: 1", "0-5,00: 1", "0-1000: 1.2.3", "0-1000: ."]) {
    assert.ok(parseBenchmarks(bad).errors.length, bad);
  }
  const ok = parseBenchmarks("$0-$1,000,000: 1.25%\n1,000,001+: .5");
  assert.deepEqual(ok.errors, []);
});

test("expense ratios up to 5% are taken; above 5% is called a typo", () => {
  assert.deepEqual(parseFunds("A, 1000, 5").errors, []);
  assert.match(parseFunds("A, 1000, 5.5").errors[0], /looks wrong/);
});

test("a $1 fee line is listed, a $0 one is dropped", () => {
  const r = plan({ ...sampleInput(), otherFlat: 1, advisorFlat: 0 });
  assert.ok(r.lines.some((l) => l.label.startsWith("TPA") && l.amount === 1));
  assert.ok(!r.lines.some((l) => l.label === "Advisor, flat"));
});

test("no employer-paid sentence when the employer pays nothing", () => {
  assert.ok(!plan({ ...sampleInput(), employerPaid: 0 }).advice.some((a) => /employer pays/.test(a)));
  assert.ok(plan({ ...sampleInput(), employerPaid: 1000 }).advice.some((a) => /employer pays \$1,000/.test(a)));
});

test("csv percent column is each line over assets", () => {
  const r = plan(sampleInput());
  const csv = toCsv(r);
  for (const l of r.lines) assert.ok(csv.includes(`${l.amount.toFixed(2)},${((l.amount / r.assets) * 100).toFixed(3)}`), l.label);
  assert.match(csv, /^Fund expense ratios,\d+\.\d\d,0\.\d{3}$/m);
});

// Red team 2026-11-14: `num(grossReturn) || 6` turned a typed 0% return into 6%.
test("a typed 0% gross return is used, blank means the 6% default", () => {
  assert.equal(plan({ ...sampleInput(), grossReturn: "0" }).gross, 0);
  assert.equal(plan({ ...sampleInput(), grossReturn: 0 }).gross, 0);
  assert.equal(plan({ ...sampleInput(), grossReturn: "" }).gross, 6);
  assert.equal(plan({ ...sampleInput(), grossReturn: undefined }).gross, 6);
  assert.equal(plan({ ...sampleInput(), grossReturn: "abc" }).gross, 6);
});
