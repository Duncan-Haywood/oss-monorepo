import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE_BEERS, EXAMPLE_SHARED, parseTanks, cleanShared, cleanBeers, decode, validate, valueOf, upperBound, optimize, analyze, toCsv, dayLabel } from "./calc.mjs";

const ctxOf = (beers, shared) => { const s = cleanShared(shared); const b = cleanBeers(beers); return { beers: b, shared: s, H: s.weeks * 7, T: s.turnaroundDays }; };
const beer = (name, bbl, f, c, m, mn = 0, mx = 0) => ({ name, batchBbl: bbl, fermentDays: f, conditionDays: c, marginPerBbl: m, minBatches: mn, maxBatches: mx });

test("tank list parser reads sizes and skips junk", () => {
  assert.deepEqual(parseTanks("30 30, 15; x -5 0"), [30, 30, 15]);
  assert.deepEqual(parseTanks(""), []);
});

test("beers need a size, a fermenting day and a margin to be kept", () => {
  assert.equal(cleanBeers([beer("a", 10, 0, 0, 5)]).length, 0);
  assert.equal(cleanBeers([beer("a", 0, 5, 0, 5)]).length, 0);
  assert.equal(cleanBeers([beer("a", 10, 5, 0, 0)]).length, 0);
  assert.equal(cleanBeers([beer("a", 10, 4.2, 0, 5)])[0].fermentDays, 5);
});

test("day labels", () => { assert.equal(dayLabel(0), "Wk 1 Mon"); assert.equal(dayLabel(9), "Wk 2 Wed"); });

test("one batch is placed on the first brew day and the tank is then busy until it is cleaned", () => {
  const ctx = ctxOf([beer("A", 10, 10, 0, 100)], { fermenters: "10", brites: "", weeks: 4, brewDaysPerWeek: 3, brewsPerBrewDay: 1, turnaroundDays: 1 });
  const p = decode([0, 0, 0], ctx);
  assert.equal(p[0].start, 0);
  assert.ok(p[1].start >= 11, "second batch waits for fermenting plus cleaning");
  assert.deepEqual(validate(p, ctx), []);
});

test("a batch only goes in a tank big enough, smallest first", () => {
  const ctx = ctxOf([beer("A", 10, 5, 0, 100)], { fermenters: "30 10", brites: "", weeks: 2, brewDaysPerWeek: 2, brewsPerBrewDay: 1, turnaroundDays: 0 });
  assert.equal(decode([0], ctx)[0].fermenter, 1);
  const big = ctxOf([beer("A", 20, 5, 0, 100)], { fermenters: "30 10", brites: "", weeks: 2, brewDaysPerWeek: 2, brewsPerBrewDay: 1, turnaroundDays: 0 });
  assert.equal(decode([0], big)[0].fermenter, 0);
});

test("the brewhouse limit is respected", () => {
  const ctx = ctxOf([beer("A", 5, 3, 0, 100)], { fermenters: "5 5 5 5", brites: "", weeks: 2, brewDaysPerWeek: 1, brewsPerBrewDay: 2, turnaroundDays: 0 });
  const p = decode([0, 0, 0, 0], ctx);
  const perDay = {};
  p.forEach((x) => { perDay[x.start] = (perDay[x.start] || 0) + 1; assert.equal(x.start % 7, 0); });
  assert.ok(Object.values(perDay).every((n) => n <= 2));
  assert.deepEqual(validate(p, ctx), []);
});

test("a batch that cannot finish inside the horizon is not scheduled", () => {
  const ctx = ctxOf([beer("A", 5, 20, 0, 100)], { fermenters: "5", brites: "", weeks: 2, brewDaysPerWeek: 7, brewsPerBrewDay: 1, turnaroundDays: 0 });
  assert.equal(decode([0], ctx).length, 0);
});

test("validate catches a double-booked tank", () => {
  const ctx = ctxOf([beer("A", 5, 5, 0, 100)], { fermenters: "5", brites: "", weeks: 4, brewDaysPerWeek: 7, brewsPerBrewDay: 2, turnaroundDays: 0 });
  const bad = [{ beer: 0, start: 0, fermenter: 0, brite: -1, ready: 5 }, { beer: 0, start: 2, fermenter: 0, brite: -1, ready: 7 }];
  assert.ok(validate(bad, ctx).some((m) => /double-booked/.test(m)));
});

// Exhaustive optimum over every choice of skip / start day / tank for a handful of batches.
function exact(ctx, requests, tanks) {
  let best = 0;
  const rec = (i, placed) => {
    if (i === requests.length) { best = Math.max(best, valueOf(placed, ctx.beers)); return; }
    rec(i + 1, placed);
    const b = ctx.beers[requests[i]];
    for (let s = 0; s + b.fermentDays + b.conditionDays <= ctx.H; s++) {
      if (s % 7 >= ctx.shared.brewDaysPerWeek) continue;
      for (let f = 0; f < tanks.fermenters.length; f++) {
        const brites = b.conditionDays > 0 ? tanks.brites.map((_, g) => g) : [-1];
        for (const g of brites) {
          const next = placed.concat({ beer: requests[i], start: s, fermenter: f, brite: g, ready: s + b.fermentDays + b.conditionDays });
          if (validate(next, ctx, tanks).length === 0) rec(i + 1, next);
        }
      }
    }
  };
  rec(0, []);
  return best;
}

