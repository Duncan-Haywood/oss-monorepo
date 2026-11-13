import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normCdf, c4, factors, nelson, analyse, analyze, parseRows, capability, toCsv, suggestType, mulberry32, gauss, PAPERS } from "./engine.mjs";
import { EXAMPLE_TEXT } from "./example-data.mjs";

// Published chart factors (Montgomery, Introduction to Statistical Quality
// Control, Appendix VI; ASTM E2587), three decimals unless noted.
const TABLE = {
  2: { d2: 1.128, d3: 0.853, A2: 1.880, D3: 0, D4: 3.267, c4: 0.7979, B3: 0, B4: 3.267 },
  3: { d2: 1.693, d3: 0.888, A2: 1.023, D3: 0, c4: 0.8862, B4: 2.568 },
  4: { d2: 2.059, d3: 0.880, A2: 0.729, D3: 0, D4: 2.282, c4: 0.9213, B4: 2.266 },
  5: { d2: 2.326, d3: 0.864, A2: 0.577, D3: 0, c4: 0.9400, B3: 0, B4: 2.089 },
  6: { d2: 2.534, d3: 0.848, A2: 0.483, D3: 0, D4: 2.004, c4: 0.9515, B3: 0.030, B4: 1.970 },
  7: { d2: 2.704, d3: 0.833, A2: 0.419, D3: 0.076, D4: 1.924, c4: 0.9594, B3: 0.118, B4: 1.882 },
  8: { d2: 2.847, d3: 0.820, A2: 0.373, D3: 0.136, D4: 1.864, c4: 0.9650, B3: 0.185, B4: 1.815 },
  9: { d2: 2.970, d3: 0.808, A2: 0.337, D3: 0.184, D4: 1.816, c4: 0.9693, B3: 0.239, B4: 1.761 },
  10: { d2: 3.078, d3: 0.797, A2: 0.308, D3: 0.223, D4: 1.777, c4: 0.9727, B3: 0.284, B4: 1.716 },
  15: { d2: 3.472, d3: 0.756, A2: 0.223, D3: 0.347, D4: 1.653, c4: 0.9823, B3: 0.428, B4: 1.572 },
  20: { d2: 3.735, d3: 0.729, A2: 0.180, D3: 0.415, D4: 1.585, c4: 0.9869, B3: 0.510, B4: 1.490 },
  25: { d2: 3.931, d3: 0.708, A2: 0.153, D3: 0.459, D4: 1.541, c4: 0.9896, B3: 0.565, B4: 1.435 },
};

test("chart factors computed from their definitions match the published table", () => {
  for (const [n, row] of Object.entries(TABLE)) {
    const f = factors(Number(n));
    for (const [k, v] of Object.entries(row)) {
      const dp = k === "c4" ? 4 : 3;
      assert.ok(Math.abs(f[k] - v) <= 0.5 * 10 ** -dp + 1e-9, `n=${n} ${k}: computed ${f[k]} vs table ${v}`);
    }
  }
});

test("d2 and d3 agree with a seeded simulation of 200,000 subgroups", () => {
  const r = mulberry32(7);
  for (const n of [2, 5, 10]) {
    const R = [];
    for (let i = 0; i < 200000; i++) { const x = Array.from({ length: n }, () => gauss(r)); R.push(Math.max(...x) - Math.min(...x)); }
    const m = R.reduce((s, v) => s + v, 0) / R.length;
    const s = Math.sqrt(R.reduce((a, v) => a + (v - m) ** 2, 0) / (R.length - 1));
    const f = factors(n);
    assert.ok(Math.abs(m - f.d2) < 4 * s / Math.sqrt(R.length), `n=${n} d2 sim ${m} vs ${f.d2}`);
    assert.ok(Math.abs(s - f.d3) < 0.01, `n=${n} d3 sim ${s} vs ${f.d3}`);
  }
});

test("normal CDF matches erfc to 1e-14 and c4 has its closed form at n=2", () => {
  // Reference values from Python's math.erfc: 0.5 * erfc(-x / sqrt(2)).
  for (const [x, v] of [[1.96, 0.9750021048517795], [-3, 0.0013498980316300957], [1, 0.8413447460685429], [-6, 9.865876450376946e-10]]) {
    assert.ok(Math.abs(normCdf(x) - v) < 1e-14 * Math.max(1, 1 / v) * v + 1e-16, `${x}`);
  }
  assert.ok(Math.abs(c4(2) - Math.sqrt(2 / Math.PI)) < 1e-14);
});

const z = (arr) => nelson(arr).map((r, i) => [i, r]).filter(([, r]) => r.length);

