import { test } from "node:test";
import assert from "node:assert/strict";
import { SHARED_DEFAULTS, EXAMPLE_TYPES, num, money, cleanTypes, cleanShared, unitNoi, evaluate, optimize, analyze, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const shared = (o = {}) => cleanShared({ totalSqft: 1000, opexPct: 0, unitCostYear: 0, ...o });

// Exhaustive search over every count vector inside the bounds, for tiny instances.
function brute(types, sh) {
  let best = -Infinity;
  const counts = [];
  const go = (i, used) => {
    if (i === types.length) {
      const v = evaluate(types, counts, sh).noi;
      if (v > best) best = v;
      return;
    }
    const t = types[i];
    const hi = Number.isFinite(t.max) ? t.max : Math.floor((sh.totalSqft - used) / t.sqft);
    for (let n = t.min; n <= hi && used + n * t.sqft <= sh.totalSqft; n++) { counts[i] = n; go(i + 1, used + n * t.sqft); }
  };
  go(0, 0);
  return best;
}

test("num strips currency and percent signs and falls back", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("92%"), 92);
  assert.equal(num("abc", 7), 7);
});

test("types without a size or a rate are left out; a zero ceiling means no limit", () => {
  const t = cleanTypes([{ sqft: 100, rate: 100, maxUnits: 0 }, { sqft: 0, rate: 50 }, { sqft: 50, rate: 0 }]);
  assert.equal(t.length, 1);
  assert.equal(t[0].max, Infinity);
});

test("unit NOI is rate x 12 x occupancy, less operating share and per-unit cost", () => {
  const [t] = cleanTypes([{ sqft: 100, rate: 100, occ: 90 }]);
  near(unitNoi(t, shared({ opexPct: 40, unitCostYear: 60 })), 100 * 12 * 0.9 * 0.6 - 60);
});

test("with no ceilings the densest-revenue size takes all the area", () => {
  const types = cleanTypes([{ sqft: 25, rate: 55 }, { sqft: 100, rate: 135 }]);
  const o = optimize(types, shared({ totalSqft: 1000 }));
  assert.deepEqual(o.counts, [40, 0]);
});

test("ceilings force the rest of the area into the next best size", () => {
  const types = cleanTypes([{ sqft: 25, rate: 55, maxUnits: 10 }, { sqft: 100, rate: 135 }]);
  const o = optimize(types, shared({ totalSqft: 1000 }));
  assert.deepEqual(o.counts, [8, 8]); // fills all 1,000 sq ft; [10, 7] would strand 50
});

test("minimum units are honoured and infeasible minimums are flagged", () => {
  const types = cleanTypes([{ sqft: 100, rate: 100, minUnits: 3 }]);
  assert.deepEqual(optimize(types, shared({ totalSqft: 1000 })).counts, [10]);
  const bad = cleanTypes([{ sqft: 100, rate: 100, minUnits: 30 }]);
  assert.equal(optimize(bad, shared({ totalSqft: 1000 })).feasible, false);
  assert.ok(analyze([{ sqft: 100, rate: 100, minUnits: 30 }], { totalSqft: 1000 }).warnings.some((w) => /minimum/i.test(w)));
});

test("a size that loses money after costs is built only to its minimum", () => {
  const types = cleanTypes([{ sqft: 100, rate: 10, minUnits: 2 }, { sqft: 100, rate: 100 }]);
  const o = optimize(types, shared({ unitCostYear: 500 }));
  assert.equal(o.counts[0], 2);
});

test("the DP matches exhaustive search on random small instances", () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const sizes = [25, 50, 75, 100, 150];
  for (let trial = 0; trial < 60; trial++) {
    const raw = [];
    for (let k = 0; k < 3; k++) raw.push({ sqft: sizes[rnd(sizes.length)], rate: 20 + rnd(200), occ: 70 + rnd(30), minUnits: rnd(2), maxUnits: rnd(3) ? 1 + rnd(8) : 0 });
    const types = cleanTypes(raw);
    const sh = shared({ totalSqft: 300 + rnd(8) * 50, opexPct: rnd(50), unitCostYear: rnd(100) });
    const o = optimize(types, sh);
    if (!o.feasible) continue;
    near(evaluate(types, o.counts, sh).noi, brute(types, sh), 1e-6);
  }
});

test("area is never exceeded and ceilings are never exceeded", () => {
  const a = analyze(EXAMPLE_TYPES, SHARED_DEFAULTS);
  assert.ok(a.best.sqft <= SHARED_DEFAULTS.totalSqft);
  a.rows.forEach((r) => { if (Number.isFinite(r.ceiling)) assert.ok(r.optimal <= r.ceiling); });
});

test("the example mix is at least as good as the current mix", () => {
  const a = analyze(EXAMPLE_TYPES, SHARED_DEFAULTS);
  assert.ok(a.ok);
  assert.ok(a.best.noi >= a.current.noi);
  near(a.gain, a.best.noi - a.current.noi);
});

test("marginal area value is positive when space binds and zero when demand does", () => {
  const binding = analyze([{ sqft: 100, rate: 100 }], { totalSqft: 1000, opexPct: 0 });
  assert.ok(binding.addSqft > 0);
  const capped = analyze([{ sqft: 100, rate: 100, maxUnits: 5 }], { totalSqft: 1000, opexPct: 0 });
  near(capped.addSqft, 0);
  assert.ok(capped.warnings.some((w) => /empty/.test(w)));
});

test("bad input is reported, never thrown", () => {
  assert.equal(analyze([], SHARED_DEFAULTS).ok, false);
  assert.equal(analyze(EXAMPLE_TYPES, { totalSqft: 0 }).ok, false);
  assert.equal(analyze([{ sqft: 1, rate: 5 }], { totalSqft: 1e9 }).ok, false);
});

test("csv lists every size and both totals", () => {
  const csv = toCsv(analyze(EXAMPLE_TYPES, SHARED_DEFAULTS));
  assert.equal(csv.trim().split("\n").length, 1 + EXAMPLE_TYPES.length + 2);
  assert.match(csv, /total_noi_optimal/);
  assert.equal(money(1234.4), "$1,234");
});
