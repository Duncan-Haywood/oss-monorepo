import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, matrixProfile, topMotifs, topDiscords, exclusionZone, parseCsv, seriesFromCsv, suggestWindow,
  detrendLinear, exampleSeries, exampleCsv, PAPERS, DEFAULTS, CONVENTIONS,
} from "./engine.mjs";

// Seeded PRNG (mulberry32) and Box-Muller normals, so every run tests the same series.
function rng(seed) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(u() || 1e-300)) * Math.cos(2 * Math.PI * u());
  return { u, normal };
}

// Independent brute force: z-normalize every window explicitly (two-pass mean
// and population std; a window of identical values becomes all zeros), then
// take the plain Euclidean distance to every non-trivial window. O(n^2 m).
function bruteForce(x, m) {
  const l = x.length - m + 1;
  const zone = Math.ceil(m / 4);
  const Z = [];
  for (let i = 0; i < l; i++) {
    const w = x.slice(i, i + m);
    const flat = w.every((v) => v === w[0]);
    const mu = w.reduce((s, v) => s + v, 0) / m;
    const sd = Math.sqrt(w.reduce((s, v) => s + (v - mu) ** 2, 0) / m);
    Z.push(flat ? new Array(m).fill(0) : w.map((v) => (v - mu) / sd));
  }
  const P = new Array(l).fill(Infinity);
  const I = new Array(l).fill(-1);
  const D = (i, j) => Math.sqrt(Z[i].reduce((s, v, k) => s + (v - Z[j][k]) ** 2, 0));
  for (let i = 0; i < l; i++) {
    for (let j = 0; j < l; j++) {
      if (Math.abs(i - j) <= zone) continue;
      const d = D(i, j);
      if (d < P[i]) { P[i] = d; I[i] = j; }
    }
  }
  return { P, I, D };
}

function assertProfilesAgree(x, m, mp, ref, label, tol = 1e-6) {
  const { P, I } = ref;
  assert.equal(mp.profile.length, P.length, `${label}: length`);
  let worst = 0;
  for (let i = 0; i < P.length; i++) {
    const diff = Math.abs(mp.profile[i] - P[i]);
    worst = Math.max(worst, diff);
    assert.ok(diff < tol, `${label}: P[${i}] ${mp.profile[i]} vs ${P[i]}`);
    if (mp.index[i] !== I[i]) {
      // A tie: the engine's neighbour must be just as close as the reference's.
      const zone = Math.ceil(m / 4);
      assert.ok(Math.abs(mp.index[i] - i) > zone, `${label}: index ${i} is a trivial match`);
      if (ref.D) assert.ok(Math.abs(ref.D(i, mp.index[i]) - P[i]) < tol, `${label}: I[${i}] ${mp.index[i]} vs ${I[i]} is not a tie`);
      else {
        // Without the reference's distance function, check the tie with our own brute force.
        const bf = bruteForce(x, m);
        assert.ok(Math.abs(bf.D(i, mp.index[i]) - P[i]) < tol, `${label}: I[${i}] ${mp.index[i]} vs ${I[i]} is not a tie`);
      }
    }
  }
  return worst;
}

test("STOMP equals brute-force z-normalized distances on seeded random series", () => {
  const cases = [
    { seed: 1, n: 200, m: 8, kind: "noise" },
    { seed: 2, n: 300, m: 25, kind: "walk" },
    { seed: 3, n: 150, m: 3, kind: "noise" },
    { seed: 4, n: 256, m: 50, kind: "sine+noise" },
    { seed: 5, n: 120, m: 7, kind: "offset" },
  ];
  for (const c of cases) {
    const r = rng(c.seed);
    let x = [];
    let s = 0;
    for (let i = 0; i < c.n; i++) {
      if (c.kind === "walk") { s += r.normal(); x.push(s); }
      else if (c.kind === "sine+noise") x.push(Math.sin(i / 7) + 0.3 * r.normal());
      else if (c.kind === "offset") x.push(1e4 + 0.01 * r.normal()); // large level, tiny spread: a precision test
      else x.push(r.normal());
    }
    const mp = matrixProfile(x, c.m);
    const worst = assertProfilesAgree(x, c.m, mp, bruteForce(x, c.m), `seed ${c.seed}`);
    assert.ok(worst < 1e-6, `seed ${c.seed}: max abs diff ${worst}`);
  }
});

