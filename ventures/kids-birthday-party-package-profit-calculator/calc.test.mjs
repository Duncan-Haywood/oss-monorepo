import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, compareJobs, sampleInput, sampleJob, validateInput, resultText, resultCsv, serializeState, parseState, money, cents } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("hand-worked party: every line of the sample", () => {
  const r = solve(sampleInput());
  assert.ok(r.ok);
  near(r.revenue, 449);
  near(r.roomHours, 3); // 2 party + 1 setup and cleanup
  near(r.labor, 2 * 3 * 16 * 1.1); // 105.60
  near(r.food, 54);
  near(r.goods, 18);
  near(r.processing, 13.47);
  near(r.displaced, 60);
  near(r.fixedShare, 60000 / 420);
  near(r.costs, 105.6 + 54 + 18 + 18 + 13.47 + 60 + 60000 / 420, 1e-6);
  near(r.profit, 449 - r.costs);
  near(r.margin, r.profit / 449);
  near(r.profitPerRoomHour, r.profit / 3);
  near(r.pricePerKid, 449 / 12);
  near(r.annualProfit, r.profit * 420);
});

test("setup and cleanup hours are paid even though nobody is billed for them", () => {
  const a = solve({ ...sampleInput(), setupHours: 0 });
  const b = solve({ ...sampleInput(), setupHours: 2 });
  near(b.labor - a.labor, 2 * 2 * 16 * 1.1);
  near(b.displaced, a.displaced);
});

test("open play given up scales with party hours only", () => {
  const a = solve({ ...sampleInput(), displacedPerHour: 0 });
  assert.equal(a.displaced, 0);
  assert.equal(a.notes.some((n) => /Open-play/.test(n)), false);
  const b = solve({ ...sampleInput(), partyHours: 3 });
  near(b.displaced, 90);
});

test("charging exactly the lowest price earns exactly the target margin", () => {
  let seed = 11;
  const rnd = (lo, hi) => { seed = (seed * 16807) % 2147483647; return lo + ((seed - 1) / 2147483646) * (hi - lo); };
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const i = { ...sampleInput(), kids: Math.round(rnd(4, 40)), partyHours: rnd(1, 4), setupHours: rnd(0, 2), hosts: Math.round(rnd(0, 4)), wage: rnd(10, 40), processPct: rnd(0, 6), targetMargin: rnd(5, 50), partiesPerYear: Math.round(rnd(30, 900)), displacedPerHour: rnd(0, 150) };
    const base = solve(i);
    assert.ok(base.ok);
    const charged = solve({ ...i, price: base.minPrice });
    assert.ok(charged.ok);
    near(charged.margin, i.targetMargin / 100, 1e-9);
    checked++;
  }
  assert.equal(checked, 300);
});

test("break-even parties cover the yearly overhead exactly", () => {
  const r = solve(sampleInput());
  near(r.breakevenParties * (r.revenue - (r.costs - r.fixedShare)), 60000);
  assert.equal(solve({ ...sampleInput(), price: 150 }).breakevenParties, null);
});

test("a losing party says so", () => {
  const r = solve({ ...sampleInput(), price: 250 });
  assert.ok(r.profit < 0);
  assert.match(r.notes[0], /loses/);
});

test("validation rejects nonsense", () => {
  assert.ok(validateInput({ ...sampleInput(), price: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), kids: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), partyHours: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), processPct: 40, targetMargin: 60 }).length);
  assert.equal(validateInput(sampleInput()).length, 0);
  assert.equal(solve({ ...sampleInput(), hosts: NaN }).ok, false);
});

test("compare: Package A makes more per party, Package B more per room hour", () => {
  const c = compareJobs(sampleInput(), sampleJob());
  assert.ok(c.ok);
  assert.equal(c.winnerJob, "A");
  assert.equal(c.winnerHour, "B");
  assert.equal(c.notes.length, 2);
  const bad = compareJobs(sampleInput(), { kids: 0 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /^Package B:/);
});

test("exports, state round trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Lowest package price for a 25% margin: \$553\.41/);
  assert.match(resultCsv(r), /^item,amount\nrevenue,449/);
  const back = parseState(serializeState(sampleInput(), sampleJob()));
  assert.deepEqual(back.state, sampleInput());
  assert.deepEqual(back.job, sampleJob());
  assert.ok(parseState("nope").error);
  assert.ok(parseState(JSON.stringify({ app: "other", input: {} })).error);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(cents(1.5), "$1.50");
});