test("search is close to the exhaustive optimum on small instances, never above it, and never above the bound", () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let worst = 1, equal = 0, total = 0;
  for (let t = 0; t < 25; t++) {
    const beers = [beer("A", 10, 3 + Math.floor(rnd() * 5), Math.floor(rnd() * 4), 50 + Math.floor(rnd() * 100), 0, 2), beer("B", 10, 3 + Math.floor(rnd() * 5), Math.floor(rnd() * 4), 50 + Math.floor(rnd() * 100), 0, 2)];
    const ctx = ctxOf(beers, { fermenters: rnd() < 0.5 ? "10" : "10 10", brites: "10", weeks: 2, brewDaysPerWeek: 2 + Math.floor(rnd() * 3), brewsPerBrewDay: 1, turnaroundDays: Math.floor(rnd() * 2) });
    const tanks = { fermenters: ctx.shared.fermenters, brites: ctx.shared.brites };
    const opt = exact(ctx, [0, 0, 1, 1], tanks);
    const got = optimize(ctx, { iterations: 300 });
    assert.deepEqual(validate(got.placed, ctx), []);
    assert.ok(got.value <= opt + 1e-9, "heuristic cannot beat the exhaustive optimum");
    assert.ok(opt <= upperBound(ctx) + 1e-9, "bound must not be below the optimum");
    total++;
    if (got.value === opt) equal++;
    if (opt > 0) worst = Math.min(worst, got.value / opt);
  }
  assert.ok(worst >= 0.7, `worst ratio ${worst}`);
  assert.ok(equal / total >= 0.7, `matched the optimum on ${equal} of ${total}`);
});

test("random plans are always feasible and respect minimums and maximums", () => {
  let seed = 3;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let t = 0; t < 20; t++) {
    const beers = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => beer("B" + i, 5 + 5 * Math.floor(rnd() * 3), 5 + Math.floor(rnd() * 20), Math.floor(rnd() * 10), 50 + Math.floor(rnd() * 200), Math.floor(rnd() * 2), rnd() < 0.5 ? 0 : 2 + Math.floor(rnd() * 3)));
    const ctx = ctxOf(beers, { fermenters: "15 15 10 5", brites: "15 10", weeks: 8 + Math.floor(rnd() * 8), brewDaysPerWeek: 1 + Math.floor(rnd() * 5), brewsPerBrewDay: 1 + Math.floor(rnd() * 2), turnaroundDays: Math.floor(rnd() * 3) });
    const r = optimize(ctx, { iterations: 100 });
    const hasBrite = (b) => b.conditionDays === 0 || ctx.shared.brites.some((c) => c >= b.batchBbl);
    if (ctx.beers.every(hasBrite)) assert.deepEqual(validate(r.placed, ctx), []);
    assert.ok(r.value <= upperBound(ctx) + 1e-9);
  }
});

test("a minimum batch count is met when it can be, and reported when it cannot", () => {
  const shared = { fermenters: "10", brites: "", weeks: 6, brewDaysPerWeek: 7, brewsPerBrewDay: 1, turnaroundDays: 1 };
  const meets = analyze([beer("Cheap", 10, 6, 0, 10, 3), beer("Rich", 10, 6, 0, 500, 0)], shared);
  assert.equal(meets.beers[0].made >= 3, true);
  assert.equal(meets.warnings.length, 0);
  const cannot = analyze([beer("Cheap", 10, 6, 0, 10, 20)], shared);
  assert.ok(cannot.warnings.some((w) => /short/.test(w)));
});

test("the same inputs always give the same plan", () => {
  const a = analyze(EXAMPLE_BEERS, EXAMPLE_SHARED, { scenarios: false });
  const b = analyze(EXAMPLE_BEERS, EXAMPLE_SHARED, { scenarios: false });
  assert.deepEqual(a.schedule, b.schedule);
  assert.equal(a.value, b.value);
});

test("example is feasible, beats brewing in rotation and sits under its bound", () => {
  const a = analyze(EXAMPLE_BEERS, EXAMPLE_SHARED);
  assert.ok(a.ok);
  assert.deepEqual(a.problems, []);
  assert.ok(a.value >= a.naiveValue);
  assert.ok(a.value <= a.bound);
  assert.ok(a.fermUtil.every((u) => u >= 0 && u <= 1));
  assert.equal(a.rowsF.length, 4);
  assert.ok(a.scenarios.every((s) => s.gain >= 0));
  const csv = toCsv(a);
  assert.equal(csv.trim().split("\n").length, a.schedule.length + 1);
});

test("beers that fit no tank are named and left out; nothing usable is a clean failure", () => {
  const a = analyze([beer("Huge", 99, 10, 0, 100), beer("Ok", 10, 10, 0, 100)], { fermenters: "10", brites: "", weeks: 8, brewDaysPerWeek: 3, brewsPerBrewDay: 1, turnaroundDays: 1 });
  assert.ok(a.ok);
  assert.ok(a.warnings.some((w) => /Huge/.test(w)));
  const none = analyze([beer("Huge", 99, 10, 0, 100)], { fermenters: "10", brites: "", weeks: 8 });
  assert.equal(none.ok, false);
  assert.equal(analyze([], EXAMPLE_SHARED).ok, false);
  assert.equal(analyze(EXAMPLE_BEERS, { ...EXAMPLE_SHARED, fermenters: "" }).ok, false);
});