test("matches STUMPY's matrix profile on stored reference series (CO2, random walk, flat segments)", () => {
  const ref = JSON.parse(readFileSync(new URL("./fixtures/stumpy-reference.json", import.meta.url), "utf8"));
  assert.match(ref.provenance, /STUMPY 1\.14\.1/);
  assert.equal(ref.cases.length, 3);
  for (const c of ref.cases) {
    const mp = matrixProfile(c.values, c.m);
    const worst = assertProfilesAgree(c.values, c.m, mp, { P: c.profile, I: c.index }, c.name);
    assert.ok(worst < 1e-6, `${c.name}: max abs diff ${worst}`);
  }
});

test("the bundled CO2 example is the NOAA file's average column", () => {
  const ref = JSON.parse(readFileSync(new URL("./fixtures/stumpy-reference.json", import.meta.url), "utf8"));
  const ex = exampleSeries();
  assert.deepEqual(ex.values, ref.cases[0].values);
  assert.equal(ex.values.length, 823);
  assert.equal(ex.labels[0], "1958-03");
  const raw = readFileSync(new URL("./data/co2_mm_mlo.csv", import.meta.url), "utf8");
  const parsed = seriesFromCsv(raw, "average");
  assert.deepEqual(parsed.values, ex.values);
  assert.equal(parsed.column, "average");
  assert.match(ex.source, /Xin Lan/);
  assert.match(ex.source, /Ralph Keeling/);
});

test("a planted motif is found as the top motif at the planted positions", () => {
  const r = rng(42);
  const n = 1000, m = 50;
  const x = Array.from({ length: n }, () => r.normal());
  const shape = Array.from({ length: m }, (_, k) => 4 * Math.sin((k / m) * 3 * Math.PI) * Math.exp(-k / 40));
  for (const at of [180, 690]) for (let k = 0; k < m; k++) x[at + k] = shape[k] + 0.05 * r.normal();
  const res = analyze({ values: x, window: m, top: 3 });
  assert.equal(res.error, undefined);
  assert.deepEqual([res.motifs[0].a, res.motifs[0].b], [180, 690]);
  assert.ok(res.motifs[0].correlation > 0.99);
});

test("a planted anomaly is the top discord", () => {
  const r = rng(7);
  const n = 1200, m = 40;
  const x = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / m) + 0.05 * r.normal());
  // Replace one cycle with a flattened, inverted half-wave: an event unlike any other cycle.
  for (let k = 0; k < m; k++) x[640 + k] = k < m / 2 ? -0.3 * Math.sin((2 * Math.PI * k) / m) : 0.1 * r.normal();
  const res = analyze({ values: x, window: m, top: 3 });
  const d = res.discords[0];
  assert.ok(d.index > 640 - m && d.index < 640 + m, `top discord at ${d.index}`);
  // and it is much farther from its neighbour than an ordinary cycle
  assert.ok(d.distance > 3 * res.profileStats.median);
});

test("exclusion zone: no subsequence is matched within ceil(m/4) of itself", () => {
  for (const m of [3, 4, 5, 12, 31]) {
    assert.equal(exclusionZone(m), Math.ceil(m / 4));
    const r = rng(m);
    // A smooth series, where trivial (shifted-self) matches would otherwise win.
    let s = 0;
    const x = Array.from({ length: 300 }, () => (s += r.normal()));
    const mp = matrixProfile(x, m);
    for (let i = 0; i < mp.index.length; i++) assert.ok(Math.abs(mp.index[i] - i) > Math.ceil(m / 4), `m=${m} i=${i} I=${mp.index[i]}`);
    // Without an exclusion zone, the neighbour of most windows on a random walk is the next window.
  }
});

test("listed motifs and discords do not overlap each other", () => {
  const r = rng(11);
  let s = 0;
  const x = Array.from({ length: 800 }, () => (s += r.normal()));
  const res = analyze({ values: x, window: 30, top: 5 });
  const motifStarts = res.motifs.flatMap((t) => [t.a, t.b]);
  for (let p = 0; p < motifStarts.length; p++) for (let q = p + 1; q < motifStarts.length; q++) {
    if ((p >> 1) === (q >> 1)) continue; // the two members of one motif may be closer than m
    assert.ok(Math.abs(motifStarts[p] - motifStarts[q]) >= 30);
  }
  for (let p = 0; p < res.discords.length; p++) for (let q = p + 1; q < res.discords.length; q++) assert.ok(Math.abs(res.discords[p].index - res.discords[q].index) >= 30);
  for (const t of res.motifs) assert.ok(t.b - t.a > Math.ceil(30 / 4));
});

