import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, sampleInput, validateInput, resultText, resultCsv, serializeState, parseState, MAX_LOCATIONS } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const one = (over = {}, loc = {}) => ({ ...sampleInput(), costPerMile: 0, prizePct: 0, cardSharePct: 0, cardFeePct: 0, repairPerMachine: 0, licensePerMachineYear: 0, machinePrice: 0, lifeYears: 1, ...over, locations: [{ name: "x", machines: 1, weeklyTake: 100, commissionPct: 50, visitsPerMonth: 4, miles: 0, minutes: 60, ...loc }] });

test("profit for a hand-worked location", () => {
  const r = solve(one()).rows[0];
  near(r.gross, (100 * 52) / 12);
  near(r.commission, r.gross / 2);
  near(r.profit, r.gross / 2);
  near(r.hours, 4);
});

test("every cost comes off the profit", () => {
  const i = one({ prizePct: 10, cardSharePct: 50, cardFeePct: 4, repairPerMachine: 12, licensePerMachineYear: 120, machinePrice: 1200, lifeYears: 5, costPerMile: 0.5 }, { machines: 2, miles: 20 });
  const r = solve(i).rows[0];
  const g = (100 * 2 * 52) / 12;
  near(r.prizes, g * 0.1);
  near(r.cardFees, g * 0.5 * 0.04);
  near(r.repairs, 24);
  near(r.licence, 20);
  near(r.wear, (1200 / 60) * 2);
  near(r.driving, 4 * 20 * 0.5);
  near(r.profit, g - r.commission - r.prizes - r.cardFees - r.repairs - r.licence - r.wear - r.driving);
});

test("the break-even take and the highest commission each earn exactly the target hourly", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 300; t++) {
    const base = one({ targetHourly: 10 + rnd() * 80, costPerMile: rnd(), prizePct: rnd() * 20, cardSharePct: rnd() * 100, cardFeePct: rnd() * 5, repairPerMachine: rnd() * 40, licensePerMachineYear: rnd() * 300, machinePrice: rnd() * 6000, lifeYears: 3 + rnd() * 8 },
      { machines: 1 + Math.floor(rnd() * 6), weeklyTake: 50 + rnd() * 400, commissionPct: 20 + rnd() * 40, visitsPerMonth: 1 + rnd() * 8, miles: rnd() * 60, minutes: 15 + rnd() * 90 });
    const r = solve(base).rows[0];
    const l = base.locations[0];
    if (r.breakEvenTake != null) near(solve({ ...base, locations: [{ ...l, weeklyTake: r.breakEvenTake }] }).rows[0].perHour, base.targetHourly, 1e-5);
    if (r.maxCommissionPct >= 0 && r.maxCommissionPct <= 90) near(solve({ ...base, locations: [{ ...l, commissionPct: r.maxCommissionPct }] }).rows[0].perHour, base.targetHourly, 1e-5);
    assert.equal(r.meets, r.perHour >= base.targetHourly - 1e-9);
  }
});

test("a higher commission lowers profit and the highest commission does not depend on it", () => {
  const a = solve(one({}, { commissionPct: 30 })).rows[0];
  const b = solve(one({}, { commissionPct: 60 })).rows[0];
  assert.ok(a.profit > b.profit);
  near(a.maxCommissionPct, b.maxCommissionPct);
});

test("a location can be unreachable at any commission", () => {
  const r = solve(one({ targetHourly: 500 }, { weeklyTake: 20 }));
  assert.ok(r.rows[0].maxCommissionPct < 0);
  assert.ok(r.notes.some((n) => /no commission reaches/.test(n)));
});

test("losing locations are named", () => {
  const r = solve(sampleInput());
  assert.equal(r.losingCount, 2);
  assert.ok(r.notes.some((n) => /lose money/.test(n) && /Truck stop/.test(n)));
});

test("route totals add up", () => {
  const r = solve(sampleInput());
  near(r.totals.profit, r.rows.reduce((a, x) => a + x.profit, 0));
  near(r.totals.perHour, r.totals.profit / r.totals.hours);
  assert.equal(r.totals.machines, 14);
});

test("validation rejects bad input", () => {
  assert.equal(validateInput(sampleInput()).length, 0);
  assert.ok(validateInput({ ...sampleInput(), locations: [] }).length);
  assert.ok(validateInput({ ...sampleInput(), lifeYears: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), cardFeePct: 20 }).length);
  assert.ok(validateInput({ ...sampleInput(), locations: Array(MAX_LOCATIONS + 1).fill(sampleInput().locations[0]) }).length);
  assert.ok(validateInput(one({}, { machines: 1.5 })).length);
  assert.ok(validateInput(one({}, { commissionPct: 95 })).length);
  assert.equal(solve({ ...sampleInput(), locations: [] }).ok, false);
});

test("exports and save/load round trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Corner bar/);
  assert.equal(resultCsv(r).split("\n").length, 1 + r.rows.length);
  const back = parseState(serializeState(r.input));
  assert.deepEqual(back.state, r.input);
  assert.ok(parseState("nope").error);
  assert.ok(parseState(JSON.stringify({ app: "other", input: {} })).error);
});
