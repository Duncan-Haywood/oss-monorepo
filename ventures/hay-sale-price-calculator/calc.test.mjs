import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, analyzeChannel, sensitivity, money, sampleInput, toCsv, CHANNELS } from "./calc.mjs";

const common = { acres: 10, tonsPerAcre: 4, growCostPerAcre: 200, makeCostPerTon: 20, storageLossPct: 10 };
const ch = { key: "x", label: "X", baleLbs: 1000, baleCostPerTon: 10, sellCostPerTon: 5, lossExtraPct: 0, pricePerBale: 100 };

test("hand-computed channel", () => {
  const r = analyzeChannel(common, ch);
  // produced 40 t; sold 36 t; bales 72; revenue 7200; cost 2000 + 40*30 + 36*5 = 3380
  assert.equal(r.soldTons, 36);
  assert.equal(r.bales, 72);
  assert.equal(r.revenue, 7200);
  assert.equal(r.totalCost, 3380);
  assert.equal(r.net, 3820);
  assert.equal(r.pricePerTon, 200);
  assert.equal(r.breakEvenPerTon, 93.89);
  assert.equal(r.breakEvenPerBale, 46.94);
});

test("extra channel loss reduces tons sold", () => {
  const a = analyzeChannel(common, ch), b = analyzeChannel(common, { ...ch, lossExtraPct: 5 });
  assert.ok(b.soldTons < a.soldTons);
  assert.equal(b.lossPct, 15);
});

test("ranks channels by net and flags a loss", () => {
  const r = analyze({ ...common, smallPrice: 1, largePrice: 1, roundPrice: 1 });
  assert.equal(r.anyProfit, false);
  assert.match(r.advice.join(" "), /No channel covers your costs/);
  const s = analyze(sampleInput());
  assert.equal(s.anyProfit, true);
  assert.equal(s.ranked[0], s.best);
  assert.equal(s.channels.length, CHANNELS.length);
});

test("break-even price makes net zero", () => {
  const s = analyze(sampleInput());
  for (const c of s.channels) {
    const price = c.breakEvenPerBale;
    const key = c.key;
    const r = analyze({ ...sampleInput(), [key + "Price"]: price });
    const x = r.channels.find((y) => y.key === key); assert.ok(Math.abs(x.net) <= x.bales * 0.005 + 1, key); // price is rounded to a cent per bale
  }
});

test("validation", () => {
  assert.match(analyze({ acres: 0 }).error, /acres/);
  assert.match(analyze({ ...common, tonsPerAcre: 0 }).error, /tons/);
  assert.match(analyze({ ...common, storageLossPct: 100 }).error, /Storage loss/);
  assert.match(analyze({ ...common, growCostPerAcre: -1 }).error, /negative/);
  assert.match(analyze({ ...common, smallBaleLbs: 0 }).error, /bale weight/);
});

test("sensitivity grid centre matches the base", () => {
  const g = sensitivity(sampleInput(), "large");
  const base = analyze(sampleInput()).channels.find((c) => c.key === "large").net;
  assert.equal(g[1].cells[1].net, base);
  assert.ok(g[2].cells[2].net > g[0].cells[0].net);
});

test("csv and money", () => {
  assert.equal(money(-1234.4), "-$1,234");
  const csv = toCsv(analyze(sampleInput()));
  assert.equal(csv.trim().split("\n").length, 4);
  assert.match(csv, /Large squares/);
});