test("constant segments never produce NaN and follow the stated convention", () => {
  const x = [...Array(50).fill(3), ...Array.from({ length: 60 }, (_, i) => Math.sin(i / 3)), ...Array(40).fill(3), ...Array(30).fill(-2)];
  const m = 10;
  const mp = matrixProfile(x, m);
  for (const d of mp.profile) assert.ok(Number.isFinite(d), "finite");
  // Flat windows match other flat windows at distance 0.
  assert.equal(mp.profile[0], 0);
  assert.equal(mp.profile[x.length - m], 0);
  assertProfilesAgree(x, m, mp, bruteForce(x, m), "flat");
  // An all-constant series is valid input: every distance is 0.
  const allFlat = analyze({ values: Array(40).fill(5), window: 5 });
  assert.equal(allFlat.error, undefined);
  assert.equal(allFlat.profileStats.max, 0);
  assert.ok(allFlat.constantWindows > 0);
  assert.doesNotMatch(JSON.stringify(allFlat), /NaN/);
  // One flat window against a non-flat one is at sqrt(m).
  const one = matrixProfile([0, 0, 0, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3, 9], 4);
  assert.ok(Number.isFinite(one.profile[0]));
  assert.ok(Math.abs(one.profile[0] - 2) < 1e-12, "flat vs varying is sqrt(m) = 2");
  assert.match(CONVENTIONS.constant, /sqrt\(m\)/);
});

test("CSV parsing: headers, delimiters, quotes, comments, BOM, missing values", () => {
  assert.deepEqual(seriesFromCsv("1\n2\n3.5\n-4e-1\n").values, [1, 2, 3.5, -0.4]);
  const tv = seriesFromCsv("time,value\r\n2020-01,1\r\n2020-02,2\r\n2020-03,3\r\n");
  assert.deepEqual(tv.values, [1, 2, 3]);
  assert.equal(tv.column, "value");
  assert.deepEqual(tv.labels, ["2020-01", "2020-02", "2020-03"]);
  assert.deepEqual(seriesFromCsv("﻿date;temp;rain\n1;10;0\n2;11;5\n", "rain").values, [0, 5]);
  assert.deepEqual(seriesFromCsv("a\tb\n1\t9\n2\t8\n", "a").values, [1, 2]);
  assert.deepEqual(seriesFromCsv("a,b\n1,9\n2,8\n", "2").values, [9, 8]);
  assert.deepEqual(seriesFromCsv("# comment\n\nname,\"value, ppm\"\n\"x, 1\",5\n\"y\",6\n", "value, ppm").values, [5, 6]);
  const gaps = seriesFromCsv("t,v\n0,\n1,1\n2,NA\n3,\n4,4\n5,\n");
  assert.deepEqual(gaps.values, [1, 2, 3, 4]);
  assert.equal(gaps.filled, 2);
  assert.equal(gaps.dropped, 2);
  assert.match(seriesFromCsv("t,v\n1,2\n", "nope").error, /No column "nope"/);
  assert.match(seriesFromCsv("t,v\n1,\n2,x\n").error, /no numbers/);
  assert.match(parseCsv("   \n# only a comment\n").error, /No data/);
  // Default column: skip time-like headers and non-numeric columns.
  const noaa = readFileSync(new URL("./data/co2_mm_mlo.csv", import.meta.url), "utf8");
  assert.equal(seriesFromCsv(noaa).column, "average");
  assert.equal(seriesFromCsv("date,station,temp\n2020-01-01,A,3\n2020-01-02,A,4\n").column, "temp");
  assert.equal(seriesFromCsv("t,value\n1,5\n2,6\n").column, "value");
  assert.equal(seriesFromCsv("x,y\n1,5\n2,6\n").column, "y");
  assert.equal(seriesFromCsv("year,month\n2020,1\n2020,2\n").column, "month");
  const p = parseCsv("1,2\n3,4\n");
  assert.equal(p.header, false);
  assert.deepEqual(p.columns, ["column 1", "column 2"]);
});

