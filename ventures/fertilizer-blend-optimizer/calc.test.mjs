import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProducts, validateSpec, solve, verifyPlan, planFeasible, planCost, delivered, sampleSpec, applyPreset, PRESETS, SAMPLE_PRODUCTS, planCsv, simplex, money2, naivePlan, NUTRIENTS } from "./calc.mjs";

test("simplex solves a textbook LP", () => {
  const r = simplex([3, 2], [{ a: [1, 1], rel: "<=", b: 4 }, { a: [1, 3], rel: "<=", b: 6 }]);
  assert.equal(r.status, "optimal");
  assert.ok(Math.abs(r.value - 12) < 1e-9);
});

test("simplex reports infeasible and unbounded", () => {
  assert.equal(simplex([1], [{ a: [1], rel: ">=", b: 5 }, { a: [1], rel: "<=", b: 2 }]).status, "infeasible");
  assert.equal(simplex([1], [{ a: [1], rel: ">=", b: 1 }]).status, "unbounded");
});

test("parseProducts reads the starter list and rejects bad lines", () => {
  const ok = parseProducts(SAMPLE_PRODUCTS);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.products.length, 8);
  assert.equal(ok.products.find((f) => f.name.startsWith("DAP")).p, 46);
  const bad = parseProducts("A | 100 | 46 | 0 | 0\nB | 100 | 60 | 50 | 0 | 0\nC | -5 | 46 | 0 | 0 | 0\nD | 100 | 0 | 0 | 0 | 0\nE | 0 | 46 | 0 | 0 | 0");
  assert.equal(bad.products.length, 0);
  assert.equal(bad.errors.length, 5);
  const dup = parseProducts("Urea | 500 | 46 | 0 | 0 | 0\nurea | 520 | 46 | 0 | 0 | 0 | 300");
  assert.equal(dup.products.length, 1);
  assert.match(dup.errors[0], /twice/);
  assert.equal(parseProducts("Urea | 500 | 46 | 0 | 0 | 0 | 120").products[0].max, 120);
});

test("every preset solves to a verified blend that meets its targets", () => {
  for (const key of Object.keys(PRESETS)) {
    const spec = sampleSpec(key);
    assert.deepEqual(validateSpec(spec), [], key);
    const res = solve(spec);
    assert.equal(res.status, "optimal", key);
    assert.deepEqual(verifyPlan(spec, res), [], key);
    for (const k of NUTRIENTS) assert.ok(res.delivered[k] >= spec[k] - 1e-6, `${key} ${k}`);
    assert.ok(res.naiveSeparate.perAcre >= -1e-9, key);
    assert.ok(res.naive.perAcre >= -1e-9, key);
    assert.ok(res.naiveSeparate.perAcre >= res.naive.perAcre - 1e-9, key);
  }
});

