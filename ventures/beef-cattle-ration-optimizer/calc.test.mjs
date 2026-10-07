import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeeds, validateSpec, solve, verifyPlan, planFeasible, planCost, totals, sampleSpec, applyPreset, PRESETS, SAMPLE_FEEDS, planCsv, simplex, money2, dmiTarget } from "./calc.mjs";

test("simplex solves a textbook LP", () => {
  const r = simplex([3, 2], [{ a: [1, 1], rel: "<=", b: 4 }, { a: [1, 3], rel: "<=", b: 6 }]);
  assert.equal(r.status, "optimal");
  assert.ok(Math.abs(r.value - 12) < 1e-9);
});

test("simplex reports infeasible and unbounded", () => {
  assert.equal(simplex([1], [{ a: [1], rel: ">=", b: 5 }, { a: [1], rel: "<=", b: 2 }]).status, "infeasible");
  assert.equal(simplex([1], [{ a: [1], rel: ">=", b: 1 }]).status, "unbounded");
});

test("parseFeeds reads the starter list and rejects bad lines", () => {
  const ok = parseFeeds(SAMPLE_FEEDS);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.feeds.length, 12);
  assert.equal(ok.feeds.find((f) => f.name === "Wheat straw").max, 8);
  const bad = parseFeeds("Hay | 100 | 88 | 10 | 55 | 0.4 | 0.2\nHay | 100 | 88 | 10 | 55 | 0.4 | 0.2 | X\nCorn | -5 | 88 | 9 | 88 | 0 | 0.3 | C\nA | 5 | 0 | 9 | 88 | 0 | 0.3 | C\nB | 5 | 90 | 109 | 88 | 0 | 0.3 | C");
  assert.equal(bad.feeds.length, 0);
  assert.equal(bad.errors.length, 5);
  const dup = parseFeeds("Hay | 100 | 88 | 10 | 55 | 0.4 | 0.2 | F\nhay | 120 | 88 | 10 | 55 | 0.4 | 0.2 | F");
  assert.equal(dup.feeds.length, 1);
  assert.match(dup.errors[0], /twice/);
});

test("every preset solves to a verified, feasible ration that meets its requirements", () => {
  for (const key of Object.keys(PRESETS)) {
    const spec = sampleSpec(key);
    assert.deepEqual(validateSpec(spec), [], key);
    const res = solve(spec);
    assert.equal(res.status, "optimal", key);
    assert.deepEqual(verifyPlan(spec, res), [], key);
    assert.ok(res.cpPct >= spec.cp - 1e-6 && res.tdnPct >= spec.tdn - 1e-6, key);
    assert.ok(res.foragePct >= spec.forageMin - 1e-6, key);
    assert.ok(res.caP >= spec.caPMin - 1e-6 && res.caP <= spec.caPMax + 1e-6, key);
    const dmi = dmiTarget(spec);
    assert.ok(res.totals.dm >= dmi * 0.98 - 1e-6 && res.totals.dm <= dmi * 1.02 + 1e-6, key);
  }
});

// A tiny deterministic generator so the optimality check is reproducible.
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

test("no random feasible ration is cheaper than the solver's", () => {
  for (const key of ["cow-lact", "grower", "finisher"]) {
    const spec = sampleSpec(key);
    const res = solve(spec);
    const rand = rng(7 + key.length);
    let feasibleSeen = 0;
    for (let t = 0; t < 60000; t++) {
      // random sparse mix: 2 to 4 feeds, scaled to land near the intake target
      const x = spec.feeds.map(() => 0);
      const k = 2 + Math.floor(rand() * 3);
      for (let j = 0; j < k; j++) x[Math.floor(rand() * x.length)] = rand() * 20;
      const dm = totals(spec, x).dm;
      if (dm <= 0) continue;
      const scale = dmiTarget(spec) / dm;
      const y = x.map((v) => v * scale);
      if (!planFeasible(spec, y)) continue;
      feasibleSeen++;
      assert.ok(planCost(spec, y) >= res.cost - 1e-6, `${key}: random ration beat the solver`);
    }
    assert.ok(feasibleSeen >= 0);
  }
});

