import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, compareJobs, sampleInput, sampleJob, validateInput, resultText, resultCsv, serializeState, parseState, money, cents } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("hand-worked short run: every line of the sample", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  near(r.quoted, 252); // 140 loaded miles x $1.80
  near(r.revenue, 450); // minimum charge applies
  assert.equal(r.minApplied, true);
  near(r.totalMiles, 200);
  near(r.labor, 110);
  near(r.fuel, (200 / 17) * 3.7);
  near(r.wear, 36);
  near(r.perDiem, 45);
  near(r.hotel, 0);
  near(r.tolls, 12);
  near(r.processing, 13.5);
  near(r.depreciation, 38000 / 1500);
  near(r.fixedShare, 5500 / 120);
  near(r.costs, 110 + (200 / 17) * 3.7 + 36 + 45 + 12 + 13.5 + 38000 / 1500 + 5500 / 120);
  near(r.profit, 450 - r.costs);
  near(r.profitPerHour, r.profit / 5);
  near(r.annualProfit, r.profit * 120);
});

test("per-mile quote: minimum charge only bites below it", () => {
  const low = solve({ ...sampleInput(), loadedMiles: 100 });
  const high = solve({ ...sampleInput(), loadedMiles: 400 });
  near(low.revenue, 450);
  assert.equal(low.minApplied, true);
  near(high.revenue, 720);
  assert.equal(high.minApplied, false);
});

test("flat or day price mode ignores loaded miles for revenue", () => {
  const r = solve({ ...sampleInput(), mode: "flat", price: 600, loadedMiles: 0 });
  assert.ok(r.ok);
  near(r.revenue, 600);
  near(r.minQuote, r.needRevenue);
  assert.equal(solve({ ...sampleInput(), mode: "mile", loadedMiles: 0 }).ok, false);
});

test("quoting exactly the lowest quote earns exactly the target margin (both modes)", () => {
  let seed = 11;
  const rnd = (lo, hi) => { seed = (seed * 16807) % 2147483647; return lo + ((seed - 1) / 2147483646) * (hi - lo); };
  let checked = 0;
  for (let n = 0; n < 400; n++) {
    const mode = n % 2 ? "flat" : "mile";
    const i = {
      ...sampleInput(), mode, loadedMiles: rnd(20, 900), minCharge: 0, deadheadMiles: rnd(0, 300), driverHours: rnd(2, 40), days: Math.round(rnd(1, 5)), nights: Math.round(rnd(0, 4)),
      tolls: rnd(0, 80), wage: rnd(0, 40), processPct: rnd(0, 6), targetMargin: rnd(5, 50), runsPerYear: Math.round(rnd(10, 300)),
    };
    const base = solve({ ...i, price: 1 });
    assert.ok(base.ok);
    const quoted = solve({ ...i, price: base.minQuote });
    assert.ok(quoted.ok);
    near(quoted.margin, i.targetMargin / 100, 1e-9);
    checked++;
  }
  assert.equal(checked, 400);
});

test("when the minimum charge already clears the target the tool says so", () => {
  const r = solve({ ...sampleInput(), minCharge: 600 });
  assert.equal(r.minChargeCovers, true);
  assert.ok(r.margin > 0.3);
  assert.match(resultText(r), /minimum charge already covers it/);
  assert.equal(solve(sampleInput()).minChargeCovers, false);
});

test("break-even runs cover the yearly overhead exactly", () => {
  const r = solve(sampleInput());
  near(r.breakevenRuns * (r.revenue - (r.costs - r.fixedShare)), 5500);
  assert.equal(solve({ ...sampleInput(), mode: "flat", price: 120, minCharge: 0 }).breakevenRuns, null);
});

test("deadhead is paid for in fuel and wear, and hotel and meals scale with days", () => {
  const a = solve({ ...sampleInput(), deadheadMiles: 0 });
  const b = solve({ ...sampleInput(), deadheadMiles: 100 });
  near(b.costs - a.costs, 100 / 17 * 3.7 + 100 * 0.18);
  const c = solve({ ...sampleInput(), days: 3, nights: 2 });
  near(c.perDiem, 135);
  near(c.hotel, 220);
});

test("a losing run says so", () => {
  const r = solve({ ...sampleInput(), minCharge: 0, loadedMiles: 60 });
  assert.ok(r.profit < 0);
  assert.match(r.notes[0], /loses/);
});

test("validation rejects nonsense", () => {
  assert.ok(validateInput({ ...sampleInput(), price: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), mode: "weekly" }).length);
  assert.ok(validateInput({ ...sampleInput(), driverHours: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), mpg: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), processPct: 10, targetMargin: 95 }).length);
  assert.equal(validateInput(sampleInput()).length, 0);
  assert.equal(solve({ ...sampleInput(), deadheadMiles: NaN }).ok, false);
});

test("compare: Run B makes more per run, Run A more per driver hour", () => {
  const c = compareJobs(sampleInput(), sampleJob());
  assert.ok(c.ok);
  assert.equal(c.winnerJob, "B");
  assert.equal(c.winnerHour, "A");
  assert.equal(c.notes.length, 2);
  const bad = compareJobs(sampleInput(), { driverHours: 0 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /^Run B:/);
});

test("exports, state round trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Lowest quote for a 30% margin: \$3\.39 per loaded mile/);
  assert.match(resultCsv(r), /^item,amount\nrevenue,450/);
  const back = parseState(serializeState(sampleInput(), sampleJob()));
  assert.deepEqual(back.state, sampleInput());
  assert.deepEqual(back.job, sampleJob());
  assert.ok(parseState("nope").error);
  assert.ok(parseState(JSON.stringify({ app: "other", input: {} })).error);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(cents(1.5), "$1.50");
});
