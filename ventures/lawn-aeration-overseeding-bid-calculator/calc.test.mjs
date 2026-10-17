import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, compareJobs, sampleInput, sampleJob, validateInput, resultText, resultCsv, serializeState, parseState, money, cents } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("hand-worked job: every line of the sample", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  near(r.turf, 9500);
  near(r.aerRate, 2 * 2.5 * 5280 * 0.6); // 15,840 sq ft an hour
  near(r.aerHours, (9500 * 2) / 15840);
  near(r.seedHours, 9500 / 25000);
  near(r.clockHours, r.aerHours + 0.38 + 0.5);
  near(r.crewHours, 2 * (r.clockHours + 1));
  near(r.labor, r.crewHours * 22 * 1.12);
  near(r.seedLbs, 57);
  near(r.seedCost, 57 * 2.8);
  near(r.fertCost, 9.5 * 3 * 1.1);
  near(r.machine, r.aerHours * (18 + 0.8 * 3.7));
  near(r.truckFuel, (30 / 13) * 3.7);
  near(r.truckWear, 10.5);
  near(r.processing, 0.03 * 520);
  near(r.fixedShare, 40);
  near(r.revenue, 520);
  near(r.profit, 520 - r.costs);
  near(r.pricePerKsf, 520 / 9.5);
  near(r.annualProfit, r.profit * 120);
});

test("quoting exactly the lowest total earns exactly the target margin", () => {
  let seed = 11;
  const rnd = (lo, hi) => { seed = (seed * 16807) % 2147483647; return lo + ((seed - 1) / 2147483646) * (hi - lo); };
  for (let n = 0; n < 300; n++) {
    const lot = rnd(3000, 80000);
    const i = { ...sampleInput(), lotSqft: lot, bedsSqft: rnd(0, lot * 0.5), passes: Math.round(rnd(1, 3)), crewSize: Math.round(rnd(1, 5)), miles: rnd(0, 120), wage: rnd(12, 40), processPct: rnd(0, 6), targetMargin: rnd(5, 60), jobsPerYear: Math.round(rnd(20, 400)), minFee: 0 };
    const base = solve(i);
    const quoted = solve({ ...i, price: base.minRevenue });
    near(quoted.margin, i.targetMargin / 100, 1e-9);
  }
});

test("the minimum job fee bills the floor and says so", () => {
  const small = solve({ ...sampleInput(), price: 90, minFee: 150, lotSqft: 3000, bedsSqft: 500 });
  assert.equal(small.minFeeApplied, true);
  near(small.revenue, 150);
  assert.ok(small.notes.some((n) => /minimum job fee/.test(n)));
  assert.equal(solve(sampleInput()).minFeeApplied, false);
});

test("a second pass doubles aerator hours and seed cost scales with turf", () => {
  const a = solve({ ...sampleInput(), passes: 1 });
  const b = solve({ ...sampleInput(), passes: 2 });
  near(b.aerHours / a.aerHours, 2);
  const big = solve({ ...sampleInput(), lotSqft: 22000, bedsSqft: 2500 });
  near(big.seedCost / b.seedCost, 19500 / 9500);
});

test("break-even jobs cover the yearly overhead exactly", () => {
  const r = solve(sampleInput());
  const afterWear = r.revenue - (r.costs - r.fixedShare);
  near(r.breakevenJobs * afterWear, 4800);
  assert.equal(solve({ ...sampleInput(), price: 100, minFee: 0 }).breakevenJobs, null);
});

test("a losing job says so", () => {
  const r = solve({ ...sampleInput(), price: 200, minFee: 0 });
  assert.ok(r.profit < 0);
  assert.match(r.notes[0], /loses/);
});

test("validation rejects nonsense", () => {
  assert.ok(validateInput({ ...sampleInput(), crewSize: 2.5 }).length);
  assert.ok(validateInput({ ...sampleInput(), bedsSqft: 12000 }).length);
  assert.ok(validateInput({ ...sampleInput(), passes: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), efficiencyPct: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), processPct: 10, targetMargin: 95 }).length);
  assert.equal(validateInput(sampleInput()).length, 0);
  assert.equal(solve({ ...sampleInput(), miles: NaN }).ok, false);
});

test("compare: the bigger lot beats the sample job per job and per crew hour", () => {
  const c = compareJobs(sampleInput(), sampleJob());
  assert.ok(c.ok);
  assert.equal(c.winnerJob, "B");
  assert.equal(c.winnerHour, "B");
  near(c.profitDifference, c.b.profit - c.a.profit);
  const bad = compareJobs(sampleInput(), { passes: 0 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /^Job B:/);
});

test("exports, state round trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Lowest quote for a 30% margin: \$646\.10/);
  assert.match(resultCsv(r), /^item,amount\nturf_sqft,9500/);
  const back = parseState(serializeState(sampleInput(), sampleJob()));
  assert.deepEqual(back.state, sampleInput());
  assert.deepEqual(back.job, sampleJob());
  assert.ok(parseState("nope").error);
  assert.ok(parseState(JSON.stringify({ app: "other", input: {} })).error);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(cents(1.5), "$1.50");
});