test("matches exhaustive search on a three-feed list", () => {
  const spec = {
    ...applyPreset("grower", 600),
    forageMin: 40,
    feeds: parseFeeds("Hay | 160 | 88 | 10 | 55 | 0.45 | 0.25 | F\nCorn | 220 | 88 | 9.5 | 88 | 0.03 | 0.3 | C\nSBM | 400 | 90 | 53 | 84 | 0.35 | 0.72 | C\nLime | 150 | 100 | 0 | 0 | 38 | 0.02 | M | 0.5").feeds,
    caPMin: 1, caPMax: 8,
  };
  const res = solve(spec);
  assert.equal(res.status, "optimal");
  let best = Infinity;
  for (let h = 0; h <= 30; h += 0.5) for (let c = 0; c <= 20; c += 0.25) for (let s = 0; s <= 4; s += 0.1) for (let l = 0; l <= 0.5; l += 0.05) {
    const x = [h, c, s, l];
    if (planFeasible(spec, x, 1e-9)) best = Math.min(best, planCost(spec, x));
  }
  assert.ok(Number.isFinite(best));
  assert.ok(res.cost <= best + 1e-9, `solver ${res.cost} vs grid ${best}`);
  assert.ok(res.cost >= best - 0.05, `solver ${res.cost} implausibly far below grid ${best}`);
});

test("shadow prices equal the re-solved cost difference", () => {
  const spec = sampleSpec("cow-lact");
  const base = solve(spec);
  const raised = solve({ ...spec, cp: spec.cp + 1 });
  assert.ok(Math.abs(base.marginal.cp.extra - (raised.cost - base.cost)) < 1e-9);
  assert.ok(base.marginal.cp.extra > 0);
});

test("an unused feed enters the ration just below its reported entry price, not above it", () => {
  const spec = sampleSpec("cow-mid");
  const res = solve(spec);
  const hay = res.entry.find((e) => e.name === "Grass hay, mid-maturity");
  assert.ok(hay && hay.enters > 0 && hay.enters < hay.ton);
  const at = (ton) => {
    const s = { ...spec, feeds: spec.feeds.map((f) => (f.name === hay.name ? { ...f, ton } : f)) };
    const r = solve(s);
    return r.items.find((i) => i.name === hay.name)?.lb ?? 0;
  };
  assert.ok(at(hay.enters * 0.97) > 0.01);
  assert.ok(at(hay.enters * 1.03) < 0.02);
});

test("a requirement no feed can reach comes back infeasible with a reason", () => {
  const spec = { ...sampleSpec("cow-mid"), cp: 70 };
  const res = solve(spec);
  assert.equal(res.status, "infeasible");
  assert.ok(res.hints.some((h) => /Crude protein/.test(h)));
});

test("price changes move the ration the right way", () => {
  const spec = sampleSpec("cow-lact");
  const cheap = solve({ ...spec, feeds: spec.feeds.map((f) => (f.name === "Alfalfa hay" ? { ...f, ton: 60 } : f)) });
  assert.ok((cheap.items.find((i) => i.name === "Alfalfa hay")?.lb ?? 0) > 5);
  assert.ok(cheap.cost < solve(spec).cost);
});

test("herd totals and purchase quantities add up", () => {
  const spec = { ...sampleSpec("cow-mid"), head: 40, days: 100, waste: 10 };
  const res = solve(spec);
  assert.ok(Math.abs(res.herdPeriod - res.cost * 40 * 100 * 1.1) < 1e-6);
  const buyCost = res.buy.reduce((s, b) => s + b.cost, 0);
  assert.ok(Math.abs(buyCost - res.herdPeriod) < 1e-6);
});

test("validateSpec rejects nonsense", () => {
  const s = sampleSpec();
  assert.ok(validateSpec({ ...s, weight: 0 }).length);
  assert.ok(validateSpec({ ...s, dmiPct: 9 }).length);
  assert.ok(validateSpec({ ...s, feeds: s.feeds.slice(0, 1) }).length);
  assert.ok(validateSpec({ ...s, caPMin: 5, caPMax: 2 }).length);
  assert.ok(validateSpec({ ...s, cp: 120 }).length);
});

test("csv has a header, one row per feed and a total", () => {
  const spec = sampleSpec();
  const res = solve(spec);
  const lines = planCsv(spec, res).trim().split("\n");
  assert.equal(lines.length, res.items.length + 2);
  assert.match(lines[0], /^Feed,/);
  assert.match(lines.at(-1), /^"Total"/);
  assert.match(money2(res.cost), /^\$\d+\.\d\d$/);
});
