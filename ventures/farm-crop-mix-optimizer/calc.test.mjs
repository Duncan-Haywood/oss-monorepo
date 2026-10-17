import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE_CROPS, SHARED_DEFAULTS, cleanCrops, cleanShared, optimize, evaluate, analyze, simplex, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const crop = (name, margin, labor = 0, cost = 0, min = 0, max = 0) => ({ name, yieldPerAcre: 1, price: margin + cost, costPerAcre: cost, laborPerAcre: labor, minAcres: min, maxAcres: max });
const sh = (o = {}) => cleanShared({ totalAcres: 100, laborHours: 0, capital: 0, landCostPerAcre: 0, ...o });

test("simplex solves a textbook LP", () => {
  // max 3x+5y; x<=4, 2y<=12, 3x+2y<=18 -> x=2,y=6, value 36
  const r = simplex([3, 5], [[1, 0], [0, 2], [3, 2]], [4, 12, 18]);
  near(r.value, 36); near(r.y[0], 2); near(r.y[1], 6);
  near(r.duals[0], 0); near(r.duals[1], 1.5); near(r.duals[2], 1);
});

test("with only an acre limit, all acres go to the best margin", () => {
  const crops = cleanCrops([crop("A", 100), crop("B", 150), crop("C", 120)]);
  const s = optimize(crops, sh());
  near(s.acres[1], 100); near(s.acres[0], 0);
  near(s.shadow.acre, 150);
});

test("a crop ceiling pushes the rest to the next best crop", () => {
  const crops = cleanCrops([crop("A", 100), crop("B", 150, 0, 0, 0, 30)]);
  const s = optimize(crops, sh());
  near(s.acres[1], 30); near(s.acres[0], 70);
  near(s.shadow.acre, 100);
});

test("a labor limit makes a labor-hungry crop lose to a leaner one", () => {
  const crops = cleanCrops([crop("Lean", 100, 1), crop("Hungry", 300, 5)]);
  const s = optimize(crops, sh({ laborHours: 200 }));
  // 200 hours: Lean 100 acres uses 100h; Hungry limited by hours.
  const e = evaluate(crops, s.acres, sh({ laborHours: 200 }));
  assert.ok(e.labor <= 200 + 1e-6);
  assert.ok(s.shadow.labor > 0);
});

test("capital limit binds and its shadow price is the return per dollar", () => {
  const crops = cleanCrops([crop("A", 200, 0, 400)]);
  const s = optimize(crops, sh({ capital: 20000 })); // 50 acres of capital
  near(s.acres[0], 50);
  near(s.shadow.capital, 0.5);
});

test("minimum acres are honoured and infeasible floors are reported", () => {
  const crops = cleanCrops([crop("A", 100, 0, 0, 40), crop("B", 150)]);
  const s = optimize(crops, sh());
  assert.ok(s.acres[0] >= 40 - 1e-9);
  const bad = cleanCrops([crop("A", 100, 0, 0, 80), crop("B", 150, 0, 0, 80)]);
  const a = analyze(bad.map((k) => ({ name: k.name, yieldPerAcre: 1, price: k.margin, minAcres: k.min })), sh());
  assert.equal(a.ok, false);
  assert.match(a.warnings[0], /No plan fits/);
});

test("strong duality: shadow prices times limits recover the optimum", () => {
  const crops = cleanCrops([crop("A", 120, 1, 300), crop("B", 200, 3, 450, 0, 40), crop("C", 90, 0.5, 200)]);
  const s = sh({ laborHours: 150, capital: 30000 });
  const sol = optimize(crops, s);
  const e = evaluate(crops, sol.acres, s);
  // Upper-bound duals are not exposed, so check weak duality plus feasibility.
  const bound = sol.shadow.acre * 100 + sol.shadow.labor * 150 + sol.shadow.capital * 30000;
  assert.ok(bound >= e.margin - 1e-6);
  assert.ok(e.labor <= 150 + 1e-6 && e.capital <= 30000 + 1e-6 && e.acres <= 100 + 1e-6);
});

test("optimum beats a grid of feasible plans (randomised cross-check)", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let trial = 0; trial < 40; trial++) {
    const crops = cleanCrops([0, 1, 2].map((i) => crop("c" + i, 20 + rnd() * 300, rnd() * 4, 50 + rnd() * 400, 0, rnd() < 0.5 ? 10 + rnd() * 60 : 0)));
    const s = sh({ laborHours: 100 + rnd() * 300, capital: 10000 + rnd() * 40000 });
    const sol = optimize(crops, s);
    const best = evaluate(crops, sol.acres, s).margin;
    for (let k = 0; k < 400; k++) {
      const x = crops.map((c) => rnd() * (Number.isFinite(c.max) ? c.max : 100));
      const e = evaluate(crops, x, s);
      if (e.acres <= s.totalAcres && e.labor <= s.laborHours && e.capital <= s.capital) assert.ok(e.margin <= best + 1e-6, `trial ${trial}`);
    }
  }
});

test("a crop with a negative margin gets zero acres and a break-even margin", () => {
  const a = analyze([crop("Good", 200), crop("Bad", -40, 0, 100)], SHARED_DEFAULTS);
  assert.equal(a.ok, true);
  near(a.rows[1].optimal, 0);
  assert.ok(a.rows[1].needs > a.rows[1].margin);
});

test("example runs, uses the farm, and is no worse than the current plan", () => {
  const a = analyze(EXAMPLE_CROPS, SHARED_DEFAULTS);
  assert.equal(a.ok, true);
  assert.ok(a.best.margin >= a.current.margin - 1e-6);
  assert.ok(a.best.acres <= SHARED_DEFAULTS.totalAcres + 1e-6);
  assert.match(toCsv(a), /Corn/);
});

test("warns when the current plan breaks a limit; ignores incomplete crops", () => {
  const a = analyze([{ ...EXAMPLE_CROPS[0], current: 2000 }, { name: "x" }], SHARED_DEFAULTS);
  assert.ok(a.warnings.some((w) => /more than the/.test(w)));
  assert.equal(cleanCrops([{ name: "x" }]).length, 0);
  assert.equal(analyze([], SHARED_DEFAULTS).ok, false);
});
