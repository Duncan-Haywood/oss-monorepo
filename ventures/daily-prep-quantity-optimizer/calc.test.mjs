import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE_ITEMS, SHARED_DEFAULTS, ITEM_DEFAULTS, parseHistory, survival, cleanItems, cleanShared, outcome, plan, analyze, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const item = (history, price = 5, cost = 2, salvage = 0, minutes = 0, current = 0) => ({ name: "X", price, cost, salvage, minutesPerUnit: minutes, history, current });
const hist = (...v) => v.join(" ");

test("history parser reads numbers, sold-out plus signs and skips junk", () => {
  assert.deepEqual(parseHistory("10 12+, abc 9;8"), [
    { v: 10, censored: false }, { v: 12, censored: true }, { v: 9, censored: false }, { v: 8, censored: false }]);
  assert.deepEqual(parseHistory(""), []);
});

test("without sell-outs the survival curve is the plain empirical one", () => {
  const S = survival(parseHistory("1 2 2 3"));
  near(S[0], 1); near(S[1], 0.75); near(S[2], 0.25); near(S[3], 0);
});

test("a sold-out day counts as demand of at least its sales, so survival is higher than if it were taken as demand", () => {
  const plain = survival(parseHistory("5 6 7 8"));
  const cens = survival(parseHistory("5 6 7 8+"));
  for (let q = 0; q < 8; q++) assert.ok(cens[q] >= plain[q] - 1e-12);
  near(plain[7], 0.25);
  near(cens[7], 0.25); near(cens[8], 0); // leftover mass is placed at the last observation, so the curve ends there
  const mid = survival(parseHistory("5 6+ 7 8"));
  assert.ok(mid[6] > survival(parseHistory("5 6 7 8"))[6] - 1e-12);
});

test("an item with a price, cost, and three days is kept; fewer is dropped", () => {
  assert.equal(cleanItems([item("5 6")]).length, 0);
  assert.equal(cleanItems([item("5 6 7")]).length, 1);
  assert.equal(cleanItems([{ ...item("5 6 7"), price: 0 }]).length, 0);
});

test("unconstrained plan matches an exhaustive search over prep quantities", () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let t = 0; t < 80; t++) {
    const days = Array.from({ length: 12 }, () => { const v = Math.floor(rnd() * 30); return rnd() < 0.2 ? v + "+" : String(v); });
    const price = 3 + Math.floor(rnd() * 8), cost = 1 + rnd() * (price - 1.5), salv = rnd() < 0.5 ? 0 : cost * rnd();
    const [k] = cleanItems([item(days.join(" "), price, cost, salv)]);
    if (!k) continue;
    const [Q] = plan([k], cleanShared({})).prep;
    let bestQ = 0, bestP = -Infinity;
    for (let q = 0; q <= 40; q++) { const p = outcome(k, q).profit; if (p > bestP + 1e-12) { bestP = p; bestQ = q; } }
    near(outcome(k, Q).profit, bestP, 1e-9);
    assert.ok(Math.abs(Q - bestQ) <= 1 || Math.abs(outcome(k, Q).profit - bestP) < 1e-9);
  }
});

test("leftover value raises the prep quantity", () => {
  const h = hist(10, 12, 14, 16, 18, 20, 22, 24);
  const none = plan(cleanItems([item(h, 5, 3, 0)]), cleanShared({})).prep[0];
  const some = plan(cleanItems([item(h, 5, 3, 2)]), cleanShared({})).prep[0];
  assert.ok(some >= none);
});

test("a thin margin preps less than a fat one", () => {
  const h = hist(10, 12, 14, 16, 18, 20, 22, 24);
  const thin = plan(cleanItems([item(h, 5, 4.5)]), cleanShared({})).prep[0];
  const fat = plan(cleanItems([item(h, 5, 1)]), cleanShared({})).prep[0];
  assert.ok(thin < fat);
});

test("expected sold plus expected leftover equals the prep", () => {
  const [k] = cleanItems([item(hist(10, 12, 14, 16, 18, 20))]);
  for (const q of [0, 5, 15, 25]) { const o = outcome(k, q); near(o.sold + o.left, q, 1e-9); }
});

test("a limit on prep minutes is respected and prefers the higher profit per minute", () => {
  const items = cleanItems([
    { ...item(hist(20, 22, 24, 26, 28, 30), 6, 2, 0, 5) },
    { ...item(hist(20, 22, 24, 26, 28, 30), 6, 2, 0, 1) },
  ]);
  const free = plan(items, cleanShared({}));
  const tight = plan(items, cleanShared({ prepMinutes: 80 }));
  assert.ok(tight.usedMinutes <= 80 + 1e-9);
  assert.ok(tight.prep[1] >= tight.prep[0]);
  assert.ok(tight.prep[0] + tight.prep[1] <= free.prep[0] + free.prep[1]);
  assert.ok(tight.shadow > 0);
});

test("a very large limit changes nothing", () => {
  const items = cleanItems(EXAMPLE_ITEMS);
  const free = plan(items, cleanShared({}));
  const big = plan(items, cleanShared({ prepMinutes: 1e6, budget: 1e6 }));
  assert.deepEqual(big.prep, free.prep);
});

test("a cash budget is respected", () => {
  const items = cleanItems(EXAMPLE_ITEMS);
  const p = plan(items, cleanShared({ budget: 100 }));
  assert.ok(p.usedBudget <= 100 + 1e-9);
});

test("the example gains against the current prep and has no negative waste", () => {
  const a = analyze(EXAMPLE_ITEMS, SHARED_DEFAULTS);
  assert.ok(a.ok && a.hasCurrent);
  assert.ok(a.dayGain > 0);
  near(a.monthGain, a.dayGain * 26, 1e-9);
  for (const r of a.rows) assert.ok(r.best.left >= -1e-9);
  assert.ok(a.curWaste >= a.bestWaste - 1e-9);
});

test("nothing to analyse gives a plain message; warnings flag a thin history", () => {
  assert.equal(analyze([], SHARED_DEFAULTS).ok, false);
  const a = analyze([item("5 6 7 8")], SHARED_DEFAULTS);
  assert.ok(a.warnings.some((w) => /only 4 days/.test(w)));
});

test("price below cost is flagged and preps nothing", () => {
  const a = analyze([item(hist(5, 6, 7, 8), 2, 3)], SHARED_DEFAULTS);
  assert.ok(a.warnings.some((w) => /does not exceed the cost/.test(w)));
  assert.equal(a.rows[0].best.prep, 0);
});

test("csv has a header, a row per item and a total", () => {
  const csv = toCsv(analyze(EXAMPLE_ITEMS, SHARED_DEFAULTS));
  assert.match(csv, /^"Item","Prep"/);
  assert.match(csv, /"Total"/);
  assert.equal(csv.split("\n").length, 5);
});

test("defaults are stable", () => {
  assert.deepEqual(cleanShared({}), cleanShared(SHARED_DEFAULTS));
  assert.equal(ITEM_DEFAULTS.history, "");
});