test("each Nelson rule fires on its own pattern and on its last point", () => {
  assert.deepEqual(z([0, 0.5, 3.2, 0]), [[2, [1]]]);
  // rule 2: nine on one side, small enough to miss rules 6 and 8
  const r2 = nelson([-0.2, 0.3, -0.4, 0.5, -0.3, 0.2, 0.4, -0.1, 0.3, 0.2, 0.6, 0.1, 0.3, 0.5, 0.2, 0.4, 0.3]);
  assert.deepEqual(r2.map((r) => r.includes(2)), [...Array(16).fill(false), true]);
  // rule 3: six increasing (five rises)
  const r3 = nelson([0.5, -0.5, -0.4, -0.2, 0, 0.1, 0.3]);
  assert.deepEqual(r3.map((r) => r.includes(3)), [false, false, false, false, false, false, true]);
  // rule 4: fourteen alternating
  const alt = Array.from({ length: 14 }, (_, i) => (i % 2 ? 0.5 : -0.5));
  assert.deepEqual(nelson(alt).map((r) => r.includes(4)), [...Array(13).fill(false), true]);
  assert.ok(!nelson(alt.slice(0, 13)).some((r) => r.includes(4)));
  // rule 5: two of three beyond 2 sigma, same side; opposite sides do not count
  assert.deepEqual(z([0, 2.2, 0.5, 2.5]), [[3, [5]]]);
  assert.deepEqual(z([0, 2.2, -2.5]), []);
  // rule 6: four of five beyond 1 sigma, same side
  assert.deepEqual(z([0, 1.2, 1.5, 0.2, 1.4, 1.1]), [[5, [6]]]);
  // rule 7: fifteen inside 1 sigma
  const hug = Array.from({ length: 15 }, (_, i) => (i % 3 === 0 ? 0.6 : -0.3));
  assert.ok(nelson(hug)[14].includes(7) && !nelson(hug.slice(0, 14)).some((r) => r.includes(7)));
  // rule 8: eight outside 1 sigma, either side
  const mix = [1.5, -1.5, 1.2, -1.8, 1.1, -1.3, 1.6, -1.2];
  assert.ok(nelson(mix)[7].includes(8));
  // a point on the centre line breaks a rule-2 run
  assert.ok(!nelson([0.1, 0.1, 0.1, 0.1, 0, 0.1, 0.1, 0.1, 0.1, 0.1]).some((r) => r.includes(2)));
});

// An independent, deliberately plain re-implementation of the run rules.
function slow(zs) {
  const hit = zs.map(() => new Set());
  for (let k = 0; k < zs.length; k++) {
    const w = (len) => (k + 1 >= len ? zs.slice(k + 1 - len, k + 1) : null);
    if (Math.abs(zs[k]) > 3) hit[k].add(1);
    const w9 = w(9);
    if (w9 && (w9.every((q) => q > 1e-12) || w9.every((q) => q < -1e-12))) hit[k].add(2);
    const w6 = w(6);
    if (w6) { const d = w6.slice(1).map((q, j) => q - w6[j]); if (d.every((x) => x > 0) || d.every((x) => x < 0)) hit[k].add(3); }
    const w14 = w(14);
    if (w14) { const d = w14.slice(1).map((q, j) => Math.sign(q - w14[j])); if (d.every((x, j) => x !== 0 && (j === 0 || x === -d[j - 1]))) hit[k].add(4); }
    for (const s of [1, -1]) {
      const w3 = w(3), w5 = w(5);
      if (w3 && s * zs[k] > 2 && w3.filter((q) => s * q > 2).length >= 2) hit[k].add(5);
      if (w5 && s * zs[k] > 1 && w5.filter((q) => s * q > 1).length >= 4) hit[k].add(6);
    }
    const w15 = w(15);
    if (w15 && w15.every((q) => Math.abs(q) < 1)) hit[k].add(7);
    const w8 = w(8);
    if (w8 && w8.every((q) => Math.abs(q) > 1)) hit[k].add(8);
  }
  return hit.map((s) => [...s].sort());
}

test("rules agree with a plain window-by-window implementation on 2,000 random series", () => {
  const r = mulberry32(99);
  for (let t = 0; t < 2000; t++) {
    const drift = (t % 5) * 0.4, len = 10 + (t % 40);
    const zs = Array.from({ length: len }, (_, i) => Math.round((gauss(r) * (t % 3 ? 1 : 0.5) + (i > len / 2 ? drift : 0)) * 4) / 4);
    assert.deepEqual(nelson(zs).map((x) => [...x].sort()), slow(zs), `series ${t}`);
  }
});

test("rule 1 alone false-alarms on 0.27% of in-control points", () => {
  const r = mulberry32(3);
  const zs = Array.from({ length: 400000 }, () => gauss(r));
  const rate = nelson(zs, [1]).filter((x) => x.length).length / zs.length;
  assert.ok(Math.abs(rate - 2 * normCdf(-3)) < 0.0004, String(rate));
});

