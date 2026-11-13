// optimizeStock keeps recent solver answers (perf, 2026-11-13). A cached answer must be the
// cold answer: same bars, cost and bound, labels and refs mapped from the current call, and a
// caller that edits the returned object must not change what the next call gets.
import test from "node:test";
import assert from "node:assert/strict";
import { optimizeStock } from "./engine.mjs";

const stock = [
  { length: 96, price: 4, label: "8 ft" },
  { length: 120, price: 5.5, label: "10 ft" },
  { length: 144, price: 7, label: "12 ft" },
];
const pieces = [
  { length: 92.625, qty: 9, ref: "stud" },
  { length: 37.5, qty: 5, ref: "cripple" },
  { length: 61.25, qty: 3, ref: "header" },
  { length: 13, qty: 7, ref: "block" },
];

test("a repeated stock problem returns the cold answer, and edits to a result do not leak", () => {
  const cold = JSON.stringify(optimizeStock(pieces, stock));
  const first = optimizeStock(pieces, stock);
  assert.equal(JSON.stringify(first), cold);
  first.bars[0].cuts.push({ length: 1, ref: "x" });
  first.bars.length = 0;
  first.cost = -1;
  assert.equal(JSON.stringify(optimizeStock(pieces, stock)), cold);
});

test("same widths and prices with other labels and refs map the new ones on", () => {
  optimizeStock(pieces, stock);
  const relabelled = stock.map((s) => ({ ...s, label: `L${s.length}` }));
  const reref = pieces.map((p) => ({ ...p, ref: `${p.ref}-2` }));
  const res = optimizeStock(reref, relabelled);
  for (const b of res.bars) {
    assert.equal(b.label, `L${b.length}`);
    for (const c of b.cuts) assert.match(c.ref, /-2$/);
  }
});

test("a different price is a different problem", () => {
  const a = optimizeStock(pieces, stock);
  const pricier = stock.map((s) => (s.length === 144 ? { ...s, price: 70 } : s));
  const b = optimizeStock(pieces, pricier);
  assert.ok(!b.bars.some((x) => x.length === 144) || b.cost !== a.cost);
});
