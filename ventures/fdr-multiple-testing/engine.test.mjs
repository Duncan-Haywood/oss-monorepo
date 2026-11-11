import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, parseCsv, bonferroni, sidak, holm, hochberg, bh, by, bky, qvalues, pi0Estimate, eBH, harmonic, histogram, PAPERS, METHODS } from "./engine.mjs";
import { EXAMPLE_CSV } from "./example-data.mjs";

const REF = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const FN = { bonferroni, sidak, holm, hochberg, bh, by };

function close(actual, expected, tol, what) {
  assert.equal(actual.length, expected.length, what);
  for (let i = 0; i < actual.length; i++) {
    const d = Math.abs(actual[i] - expected[i]);
    assert.ok(d <= tol * Math.max(1, Math.abs(expected[i])), `${what}[${i}]: ${actual[i]} vs ${expected[i]}`);
  }
}

test("adjusted p-values match statsmodels 0.15.0 on every reference case", () => {
  assert.equal(REF.statsmodels, "0.15.0");
  for (const [name, c] of Object.entries(REF.cases)) {
    for (const [id, f] of Object.entries(FN)) close(f(c.p), c.adjusted[id], 1e-12, `${name} ${id}`);
  }
});

test("two-stage BKY rejections match statsmodels fdr_tsbky at four levels", () => {
  for (const [name, c] of Object.entries(REF.cases)) {
    for (const [a, rej] of Object.entries(c.bky)) assert.deepEqual(bky(c.p, Number(a)).reject, rej, `${name} alpha ${a}`);
  }
});

test("Storey pi0 and q-values match the reference at three lambdas", () => {
  for (const [name, c] of Object.entries(REF.cases)) {
    for (const lam of ["0.5", "0.2", "0.8"]) {
      const pi0 = pi0Estimate(c.p, Number(lam));
      assert.ok(Math.abs(pi0 - c.pi0[lam]) < 1e-15, `${name} pi0 ${lam}`);
      close(qvalues(c.p, pi0), c.storey[lam], 1e-12, `${name} q ${lam}`);
    }
  }
});

test("e-BH rejections match the Wang-Ramdas definition at four levels", () => {
  const e = REF.evalues.e;
  const adj = eBH(e);
  for (const [a, rej] of Object.entries(REF.evalues.rejections)) {
    assert.deepEqual(adj.map((x) => x <= Number(a)), rej, `alpha ${a}`);
    assert.ok(rej.some(Boolean), `alpha ${a} rejects something, so the test has teeth`);
  }
});

test("the Benjamini-Hochberg (1995) example: Bonferroni 3, BH 4, two-stage BKY 8 at 0.05", () => {
  const r = analyze({ csv: EXAMPLE_CSV, alpha: 0.05 });
  const n = Object.fromEntries(r.methods.map((x) => [x.id, x.rejections]));
  assert.equal(r.m, 15);
  assert.equal(n.bonferroni, 3);
  assert.equal(n.holm, 3); // 0.0095 x 12 = 0.114 > 0.05
  assert.equal(n.bh, 4);
  assert.equal(n.bky, 8);
  assert.equal(r.bhCutoff, 0.0095);
  assert.equal(r.bky.stage1Rejections, 4);
  // Benjamini, Krieger & Yekutieli (2006) report the second-stage level 0.0649 for this example (as pinned in statsmodels' tests).
  assert.ok(Math.abs(r.bky.alphaStage2 - 0.0649) < 1e-4, String(r.bky.alphaStage2));
  assert.match(r.summary, /Of 15 tests, 9 have p ≤ 0.05 before correction/);
  assert.match(r.summary, /Benjamini-Hochberg keeps 4 at a 5% false discovery rate/);
});

test("hand-computed small case", () => {
  const p = [0.01, 0.04, 0.03, 0.005];
  // sorted 0.005, 0.01, 0.03, 0.04; BH: 0.02, 0.02, 0.04, 0.04
  close(bh(p), [0.02, 0.04, 0.04, 0.02], 1e-15, "bh");
  // Holm: 4*0.005=0.02, 3*0.01=0.03, 2*0.03=0.06, max(0.06, 0.04)=0.06
  close(holm(p), [0.03, 0.06, 0.06, 0.02], 1e-15, "holm");
  // Hochberg: from the top 0.04, min(0.04, 2*0.03)=0.04, min(0.04, 0.03)=0.03, min(0.03, 0.02)=0.02
  close(hochberg(p), [0.03, 0.04, 0.04, 0.02], 1e-15, "hochberg");
  close(by(p), bh(p).map((x) => Math.min(1, x * (1 + 1 / 2 + 1 / 3 + 1 / 4))), 1e-15, "by");
  assert.ok(Math.abs(harmonic(4) - 25 / 12) < 1e-15);
});

test("properties: monotone in p, ordered between methods, invariant to order", () => {
  const p = REF.cases.mix1000.p;
  const a = { bonferroni: bonferroni(p), holm: holm(p), hochberg: hochberg(p), bh: bh(p), by: by(p), sidak: sidak(p) };
  const o = p.map((_, i) => i).sort((i, j) => p[i] - p[j]);
  for (const [id, v] of Object.entries(a)) {
    for (let k = 1; k < o.length; k++) assert.ok(v[o[k]] >= v[o[k - 1]] - 1e-15, `${id} monotone`);
    for (let i = 0; i < p.length; i++) assert.ok(v[i] >= p[i] - 1e-15 && v[i] <= 1, `${id} in [p, 1]`);
  }
  for (let i = 0; i < p.length; i++) {
    assert.ok(a.holm[i] <= a.bonferroni[i] + 1e-15);
    assert.ok(a.hochberg[i] <= a.holm[i] + 1e-15);
    assert.ok(a.bh[i] <= a.hochberg[i] + 1e-15);
    assert.ok(a.bh[i] <= a.by[i] + 1e-15);
    assert.ok(a.sidak[i] <= a.bonferroni[i] + 1e-15);
  }
  const rev = [...p].reverse();
  assert.deepEqual(bh(rev), [...a.bh].reverse());
  assert.deepEqual(holm(rev), [...a.holm].reverse());
  assert.deepEqual(eBH([3, 0, 50]), [...eBH([50, 0, 3])].reverse());
});

