import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, compareScenarios, validateInput, loanPayment, sampleInput, sampleScenario, resultText, resultCsv, serializeState, parseState } from "./calc.mjs";

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

// small deterministic PRNG so the random-room tests are reproducible
function rng(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }
function room(rand) {
  const u = (lo, hi) => lo + rand() * (hi - lo);
  return {
    ...sampleInput(), capacity: Math.round(u(40, 300)), sessions: Math.round(u(3, 12)), daysPerWeek: Math.round(u(4, 7)), fill: u(8, 45),
    ticket: u(10, 30), snackSpend: u(0, 8), parties: Math.round(u(0, 150)), partyPrice: u(150, 500), partyCost: u(40, 150), members: Math.round(u(0, 200)),
    memberFee: u(20, 60), staff: Math.round(u(2, 12)), rent: u(8000, 40000), financedPct: rand() < 0.5 ? 0 : u(20, 100), targetMargin: u(5, 30), targetPaybackMonths: u(18, 84),
  };
}

test("worked example: sample bar recomputed by hand", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  const avail = 32 * 5 * 6 * 52 / 12;
  close(r.avail, avail);
  close(r.visits, avail * 0.28);
  const revenue = r.visits * 37 + 24 * 520 + 48 * 40;
  close(r.revenue, revenue);
  const staff = 5 * 1.75 * 6 * 52 / 12 * 5 * 16 * 1.12;
  close(r.staffCost, staff);
  const fixed = staff + 10000 + 1800 + 2600 + 2400;
  const profit = revenue - r.visits * 10 * 0.28 - 24 * 150 - revenue * 0.06 - fixed;
  close(r.profit, profit);
  close(r.paybackMonths, 280000 / profit);
});

test("break-even fill makes profit zero", () => {
  const rand = rng(7);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = room(rand);
    const r = solve(i);
    if (!r.ok || !r.breakevenFill) continue;
    const s = r.breakevenFill / r.fillRate;
    const back = solve({ ...i, fill: i.fill * s });
    close(back.profit, 0, 1e-6);
    checked++;
  }
  assert.ok(checked > 100);
});

test("lowest ticket for margin reproduces the target margin", () => {
  const rand = rng(11);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = room(rand);
    const r = solve(i);
    if (!r.ok || r.minTicket === null || r.minTicket <= 0) continue;
    const back = solve({ ...i, ticket: r.minTicket });
    close(back.margin, i.targetMargin / 100, 1e-6);
    checked++;
  }
  assert.ok(checked > 100);
});

test("lowest ticket for payback reproduces the payback target", () => {
  const rand = rng(13);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = room(rand);
    const r = solve(i);
    if (!r.ok || r.minPaybackTicket === null || r.minPaybackTicket <= 0) continue;
    const back = solve({ ...i, ticket: r.minPaybackTicket });
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

test("sensitivity: fewer visits lowers profit by the lost visit margin", () => {
  const r = solve(sampleInput());
  assert.equal(r.sensitivity.length, 2);
  assert.ok(r.sensitivity[1].profit < r.sensitivity[0].profit && r.sensitivity[0].profit < r.profit);
  const perVisit = 27 + 10 - 10 * 0.28 - (27 + 10) * 0.06;
  close(r.profit - r.sensitivity[0].profit, r.visits * 0.1 * perVisit);
});

test("loan payment formula", () => {
  close(loanPayment(100000, 12, 12), 8884.88, 1e-5);
  assert.equal(loanPayment(0, 10, 12), 0);
  close(loanPayment(1200, 0, 12), 100);
});

test("validation rejects bad input and never throws", () => {
  assert.ok(validateInput({ ...sampleInput(), fill: 120 }).length);
  assert.ok(validateInput({ ...sampleInput(), capacity: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), capacity: 12.5 }).length);
  assert.ok(validateInput({ ...sampleInput(), processPct: 15, reservePct: 30, targetMargin: 60 }).length);
  assert.equal(solve({ ...sampleInput(), ticket: NaN }).ok, false);
  assert.equal(validateInput(sampleInput()).length, 0);
});

test("zero fill: no break-even, no payback, no crash", () => {
  const r = solve({ ...sampleInput(), fill: 0 });
  assert.ok(r.ok);
  assert.equal(r.breakevenFill, null);
  assert.equal(r.minTicket, null);
});

test("a bar already above target margin reports it", () => {
  const r = solve({ ...sampleInput(), ticket: 40 });
  assert.ok(r.meets);
  assert.match(r.notes[0], /clears your target/);
});

test("compare scenarios picks the more profitable build", () => {
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
  assert.match(resultCsv(r), /^item,amount\nthrower_slots,/);
  const saved = serializeState(r.input, sampleScenario());
  const back = parseState(saved);
  assert.deepEqual(back.state, r.input);
  assert.ok(parseState("{").error);
  assert.ok(parseState('{"app":"other","input":{}}').error);
});
