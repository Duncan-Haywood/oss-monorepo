import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGenes, parseAnimal, parseAnimals, parsePrices, parseTarget, parseMorphName, cross, evaluate, solve, validateSpec,
  verifyPlan, planCsv, buildSpec, money2, fmt, pct,
  SAMPLE_GENES, SAMPLE_FEMALES, SAMPLE_MALES, SAMPLE_PRICES, SAMPLE_ECON,
} from "./calc.mjs";

const G = parseGenes(SAMPLE_GENES);
const animal = (text) => ({ name: "x", state: parseAnimal(text, G.lookup).state });
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const byLabel = (x) => Object.fromEntries(x.outcomes.map((o) => [[...o.vis, ...o.het.map((h) => h)].join(" ") || "Normal", o.p]));

test("gene table parses, with aliases, groups and bad lines", () => {
  assert.deepEqual(G.errors, []);
  assert.equal(G.genes.length, 17);
  assert.equal(G.lookup.get("pied").name, "Piebald");
  assert.equal(G.lookup.get("hypo").name, "Ghost");
  assert.equal(G.lookup.get("mojave").group, "lesser");
  const bad = parseGenes("Foo | X\nSuper Bar | R\n | R\nBaz | R\nbaz | I\nQ,x | R");
  assert.equal(bad.genes.length, 1);
  assert.equal(bad.errors.length, 5);
});

test("animal traits: visual, het, percentage het, super, and the errors", () => {
  const a = parseAnimal("Pastel, het Albino, 66% het Clown, Super Enchi, Spider, Normal", G.lookup);
  assert.deepEqual(a.errors, []);
  assert.equal(a.state.get("Pastel").t, 0.5);
  assert.equal(a.state.get("Albino").t, 0.5);
  near(a.state.get("Clown").t, 0.33);
  assert.equal(a.state.get("Enchi").t, 1);
  assert.equal(a.state.get("Spider").t, 0.5);
  const bad = parseAnimal("het Pastel, Super Albino, Super Spider, poss het Clown, 0% het Clown, Nonesuch, Pastel, Pastel, 120% het Piebald", G.lookup);
  assert.equal(bad.errors.length, 8);
  assert.match(bad.errors[0], /only recessive genes can be het/);
  assert.match(bad.errors[2], /does not hatch/);
  assert.match(bad.errors[3], /give the chance/);
});

test("recessive: het x het is 25 / 50 / 25; visual x normal is all het", () => {
  const x = cross(animal("het Albino"), animal("het Albino"), G.genes);
  const o = byLabel(x);
  near(o["Albino"], 0.25); near(o["het Albino"], 0.5); near(o["Normal"], 0.25);
  const y = byLabel(cross(animal("Albino"), animal(""), G.genes));
  assert.deepEqual(Object.keys(y), ["het Albino"]);
  near(y["het Albino"], 1);
  const z = byLabel(cross(animal("Albino"), animal("het Albino"), G.genes));
  near(z["Albino"], 0.5); near(z["het Albino"], 0.5);
});

test("incomplete dominant: pastel x pastel gives a super; a super x normal is all pastel", () => {
  const o = byLabel(cross(animal("Pastel"), animal("Pastel"), G.genes));
  near(o["Pastel"], 0.5); near(o["Super Pastel"], 0.25); near(o["Normal"], 0.25);
  const p = byLabel(cross(animal("Super Pastel"), animal(""), G.genes));
  assert.deepEqual(p, { Pastel: 1 });
});

test("lethal dominant: spider x spider loses a quarter of the eggs", () => {
  const x = cross(animal("Spider"), animal("Spider"), G.genes);
  near(x.dead, 0.25);
  near(x.outcomes.reduce((a, o) => a + o.p, 0), 0.75);
  assert.deepEqual(byLabel(x), { Spider: 0.5, Normal: 0.25 });
});

test("dominant: both forms look the same", () => {
  const o = byLabel(cross(animal("Pinstripe"), animal("Pinstripe"), G.genes));
  near(o["Pinstripe"], 0.75); near(o["Normal"], 0.25);
});

test("possible het: a 66% het parent passes the gene to a third of eggs", () => {
  const o = byLabel(cross(animal("66% het Clown"), animal("Clown"), G.genes));
  near(o["Clown"], 0.33); near(o["het Clown"], 0.67);
});

test("allelic genes are refused instead of mis-modelled", () => {
  const x = cross(animal("Mojave"), animal("Butter"), G.genes);
  assert.match(x.error, /Mojave and Butter are allelic/);
  const y = cross(animal("Cinnamon"), animal("Black Pastel"), G.genes);
  assert.match(y.error, /allelic/);
  assert.ok(!cross(animal("Mojave"), animal("Cinnamon"), G.genes).error);
});