test("Sidak keeps precision for tiny p-values", () => {
  const s = sidak([1e-14, 0.5]);
  assert.ok(Math.abs(s[0] - 2e-14) / 2e-14 < 1e-9, String(s[0]));
  assert.equal(sidak([1])[0], 1);
});

test("BH rejection set equals the step-up definition at many levels", () => {
  const p = REF.cases.ties200.p, m = p.length, s = [...p].sort((x, y) => x - y), adj = bh(p);
  for (const q of [0.001, 0.01, 0.05, 0.1, 0.25, 0.5]) {
    let k = 0;
    for (let i = m; i >= 1; i--) if (s[i - 1] <= (i * q) / m) { k = i; break; }
    assert.equal(adj.filter((x) => x <= q).length, k, `q ${q}`);
  }
});

test("pi0 estimate is 1 for all nulls far above lambda and 0 when every p is small", () => {
  assert.equal(pi0Estimate([0.9, 0.95, 0.99, 0.6]), 1);
  assert.equal(pi0Estimate([0.01, 0.02]), 0);
  assert.throws(() => pi0Estimate([0.1], 1));
  assert.deepEqual(histogram([0, 0.05, 0.5, 1], 2), [2, 2]);
});

test("parsing: bare lists, CSV with labels, missing rows, bad values", () => {
  assert.deepEqual(parseCsv("0.01\n0.2, 0.3 ;0.4").rows.length, 4);
  const r = analyze({ csv: "gene,pvalue,logfc\nA,0.001,1.2\nB,NA,0.3\nC,0.02,-1\nD,0.9,0.1" });
  assert.equal(r.m, 3);
  assert.equal(r.columns.value, "pvalue");
  assert.equal(r.columns.label, "gene");
  assert.equal(r.items[0].label, "A");
  assert.match(r.warnings[0], /1 row had a missing/);
  assert.match(analyze({ csv: "0.1\n1.5" }).error, /between 0 and 1/);
  assert.match(analyze({ csv: "" }).error, /empty/);
  assert.match(analyze({ csv: "a,b\nx,y" }).error, /No numeric column/);
  assert.match(analyze({ csv: "0.1", alpha: 2 }).error, /level/);
  assert.match(analyze({ csv: "0.1", method: "nope" }).error, /Unknown method/);
  assert.match(analyze({ csv: "p\n0.1", column: "q" }).error, /not in the header/);
  assert.equal(analyze({ values: [0.01, 0.5], alpha: 0.05 }).m, 2);
});

test("e-value mode", () => {
  const r = analyze({ csv: "test,e\nA,400\nB,30\nC,0.5\nD,0", kind: "e", alpha: 0.1 });
  // m = 4; e_[1]=400 >= 4/(0.1*1)=40 yes; e_[2]=30 >= 4/(0.1*2)=20 yes; e_[3]=0.5 < 13.3
  assert.equal(r.methods[0].rejections, 2);
  assert.equal(r.items[0].label, "A");
  assert.match(r.summary, /2 pass e-BH/);
  assert.match(analyze({ csv: "e\n-1", kind: "e" }).error, /zero or positive/);
  assert.match(analyze({ csv: "e\n0.1\n0.2", kind: "e" }).summary, /None of the 2/);
});

test("warns about already-adjusted lists and spikes near 1", () => {
  const p = [...Array(30).fill(1), ...Array.from({ length: 70 }, (_, i) => (i + 0.5) / 70)];
  assert.ok(analyze({ values: p }).warnings.some((w) => /already adjusted/.test(w)));
});

test("PAPERS are complete and every method is described", () => {
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
  assert.deepEqual(METHODS.map((m) => m.id), ["bonferroni", "sidak", "holm", "hochberg", "bh", "by", "bky", "storey"]);
  const r = analyze({ csv: EXAMPLE_CSV });
  assert.doesNotThrow(() => JSON.stringify(r));
  assert.equal(r.items.length, 15);
});

test("a large list stays fast", () => {
  const p = Array.from({ length: 200000 }, (_, i) => ((i * 7919) % 200000) / 200000);
  const t = Date.now();
  const r = analyze({ values: p });
  assert.equal(r.m, 200000);
  assert.ok(Date.now() - t < 8000);
});

test("the simulation's normal tail matches scipy.stats.norm.sf, and a small run is reproducible", async () => {
  const { normSf, simulate } = await import("./eval/simulate.mjs");
  // scipy 1.18.1: norm.sf at -1, 0.3, 1, 3, 6, 10
  const ref = [0.8413447460685429, 0.3820885778110474, 0.15865525393145707, 0.0013498980316300933, 9.865876450376946e-10, 7.61985302416047e-24];
  [-1, 0.3, 1, 3, 6, 10].forEach((z, i) => assert.ok(Math.abs(normSf(z) - ref[i]) / ref[i] < 1e-12, `z ${z}`));
  const a = simulate({ reps: 5 }), b = simulate({ reps: 5 });
  assert.deepEqual(a, b);
  assert.ok(a.methods.bh.power > a.methods.bonferroni.power);
});
