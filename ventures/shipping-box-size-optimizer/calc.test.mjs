import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSkus, parseBoxes, parseRateTable, postage, fits, landedCost, customCandidates,
  solveK, analyze, whatIf, reportCsv, sampleSkus, sampleBoxes, money, money2, DEFAULTS,
} from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const O = { ...DEFAULTS };
const sku = (name, l, w, h, weight, qty) => ({ name, dims: [l, w, h].sort((a, b) => b - a), weight, qty });
const box = (name, l, w, h, cost, current = false) => ({ name, dims: [l, w, h].sort((a, b) => b - a), cost, current, custom: false });

test("parses products with a header, tabs, a default quantity, and skips bad lines", () => {
  const p = parseSkus("name,length,width,height,weight,orders\nMug,4,5,4.5,0.9,300\nTin\t3.5\t3.5\t3\t0.7\nbad,1,2\nNeg,-1,2,3,1,5");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { name: "Mug", dims: [5, 4.5, 4], weight: 0.9, qty: 300 });
  assert.equal(p.rows[1].qty, 1);
  assert.match(p.warnings.join(" "), /2 product line/);
  assert.ok(parseSkus("").error);
  assert.ok(parseSkus("A,1,1,1,1,0").error, "all-zero quantities is an error");
});

test("parses boxes, marks today's sizes with *, and sorts inside dims", () => {
  const p = parseBoxes("box,l,w,h,cost\n*Small,6,8,4,$0.50\nBig,12,12,12,1.45\nnope,1,1");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { name: "Small", dims: [8, 6, 4], cost: 0.5, current: true, custom: false });
  assert.equal(p.rows[1].current, false);
  assert.match(p.warnings.join(" "), /1 box line/);
});

test("rate card: next listed weight up, then the last slope continues", () => {
  const t = parseRateTable("1, 8\n5=12\n2:9");
  assert.deepEqual(t, [[1, 8], [2, 9], [5, 12]]);
  assert.equal(postage(1, O, t), 8);
  assert.equal(postage(3, O, t), 12);
  near(postage(7, O, t), 14); // slope (12-9)/(5-2) = 1 per lb
  // no table: first pound plus each additional pound
  near(postage(5, { firstLb: 9.5, addlLb: 0.85 }, []), 9.5 + 4 * 0.85);
});

test("fit check rotates the item and applies padding on every side", () => {
  assert.equal(fits([10, 4, 4], [12, 6, 6], 0.5), true); // 11 x 5 x 5
  assert.equal(fits([10, 4, 4], [10.5, 6, 6], 0.5), false);
  assert.equal(fits([8, 5, 3], [9, 6, 4], 0.5), true); // sorted both ways
  assert.equal(fits([8, 5, 3], [9, 6, 4], 0.51), false);
});

test("landed cost by hand: DIM-billed box", () => {
  // Item 10x6x4, 2 lb, in a 12x8x6 box at $1. Outer = inside + 0.25 = 12.25x8.25x6.25,
  // rounded to 12x8x6 = 576 in^3, /139 = 4.144 lb DIM. Board area = 3.1832 sq ft x 0.1 lb.
  // Actual = 2.318 lb, so DIM wins: billable 5 lb, postage 9.5 + 4 x 0.85 = 12.90.
  // Void = (576 - 240) / 1728 cu ft x $0.35. Total = 12.90 + 1 + 0.068056.
  const d = landedCost(sku("A", 10, 6, 4, 2, 1), box("B", 12, 8, 6, 1), O, []);
  near(d.dimWeight, 576 / 139);
  near(d.actual, 2 + (2 * (12.25 * 8.25 + 12.25 * 6.25 + 8.25 * 6.25) / 144) * 0.1);
  assert.equal(d.billable, 5);
  assert.equal(d.dimBilled, true);
  near(d.ship, 12.9);
  near(d.fill, ((576 - 240) / 1728) * 0.35);
  near(d.total, 12.9 + 1 + ((576 - 240) / 1728) * 0.35);
  assert.equal(landedCost(sku("A", 10, 6, 4, 2, 1), box("tiny", 10, 6, 4, 1), O, []), null);
});

test("landed cost by hand: heavy item bills on actual weight, rounded up", () => {
  const d = landedCost(sku("Iron", 5, 5, 5, 9.2, 1), box("B", 6, 6, 6, 0.5), { ...O, boardLbPerSqFt: 0 }, []);
  // DIM: 6.25 rounds to 6 -> 216/139 = 1.55 lb; actual 9.2 -> billable 10
  assert.equal(d.billable, 10);
  assert.equal(d.dimBilled, false);
  near(d.ship, 9.5 + 9 * 0.85);
});

