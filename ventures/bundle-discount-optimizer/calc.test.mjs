import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProducts, parseOrders, countPairs, bundleProfit, breakEvenLift, liftAt, analyze, bundlesCsv, sampleProducts, sampleOrders, money, pct, MIN_TRY_ORDERS } from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const sample = () => ({ products: parseProducts(sampleProducts()).products, orders: parseOrders(sampleOrders()).orders });

test("bundleProfit matches a hand calculation", () => {
  // A $20 (cost 6), B $10 (cost 3); 100 A orders, 50 B orders, 30 with both; 10% off, 2% fee, $1 handling, attach rise m = 0.5.
  const c = { pA: 20, pB: 10, cA: 6, cB: 3, nA: 100, nB: 50, nAB: 30 };
  const r = bundleProfit(c, 0.1, 0.5, { feePct: 2, handling: 1 });
  const loss = 30 * 30 * 0.1 * 0.98; // 30 existing pairs lose 10% of $30, net of fee
  near(r.loss, loss);
  const bundle = 27;
  const gainAddB = (bundle - 20) * 0.98 - 3 - 1; // A-only order adds B
  const gainAddA = (bundle - 10) * 0.98 - 6 - 1;
  const gain = 70 * (30 / 100) * 0.5 * gainAddB + 20 * (30 / 50) * 0.5 * gainAddA;
  near(r.gain, gain);
  near(r.profit, gain - loss);
});

test("at the break-even attach rise the discount makes exactly nothing", () => {
  const c = { pA: 20, pB: 10, cA: 6, cB: 3, nA: 100, nB: 50, nAB: 30 };
  for (const d of [0.05, 0.1, 0.25]) {
    const m = breakEvenLift(c, d);
    assert.ok(Number.isFinite(m) && m > 0);
    near(bundleProfit(c, d, m).profit, 0, 1e-7);
    assert.ok(bundleProfit(c, d, m * 1.2).profit > 0);
    assert.ok(bundleProfit(c, d, m * 0.8).profit < 0);
  }
});

test("an item that loses money when added can never break even", () => {
  // The added item costs more than the bundle brings in: no amount of extra adding helps.
  const c = { pA: 10, pB: 5, cA: 2, cB: 9, nA: 50, nB: 50, nAB: 10 };
  assert.equal(breakEvenLift(c, 0.1), Infinity);
});

test("a pair nobody buys together gains nothing however the discount is set", () => {
  const c = { pA: 20, pB: 10, cA: 6, cB: 3, nA: 100, nB: 50, nAB: 0 };
  assert.equal(bundleProfit(c, 0.2, 5).gain, 0);
  assert.equal(bundleProfit(c, 0.2, 5).profit, 0);
});

test("liftAt grows with the discount, with diminishing returns", () => {
  assert.equal(liftAt(0.4, 0.1), 0.4);
  assert.ok(liftAt(0.4, 0.2) > liftAt(0.4, 0.1));
  assert.ok(liftAt(0.4, 0.2) < 2 * liftAt(0.4, 0.1));
});

test("countPairs agrees with brute force", () => {
  const orders = [["a", "b"], ["a", "b", "c"], ["c"], ["a"], ["b", "c"], ["a", "c"]];
  const { single, pair } = countPairs(orders, ["a", "b", "c"]);
  assert.deepEqual([single.get("a"), single.get("b"), single.get("c")], [4, 3, 4]);
  for (const [x, y] of [["a", "b"], ["a", "c"], ["b", "c"]]) {
    const brute = orders.filter((o) => o.includes(x) && o.includes(y)).length;
    assert.equal(pair.get(`${x}\u0001${y}`) || 0, brute);
  }
});

test("the sample store's planted pairings come out on top and persist in the hold-out", () => {
  const r = analyze(sample());
  assert.equal(r.orderCount, 420);
  const top2 = r.bundles.slice(0, 2).map((b) => [b.a, b.b].sort().join("+"));
  assert.ok(top2.includes("candle-cedar+wick-trimmer"), top2.join());
  assert.ok(top2.includes("soap-dish+soap-oat"), top2.join());
  for (const b of r.bundles.slice(0, 2)) { assert.equal(b.persists, true); assert.equal(b.verdict, "try"); assert.ok(b.nAB >= MIN_TRY_ORDERS); }
});

