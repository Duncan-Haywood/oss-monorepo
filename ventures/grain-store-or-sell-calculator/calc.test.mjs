import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, waterShrink, sampleInput, validateInput, resultText, resultCsv, serializeState, parseState, CROPS, MAX_BIDS } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("water shrink follows the moisture formula", () => {
  near(waterShrink(20, 15), 5 / 85);
  near(waterShrink(15, 15), 0);
  near(waterShrink(12, 15), 0);
  near(waterShrink(18, 13) * 100, 5.747126436781609);
});

test("selling at harvest: delivered bushels and drying cost are what the formula says", () => {
  const i = { ...sampleInput(), handlingShrinkPct: 0 };
  const r = solve(i);
  near(r.sell.bushels, 50000 * (1 - 3 / 85));
  near(r.sell.dryingCost, 3 * 0.04 * 50000);
  near(r.sell.net, r.sell.bushels * 3.85 - 6000);
});

test("a later price equal to the break-even price ties with selling now", () => {
  const base = sampleInput();
  const r = solve(base);
  for (const o of r.options) {
    const tie = solve({ ...base, bids: [{ months: o.months, price: o.breakEven }] });
    near(tie.options[0].advantage, 0, 1e-4);
  }
});

test("with no costs and no loss, storing at the same price is a tie", () => {
  const i = { ...sampleInput(), harvestMoisture: 15, handlingShrinkPct: 0, binLossPctPerMonth: 0, storageCostPerMonth: 0, interestPct: 0, bids: [{ months: 6, price: 3.85 }] };
  near(solve(i).options[0].advantage, 0, 1e-6);
});

test("more storage cost or interest only ever lowers the advantage", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 300; t++) {
    const crop = Object.keys(CROPS)[Math.floor(rnd() * 4)];
    const i = {
      crop, bushels: 1000 + Math.floor(rnd() * 200000), harvestMoisture: CROPS[crop].saleMoisture + rnd() * 10, storeMoisture: CROPS[crop].storeMoisture,
      harvestPrice: 2 + rnd() * 10, dryRate: rnd() * 0.06, handlingShrinkPct: rnd() * 1, binLossPctPerMonth: rnd() * 0.3,
      storageCostPerMonth: rnd() * 0.06, otherCostPerBu: rnd() * 0.1, interestPct: rnd() * 12,
      bids: [{ months: 1 + Math.floor(rnd() * 12), price: 2 + rnd() * 10 }],
    };
    const a = solve(i).options[0];
    const b = solve({ ...i, storageCostPerMonth: i.storageCostPerMonth + 0.01 }).options[0];
    const c = solve({ ...i, interestPct: i.interestPct + 1 }).options[0];
    assert.ok(b.advantage < a.advantage);
    assert.ok(c.advantage < a.advantage);
    // break-even always reproduces a zero advantage
    const z = solve({ ...i, bids: [{ months: i.bids[0].months, price: a.breakEven }] }).options[0];
    near(z.advantage, 0, 1e-3);
  }
});

test("verdict is sell when no later price wins, store when one does", () => {
  const low = solve({ ...sampleInput(), bids: [{ months: 6, price: 3.9 }] });
  assert.equal(low.verdict, "sell");
  const high = solve({ ...sampleInput(), bids: [{ months: 6, price: 4.8 }] });
  assert.equal(high.verdict, "store");
});

test("drier storage target costs extra drying points and shrinks more", () => {
  const a = solve({ ...sampleInput(), storeMoisture: 15 }).options[0];
  const b = solve({ ...sampleInput(), storeMoisture: 14 }).options[0];
  assert.ok(b.dryingCost > a.dryingCost && b.sellBu < a.sellBu);
});

test("validation rejects bad input and lists what to fix", () => {
  assert.ok(validateInput({ ...sampleInput(), bushels: 0 }).length);
  assert.ok(validateInput({ ...sampleInput(), bids: [] }).length);
  assert.ok(validateInput({ ...sampleInput(), bids: Array(MAX_BIDS + 1).fill({ months: 3, price: 4 }) }).length);
  assert.ok(validateInput({ ...sampleInput(), harvestMoisture: 80 }).length);
  assert.equal(solve({ ...sampleInput(), crop: "kale" }).ok, false);
  assert.deepEqual(validateInput(sampleInput()), []);
});

test("copy text, CSV and save/load round-trip", () => {
  const r = solve(sampleInput());
  assert.match(resultText(r), /Sell at harvest/);
  assert.equal(resultCsv(r).split("\n").length, 2 + r.options.length);
  const back = parseState(serializeState(sampleInput()));
  assert.deepEqual(back.state, sampleInput());
  assert.ok(parseState("{nope").error);
  assert.ok(parseState('{"app":"other"}').error);
});
