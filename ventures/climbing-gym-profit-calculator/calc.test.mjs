import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, compareScenarios, validateInput, loanPayment, sampleInput, sampleScenario, resultText, resultCsv, serializeState, parseState } from "./calc.mjs";

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

// small deterministic PRNG so the random-gym tests are reproducible
function rng(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }
function gym(rand) {
  const u = (lo, hi) => lo + rand() * (hi - lo);
  return {
    ...sampleInput(), capacity: Math.round(u(60, 300)), openHours: Math.round(u(50, 100)), dayPasses: Math.round(u(300, 3000)), dayPassPrice: u(15, 35),
    members: Math.round(u(100, 900)), memberFee: u(45, 110), kids: Math.round(u(0, 150)), tuition: u(80, 250), parties: Math.round(u(0, 60)), partyPrice: u(200, 500),
    staff: Math.round(u(1, 5)), setters: u(3000, 12000), rent: u(8000, 40000), financedPct: rand() < 0.5 ? 0 : u(20, 100), targetMargin: u(5, 30), targetPaybackMonths: u(18, 84),
  };
}

test("worked example: sample gym recomputed by hand", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  close(r.visits, 1300 + 430 * 6);
  const revenue = 1300 * 22 + 430 * 72 + 60 * 160 + 25 * 350 + r.visits * 4;
  close(r.revenue, revenue);
  const staff = 80 * 52 / 12 * 3 * 17 * 1.12;
  close(r.staffCost, staff);
  const fixed = staff + 7000 + 21000 + 3500 + 2500 + 3500;
  close(r.fixed, fixed);
  const profit = revenue - r.visits * 4 * 0.45 - 60 * 160 * 0.4 - 25 * 90 - revenue * 0.06 - fixed;
  close(r.profit, profit);
  close(r.paybackMonths, 800000 / profit);
});

test("break-even demand is exact: profit(s) is linear and zero at the reported share", () => {
  const rand = rng(17);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = gym(rand);
    const r = solve(i);
    if (!r.ok || r.breakevenDemand === null) continue;
    // profit at 100% and at the sensitivity points are collinear with the zero at breakevenDemand
    const p1 = r.profit, p9 = r.sensitivity[0].profit;
    const slope = (p1 - p9) / 0.1;
    close(p1 - slope * (1 - r.breakevenDemand), 0, 1e-6);
    checked++;
  }
  assert.ok(checked > 100);
});

test("lowest day pass for margin reproduces the target margin", () => {
  const rand = rng(11);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = gym(rand);
    const r = solve(i);
    if (!r.ok || r.minPassPrice === null || r.minPassPrice <= 0) continue;
    close(solve({ ...i, dayPassPrice: r.minPassPrice }).margin, i.targetMargin / 100, 1e-6);
    checked++;
  }
  assert.ok(checked > 100);
});

test("lowest membership fee for margin reproduces the target margin", () => {
  const rand = rng(19);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = gym(rand);
    const r = solve(i);
    if (!r.ok || r.minMemberFee === null || r.minMemberFee <= 0) continue;
    close(solve({ ...i, memberFee: r.minMemberFee }).margin, i.targetMargin / 100, 1e-6);
    checked++;
  }
  assert.ok(checked > 100);
});

test("lowest day pass for payback reproduces the payback target", () => {
  const rand = rng(13);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = gym(rand);
    const r = solve(i);
    if (!r.ok || r.minPaybackPassPrice === null || r.minPaybackPassPrice <= 0) continue;
    close(solve({ ...i, dayPassPrice: r.minPaybackPassPrice }).paybackMonths, i.targetPaybackMonths, 1e-6);
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

test("sensitivity: less demand lowers profit by the lost visit margin", () => {
  const r = solve(sampleInput());
  assert.equal(r.sensitivity.length, 2);
  assert.ok(r.sensitivity[1].profit < r.sensitivity[0].profit && r.sensitivity[0].profit < r.profit);
  const f = 0.06;
  const lost = 0.1 * (1300 * 22 * (1 - f) + 430 * 72 * (1 - f) + r.visits * 4 * (1 - 0.45 - f));
  close(r.profit - r.sensitivity[0].profit, lost);
});

test("loan payment formula", () => {
  close(loanPayment(100000, 12, 12), 8884.88, 1e-5);
  assert.equal(loanPayment(0, 10, 12), 0);
  close(loanPayment(1200, 0, 12), 100);
});

test("validation rejects bad input and never throws", () => {
  assert.ok(validateInput({ ...sampleInput(), members: -1 }).length);
  assert.ok(validateInput({ ...sampleInput(), capacity: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), members: 12.5 }).length);
  assert.ok(validateInput({ ...sampleInput(), processPct: 15, reservePct: 30, targetMargin: 60 }).length);
  assert.equal(solve({ ...sampleInput(), dayPassPrice: NaN }).ok, false);
  assert.equal(validateInput(sampleInput()).length, 0);
});

test("no day passes and no members: no break-even, no minimum price, no crash", () => {
  const r = solve({ ...sampleInput(), dayPasses: 0, members: 0 });
  assert.ok(r.ok);
  assert.equal(r.minPassPrice, null);
  assert.equal(r.minMemberFee, null);
});

test("a gym already above target margin reports it", () => {
  const r = solve({ ...sampleInput(), memberFee: 140 });
  assert.ok(r.meets);
  assert.match(r.notes[0], /clears your target/);
});

test("crowding note fires when average use is high", () => {
  const r = solve({ ...sampleInput(), capacity: 30 });
  assert.ok(r.notes.some((n) => /crowded/.test(n)));
});

test("compare scenarios picks the more profitable plan", () => {
  const c = compareScenarios(sampleInput(), sampleScenario());
  assert.ok(c.ok);
  assert.equal(c.winnerProfit, "B");
  const bad = compareScenarios(sampleInput(), { members: -5 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /^Scenario B/);
});

test("exports and saved state round-trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /not tax, legal, lending or financial advice/);
  assert.match(resultCsv(r), /^item,amount\nvisits,/);
  const back = parseState(serializeState(r.input, sampleScenario()));
  assert.deepEqual(back.state, r.input);
  assert.ok(parseState("{").error);
  assert.ok(parseState('{"app":"other","input":{}}').error);
});
