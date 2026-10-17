import test from "node:test";
import assert from "node:assert/strict";
import { parseItems, parseLevels, plan, summarize, evaluate, bestSchedule, sellChance, describeSchedule, standardSchedule, analyzeItem, money } from "./engine.mjs";

const O = { weeks: 6, lift: 0.35, cap: 0.95, handling: 2, slow: 60, levels: [0, 10, 25, 40] };

test("parse reports line numbers and never throws", () => {
  const r = parseItems("name,price\nJacket,abc,10,40,0.5\nOK,40,10,40,0.5\nShort,10\nBig,10,150,40,1\nBadWeeks,10,10,40,1,0\nZero,0,10,40,1");
  assert.equal(r.items.length, 1);
  assert.match(r.errors[0], /^line 2: price must be a number/);
  assert.ok(r.errors.some((e) => /^line 4: expected name/.test(e)));
  assert.ok(r.errors.some((e) => /^line 5: percentages cannot exceed 100/.test(e)));
  assert.ok(r.errors.some((e) => /^line 6: weeks on floor/.test(e)));
  assert.ok(r.errors.some((e) => /^line 7: price must be above zero/.test(e)));
  assert.equal(parseItems("").items.length, 0);
});

test("levels parse, sort, dedupe and reject bad values", () => {
  assert.deepEqual(parseLevels("50, 0,25,25"), [0, 25, 50]);
  assert.throws(() => parseLevels("0,100"));
  assert.throws(() => parseLevels("a"));
});

test("evaluate agrees with hand arithmetic", () => {
  const item = { name: "x", price: 100, rate: 0.1, share: 0.4, shelf: 1, weeks: 2 };
  const e = evaluate(item, [0, 0], { ...O, handling: 0 });
  // week 1: 0.1*100*0.4 - 1 = 3; week 2: 0.9*(4 - 1) = 2.7
  assert.ok(Math.abs(e.net - 5.7) < 1e-9);
  assert.ok(Math.abs(e.sold - 0.19) < 1e-9);
  assert.ok(Math.abs(e.expectedWeeks - 1.9) < 1e-9);
  assert.ok(Math.abs(sellChance(item, 20, O) - 0.17) < 1e-9);
});

function* schedules(levels, weeks, from = 0) {
  if (weeks === 0) return yield [];
  for (let k = from; k < levels.length; k += 1) for (const rest of schedules(levels, weeks - 1, k)) yield [levels[k], ...rest];
}

test("dynamic programme equals brute force over every non-decreasing schedule", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let n = 0; n < 150; n += 1) {
    const item = { name: "r", price: 10 + rnd() * 300, rate: 0.01 + rnd() * 0.3, share: 0.2 + rnd() * 0.5, shelf: rnd() * 4, weeks: 1 + Math.floor(rnd() * 6) };
    const o = { ...O, lift: rnd() * 1.5, handling: rnd() * 3 };
    let best = -Infinity;
    for (const s of schedules(o.levels, item.weeks)) best = Math.max(best, evaluate(item, s, o).net);
    const dp = bestSchedule(item, o);
    assert.ok(Math.abs(dp.net - best) < 1e-9, `${dp.net} vs ${best}`);
    assert.ok(Math.abs(evaluate(item, dp.discounts, o).net - dp.net) < 1e-9);
    for (let i = 1; i < dp.discounts.length; i += 1) assert.ok(dp.discounts[i] >= dp.discounts[i - 1]);
  }
});

test("with zero lift the plan never marks down", () => {
  const item = { name: "x", price: 100, rate: 0.1, share: 0.4, shelf: 0.5, weeks: 8 };
  assert.deepEqual(bestSchedule(item, { ...O, lift: 0 }).discounts, new Array(8).fill(0));
});

test("an expensive shelf slot pulls the first markdown earlier", () => {
  const item = { name: "x", price: 100, rate: 0.05, share: 0.4, weeks: 10 };
  const cheap = bestSchedule({ ...item, shelf: 0.1 }, O).discounts.findIndex((d) => d > 0);
  const dear = bestSchedule({ ...item, shelf: 2 }, O).discounts.findIndex((d) => d > 0);
  assert.ok(dear <= cheap || cheap === -1);
});

test("intake: a low-ticket item on a costly shelf is declined, with the price and share that would flip it", () => {
  const item = { name: "tee", price: 12, rate: 0.1, share: 0.4, shelf: 0.6, weeks: 12, note: "" };
  const a = analyzeItem(item, O);
  assert.equal(a.accept, false);
  assert.ok(a.minPriceToAccept > 12);
  assert.ok(a.minShareToAccept > 0.4 && a.minShareToAccept < 1);
  const flipped = analyzeItem({ ...item, price: a.minPriceToAccept * 1.01 }, O);
  assert.equal(flipped.accept, true);
  assert.equal(analyzeItem({ ...item, share: a.minShareToAccept * 1.01 }, O).accept, true);
});

test("plan never does worse than the fixed rule or never marking down", () => {
  const p = plan(parseItems("A,120,8,40,0.6,12\nB,38,14,40,0.6,12\nC,150,5,50,0.6,12"), {});
  for (const x of p.items) {
    assert.ok(x.net >= x.standard.net - 1e-9);
    assert.ok(x.net >= x.noMarkdown.net - 1e-9);
  }
  assert.ok(p.totals.upliftVsStandard >= 0);
  assert.equal(summarize(p).status === "gain" || summarize(p).status === "ok", true);
});

test("schedule text and standard rule", () => {
  assert.equal(describeSchedule([0, 0, 25, 25, 50]), "weeks 1-2: full price, weeks 3-4: 25% off, week 5: 50% off");
  assert.deepEqual(standardSchedule(10), [0, 0, 0, 0, 25, 25, 25, 25, 50, 50]);
});

test("bad options throw a readable message", () => {
  assert.throws(() => plan({ items: [] }, { weeks: 0 }), /weeks on floor/);
  assert.throws(() => plan({ items: [] }, { lift: "x" }), /lift/);
});

test("money formats", () => {
  assert.equal(money(-3.456), "-$3.46");
});