test("results are sorted by estimated profit and every range brackets its estimate's neighbourhood", () => {
  const r = analyze(sample());
  for (let i = 1; i < r.bundles.length; i++) assert.ok(r.bundles[i - 1].best.profit >= r.bundles[i].best.profit);
  for (const b of r.bundles) { assert.ok(b.p10 <= b.p90); assert.equal(b.grid.length, 4); }
});

test("a thin pairing is labelled thin, not recommended", () => {
  const r = analyze(sample());
  const thin = r.bundles.filter((b) => b.nAB < MIN_TRY_ORDERS && b.best.profit > 0);
  assert.ok(thin.length > 0);
  for (const b of thin) assert.equal(b.verdict, "thin");
});

test("analysis is deterministic and the seed changes only the ranges", () => {
  const a = analyze(sample()), b = analyze(sample()), c = analyze(sample(), { seed: 99 });
  assert.deepEqual(a.bundles.map((x) => [x.a, x.b, x.best.d, x.p10, x.p90]), b.bundles.map((x) => [x.a, x.b, x.best.d, x.p10, x.p90]));
  assert.deepEqual(a.bundles.map((x) => [x.a, x.b, x.best.d]), c.bundles.map((x) => [x.a, x.b, x.best.d]));
});

test("a bigger response to discounts raises the best discount and never lowers the profit", () => {
  const lo = analyze(sample(), { attachLift: 20 }).bundles[0], hi = analyze(sample(), { attachLift: 120 }).bundles[0];
  assert.ok(hi.best.d >= lo.best.d);
  assert.ok(hi.best.profit >= lo.best.profit);
});

test("unknown skus are dropped with a warning", () => {
  const { products, orders } = sample();
  const r = analyze({ products, orders: orders.map((o, i) => (i % 10 === 0 ? [...o, "mystery"] : o)) });
  assert.ok(r.warnings.some((w) => /mystery/.test(w)));
});

test("input errors are plain sentences", () => {
  assert.match(parseProducts("").error, /Add your products/);
  assert.match(parseProducts("a,10").error, /three values/);
  assert.match(parseProducts("a,0,1\nb,2,1").error, /price above zero/);
  assert.match(parseProducts("a,5,1\na,6,1").error, /twice/);
  assert.match(parseProducts("a,5,1").error, /at least two/);
  assert.match(parseOrders("o1,a\no2,b").error, /at least 10/);
  assert.match(parseOrders("").error, /Paste your orders/);
  assert.match(analyze(sample(), { feePct: 120 }).error, /fee/);
});

test("parsers accept headers, tabs, dollar signs, comments and repeated lines", () => {
  const p = parseProducts("# my shop\nsku\tprice\tcost\nmug\t$12.50\t$4\nplate\t20\t7\n");
  assert.equal(p.products.get("mug").price, 12.5);
  const lines = [];
  for (let i = 0; i < 12; i++) { lines.push(`o${i},mug`, `o${i},mug`, `o${i},plate`); }
  const o = parseOrders("order,sku\n" + lines.join("\n"));
  assert.equal(o.orders.length, 12);
  assert.deepEqual(o.orders[0].sort(), ["mug", "plate"]);
});

test("the CSV export has a row per bundle and quotes awkward names", () => {
  const r = analyze(sample());
  const rows = bundlesCsv(r).trim().split("\n");
  assert.equal(rows.length, r.bundles.length + 1);
  assert.match(rows[0], /^product_a,product_b/);
  const q = bundlesCsv({ bundles: [{ ...r.bundles[0], a: 'the "big" one, xl' }] });
  assert.match(q, /"the ""big"" one, xl"/);
});

test("formatters", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-3), "−$3.00");
  assert.equal(pct(0.072), "7.2%");
});
