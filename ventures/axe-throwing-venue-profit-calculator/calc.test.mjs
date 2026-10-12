import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, compareScenarios, validateInput, loanPayment, sampleInput, sampleScenario, resultText, resultCsv, serializeState, parseState } from "./calc.mjs";

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

// small deterministic PRNG so the random-venue tests are reproducible
function rng(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }
function venue(rand) {
  const u = (lo, hi) => lo + rand() * (hi - lo);
  return {
    ...sampleInput(), lanes: Math.round(u(6, 30)), hoursPerDay: Math.round(u(5, 12)), daysPerWeek: Math.round(u(4, 7)), throwersPerLane: Math.round(u(2, 6)),
    fill: u(8, 50), price: u(12, 40), barSpend: u(0, 12), leagueNights: Math.round(u(0, 4)), leaguePlayers: Math.round(u(0, 40)), seasonFee: u(60, 200),
    events: Math.round(u(0, 40)), eventPrice: u(300, 2000), coaches: Math.round(u(1, 8)), rent: u(5000, 30000), wearPerThrower: u(0, 2),
    financedPct: rand() < 0.5 ? 0 : u(20, 100), targetMargin: u(5, 30), targetPaybackMonths: u(18, 84),
  };
}

test("worked example: sample venue recomputed by hand", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  const total = 10 * 8 * 1 * 6 * 52 / 12;
  close(r.total, total);
  const leagueLanes = Math.ceil(40 / 4);
  const walkSlots = total - 3 * leagueLanes * 2 * 1 * 52 / 12;
  close(r.avail, walkSlots);
  const walk = walkSlots * 0.18 * 4;
  close(r.visits, walk);
  const leagueRev = 3 * 40 * 100 * 4 / 12;
  close(r.leagueRevenue, leagueRev);
  const throwers = walk + 3 * 40 * 8 * 4 / 12 + 12 * 20;
  close(r.throwers, throwers);
  const revenue = walk * 22 + leagueRev + 12 * 600 + throwers * 6;
  close(r.revenue, revenue);
  const staff = 8 * 6 * 52 / 12 * 4 * 17 * 1.12;
  close(r.staffCost, staff);
  const fixed = staff + 14000 + 1800 + 2400 + 3000;
  const profit = revenue - throwers * 6 * 0.3 - 12 * 150 - throwers * 0.6 - revenue * 0.03 - fixed;
  close(r.profit, profit);
  close(r.paybackMonths, 400000 / profit);
});

test("leagues take lane time from walk-in bookings", () => {
  const base = sampleInput();
  const a = solve({ ...base, leagueNights: 0 }), b = solve(base);
  assert.ok(a.avail > b.avail);
  close(a.total, b.total);
  assert.equal(a.leagueRevenue, 0);
});

test("league revenue recurs per season and is paid once per player", () => {
  const base = sampleInput();
  const a = solve(base), b = solve({ ...base, seasonsPerYear: 2 });
  close(b.leagueRevenue, a.leagueRevenue / 2);
  close(a.leagueRevenue, base.leagueNights * base.leaguePlayers * base.seasonFee * base.seasonsPerYear / 12);
});

test("break-even fill makes profit zero", () => {
  const rand = rng(7);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = venue(rand);
    const r = solve(i);
    if (!r.ok || !r.breakevenFill) continue;
    const s = r.breakevenFill / r.fillRate;
    const back = solve({ ...i, fill: i.fill * s });
    close(back.profit, 0, 1e-6);
    checked++;
  }
  assert.ok(checked > 100);
});

test("lowest price for margin reproduces the target margin", () => {
  const rand = rng(11);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = venue(rand);
    const r = solve(i);
    if (!r.ok || r.minPrice === null || r.minPrice <= 0) continue;
    const back = solve({ ...i, price: r.minPrice });
    close(back.margin, i.targetMargin / 100, 1e-6);
    checked++;
  }
  assert.ok(checked > 100);
});

test("lowest price for payback reproduces the payback target", () => {
  const rand = rng(13);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = venue(rand);
    const r = solve(i);
    if (!r.ok || r.minPaybackPrice === null || r.minPaybackPrice <= 0) continue;
    const back = solve({ ...i, price: r.minPaybackPrice });
    close(back.paybackMonths, i.targetPaybackMonths, 1e-6);
    checked++;
  }
  assert.ok(checked > 100);
});

test("payback ignores the loan; profit includes it", () => {
  const base = sampleInput();
  const a = solve(base), b = solve({ ...base, financedPct: 80 });
  close(a.paybackMonths, b.paybackMonths);
  assert.ok(b.profit < a.profit);
  close(a.profit - b.profit, b.loanPayment);
});

test("sensitivity: fewer walk-in visits lowers profit by the lost visit margin", () => {
  const r = solve(sampleInput());
  assert.equal(r.sensitivity.length, 2);
  assert.ok(r.sensitivity[1].profit < r.sensitivity[0].profit && r.sensitivity[0].profit < r.profit);
  const perVisit = 22 + 6 - 6 * 0.3 - 0.6 - (22 + 6) * 0.03;
  close(r.profit - r.sensitivity[0].profit, r.visits * 0.1 * perVisit);
});

test("loan payment formula", () => {
  close(loanPayment(100000, 12, 12), 8884.88, 1e-5);
  assert.equal(loanPayment(0, 10, 12), 0);
  close(loanPayment(1200, 0, 12), 100);
});

test("validation rejects bad input and never throws", () => {
  assert.ok(validateInput({ ...sampleInput(), fill: 120 }).length);
  assert.ok(validateInput({ ...sampleInput(), lanes: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), lanes: 12.5 }).length);
  assert.ok(validateInput({ ...sampleInput(), processPct: 15, targetMargin: 90 }).length);
  assert.ok(validateInput({ ...sampleInput(), leaguePlayers: 400 }).length, "league needs more lanes than exist");
  assert.ok(validateInput({ ...sampleInput(), leagueHours: 9 }).length, "league longer than opening hours");
  assert.equal(solve({ ...sampleInput(), price: NaN }).ok, false);
  assert.equal(validateInput(sampleInput()).length, 0);
});

test("league nights that use every lane-hour are rejected", () => {
  const i = { ...sampleInput(), lanes: 10, leagueNights: 7, leaguePlayers: 40, leagueHours: 8, hoursPerDay: 8, daysPerWeek: 7 };
  assert.match(validateInput(i)[0], /use all of your lane time/);
});

test("zero fill: no break-even, no payback, no crash", () => {
  const r = solve({ ...sampleInput(), fill: 0 });
  assert.ok(r.ok);
  assert.equal(r.breakevenFill, null);
  assert.equal(r.minPrice, null);
});

test("a venue already above target margin reports it", () => {
  const r = solve({ ...sampleInput(), price: 40 });
  assert.ok(r.meets);
  assert.match(r.notes[0], /clears your target/);
});

test("compare scenarios picks the more profitable setup", () => {
  const c = compareScenarios(sampleInput(), sampleScenario());
  assert.ok(c.ok);
  assert.ok(["A", "B", "tie"].includes(c.winnerProfit));
  const bad = compareScenarios(sampleInput(), { fill: 500 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /^Scenario B/);
});

test("exports and saved state round-trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /not tax, legal, lending or financial advice/);
  assert.match(resultCsv(r), /^item,amount\nwalk_in_lane_slots,/);
  const saved = serializeState(r.input, sampleScenario());
  const back = parseState(saved);
  assert.deepEqual(back.state, r.input);
  assert.ok(parseState("{").error);
  assert.ok(parseState('{"app":"other","input":{}}').error);
});