// Exact reference: enumerate every vertex of {A x >= b, x <= max, x >= 0} by
// choosing which variables are nonzero and which constraints are tight.
function solveSquare(M, v) {
  const n = v.length, A = M.map((r, i) => [...r, v[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let j = c; j <= n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((r, i) => r[n] / r[i]);
}
function bruteForce(spec) {
  const prods = spec.products, n = prods.length;
  const cons = []; // {a, b} tight equalities available
  for (const k of NUTRIENTS) {
    const t = Number(spec[k]);
    if (!(t > 0)) continue;
    const a = prods.map((f) => f[k] / 100);
    cons.push({ a, b: t });
    if (spec.over !== null && spec.over !== undefined) cons.push({ a, b: t * (1 + spec.over / 100) });
  }
  prods.forEach((f, i) => { if (f.max !== null) cons.push({ a: prods.map((_, j) => (j === i ? 1 : 0)), b: f.max }); });
  let best = Infinity;
  for (let mask = 1; mask < 1 << n; mask++) {
    const S = []; for (let i = 0; i < n; i++) if (mask & (1 << i)) S.push(i);
    const m = S.length;
    const pick = (start, chosen) => {
      if (chosen.length === m) {
        const sol = solveSquare(chosen.map((c) => S.map((i) => c.a[i])), chosen.map((c) => c.b));
        if (!sol) return;
        const x = new Array(n).fill(0); S.forEach((i, j) => (x[i] = sol[j]));
        if (planFeasible(spec, x, 1e-7)) best = Math.min(best, planCost(spec, x));
        return;
      }
      for (let c = start; c < cons.length; c++) pick(c + 1, [...chosen, cons[c]]);
    };
    pick(0, []);
  }
  return best;
}

test("matches exhaustive vertex enumeration on small cases", () => {
  const lists = [
    "Urea | 520 | 46 | 0 | 0 | 0\nDAP | 780 | 18 | 46 | 0 | 0\nPotash | 600 | 0 | 0 | 60 | 0",
    "Urea | 520 | 46 | 0 | 0 | 0\nNH3 | 700 | 82 | 0 | 0 | 0\nMAP | 820 | 11 | 52 | 0 | 0\nDAP | 700 | 18 | 46 | 0 | 0\nPotash | 600 | 0 | 0 | 60 | 0",
    "Urea | 300 | 46 | 0 | 0 | 0 | 150\nAMS | 450 | 21 | 0 | 0 | 24\n10-10-10 | 640 | 10 | 10 | 10 | 0\nMAP | 820 | 11 | 52 | 0 | 0\nPotash | 600 | 0 | 0 | 60 | 0",
  ];
  const targets = [{ n: 150, p: 55, k: 60, s: 0 }, { n: 100, p: 40, k: 0, s: 10 }, { n: 0, p: 60, k: 90, s: 0 }, { n: 120, p: 30, k: 30, s: 15 }];
  let checked = 0;
  for (const text of lists) for (const t of targets) for (const over of [null, 25]) {
    const spec = { acres: 100, ...t, over, products: parseProducts(text).products };
    if (validateSpec(spec).length) continue;
    const res = solve(spec);
    const bf = bruteForce(spec);
    if (!Number.isFinite(bf)) { assert.notEqual(res.status, "optimal"); continue; }
    assert.equal(res.status, "optimal");
    assert.ok(Math.abs(res.cost - bf) < 1e-6, `solver ${res.cost} vs exhaustive ${bf}`);
    assert.deepEqual(verifyPlan(spec, res), []);
    checked++;
  }
  assert.ok(checked >= 12, `only ${checked} cases checked`);
});

test("no random feasible blend is cheaper than the solver's", () => {
  let s = 11; const rand = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (const key of ["corn", "alfalfa", "grass-hay"]) {
    const spec = sampleSpec(key), res = solve(spec);
    for (let t = 0; t < 40000; t++) {
      const x = spec.products.map(() => 0);
      const k = 1 + Math.floor(rand() * 4);
      for (let j = 0; j < k; j++) x[Math.floor(rand() * x.length)] = rand() * 500;
      if (!planFeasible(spec, x)) continue;
      assert.ok(planCost(spec, x) >= res.cost - 1e-6, `${key}: random blend beat the solver`);
    }
  }
});

test("a nutrient price equals the re-solved cost difference per pound", () => {
  const spec = sampleSpec("corn");
  const base = solve(spec);
  const raised = solve({ ...spec, p: spec.p + 10 });
  assert.ok(Math.abs(base.nutrientPrice.p - (raised.cost - base.cost) / 10) < 1e-9);
  assert.ok(base.nutrientPrice.p > 0 && base.nutrientPrice.n > 0);
  assert.equal(base.nutrientPrice.s > 0, true);
  assert.equal(solve(sampleSpec("soy")).nutrientPrice.n, undefined);
});

test("an unused product enters the blend just below its reported entry price, not above it", () => {
  const spec = sampleSpec("corn");
  const res = solve(spec);
  const urea = res.entry.find((e) => e.name.startsWith("Urea"));
  assert.ok(urea && urea.enters > 0 && urea.enters < urea.ton);
  const at = (ton) => {
    const r = solve({ ...spec, products: spec.products.map((f) => (f.name === urea.name ? { ...f, ton } : f)) });
    return r.items.find((i) => i.name === urea.name)?.lb ?? 0;
  };
  assert.ok(at(urea.enters * 0.97) > 0.01);
  assert.ok(at(urea.enters * 1.03) < 0.02);
});

test("the optimum never costs more than the obvious plan, and the gap is the saving", () => {
  for (const key of Object.keys(PRESETS)) {
    const spec = sampleSpec(key), res = solve(spec);
    const nv = naivePlan(spec, true);
    assert.ok(nv.feasible, key);
    assert.ok(res.cost <= nv.cost + 1e-9, key);
    assert.ok(Math.abs(res.naive.field - (nv.cost - res.cost) * spec.acres) < 1e-6, key);
  }
  const res = solve(sampleSpec("corn"));
  assert.ok(res.naiveSeparate.perAcre > 5, "buying each nutrient separately should cost real money here");
});

test("a maximum overshoot limits what the blend delivers", () => {
  const spec = { ...sampleSpec("corn"), over: 10 };
  const res = solve(spec);
  assert.equal(res.status, "optimal");
  for (const k of NUTRIENTS) if (spec[k] > 0) assert.ok(res.delivered[k] <= spec[k] * 1.1 + 1e-6, k);
  assert.ok(res.cost >= solve(sampleSpec("corn")).cost - 1e-9);
});

test("a nutrient no product carries comes back infeasible with a reason", () => {
  const spec = { ...sampleSpec("corn"), products: parseProducts("Urea | 520 | 46 | 0 | 0 | 0\nDAP | 780 | 18 | 46 | 0 | 0").products };
  const res = solve(spec);
  assert.equal(res.status, "infeasible");
  assert.ok(res.hints.some((h) => /Potash/.test(h)));
});

test("price changes move the blend the right way", () => {
  const spec = sampleSpec("corn");
  const cheap = solve({ ...spec, products: spec.products.map((f) => (f.name.startsWith("Urea") ? { ...f, ton: 250 } : f)) });
  assert.ok((cheap.items.find((i) => i.name.startsWith("Urea"))?.lb ?? 0) > 100);
  assert.ok(cheap.cost < solve(spec).cost);
});

test("field totals and tons add up", () => {
  const spec = { ...sampleSpec("corn"), acres: 240 };
  const res = solve(spec);
  assert.ok(Math.abs(res.field - res.cost * 240) < 1e-6);
  assert.ok(Math.abs(res.items.reduce((s, i) => s + i.total, 0) - res.field) < 1e-6);
  assert.ok(Math.abs(res.items.reduce((s, i) => s + i.tons, 0) - res.tonsTotal) < 1e-9);
});

test("validateSpec rejects nonsense", () => {
  const s = sampleSpec();
  assert.ok(validateSpec({ ...s, acres: 0 }).length);
  assert.ok(validateSpec({ ...s, n: -1 }).length);
  assert.ok(validateSpec({ ...s, n: 0, p: 0, k: 0, s: 0 }).length);
  assert.ok(validateSpec({ ...s, over: -5 }).length);
  assert.ok(validateSpec({ ...s, products: [] }).length);
  assert.deepEqual(validateSpec({ ...s, over: null }), []);
});

test("applyPreset fills targets and csv has a header, one row per product and a total", () => {
  assert.equal(applyPreset("soy").n, 0);
  assert.equal(applyPreset("nope"), null);
  const spec = sampleSpec();
  const res = solve(spec);
  const lines = planCsv(spec, res).trim().split("\n");
  assert.equal(lines.length, res.items.length + 2);
  assert.match(lines[0], /^Product,/);
  assert.match(lines.at(-1), /^"Total"/);
  assert.match(money2(res.cost), /^\$\d+\.\d\d$/);
});
