import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, report, moran, geary, buildWeights, transformWeights, weightSums, distanceMatrix, haversine, parseNeighbors, detectColumns, parseCsv, fdrThreshold, normsf, rng, minThreshold, PAPERS, DEFAULTS } from "./engine.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const US = read("./data/us-state-income.csv"), NB = read("./data/us-state-neighbors.csv");
const grid = (f, side = 6) => `id,x,y,v\n${Array.from({ length: side * side }, (_, i) => `p${i},${i % side},${Math.floor(i / side)},${f(i % side, Math.floor(i / side))}`).join("\n")}`;

test("PAPERS and DEFAULTS are exported for agents", () => {
  assert.ok(PAPERS.length >= 8);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
  assert.equal(DEFAULTS.permutations, 999);
});

test("the 2009 example: the numbers the page quotes", () => {
  const r = analyze({ text: US, neighbors: NB, variables: "pci2009" }).results[0];
  assert.equal(r.n, 48);
  assert.equal(r.weights.links, 214);
  assert.equal(r.moran.I.toFixed(3), "0.429");
  assert.equal(r.moran.EI.toFixed(3), "-0.021");
  assert.equal(r.moran.z_rand.toFixed(2), "4.65");
  assert.equal(r.generalG.z_norm.toFixed(2), "-0.89");
  assert.equal(r.generalG.p_norm.toFixed(3), "0.374");
  assert.deepEqual(r.local.clusters["high-high"], ["Connecticut", "Delaware", "Massachusetts", "New York", "Rhode Island"]);
  assert.ok(r.local.clusters["low-low"].includes("Tennessee"));
  assert.deepEqual(r.local.clusters["low-high"], ["Vermont"]);
  const f = analyze({ text: US, neighbors: NB, variables: "pci2009", fdr: true });
  assert.deepEqual(f.results[0].local.clusters["high-high"], ["New York", "Rhode Island"]);
  assert.equal(f.results[0].local.permutations, 1920);
  assert.match(f.warnings[0], /1,920 permutations/);
});

test("all 81 years: the trend the page describes", () => {
  const r = analyze({ text: US, neighbors: NB, bands: 0, local: false, permutations: 99 });
  assert.equal(r.trend.length, 81);
  const by = Object.fromEntries(r.trend.map((t) => [t.variable, t]));
  const max = r.trend.reduce((a, b) => (b.I > a.I ? b : a)), min = r.trend.reduce((a, b) => (b.I < a.I ? b : a));
  assert.equal(max.variable, "pci1934"); assert.equal(max.I.toFixed(3), "0.667");
  assert.equal(min.variable, "pci1981"); assert.equal(min.I.toFixed(3), "0.248");
  assert.ok(r.trend.every((t) => t.p <= 0.05), "significant every year (randomisation p)");
  assert.equal(by.pci2009.I.toFixed(3), "0.429");
});

test("a column gets the same permutation draws whatever else is in the table", () => {
  const a = analyze({ text: US, neighbors: NB, variables: "pci2009" }).results[0];
  const b = analyze({ text: US, neighbors: NB, variables: "pci1990,pci2009" }).results[1];
  assert.equal(a.moran.p_sim, b.moran.p_sim);
  assert.deepEqual(a.local.rows.map((x) => x.p_sim), b.local.rows.map((x) => x.p_sim));
});

test("a smooth gradient is clustered, a checkerboard dispersed, and C moves the other way", () => {
  const smooth = analyze({ text: grid((x, y) => x + y), weights: "knn", k: 4 }).results[0];
  assert.ok(smooth.moran.I > 0.5 && smooth.moran.p_sim <= 0.01);
  assert.ok(smooth.geary.C < 1);
  const checker = analyze({ text: grid((x, y) => (x + y) % 2), weights: "band", threshold: 1 }).results[0];
  assert.ok(Math.abs(checker.moran.I + 1) < 1e-12, `rook checkerboard has I = -1, got ${checker.moran.I}`);
  assert.ok(checker.geary.C > 1);
  assert.match(checker.summary, /dispersed/);
});

test("Moran's I is invariant to shifting and scaling the values", () => {
  const W = transformWeights(buildWeights({ kind: "knn", k: 3, D: distanceMatrix([0, 1, 2, 3, 5, 8, 9], [0, 1, 0, 2, 1, 0, 3], false) }), "r");
  const y = [3, 5, 4, 9, 8, 2, 7];
  const a = moran(y, W), b = moran(y.map((v) => 10 * v - 4), W);
  for (const k of ["I", "VI_norm", "VI_rand", "z_rand"]) assert.ok(Math.abs(a[k] - b[k]) < 1e-12, k);
  assert.ok(Math.abs(geary(y, W).C - geary(y.map((v) => 3 * v + 1), W).C) < 1e-12);
});

test("S1 and S2 handle asymmetric weights (k nearest neighbours)", () => {
  // three points on a line: 0-1 close, 2 far; knn1 gives 0->1, 1->0, 2->1
  const W = buildWeights({ kind: "knn", k: 1, D: distanceMatrix([0, 1, 5], [0, 0, 0], false) });
  const { s0, s1, s2 } = weightSums(W);
  assert.equal(s0, 3);
  assert.equal(s1, 0.5 * ((1 + 1) ** 2 * 2 + 1 + 1)); // (0,1),(1,0) symmetric; (2,1) and (1,2) one-sided
  assert.equal(s2, (1 + 1) ** 2 + (1 + 2) ** 2 + (1 + 0) ** 2);
});

