import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, compareJobs, sampleInput, sampleJob, validateInput, resultText, resultCsv, serializeState, parseState, money, cents } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("hand-worked charter: every line of the sample", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  near(r.revenue, 850);
  near(r.billedHours, 5); // 4 booked, 5 minimum
  near(r.driverHours, 6.5); // plus 1.5 deadhead
  near(r.labor, 6.5 * 28 * 1.12); // 203.84
  near(r.fuel, (90 / 8) * 3.9);
  near(r.wear, 0.55 * 90);
  near(r.gratuity, 42.5);
  near(r.processing, 25.5);
  near(r.depreciation, 85000 / 900);
  near(r.fixedShare, 38000 / 160);
  near(r.costs, 203.84 + 43.875 + 49.5 + 45 + 42.5 + 25.5 + 85000 / 900 + 237.5, 1e-6);
  near(r.profit, 850 - r.costs);
  near(r.margin, r.profit / 850);
  near(r.profitPerVehicleHour, r.profit / 6.5);
  near(r.annualProfit, r.profit * 160);
});

test("minimum hours bill the minimum, not the booked time", () => {
  const short = solve({ ...sampleInput(), hours: 2 });
  const atMin = solve({ ...sampleInput(), hours: 5 });
  near(short.billedHours, 5);
  near(short.costs, atMin.costs, 1e-9);
  const long = solve({ ...sampleInput(), hours: 8 });
  near(long.billedHours, 8);
  assert.equal(long.minApplied, false);
  assert.equal(short.minApplied, true);
});

test("quoting exactly the lowest price earns exactly the target margin", () => {
  let seed = 7;
  const rnd = (lo, hi) => { seed = (seed * 16807) % 2147483647; return lo + ((seed - 1) / 2147483646) * (hi - lo); };
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = { ...sampleInput(), hours: rnd(1, 10), minHours: rnd(0, 6), deadheadHours: rnd(0, 4), miles: rnd(0, 400), wage: rnd(12, 50), gratuityPct: rnd(0, 20), processPct: rnd(0, 6), targetMargin: rnd(5, 50), chartersPerYear: Math.round(rnd(10, 400)) };
    const base = solve(i);
    assert.ok(base.ok);
    const quoted = solve({ ...i, price: base.minPrice });
    assert.ok(quoted.ok);
    near(quoted.margin, i.targetMargin / 100, 1e-9);
    checked++;
  }
  assert.equal(checked, 300);
});

test("payback excludes the vehicle's own depreciation", () => {
  const r = solve(sampleInput());
  near(r.contribution, r.revenue - (r.costs - r.depreciation));
  near(r.paybackCharters, 85000 / r.contribution);
  near(r.paybackYears, r.paybackCharters / 90);
  assert.equal(r.paybackWithinLife, true);
  assert.equal(solve({ ...sampleInput(), price: 300 }).paybackCharters, null);
});

test("break-even charters cover the yearly overhead exactly", () => {
  const r = solve(sampleInput());
  near(r.breakevenCharters * (r.revenue - (r.costs - r.fixedShare)), 38000);
});

test("driver pay scales with paid hours, and deadhead is paid", () => {
  const a = solve({ ...sampleInput(), deadheadHours: 0 });
  const b = solve({ ...sampleInput(), deadheadHours: 5 });
  near(b.labor - a.labor, 5 * 28 * 1.12);
});

test("a losing charter says so", () => {
  const r = solve({ ...sampleInput(), price: 400 });
  assert.ok(r.profit < 0);
  assert.match(r.notes[0], /loses/);
});

test("validation rejects nonsense", () => {
  assert.ok(validateInput({ ...sampleInput(), price: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), hours: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), lifeCharters: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), gratuityPct: 40, processPct: 10, targetMargin: 60 }).length);
  assert.equal(validateInput(sampleInput()).length, 0);
  assert.equal(solve({ ...sampleInput(), miles: NaN }).ok, false);
});

test("compare: Charter A makes more per charter, Charter B more per vehicle hour", () => {
  const c = compareJobs(sampleInput(), sampleJob());
  assert.ok(c.ok);
  assert.equal(c.winnerJob, "A");
  assert.equal(c.winnerHour, "B");
  assert.equal(c.notes.length, 2);
  const bad = compareJobs(sampleInput(), { hours: 0 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /^Charter B:/);
});

test("exports, state round trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Lowest quote for a 25% margin: \$1006\.21/);
  assert.match(resultCsv(r), /^item,amount\nrevenue,850/);
  const back = parseState(serializeState(sampleInput(), sampleJob()));
  assert.deepEqual(back.state, sampleInput());
  assert.deepEqual(back.job, sampleJob());
  assert.ok(parseState("nope").error);
  assert.ok(parseState(JSON.stringify({ app: "other", input: {} })).error);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(cents(1.5), "$1.50");
});
