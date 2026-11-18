import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, twoSample, summarize, chao, jackknife, readHistories, PAPERS, SAMPLE } from "./engine.mjs";

const close = (a, b, tol, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("Chao (1987), section 3.1: the cottontail data reproduce the paper's printed numbers", () => {
  // Edwards & Eberhardt (1967) penned 135 rabbits; 18 nights; f1..f7 as printed by Chao (1987).
  const g = analyze({ frequencies: [43, 16, 8, 6, 0, 2, 1], k: 18 }).groups[0];
  assert.equal(g.summary.r, 76);
  assert.equal(Math.round(g.chao.N), 134); // paper: N = 134
  close(g.chao.N - 1.959964 * g.chao.se, 87, 0.5, "normal lower"); // paper: (87, 181)
  close(g.chao.N + 1.959964 * g.chao.se, 181, 0.5, "normal upper");
  // Paper's log-transformed interval: (103, 202). We get 102.4 to 202.4;
  // the half-animal gap at the lower end is recorded in the README.
  close(g.chao.lower, 103, 1, "log lower");
  close(g.chao.upper, 202, 0.5, "log upper");
  assert.equal(g.models.M0.N, 96); // the paper quotes a Schnabel estimate of 96
  assert.deepEqual(Object.keys(g.models), ["M0"]);
});

test("two samples, worked by hand: Lincoln-Petersen, Chapman and Seber's variance", () => {
  const t = twoSample(60, 55, 22);
  assert.equal(t.lincoln, 150); // 60 * 55 / 22
  close(t.N, (61 * 56) / 23 - 1, 1e-12, "Chapman"); // 147.52...
  close(t.se ** 2, (61 * 56 * 38 * 33) / (23 * 23 * 24), 1e-9, "variance"); // 4,283,664 / 12,696
  assert.equal(t.r, 93);
  const g = analyze(SAMPLE).groups[0];
  assert.equal(g.models.Mt.N, 148);
  assert.equal(g.twoSample.N, t.N);
});

test("summaries count captures, first captures, recaptures and frequencies", () => {
  const s = summarize([[1, 0, 1], [0, 1, 1], [1, 1, 1], [0, 0, 1], [0, 0, 0]], [2, 1, 1, 3, 4]);
  assert.equal(s.r, 7);
  assert.deepEqual(s.n, [3, 2, 7]);
  assert.deepEqual(s.u, [3, 1, 3]);
  assert.deepEqual(s.m, [0, 1, 4]);
  assert.deepEqual(s.M, [0, 3, 4]);
  assert.deepEqual(s.f, [0, 3, 3, 1]);
  assert.equal(s.neverCaught, 4);
});

test("Chao and the jackknife follow their formulas", () => {
  const s = { r: 100, k: 5, f: [0, 40, 20, 10] };
  const c = chao(s);
  assert.equal(c.N, 100 + 1600 / 40);
  close(c.se ** 2, 20 * (2 ** 4 / 4 + 2 ** 3 + 2 ** 2 / 2), 1e-9, "var");
  assert.equal(c.corrected, 100 + (40 * 39) / (2 * 21));
  const j = jackknife(s);
  close(j.order1, 100 + 0.8 * 40, 1e-12);
  close(j.order2, 100 + (7 / 5) * 40 - (9 / 20) * 20, 1e-12);
  const none = chao({ r: 10, k: 3, f: [0, 10, 0, 0] });
  assert.equal(none.N, null);
  assert.match(none.note, /f2 = 0/);
});

test("everyone caught every time: the estimate is exactly the number seen", () => {
  const g = analyze({ histories: Array(30).fill("1111") }).groups[0];
  for (const m of ["M0", "Mt"]) {
    assert.equal(g.models[m].N, 30);
    assert.equal(g.models[m].lower, 30);
  }
});

test("no recaptures: no finite estimate, and the page says why", () => {
  const g = analyze({ histories: ["100", "010", "001", "100"] }).groups[0];
  assert.equal(g.models.M0.finite, false);
  assert.equal(g.models.Mt.finite, false);
  assert.equal(g.chao.N, null);
  assert.ok(g.warnings.some((w) => /recaptures say nothing about how many were missed/.test(w)));
  // Mb is the removal method here: 2, 1, 1 new animals is a falling catch.
  assert.equal(g.best, "Mb");
  assert.equal(g.models.Mb.upper, null);
});

test("occasion order does not change M0, Mt or Chao", () => {
  const hs = ["1100", "1010", "0110", "0001", "1000", "0100", "1111", "0011", "1001", "0010", "0101", "1000"];
  const a = analyze({ histories: hs }).groups[0];
  const b = analyze({ histories: hs.map((h) => h.split("").reverse().join("")) }).groups[0];
  for (const m of ["M0", "Mt"]) {
    assert.equal(a.models[m].N, b.models[m].N, m);
    close(a.models[m].upper, b.models[m].upper, 1e-6, m);
  }
  assert.equal(a.chao.N, b.chao.N);
});

test("a frequency column is the same as repeating the rows", () => {
  const long = analyze({ text: "ch\n110\n110\n110\n101\n011\n100\n100\n010\n001\n001\n" }).groups[0];
  const short = analyze({ text: "ch,freq\n110,3\n101,1\n011,1\n100,2\n010,1\n001,2\n" }).groups[0];
  for (const m of ["M0", "Mt", "Mb"]) assert.deepEqual(long.models[m], short.models[m], m);
});

test("groups are estimated separately, and blank occasions belong to other groups", () => {
  const csv = "year,id,o1,o2,o3\n2020,a,1,1,\n2020,b,1,0,\n2020,c,0,1,\n2021,a,1,0,1\n2021,d,0,1,1\n2021,e,1,0,0\n";
  const r = analyze({ text: csv, group: "year" });
  assert.deepEqual(r.groups.map((g) => [g.group, g.k, g.summary.r]), [["2020", 2, 3], ["2021", 3, 3]]);
  const alone = analyze({ text: "id,o1,o2\na,1,1\nb,1,0\nc,0,1\n" }).groups[0];
  assert.deepEqual(r.groups[0].models.Mt, alone.models.Mt);
  assert.throws(() => analyze({ text: "year,o1,o2\n2020,1,\n2020,1,1\n", group: "year" }), /blank while other rows of 2020 have it/);
});

test("the reader finds occasion columns and skips ids and labels", () => {
  const r = readHistories("animal id,sex,night1,night2,night3\n300,M,1,0,1\n425,F,0,1,1\n");
  assert.deepEqual(r.groups[0].occasions, ["night1", "night2", "night3"]);
  assert.throws(() => analyze({ text: "id,a\n1,1\n2,0\n" }), /at least two capture occasions/);
  assert.throws(() => analyze({ n1: 10, n2: 5, m: 7 }), /cannot exceed/);
  assert.throws(() => analyze({ histories: ["102"] }), /only 0s and 1s/);
  assert.throws(() => analyze({}), /Give capture histories/);
});

test("the Lily Pond example: numbers the page and README quote", () => {
  const text = readFileSync(new URL("./data/lily-pond-chorus-frogs.csv", import.meta.url), "utf8");
  const r = analyze({ text, group: "year" });
  assert.equal(r.groups.length, 29);
  const y = Object.fromEntries(r.groups.map((g) => [g.group, g]));
  const R = Math.round;
  // 2010: the best-recaptured year
  assert.equal(y["2010"].summary.r, 270);
  assert.equal(y["2010"].best, "Mt");
  assert.deepEqual([y["2010"].models.Mt.N, R(y["2010"].models.Mt.lower), R(y["2010"].models.Mt.upper)], [539, 455, 656]);
  // 1999: Mb and Mt disagree almost fourfold
  assert.equal(y["1999"].summary.r, 120);
  assert.equal(y["1999"].best, "Mb");
  assert.equal(y["1999"].models.Mb.N, 135);
  assert.equal(y["1999"].models.Mt.N, 493);
  close(y["1999"].models.Mb.weight, 0.95, 0.005, "Mb weight");
  // 2007: one recapture among 88 frogs
  assert.equal(y["2007"].summary.r - y["2007"].summary.f[1], 1);
  assert.deepEqual([y["2007"].models.Mt.N, R(y["2007"].models.Mt.lower), R(y["2007"].models.Mt.upper / 100) * 100], [1940, 474, 33300]);
});

test("every paper carries what was used from it", () => {
  assert.ok(PAPERS.length >= 6);
  for (const p of PAPERS) {
    assert.ok(p.key && p.cite && p.used, p.key);
    assert.match(p.cite, /\(\d{4}\)/);
  }
});