test("haversine and the automatic distance band", () => {
  assert.ok(Math.abs(haversine(0, 0, 0, 1) - 111.195) < 0.01);
  assert.ok(Math.abs(haversine(-74.006, 40.7128, -0.1278, 51.5074) - 5570) < 10);
  const D = distanceMatrix([0, 1, 10], [0, 0, 0], false);
  assert.equal(minThreshold(D), 9);
  const W = buildWeights({ kind: "band", D });
  assert.ok(W.nbr.every((a) => a.length > 0));
});

test("column detection: lon/lat, x/y, ids and explicit names", () => {
  const { header, rows } = parseCsv(US);
  const c = detectColumns(header, rows);
  assert.equal(header[c.id], "state"); assert.equal(header[c.x], "lon"); assert.equal(c.geographic, true);
  assert.equal(c.variables.length, 81);
  const g = parseCsv("site;easting;northing;ppm\nA;1;2;3\nB;2;3;4\nC;3;1;5\nD;5;5;1\nE;0;4;2");
  const d = detectColumns(g.header, g.rows);
  assert.equal(d.geographic, false); assert.deepEqual(d.variables.map((j) => g.header[j]), ["ppm"]);
  assert.throws(() => detectColumns(g.header, g.rows, { variables: "nope" }), /No column named "nope"/);
});

test("neighbour lists: semicolon lists, pairs, unknown names and missing places", () => {
  const m = parseNeighbors("a,b;c\nb,a\nc,a\nc,d");
  assert.deepEqual([...m.get("c")], ["a", "d"]);
  const text = "id,v\na,1\nb,2\nc,3\nd,4\ne,10";
  const r = analyze({ text, neighbors: "a,b;zz\nb,a;c\nc,b;d\nd,c", permutations: 0 });
  assert.equal(r.options.weights, "list");
  assert.ok(r.warnings.some((w) => /not in the neighbour list/.test(w)));
  assert.ok(r.warnings.some((w) => /names 1 place\(s\) not in the table/.test(w)));
  assert.deepEqual(r.results[0].weights.islands, ["e"]);
  assert.match(r.results[0].summary, /no neighbours/);
});

test("errors a person can act on", () => {
  assert.throws(() => analyze({ text: "" }), /Paste a table/);
  assert.throws(() => analyze({ text: "id,v\na,1\nb,2\nc,3\nd,4\ne,5" }), /No coordinate columns/);
  assert.throws(() => analyze({ text: "id,lon,lat,v\na,1,95,1\nb,2,3,2\nc,3,4,3\nd,4,5,4\ne,5,6,5" }), /outside -90\.\.90/);
  assert.match(analyze({ text: grid(() => 1) }).results[0].error, /no variation/i);
  assert.throws(() => analyze({ text: "id,x,y,v\na,0,0,1\nb,0,0,2\nc,1,1,3\nd,2,2,4\ne,3,3,5", weights: "inverse" }), /same coordinates/);
  assert.equal(analyze({ text: grid((x) => x - 2.5), weights: "knn" }).results[0].generalG.G, null);
});

test("missing values drop only that column's rows", () => {
  const t = "id,x,y,a,b\n" + Array.from({ length: 12 }, (_, i) => `p${i},${i},${i % 3},${i},${i === 3 ? "" : i * 2}`).join("\n");
  const r = analyze({ text: t, permutations: 0 });
  assert.equal(r.results[0].n, 12);
  assert.equal(r.results[1].n, 11);
});

test("Benjamini-Hochberg threshold and the normal tail", () => {
  assert.equal(fdrThreshold([0.01, 0.02, 0.03, 0.5], 0.05), 0.03);
  assert.equal(fdrThreshold([0.2, 0.3], 0.05), 0);
  assert.ok(Math.abs(normsf(1.959963984540054) - 0.025) < 1e-12);
  assert.ok(Math.abs(normsf(-1) - 0.8413447460685429) < 1e-12);
});

test("seeded: the same seed gives the same answer, another seed may not", () => {
  const a = analyze({ text: US, neighbors: NB, variables: "pci1980", seed: 7 }).results[0];
  const b = analyze({ text: US, neighbors: NB, variables: "pci1980", seed: 7 }).results[0];
  assert.deepEqual(a.local.rows.map((x) => x.p_sim), b.local.rows.map((x) => x.p_sim));
  const r = rng(1); const v = [r(), r(), r()];
  assert.ok(v.every((x) => x >= 0 && x < 1) && new Set(v).size === 3);
});

test("the correlogram decays and the report prints every part", () => {
  const r = analyze({ text: US, variables: "pci2009", weights: "knn", k: 6 });
  const c = r.results[0].correlogram;
  assert.equal(c.length, 8);
  assert.ok(c[0].I > 0.5 && c[0].p < 0.01);
  assert.ok(c[3].I < 0);
  const text = report(r);
  for (const s of ["Moran's I", "Geary's C", "General G", "distance ring", "Connecticut"]) assert.ok(text.includes(s), s);
});
