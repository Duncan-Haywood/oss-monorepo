import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, sampleInput, profitAt, breakEven, validateInput, serializeState, parseState, resultCsv, resultText, MAX_BIDS } from "./calc.mjs";

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const between = (a, b) => a + rnd() * (b - a);

function randomDeal() {
  return {
    resale: between(40000, 600000), sellCostPct: between(0, 12), repairs: between(0, 80000), months: between(1, 24),
    monthlyHolding: between(0, 2000), interestPct: between(0, 20), premiumPct: between(0, 15), recording: between(0, 2000),
    liens: between(0, 20000), quietTitle: between(0, 8000), eviction: between(0, 6000),
    targetProfitPct: between(0, 25), targetProfitMin: between(0, 30000),
    bids: [{ label: "a", amount: between(1000, 80000) }],
  };
}

test("profit at the max bid equals the target to the cent, for random deals", () => {
  let checked = 0;
  for (let n = 0; n < 500; n++) {
    const d = randomDeal();
    const r = solve(d);
    assert.ok(r.ok);
    if (r.maxBid === 0) continue;
    assert.ok(Math.abs(profitAt(d, r.maxBid) - r.target) < 0.01, JSON.stringify(d));
    assert.ok(profitAt(d, r.maxBid + 100) < r.target);
    checked++;
  }
  assert.ok(checked > 300);
});

test("profit at the break-even bid is zero", () => {
  for (let n = 0; n < 200; n++) {
    const d = randomDeal();
    const be = breakEven(d);
    if (be > 0) assert.ok(Math.abs(profitAt(d, be)) < 0.01);
  }
});

test("max bid falls as each cost rises and rises with resale", () => {
  const base = solve(sampleInput()).maxBid;
  for (const k of ["repairs", "liens", "quietTitle", "eviction", "recording", "monthlyHolding", "premiumPct", "interestPct", "months", "targetProfitMin"]) {
    const lo = solve({ ...sampleInput(), [k]: sampleInput()[k] + 1000 * (k.endsWith("Pct") || k === "months" ? 0.001 : 1) }).maxBid;
    assert.ok(lo < base, k);
  }
  assert.ok(solve({ ...sampleInput(), resale: 150000 }).maxBid > base);
});

test("hand-worked example", () => {
  // resale 100000, sell 10%, no holding/interest/premium, repairs 20000, liens 5000, target 15000
  // B = 100000*0.9 - 20000 - 5000 - 15000 = 50000
  const d = { resale: 100000, sellCostPct: 10, repairs: 20000, months: 6, monthlyHolding: 0, interestPct: 0, premiumPct: 0, recording: 0, liens: 5000, quietTitle: 0, eviction: 0, targetProfitPct: 0, targetProfitMin: 15000, bids: [{ label: "x", amount: 50000 }] };
  const r = solve(d);
  assert.equal(Math.round(r.maxBid), 50000);
  assert.equal(Math.round(r.options[0].net), 15000);
  assert.equal(r.options[0].clears, true);
});

test("a bid over the max misses the target; stress figures are lower", () => {
  const r = solve(sampleInput());
  const [open, , stretch] = r.options;
  assert.ok(open.clears);
  assert.ok(!stretch.clears);
  assert.ok(stretch.amount > r.maxBid);
  for (const o of r.options) assert.ok(o.stress20 < o.stress10 && o.stress10 < o.net);
});

test("resale drop that wipes out the target at max bid is exact", () => {
  const i = sampleInput();
  const r = solve(i);
  const drop = r.wipeoutDropPct / 100;
  // dropping the resale by that fraction, with the bid held at the max, leaves zero profit
  assert.ok(Math.abs(profitAt(i, r.maxBid, i.resale * (1 - drop))) < 0.01);
});

test("deals that cannot reach the target return a zero bid and say so", () => {
  const r = solve({ ...sampleInput(), repairs: 200000 });
  assert.equal(r.maxBid, 0);
  assert.match(r.notes[0], /Even a bid of zero/);
});

test("validation rejects nonsense and too many bids", () => {
  assert.ok(validateInput({ ...sampleInput(), resale: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), sellCostPct: 40 }).length);
  assert.ok(validateInput({ ...sampleInput(), bids: [] }).length);
  assert.ok(validateInput({ ...sampleInput(), bids: Array.from({ length: MAX_BIDS + 1 }, () => ({ label: "", amount: 1 })) }).length);
  assert.equal(solve({ ...sampleInput(), months: NaN }).ok, false);
});

test("missing-cost reminders appear only when the cost is zero", () => {
  const joined = (i) => solve(i).notes.join(" ");
  assert.doesNotMatch(joined(sampleInput()), /no cost to clear title/);
  assert.match(joined({ ...sampleInput(), quietTitle: 0 }), /no cost to clear title/);
  assert.match(joined({ ...sampleInput(), eviction: 0 }), /occupied/);
});

test("save/load round trips and rejects foreign files; csv and text export", () => {
  const i = sampleInput();
  assert.deepEqual(parseState(serializeState(i)).state, i);
  assert.ok(parseState("{").error);
  assert.ok(parseState(JSON.stringify({ app: "other", input: i })).error);
  const r = solve(i);
  assert.equal(resultCsv(r).split("\n").length, 1 + i.bids.length);
  assert.match(resultText(r), /Maximum bid/);
});
