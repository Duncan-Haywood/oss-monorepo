import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, compareJobs, sampleInput, sampleJob, validateInput, resultText, resultCsv, serializeState, parseState, money, cents } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("hand-worked job: every line of the sample", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  near(r.revenue, 725);
  near(r.crewHours, 15);
  near(r.labor, 15 * 20 * 1.12); // 336
  near(r.fuel, (40 / 11) * 3.7);
  near(r.truckWear, 14);
  near(r.processing, 21.75);
  near(r.depreciation, 5200 / 150);
  near(r.fixedShare, 6000 / 90);
  near(r.costs, 336 + 13.4545454545 + 14 + 18 + 25 + 21.75 + 34.6666666667 + 66.6666666667, 1e-6);
  near(r.profit, 725 - r.costs);
  near(r.margin, r.profit / 725);
  near(r.profitPerCrewHour, r.profit / 15);
  near(r.setAside, r.profit * 0.25);
  near(r.annualProfit, r.profit * 90);
});

test("quoting exactly the lowest total earns exactly the target margin", () => {
  let seed = 11;
  const rnd = (lo, hi) => { seed = (seed * 16807) % 2147483647; return lo + ((seed - 1) / 2147483646) * (hi - lo); };
  for (let n = 0; n < 300; n++) {
    const i = { ...sampleInput(), crewSize: Math.round(rnd(1, 8)), onsiteHours: rnd(1, 8), driveHours: rnd(0, 3), loadHours: rnd(0, 3), miles: rnd(0, 200), wage: rnd(10, 40), processPct: rnd(0, 6), targetMargin: rnd(5, 60), jobsPerYear: Math.round(rnd(10, 300)) };
    const base = solve(i);
    const quoted = solve({ ...i, rentPrice: base.minRentPrice, deliveryFee: i.deliveryFee });
    if (base.minRentPrice <= 0) continue;
    near(quoted.margin, i.targetMargin / 100, 1e-9);
  }
});

test("payback excludes the tent's own depreciation and scales with price", () => {
  const r = solve(sampleInput());
  near(r.contribution, r.revenue - (r.costs - r.depreciation));
  near(r.paybackRentals, 5200 / r.contribution);
  near(r.paybackYears, r.paybackRentals / 25);
  assert.equal(r.paybackWithinLife, true);
  const cheap = solve({ ...sampleInput(), rentPrice: 100 });
  assert.equal(cheap.paybackRentals, null);
});

test("break-even jobs cover the yearly overhead exactly", () => {
  const r = solve(sampleInput());
  const afterWear = r.revenue - (r.costs - r.fixedShare);
  near(r.breakevenJobs * afterWear, 6000);
});

test("labor scales with crew size and hours", () => {
  const a = solve(sampleInput());
  const b = solve({ ...sampleInput(), crewSize: 6 });
  near(b.labor / a.labor, 2);
});

test("a losing job says so", () => {
  const r = solve({ ...sampleInput(), rentPrice: 300, deliveryFee: 0 });
  assert.ok(r.profit < 0);
  assert.match(r.notes[0], /loses/);
});

test("validation rejects nonsense", () => {
  assert.ok(validateInput({ ...sampleInput(), crewSize: 2.5 }).length);
  assert.ok(validateInput({ ...sampleInput(), rentPrice: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), processPct: 10, targetMargin: 95 }).length);
  assert.ok(validateInput({ ...sampleInput(), lifeRentals: 0 }).length);
  assert.equal(validateInput(sampleInput()).length, 0);
  assert.equal(solve({ ...sampleInput(), miles: NaN }).ok, false);
});

test("compare: Job A makes more per job, Job B more per crew hour", () => {
  const c = compareJobs(sampleInput(), sampleJob());
  assert.ok(c.ok);
  assert.equal(c.winnerJob, "A");
  assert.equal(c.winnerHour, "B");
  assert.equal(c.notes.length, 2);
  const bad = compareJobs(sampleInput(), { crewSize: 0 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /^Job B:/);
});

test("exports, state round trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Lowest quote for a 30% margin: \$757\.89/);
  assert.match(resultCsv(r), /^item,amount\nrevenue,725/);
  const back = parseState(serializeState(sampleInput(), sampleJob()));
  assert.deepEqual(back.state, sampleInput());
  assert.deepEqual(back.job, sampleJob());
  assert.ok(parseState("nope").error);
  assert.ok(parseState(JSON.stringify({ app: "other", input: {} })).error);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(cents(1.5), "$1.50");
});
