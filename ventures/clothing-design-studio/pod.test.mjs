import test from "node:test";
import assert from "node:assert/strict";
import { poissonPmf, sales, compare, sweep, podCsv } from "./pod.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("Poisson(2) probabilities match hand values", () => {
  const p = poissonPmf(2, 3);
  close(p[0], Math.exp(-2)); close(p[1], 2 * Math.exp(-2)); close(p[2], 2 * Math.exp(-2)); close(p[3], (4 / 3) * Math.exp(-2));
});
test("a mean of 1000 does not underflow and sums to one", () => {
  close(poissonPmf(1000, 1500).reduce((a, b) => a + b, 0), 1, 1e-9);
});
test("hand-worked E[min(D,1)] and overflow for Poisson(2)", () => {
  const s = sales(2, 1);
  close(s.sold, 1 - Math.exp(-2), 1e-9);                 // P(D>=1)
  close(s.over, 2 - (1 - Math.exp(-2)), 1e-9);           // E[D] - E[min(D,1)]
});
test("with certain-ish demand the run wins when its unit cost is lower", () => {
  const c = compare({ demand: 400, price: 40, landed: 12, podCost: 26 });
  assert.notEqual(c.best.route, "Print-on-demand only");
  assert.ok(c.stock.runSize >= 380 && c.stock.runSize <= 420);
  assert.ok(c.stock.profit > c.pod.profit);
});
test("hand-worked print-on-demand profit: 100 sales x (40 - 26)", () => {
  assert.equal(compare({ demand: 100, price: 40, landed: 12, podCost: 26 }).pod.profit, 1400);
});
test("a minimum order above what demand can use leaves print-on-demand best", () => {
  const c = compare({ demand: 20, price: 40, landed: 12, podCost: 26, moq: 300 });
  assert.equal(c.best.route, "Print-on-demand only");
  assert.equal(c.stock.runSize, 0);
});
test("crossover demand: the run is the better route above it and not below it", () => {
  const i = { price: 40, landed: 12, podCost: 26, moq: 100, setup: 500 };
  const c = compare({ ...i, demand: 50 });
  assert.ok(c.crossoverDemand > 50);
  assert.equal(compare({ ...i, demand: c.crossoverDemand }).options.find(o => o.route === "Factory run only").profit > compare({ ...i, demand: c.crossoverDemand }).pod.profit, true);
  assert.ok(compare({ ...i, demand: c.crossoverDemand - 1 }).stock.profit <= compare({ ...i, demand: c.crossoverDemand - 1 }).pod.profit);
});
test("the hybrid never earns less than the best plain run when print-on-demand has a positive margin", () => {
  for (const d of [30, 150, 600]) {
    const c = compare({ demand: d, price: 40, landed: 12, podCost: 26, moq: 50 });
    assert.ok(c.hybrid.profit >= c.stock.profit - 0.01);
  }
});
test("a run cannot beat zero when each sale loses money", () => {
  const c = compare({ demand: 200, price: 10, landed: 12, podCost: 20 });
  assert.equal(c.stock.runSize, 0);
  assert.ok(c.notes.some(n => /loses money/.test(n)));
});
test("bad input is refused", () => {
  assert.throws(() => compare({ demand: -1, price: 40, landed: 12, podCost: 26 }), /Expected demand/);
  assert.throws(() => compare({ demand: 10, price: NaN, landed: 12, podCost: 26 }), /Shelf price/);
});
test("sweep and CSV have one line per demand", () => {
  const rows = sweep({ price: 40, landed: 12, podCost: 26 }, [10, 100, 1000]);
  assert.equal(podCsv(rows).trim().split("\n").length, 4);
});

test("a huge minimum order returns quickly and an explicit undefined podPrice means 'same as price'", () => {
  const base = { demand: 100, price: 40, landed: 12, podCost: 25 };
  const t = Date.now();
  const c = compare({ ...base, moq: 1e6 });
  assert.ok(Date.now() - t < 3000, "moq of a million took too long");
  assert.equal(c.best.route, "Print-on-demand only");
  assert.deepEqual(compare({ ...base, podPrice: undefined }), compare(base));
});
