import { test } from "node:test";
import assert from "node:assert/strict";
import { loanPayment, solve, compareScenarios, sampleInput, sampleScenario, validateInput, resultText, resultCsv, serializeState, parseState, money, cents } from "./calc.mjs";

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

const withExtras = () => ({ ...sampleInput(), leagueNights: 8, leagueRevenue: 250, financedPct: 70, aprPct: 9, termMonths: 60, targetPaybackMonths: 18 });

test("the sample's new fields are neutral: no leagues, no loan", () => {
  const r = solve(sampleInput());
  assert.equal(r.leagueRevenue, 0);
  assert.equal(r.loanPayment, 0);
  near(r.operating, r.profit);
});

test("loan payment follows the amortization identity", () => {
  near(loanPayment(100000, 0, 50), 2000);
  const pay = loanPayment(100000, 12, 36);
  near(pay, 3321.43, 0.01);
  let bal = 100000;
  for (let m = 0; m < 36; m++) bal = bal * 1.01 - pay;
  near(bal, 0, 1e-6);
});

test("league nights add revenue and the loan comes out of profit but not out of payback", () => {
  const base = solve(sampleInput());
  const r = solve(withExtras());
  assert.ok(r.ok);
  near(r.leagueRevenue, 2000);
  near(r.revenue, base.revenue + 2000);
  near(r.financed, 0.7 * r.capex);
  near(r.loanPayment, loanPayment(0.7 * r.capex, 9, 60));
  near(r.operating, r.profit + r.loanPayment);
  near(r.paybackMonths, r.capex / r.operating);
  near(r.profit, r.revenue - r.costs);
});

test("break-even and target-margin rates still hold with leagues and a loan", () => {
  const i = withExtras();
  const r = solve(i);
  const quoted = solve({ ...i, peakRate: r.minPeakRate, offPeakRate: r.minOffPeakRate });
  near(quoted.margin, i.targetMargin / 100, 1e-9);
  const k = r.breakevenUtil / r.utilization;
  const at = solve({ ...i, peakUtil: i.peakUtil * k, offPeakUtil: i.offPeakUtil * k });
  near(at.profit, 0, 1e-6);
});

test("typing the lowest peak rate back reproduces the payback target", () => {
  let seed = 5;
  const rnd = (lo, hi) => { seed = (seed * 16807) % 2147483647; return lo + ((seed - 1) / 2147483646) * (hi - lo); };
  let checked = 0;
  for (let n = 0; n < 400; n++) {
    const i = { ...sampleInput(), bays: Math.round(rnd(1, 10)), peakUtil: rnd(30, 90), offPeakUtil: rnd(8, 40), offPeakRate: rnd(20, 50), rent: rnd(2000, 12000), financedPct: rnd(0, 100), aprPct: rnd(0, 15), leagueNights: Math.round(rnd(0, 12)), leagueRevenue: rnd(0, 400), targetPaybackMonths: rnd(6, 60) };
    const base = solve(i);
    assert.ok(base.ok);
    if (base.minPaybackPeakRate === null || base.minPaybackPeakRate === 0 || base.minPaybackPeakRate > 1000) continue;
    const typed = solve({ ...i, peakRate: base.minPaybackPeakRate });
    assert.ok(typed.ok, JSON.stringify(typed.errors));
    near(typed.paybackMonths, i.targetPaybackMonths, 1e-7);
    checked++;
  }
  assert.ok(checked > 150, `only ${checked} cases checked`);
});

test("sensitivity cuts every booked hour and matches a direct run", () => {
  const i = withExtras();
  const r = solve(i);
  assert.deepEqual(r.sensitivity.map((s) => s.change), [-10, -20]);
  assert.ok(r.sensitivity[0].profit < r.profit && r.sensitivity[1].profit < r.sensitivity[0].profit);
  const direct = solve({ ...i, peakUtil: i.peakUtil * 0.8, offPeakUtil: i.offPeakUtil * 0.8 });
  near(direct.profit, r.sensitivity[1].profit, 1e-6);
  near(direct.paybackMonths, r.sensitivity[1].paybackMonths, 1e-9);
});

test("validation covers the new fields and old saved files still load", () => {
  assert.ok(validateInput({ ...sampleInput(), termMonths: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), financedPct: 120 }).length);
  assert.ok(validateInput({ ...sampleInput(), targetPaybackMonths: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), leagueNights: -1 }).length);
  const old = sampleInput();
  for (const k of ["leagueNights", "leagueRevenue", "financedPct", "aprPct", "termMonths", "targetPaybackMonths"]) delete old[k];
  assert.deepEqual(validateInput(old), []);
  assert.ok(solve(old).ok);
  assert.match(resultText(solve(withExtras())), /Lowest peak rate for a 18-month payback/);
  assert.match(resultCsv(solve(withExtras())), /loan_payment,/);
});
