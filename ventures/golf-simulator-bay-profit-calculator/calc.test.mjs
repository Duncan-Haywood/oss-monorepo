import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, compareScenarios, sampleInput, sampleScenario, validateInput, resultText, resultCsv, serializeState, parseState, money, cents } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("hand-worked room: every line of the sample", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  near(r.avail, 3 * 14 * 7 * 52 / 12);
  const availPeak = r.avail * 0.35;
  const availOff = r.avail - availPeak;
  near(r.booked, availPeak * 0.5 + availOff * 0.18);
  near(r.memberHours, 75);
  near(r.walkInHours, r.booked - 75);
  near(r.blendRate, (availPeak * 0.5 * 55 + availOff * 0.18 * 35) / r.booked);
  near(r.walkInRevenue, r.blendRate * (r.booked - 75));
  near(r.memberRevenue, 3750);
  near(r.fbRevenue, r.booked * 2.5 * 12);
  near(r.revenue, r.walkInRevenue + 3750 + r.fbRevenue);
  near(r.staffCost, (3 * 14 * 7 * 52 / 12 / 3) * 17 * 1.12);
  near(r.fixed, 6500 + 900 + 450 + 700 + r.staffCost);
  near(r.profit, r.revenue - r.fbCost - r.cardFees - r.reserve - r.fixed);
  near(r.capex, 3 * 28000 + 45000);
  near(r.paybackMonths, r.capex / r.profit);
});

test("charging exactly the lowest rates earns exactly the target margin", () => {
  let seed = 5;
  const rnd = (lo, hi) => { seed = (seed * 16807) % 2147483647; return lo + ((seed - 1) / 2147483646) * (hi - lo); };
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = { ...sampleInput(), bays: Math.round(rnd(1, 8)), peakUtil: rnd(20, 90), offPeakUtil: rnd(5, 60), members: Math.round(rnd(0, 60)), rent: rnd(2000, 12000), targetMargin: rnd(5, 50), fbSpend: rnd(0, 20) };
    const base = solve(i);
    if (!base.ok || base.rateScale === null || base.rateScale <= 0 || base.memberOverbooked) continue;
    const quoted = solve({ ...i, peakRate: base.minPeakRate, offPeakRate: base.minOffPeakRate });
    if (!quoted.ok) continue;
    near(quoted.margin, i.targetMargin / 100, 1e-9);
    checked++;
  }
  assert.ok(checked > 150, `only ${checked} usable rooms`);
});

test("at the break-even utilization the room earns zero", () => {
  const r = solve(sampleInput());
  assert.ok(r.breakevenUtil > 0 && r.breakevenUtil < r.utilization);
  const s = r.breakevenUtil / r.utilization;
  const z = solve({ ...sampleInput(), peakUtil: 50 * s, offPeakUtil: 18 * s });
  near(z.profit, 0, 1e-6);
});

test("members take hours out of walk-in revenue", () => {
  const a = solve(sampleInput());
  const b = solve({ ...sampleInput(), hoursPerMember: 6 });
  assert.ok(b.walkInRevenue < a.walkInRevenue);
  near(b.walkInHours, a.walkInHours - 75);
  const over = solve({ ...sampleInput(), members: 400 });
  assert.equal(over.memberOverbooked, true);
  assert.ok(over.notes.some((n) => /Members use/.test(n)));
});

test("a losing room reports break-even and no payback", () => {
  const r = solve({ ...sampleInput(), peakUtil: 5, offPeakUtil: 2 });
  assert.ok(r.profit < 0);
  assert.equal(r.paybackMonths, null);
  assert.match(r.notes[0], /loses/);
});

test("validation rejects nonsense", () => {
  assert.ok(validateInput({ ...sampleInput(), bays: 2.5 }).length);
  assert.ok(validateInput({ ...sampleInput(), peakUtil: 120 }).length);
  assert.ok(validateInput({ ...sampleInput(), players: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), processPct: 10, reservePct: 20, targetMargin: 75 }).length);
  assert.equal(validateInput(sampleInput()).length, 0);
  assert.equal(solve({ ...sampleInput(), rent: NaN }).ok, false);
});

test("compare: Scenario B earns more, Scenario A pays back sooner", () => {
  const c = compareScenarios(sampleInput(), sampleScenario());
  assert.ok(c.ok);
  assert.equal(c.winnerProfit, "B");
  assert.equal(c.winnerPayback, "A");
  assert.equal(c.notes.length, 2);
  const bad = compareScenarios(sampleInput(), { bays: 0 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /^Scenario B:/);
});

test("exports, state round trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Golf simulator room check: 3 bays/);
  assert.match(resultCsv(r), /^item,amount\navailable_bay_hours,1274/);
  const back = parseState(serializeState(sampleInput(), sampleScenario()));
  assert.deepEqual(back.state, sampleInput());
  assert.deepEqual(back.scenario, sampleScenario());
  assert.ok(parseState("nope").error);
  assert.ok(parseState(JSON.stringify({ app: "other", input: {} })).error);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(cents(1.5), "$1.50");
});