test("individuals chart: limits are mean +/- 2.66 MR-bar and MR UCL 3.267 MR-bar", () => {
  const { rows } = parseRows("1\n3\n2\n5\n4");
  const res = analyse({ type: "imr", rows });
  const [I, MR] = res.charts;
  const mrBar = (2 + 1 + 3 + 1) / 4, xBar = 3;
  assert.ok(Math.abs(I.points[0].ucl - (xBar + 3 * mrBar / factors(2).d2)) < 1e-12);
  assert.ok(Math.abs(I.points[0].ucl - (xBar + 2.66 * mrBar)) < 0.005);
  assert.ok(Math.abs(MR.points[1].ucl - 3.267 * mrBar) < 0.001);
  assert.equal(MR.points[0].value, null);
});

test("X-bar R and X-bar S reproduce the hand formulas", () => {
  const rows = parseRows("1,2,3\n2,4,6\n3,3,3\n0,1,5").rows;
  const f = factors(3);
  const R = analyse({ type: "xbar-r", rows });
  const rBar = (2 + 4 + 0 + 5) / 4, xbb = (2 + 4 + 3 + 2) / 4;
  assert.ok(Math.abs(R.charts[0].points[0].ucl - (xbb + f.A2 * rBar)) < 1e-12);
  assert.ok(Math.abs(R.charts[1].points[0].ucl - f.D4 * rBar) < 1e-12);
  const S = analyse({ type: "xbar-s", rows });
  const sd = (a) => { const m = a.reduce((x, y) => x + y) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  const sBar = rows.map((r) => sd(r.values)).reduce((a, b) => a + b) / 4;
  assert.ok(Math.abs(S.charts[0].points[0].ucl - (xbb + f.A3 * sBar)) < 1e-12);
  assert.ok(Math.abs(S.charts[1].points[0].ucl - f.B4 * sBar) < 1e-12);
  assert.throws(() => analyse({ type: "xbar-r", rows: parseRows("1,2\n1,2,3").rows }), /same number/);
});

test("attribute charts: p with varying sizes, np, c and u", () => {
  const p = analyse({ type: "p", rows: parseRows("4, 100\n10, 200\n1, 50").rows });
  const pBar = 15 / 350;
  assert.ok(Math.abs(p.charts[0].points[1].ucl - (pBar + 3 * Math.sqrt(pBar * (1 - pBar) / 200))) < 1e-12);
  assert.equal(p.charts[0].points[2].lcl, 0);
  const np = analyse({ type: "np", rows: parseRows("3\n5\n4").rows, n: 100 });
  assert.ok(Math.abs(np.charts[0].points[0].cl - 4) < 1e-12);
  const c = analyse({ type: "c", rows: parseRows("2\n4\n9\n1").rows });
  assert.ok(Math.abs(c.charts[0].points[0].ucl - (4 + 3 * 2)) < 1e-12);
  const u = analyse({ type: "u", rows: parseRows("3, 2\n8, 4").rows });
  assert.ok(Math.abs(u.charts[0].points[0].cl - 11 / 6) < 1e-12);
  assert.throws(() => analyse({ type: "p", rows: parseRows("5, 4\n1, 4").rows }), /exceed/);
  assert.throws(() => analyse({ type: "np", rows: parseRows("1, 10\n1, 20").rows }), /one sample size/);
});

test("excluding a point keeps it on the chart but out of the limits; revise drops rule-1 points", () => {
  const rows = parseRows("10\n11\n10\n9\n10\n11\n10\n40\n10\n9").rows;
  const all = analyse({ type: "imr", rows });
  const ex = analyse({ type: "imr", rows, exclude: [7] });
  assert.ok(ex.charts[0].points[7].excluded && ex.charts[0].points[7].rules.length === 0);
  assert.ok(ex.charts[0].points[0].ucl < all.charts[0].points[0].ucl);
  const rev = analyse({ type: "imr", rows, revise: true });
  assert.deepEqual(rev.revisedOut, [7]);
});

// Made-up subgroups for the capability arithmetic: 25 of 5 around 25.000 mm,
// sigma 0.010, with the mean up 0.015 from subgroup 18.
function shafts() {
  const r = mulberry32(18);
  return Array.from({ length: 25 }, (_, g) => ({ label: String(g + 1), values: Array.from({ length: 5 }, () => 25 + (g >= 17 ? 0.015 : 0) + 0.01 * gauss(r)) }));
}

test("capability: Cp, Cpk, Pp, Ppk, expected ppm and Bissell's bound", () => {
  const res = analyse({ type: "xbar-r", rows: shafts() });
  const cap = capability(res, { lsl: 24.96, usl: 25.04 });
  assert.ok(Math.abs(cap.cp - (0.08 / (6 * cap.sigmaWithin))) < 1e-12);
  assert.ok(Math.abs(cap.cpk - Math.min(25.04 - cap.mean, cap.mean - 24.96) / (3 * cap.sigmaWithin)) < 1e-12);
  assert.ok(cap.ppk <= cap.cpk, "a mean shift makes overall spread exceed within");
  assert.ok(cap.cpkLower95 < cap.cpk);
  assert.ok(cap.warnings.some((w) => /signals/.test(w)));
  const one = capability(res, { usl: 25.04 });
  assert.equal(one.cp, null);
  assert.equal(one.cpk, one.cpu);
  assert.equal(capability(res, {}), null);
  // expected ppm for a centred process at Cp = 1 is 2,700
  const flat = analyse({ type: "imr", rows: [0, 1, 0, 1].map((v, i) => ({ label: String(i), values: [v] })) });
  const c1 = capability(flat, { lsl: 0.5 - 3 * flat.sigmaWithin, usl: 0.5 + 3 * flat.sigmaWithin });
  assert.ok(Math.abs(c1.cp - 1) < 1e-12 && Math.abs(c1.ppmWithin - 2699.796) < 0.01);
});

test("example data is the NIST LITHOGRA.DAT line widths, unchanged, one wafer a line", () => {
  const dat = readFileSync(new URL("./data/LITHOGRA.DAT", import.meta.url), "utf8").split("\n").slice(25).filter((l) => l.trim());
  assert.equal(dat.length, 450);
  const rows = parseRows(EXAMPLE_TEXT).rows;
  assert.equal(rows.length, 90);
  dat.forEach((l, k) => {
    const [cas, waf, site, width] = l.trim().split(/\s+/);
    const row = rows[(+cas - 1) * 3 + (+waf - 1)];
    assert.equal(row.label, `Cassette ${+cas} wafer ${+waf}`);
    assert.equal(row.values[+site - 1], Number(width), `record ${k + 1}`);
  });
});

test("the NIST example: X-bar limits flag a quarter of the wafers, averages as individuals only cassette 27", () => {
  const xr = analyze({ text: EXAMPLE_TEXT });
  assert.equal(xr.type, "xbar-r");
  const out = (r) => new Set(r.signals.filter((s) => s.rule === 1 && s.chart === r.charts[0].name).map((s) => s.i)).size;
  assert.equal(out(xr), 25);
  assert.ok(xr.betweenRatio > 1.8 && xr.betweenRatio < 2, String(xr.betweenRatio));
  assert.match(xr.summary, /averages as individuals/);
  const mi = analyze({ text: EXAMPLE_TEXT, type: "means-imr" });
  assert.equal(out(mi), 3);
  assert.deepEqual(mi.signals.filter((s) => s.rule === 1 && s.chart === "Subgroup averages").map((s) => s.label), ["Cassette 27 wafer 1", "Cassette 27 wafer 2", "Cassette 27 wafer 3"]);
  assert.equal(mi.capability, null);
  assert.equal(toCsv(xr).trim().split("\n").length, 1 + 180);
});

test("analyze: 1-based exclusions, spec limits, errors in words, and every paper cited", () => {
  const r = analyze({ text: "1\n2\n1\n2\n9\n1", exclude: [5], lsl: 0, usl: 3 });
  assert.equal(r.type, "imr");
  assert.deepEqual(r.excluded, [4]);
  assert.ok(r.capability && r.capability.cp > 0);
  assert.throws(() => analyze({ text: "5" }), /at least two/);
  assert.throws(() => analyze({ text: "1\nabc" }), /not a number/);
  assert.ok(PAPERS.length >= 4 && PAPERS.every((p) => p.authors && p.title && p.year && p.url && p.implemented));
});

test("CSV export defuses formula-looking labels and keeps negative numbers", () => {
  const csv = toCsv(analyze({ text: "=HYPERLINK(1): -1\n@x: 2\nok: -3.5" }));
  assert.match(csv, /,'=HYPERLINK\(1\),-1,/);
  assert.match(csv, /,'@x,2,/);
  assert.match(csv, /,ok,-3\.5,/);
});

test("parser: labels, comments, separators and bad tokens", () => {
  const { rows, errors } = parseRows("# header\nMon 3 Nov: 1200, 1300\n\n7 8\nx 2");
  assert.deepEqual(rows[0], { line: 2, label: "Mon 3 Nov", values: [1200, 1300] });
  assert.equal(rows[1].label, "2");
  assert.equal(errors.length, 1);
});