// An independent oracle: pick an allele for every gene from each parent
// explicitly, over all 2^k x 2^k gamete pairs, and name the result separately.
function oracle(m, d, genes) {
  const names = genes.map((g) => g.name);
  const kind = Object.fromEntries(genes.map((g) => [g.name, g.kind]));
  const tOf = (a, n) => a.state.get(n)?.t || 0;
  const out = new Map();
  let dead = 0;
  const k = names.length;
  for (let mm = 0; mm < 1 << k; mm++) for (let dd = 0; dd < 1 << k; dd++) {
    let p = 1;
    const vis = [], het = [];
    let lethal = false;
    names.forEach((n, i) => {
      const am = (mm >> i) & 1, ad = (dd >> i) & 1;
      p *= (am ? tOf(m, n) : 1 - tOf(m, n)) * (ad ? tOf(d, n) : 1 - tOf(d, n));
      const c = am + ad;
      if (!c) return;
      if (kind[n] === "R") (c === 2 ? vis : het).push(c === 2 ? n : `het ${n}`);
      else if (kind[n] === "I") vis.push(c === 2 ? `Super ${n}` : n);
      else if (kind[n] === "D") vis.push(n);
      else if (c === 2) lethal = true; else vis.push(n);
    });
    if (p <= 0) continue;
    if (lethal) { dead += p; continue; }
    const key = [...vis.sort(), ...het.sort()].join(" ") || "Normal";
    out.set(key, (out.get(key) || 0) + p);
  }
  return { out, dead };
}

test("cross agrees with an explicit gamete-pair oracle on every sample pairing", () => {
  const f = parseAnimals(SAMPLE_FEMALES, G.lookup, "Female").animals;
  const m = parseAnimals(SAMPLE_MALES, G.lookup, "Male").animals;
  let checked = 0;
  for (const a of f) for (const b of m) {
    const x = cross(a, b, G.genes);
    assert.ok(!x.error, `${a.name} x ${b.name}: ${x.error}`);
    const inv = x.involved;
    const o = oracle(a, b, inv);
    near(x.dead, o.dead);
    const got = new Map(Object.entries(byLabel(x)).map(([k2, v]) => [k2.split(" ").sort().join(" "), v]));
    const want = new Map([...o.out].map(([k2, v]) => [k2.split(" ").sort().join(" "), v]));
    assert.deepEqual([...got.keys()].sort(), [...want.keys()].sort(), `${a.name} x ${b.name}`);
    for (const [k2, v] of want) near(got.get(k2), v);
    checked++;
  }
  assert.equal(checked, 9);
});

test("random genotypes: probabilities always sum to one with the dead share", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pool = ["Pastel", "Super Pastel", "Albino", "het Albino", "Clown", "50% het Clown", "Spider", "Pinstripe", "Enchi", "Super Enchi", "het Piebald", "Fire", "Mojave", "Cinnamon", "Ghost"];
  for (let i = 0; i < 300; i++) {
    const pick = () => [...new Set(pool.filter(() => rnd() < 0.3))].filter((t) => !(t.includes("Pastel") && t.includes("Super")));
    const mk = () => { const toks = pick(); const names = toks.map((t) => t.replace(/^(super|het|\d+% het) /i, "")); return names.length === new Set(names).size ? toks.join(", ") : ""; };
    const a = animal(mk()), b = animal(mk());
    const x = cross(a, b, G.genes);
    if (x.error) continue;
    near(x.outcomes.reduce((s, o) => s + o.p, 0) + x.dead, 1);
    for (const o of x.outcomes) assert.ok(o.p > 0 && o.p <= 1 + 1e-12);
  }
});

test("morph names and the price table", () => {
  assert.deepEqual(parseMorphName("Super Pastel Yellow Belly", G.lookup).labels, ["Super Pastel", "Yellow Belly"]);
  assert.deepEqual(parseMorphName("pied hypo", G.lookup).labels, ["Piebald", "Ghost"]);
  assert.match(parseMorphName("Super Albino", G.lookup).error, /cannot exist/);
  assert.match(parseMorphName("Pastel Pastel", G.lookup).error, /twice/);
  assert.match(parseMorphName("Pastel Zebra", G.lookup).error, /no gene called "Zebra"/);
  const p = parsePrices(SAMPLE_PRICES, G.lookup);
  assert.deepEqual(p.errors, []);
  assert.equal(p.prices.get("").price, 60);
  assert.equal(p.prices.get("Albino+Clown").price, 700);
  assert.equal(p.prices.get("Clown+Albino"), undefined);
  const dup = parsePrices("Clown Albino | 5\nAlbino Clown | 6\nPastel | x\nPastel |", G.lookup);
  assert.equal(dup.errors.length, 3);
});

test("target means carries at least: Clown needs two copies, het Clown one", () => {
  const t = parseTarget("Clown, het Albino, Super Pastel, Pastel", G.lookup);
  assert.deepEqual(t.errors, []);
  assert.equal(t.need.get("Clown"), 2);
  assert.equal(t.need.get("Albino"), 1);
  assert.equal(t.need.get("Pastel"), 2);
  assert.match(parseTarget("50% het Clown", G.lookup).errors[0], /cannot be a percentage/);
});