test("custom candidates are padded, rounded up to the inch, deduplicated and priced from area", () => {
  const c = customCandidates([sku("A", 10, 4, 4, 1, 1), sku("B", 9.6, 3.9, 3.2, 1, 1)], { ...O, paddingIn: 0.5, wallIn: 0 });
  // A -> 11x5x5; B -> 10.6x4.9x4.2 -> 11x5x5 (same); A+B envelope -> 11x5x5 (same)
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].dims, [11, 5, 5]);
  near(c[0].cost, O.customBase + O.customPerSqFt * (2 * (55 + 55 + 25)) / 144);
  assert.equal(c[0].custom, true);
});

test("toy instance: one size must be the big box; two sizes split the mix; savings vs today", () => {
  const o = { ...O, boardLbPerSqFt: 0, voidFillPerCuFt: 0, wallIn: 0, paddingIn: 0, holdingPerSize: 0 };
  const skus = [sku("small", 4, 4, 4, 1, 100), sku("big", 11, 11, 11, 3, 1)];
  const boxes = [box("S", 5, 5, 5, 0.5), box("L", 12, 12, 12, 1.5, true)];
  const r = analyze(skus, boxes, { ...o, maxSizes: 2 });
  assert.equal(r.error, undefined);
  // In L: 1728/139 = 12.43 -> 13 lb -> 9.5 + 12 x .85 = 19.70, + 1.50 box = 21.20 per order.
  // small in S: 125/139 < 1 lb -> 1 lb -> 9.50 + 0.50 = 10.00.
  near(r.baseline.monthly, 101 * 21.2);
  assert.equal(r.curve[0].plan.boxes[0].name, "L");
  near(r.curve[0].monthly, 101 * 21.2);
  near(r.curve[1].monthly, 100 * 10 + 21.2);
  near(r.curve[1].marginal, 101 * 21.2 - (100 * 10 + 21.2));
  assert.equal(r.recommended.k, 2);
  assert.ok(r.curve.every((c) => c.exact));
  assert.match(r.verdict, /saves about \$1,120 a month/);
});

test("the holding cost per size can make fewer sizes the recommendation", () => {
  const skus = [sku("small", 4, 4, 4, 1, 2), sku("big", 11, 11, 11, 3, 1)];
  const boxes = [box("S", 5, 5, 5, 0.5), box("L", 12, 12, 12, 1.5, true)];
  const r = analyze(skus, boxes, { ...O, wallIn: 0, paddingIn: 0, maxSizes: 2, holdingPerSize: 100 });
  assert.equal(r.recommended.k, 1);
});

test("a product no box fits is reported and left out, and infeasible size counts are flagged", () => {
  const skus = [sku("ok", 4, 4, 4, 1, 10), sku("ok2", 10, 10, 2, 1, 10), sku("huge", 40, 40, 40, 5, 3)];
  const boxes = [box("S", 5, 5, 5, 0.5), box("F", 11, 11, 3, 0.9)];
  const r = analyze(skus, boxes, { ...O, paddingIn: 0, maxSizes: 2 });
  assert.deepEqual(r.homeless, ["huge"]);
  assert.match(r.warnings.join(" "), /“huge” fits none/);
  assert.equal(r.curve[0].feasible, false); // neither box holds both remaining products
  assert.equal(r.curve[1].feasible, true);
  assert.equal(r.minFeasibleK, 2);
  assert.equal(r.recommended.k, 2);
});

test("adding a size never raises the monthly cost (curve is non-increasing)", () => {
  const r = analyze(parseSkus(sampleSkus()).rows, parseBoxes(sampleBoxes()).rows, { maxSizes: 6 });
  for (let i = 1; i < r.curve.length; i++) assert.ok(r.curve[i].monthly <= r.curve[i - 1].monthly + 1e-9);
  // and nothing beats the every-product-in-its-own-best-box floor
  for (const c of r.curve.filter((x) => x.feasible)) assert.ok(c.monthly >= r.floor - 1e-9);
});