test("analyze validates input and reports errors in words", () => {
  assert.match(analyze({ values: [1, 2, 3] }).error, /at least 6/);
  assert.match(analyze({ values: Array.from({ length: 40 }, (_, i) => i % 7), window: 25 }).error, /too long/);
  assert.match(analyze({ values: Array.from({ length: 40 }, (_, i) => i % 7), window: 2 }).error, /at least 3/);
  assert.match(analyze({ values: [1, 2, NaN, 4, 5, 6, 7] }).error, /finite/);
  assert.match(analyze({ values: new Array(200001).fill(0) }).error, /O\(n\^2\)/);
  const big = analyze({ values: Array.from({ length: 20001 }, (_, i) => Math.sin(i / 9) + (i % 13) / 50), window: 20, top: 1 });
  assert.ok(big.warnings.some((w) => /n squared/.test(w)));
});

test("analyze accepts CSV text as the first argument (the --stdin path)", () => {
  const csv = "t,v\n" + Array.from({ length: 60 }, (_, i) => `${i},${Math.sin(i / 2) + (i === 40 ? 3 : 0)}`).join("\n");
  const res = analyze(csv, { window: 6, top: 2 });
  assert.equal(res.n, 60);
  assert.equal(res.window, 6);
  assert.equal(res.motifs.length, 2);
  assert.equal(typeof res.summary, "string");
});

test("window suggestion finds the period of a cycle, and the 12-month cycle in CO2", () => {
  const r = rng(3);
  const x = Array.from({ length: 1000 }, (_, i) => 0.01 * i + Math.sin((2 * Math.PI * i) / 37) + 0.2 * r.normal());
  const s = suggestWindow(x);
  assert.ok(Math.abs(s.window - 37) <= 1, `suggested ${s.window}`);
  assert.equal(suggestWindow(exampleSeries().values).window, 12);
  const noise = Array.from({ length: 500 }, () => r.normal());
  const f = suggestWindow(noise);
  assert.ok(f.window >= 8 && f.window <= 100);
});

test("detrending removes a straight line exactly", () => {
  const d = detrendLinear(Array.from({ length: 20 }, (_, i) => 3 + 2 * i));
  for (const v of d) assert.ok(Math.abs(v) < 1e-9);
  const res = analyze({ values: Array.from({ length: 200 }, (_, i) => i + Math.sin(i)), window: 10, detrend: true });
  assert.equal(res.detrended, true);
});

test("CO2 example result (the numbers recorded in README Verification)", () => {
  const res = analyze({});
  assert.equal(res.n, 823);
  assert.equal(res.window, 12);
  assert.equal(res.exclusionZone, 3);
  assert.deepEqual([res.motifs[0].a, res.motifs[0].b], [678, 798]);
  assert.equal(res.motifs[0].aLabel, "2014-09");
  assert.equal(res.motifs[0].bLabel, "2024-09");
  assert.ok(Math.abs(res.motifs[0].distance - 0.139436) < 1e-6);
  assert.equal(res.discords[0].index, 790);
  assert.equal(res.discords[0].label, "2024-01");
  assert.ok(Math.abs(res.discords[0].distance - 0.747437) < 1e-6);
  assert.match(res.summary, /2014-09/);
  assert.equal(res.profile, undefined);
  const full = analyze({ includeProfile: true });
  assert.equal(full.profile.length, 812);
  assert.equal(full.profileIndex.length, 812);
  assert.ok(exampleCsv().startsWith("month,co2_ppm\n1958-03,315.71\n"));
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(full)));
});

test("PAPERS and DEFAULTS are complete", () => {
  assert.equal(PAPERS.length, 2);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "doi", "implemented", "deviations"]) assert.ok(p[k], k);
  assert.deepEqual(PAPERS.map((p) => p.doi), ["10.1109/ICDM.2016.0179", "10.1109/ICDM.2016.0085"]);
  assert.equal(DEFAULTS.top, 3);
  assert.equal(DEFAULTS.window, null);
  const mp = matrixProfile([1, 3, 2, 5, 4, 6, 1, 3, 2, 5, 4, 6], 4);
  assert.deepEqual(topMotifs(mp.profile, mp.index, 4, 1)[0], { a: 0, b: 6, distance: mp.profile[0] });
  assert.equal(topDiscords(mp.profile, mp.index, 4, 1).length, 1);
});