const INP = { genes: SAMPLE_GENES, females: SAMPLE_FEMALES, males: SAMPLE_MALES, prices: SAMPLE_PRICES, target: "", defaultPrice: 75, ...SAMPLE_ECON };

test("the sample builds a clean spec and every pairing is ranked and verified", () => {
  const { spec, errors } = buildSpec(INP);
  assert.deepEqual(errors, []);
  assert.deepEqual(validateSpec(spec), []);
  const res = solve(spec);
  assert.equal(res.ranked.length + res.refused.length, 9);
  assert.equal(res.refused.length, 0);
  assert.deepEqual(verifyPlan(spec, res), []);
  for (let i = 1; i < res.ranked.length; i++) assert.ok(res.ranked[i - 1].profit >= res.ranked[i].profit);
});

test("economics: one hand-checked pairing", () => {
  // Albino x het Albino: half the eggs are visual Albino ($200), half het (no listed price -> default $75).
  const inp = { ...INP, females: "F | Albino", males: "M | het Albino", prices: "Albino | 200", defaultPrice: 75, eggs: 8, hatch: 100, raise: 20, fee: 10, overhead: 50, target: "Albino" };
  const { spec, errors } = buildSpec(inp);
  assert.deepEqual(errors, []);
  const p = evaluate(spec.females[0], spec.males[0], spec);
  near(p.hatchlings, 8);
  near(p.revenue, 4 * 200 * 0.9 + 4 * 75 * 0.9);
  near(p.cost, 8 * 20 + 50);
  near(p.profit, 720 + 270 - 210);
  near(p.unlisted, 0.5);
  near(p.targetChance, 1 - Math.pow(0.5, 8));
});

test("hatch rate scales hatchlings, and a lethal pairing loses its dead share", () => {
  const inp = { ...INP, females: "F | Spider", males: "M | Spider", prices: "Spider | 100", eggs: 10, hatch: 80, raise: 0, fee: 0, overhead: 0 };
  const { spec } = buildSpec(inp);
  const p = evaluate(spec.females[0], spec.males[0], spec);
  near(p.hatchlings, 10 * 0.8 * 0.75);
  near(p.dead, 0.25);
  assert.deepEqual(verifyPlan(spec, solve(spec)), []);
});

test("rank by target chance puts the best shot at the target first", () => {
  const { spec } = buildSpec({ ...INP, target: "Albino, Clown", rankBy: "target" });
  const res = solve(spec);
  for (let i = 1; i < res.ranked.length; i++) assert.ok(res.ranked[i - 1].targetChance >= res.ranked[i].targetChance - 1e-12);
  assert.deepEqual(verifyPlan(spec, res), []);
});

test("an allelic pairing is refused, named, and kept out of the ranking", () => {
  const { spec } = buildSpec({ ...INP, females: "F | Mojave", males: "M | Butter\nN | Pastel" });
  const res = solve(spec);
  assert.equal(res.refused.length, 1);
  assert.match(res.refused[0].error, /allelic/);
  assert.equal(res.ranked.length, 1);
});

test("validation catches bad numbers and empty lists", () => {
  const { spec } = buildSpec({ ...INP, eggs: 0, hatch: 120, raise: -1, fee: 99, overhead: "x", females: "", males: "" });
  const e = validateSpec(spec);
  assert.ok(e.length >= 7, e.join(" | "));
  assert.ok(e.some((m) => /Add at least one female/.test(m)));
  assert.ok(validateSpec({ ...spec, eggs: 2.5 }).some((m) => /whole number/.test(m)));
});

test("parseAnimals rejects a repeated name and keeps going", () => {
  const r = parseAnimals("A | Pastel\na | Clown\nB | Zebra\nC", G.lookup, "Female");
  assert.equal(r.animals.length, 3);
  assert.equal(r.errors.length, 2);
  assert.equal(r.animals[2].traits, "Normal");
});

test("csv has a header, one row per outcome and a total per pairing", () => {
  const { spec } = buildSpec(INP);
  const res = solve(spec);
  const csv = planCsv(spec, res);
  const lines = csv.trim().split("\n");
  const rows = res.ranked.reduce((a, p) => a + p.rows.length + 1, 0);
  assert.equal(lines.length, rows + 1);
  assert.match(lines[0], /^Female,Male,Offspring/);
  assert.match(csv, /CLUTCH TOTAL/);
});

test("formatters", () => {
  assert.equal(money2(1234.5), "$1,234.50");
  assert.equal(money2(-3), "-$3.00");
  assert.equal(fmt(1234.567, 1), "1,234.6");
  assert.equal(pct(0.25), "25%");
  assert.equal(pct(0.3333), "33.3%");
});