// Deterministic pseudo-random so the property test is reproducible.
function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test("local search matches exhaustive enumeration on random instances (or is within 3%)", () => {
  const rnd = lcg(42);
  let exactHits = 0, trials = 0;
  for (let t = 0; t < 25; t++) {
    const m = 6 + Math.floor(rnd() * 6), n = 8 + Math.floor(rnd() * 8), k = 2 + Math.floor(rnd() * 3);
    const qty = Array.from({ length: m }, () => 1 + Math.floor(rnd() * 200));
    const C = Array.from({ length: m }, () => Array.from({ length: n }, () => (rnd() < 0.25 ? Infinity : 5 + rnd() * 20)));
    // make sure every SKU fits at least the last box (the "big" one)
    for (const row of C) row[n - 1] = 30;
    const penalty = qty.map((q) => q * 1000);
    const exact = solveK(k, C, qty, penalty, n, null, false);
    const heur = solveK(k, C, qty, penalty, n, null, true);
    assert.equal(exact.exact, true);
    assert.equal(heur.exact, false);
    assert.ok(heur.total >= exact.total - 1e-9, "heuristic cannot beat the exact optimum");
    assert.ok(heur.total <= exact.total * 1.03 + 1e-9, `trial ${t}: ${heur.total} vs ${exact.total}`);
    trials++;
    if (Math.abs(heur.total - exact.total) < 1e-9) exactHits++;
  }
  assert.ok(exactHits >= trials * 0.8, `local search hit the optimum ${exactHits}/${trials}`);
});

test("large custom candidate lists fall back to local search and say so", () => {
  const rnd = lcg(7);
  const skus = Array.from({ length: 30 }, (_, i) => sku(`P${i}`, 2 + rnd() * 18, 2 + rnd() * 10, 1 + rnd() * 8, rnd() * 6, 1 + Math.floor(rnd() * 100)));
  const t0 = Date.now();
  const r = analyze(skus, [], { includeCustom: true, maxSizes: 5 });
  assert.equal(r.error, undefined);
  assert.equal(r.searched.exact, false);
  assert.ok(r.candidates.length > 100);
  assert.ok(Date.now() - t0 < 20000, "solves in reasonable time");
  assert.ok(r.curve[r.curve.length - 1].feasible);
});

test("the sample runs end to end and beats today's boxes", () => {
  const r = analyze(parseSkus(sampleSkus()).rows, parseBoxes(sampleBoxes()).rows, {});
  assert.equal(r.error, undefined);
  assert.ok(r.baseline);
  assert.equal(r.baseline.boxes.length, 3);
  assert.ok(r.recommended.monthly < r.baseline.monthly);
  assert.ok(r.sameCount && r.sameCount.monthly <= r.baseline.monthly + 1e-9, "best 3 sizes are no worse than today's 3");
  const csv = reportCsv(r);
  assert.match(csv, /^section,item,box/);
  assert.match(csv, /recommended,Ceramic mug,/);
  assert.match(csv, /today,/);
  assert.match(csv, /sizes curve,1 size/);
});

test("rejects bad options and empty candidate lists", () => {
  const skus = [sku("a", 1, 1, 1, 1, 1)];
  assert.ok(analyze(skus, [box("b", 2, 2, 2, 1)], { dimDivisor: 0 }).error);
  assert.ok(analyze(skus, [box("b", 2, 2, 2, 1)], { firstLb: -1 }).error);
  assert.ok(analyze(skus, [], {}).error);
});

test("money formatting", () => {
  assert.equal(money(1234.4), "$1,234");
  assert.equal(money(-5), "−$5");
  assert.equal(money2(3.456), "$3.46");
});

test("what-if: a divisor change re-prices the old set, never beats the new optimum, and rejects no-ops", () => {
  const skus = parseSkus(sampleSkus()).rows, boxes = parseBoxes(sampleBoxes()).rows;
  const w = whatIf(skus, boxes, {}, { dimDivisor: 166 });
  assert.equal(w.error, undefined);
  assert.ok(w.regret >= -1e-9, "keeping the old set is never cheaper than the new optimum at the same size count");
  assert.ok(w.todayUnderNew > w.keepOldMonthly, "today's boxes cost more than the recommended ones");
  assert.ok(w.afterMonthly <= w.newBestMonthly + 1e-9 || !w.sameK);
  // direct check: re-price the old set by hand under the new divisor
  const after = analyze(skus, boxes, { dimDivisor: 166 });
  assert.equal(after.options.dimDivisor, 166);
  assert.ok(Math.abs(w.afterMonthly - after.recommended.monthly) < 1e-9);
  assert.ok(whatIf(skus, boxes, {}, { dimDivisor: 139 }).error, "139 is already the default");
  assert.ok(whatIf(skus, boxes, {}, {}).error);
  // a tiny change leaves the same boxes optimal
  const s = whatIf(skus, boxes, {}, { addlLb: 0.86 });
  assert.equal(s.sameSet, true);
  assert.ok(Math.abs(s.regret) < 1e-6);
});
