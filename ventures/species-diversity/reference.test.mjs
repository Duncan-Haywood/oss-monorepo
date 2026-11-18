// Agreement with eval/reference.py (scipy hypergeometric pmfs, mpmath's Lerch
// transcendent, scikit-bio), on simulated assemblages, Chao1's edge cases and
// the Portal rodent data. Regenerate with:
//   python3 -I eval/reference.py > eval/reference.json
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chao1, ace, chaoEntropy, observedHill, simpsonSum, coverageAt, curveFunction, sizeForCoverage, entropyTail, analyze } from "./engine.mjs";

const ref = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
const close = (a, b, tol, what) => assert.ok(rel(a, b) <= tol, `${what}: engine ${a}, reference ${b}`);
const cases = Object.entries(ref.cases);

test("the reference covers simulated, edge and real assemblages", () => {
  assert.ok(cases.length >= 12);
  for (const k of ["no-doubletons", "no-singletons", "one-singleton", "portal-Unmanipulated control"]) assert.ok(ref.cases[k], k);
});

test("Chao1 and its log-normal interval match, and agree with scikit-bio up to the (n-1)/n factor", () => {
  for (const [name, c] of cases) {
    const e = chao1(c.counts, 0.95);
    for (const k of ["estimate", "se", "lower", "upper"]) close(e[k], c.chao1[k], 1e-12, `${name} chao1 ${k}`);
    if (c.skbio_chao1_plain != null) close(e.estimate, c.S + ((c.n - 1) / c.n) * (c.skbio_chao1_plain - c.S), 1e-12, `${name} vs skbio`);
  }
});

test("ACE matches scikit-bio", () => {
  for (const [name, c] of cases) {
    const e = ace(c.counts, 10);
    if (c.ace == null) continue;
    assert.ok(e.estimate != null, name);
    close(e.estimate, c.ace, 1e-12, `${name} ace`);
  }
});

test("observed Hill numbers and the unbiased Simpson sum match scikit-bio", () => {
  for (const [name, c] of cases) {
    for (const q of [0, 1, 2]) close(observedHill(c.counts, q), c.observed[q], 1e-12, `${name} observed q=${q}`);
    close(simpsonSum(c.counts), c.simpson_unbiased, 1e-12, `${name} simpson`);
  }
});

test("Chao-Wang-Jost entropy matches the Lerch-transcendent route", () => {
  for (const [name, c] of cases) close(chaoEntropy(c.counts), c.entropy, 1e-11, `${name} entropy`);
});

test("the entropy tail is right in both its direct-sum and integral forms", () => {
  for (const t of ref.tails) close(entropyTail(t.A, t.n), t.tail, 1e-9, `tail A=${t.A} n=${t.n}`);
});

test("rarefaction of q = 0, 1, 2 and coverage match scipy's hypergeometric pmfs", () => {
  for (const [name, c] of cases) {
    const fns = [0, 1, 2].map((q) => curveFunction(c.counts, q));
    for (const r of c.rarefaction) {
      for (const q of [0, 1, 2]) close(fns[q](r.m), r.qD[q], 1e-10, `${name} m=${r.m} q=${q}`);
      close(coverageAt(c.counts, r.m), r.coverage, 1e-11, `${name} coverage m=${r.m}`);
    }
    close(coverageAt(c.counts, c.n), c.coverage_n, 1e-12, `${name} coverage at n`);
  }
});

test("extrapolation of q = 0, 1, 2 and coverage match the formulas written again in Python", () => {
  for (const [name, c] of cases) {
    const fns = [0, 1, 2].map((q) => curveFunction(c.counts, q));
    for (const r of c.extrapolation) {
      // q = 1 divides by D_asy - D(n-1), which is tiny for a well-sampled assemblage,
      // so round-off in D(n-1) (1e-13) is amplified; 1e-8 is still far below any formula slip.
      for (const q of [0, 1, 2]) close(fns[q](r.m), r.qD[q], q === 1 ? 1e-8 : 1e-10, `${name} m=${r.m} q=${q}`);
      close(coverageAt(c.counts, r.m), r.coverage, 1e-12, `${name} coverage m=${r.m}`);
    }
  }
});

test("the sample size for a target coverage matches brentq", () => {
  let n = 0;
  for (const [name, c] of cases) {
    for (const s of c.size_for_coverage) { close(sizeForCoverage(c.counts, s.C), s.m, 1e-7, `${name} C=${s.C}`); n++; }
  }
  assert.ok(n >= 30, `only ${n} coverage targets checked`);
});

test("rarefied expectations agree with 20,000 real subsamples", () => {
  for (const [name, c] of cases) {
    if (!c.monte_carlo) continue;
    const mc = c.monte_carlo;
    const s0 = curveFunction(c.counts, 0)(mc.m);
    const q2 = curveFunction(c.counts, 2)(mc.m);
    // Monte Carlo error on the mean of S is about sd/sqrt(20000); 1% is generous and far from any formula slip.
    close(s0, mc.S, 0.01, `${name} S at m=${mc.m}`);
    close(1 / q2, mc.simpson, 0.01, `${name} sum p^2 at m=${mc.m}`);
    // exp of the expected entropy is the q = 1 rarefaction (Chao et al. 2014 rarefy entropy, then exponentiate).
    close(curveFunction(c.counts, 1)(mc.m), Math.exp(mc.H), 0.01, `${name} q=1 at m=${mc.m}`);
  }
});

test("the full analysis of the Portal treatments reproduces the reference's asymptotes", () => {
  const assemblages = {};
  for (const [name, c] of cases) if (name.startsWith("portal-") && !name.startsWith("portal-plot")) assemblages[name.slice(7)] = c.counts;
  const res = analyze({ assemblages, bootstrap: 0 });
  for (const g of res.groups) {
    const c = ref.cases[`portal-${g.name}`];
    close(g.asymptotic[0].estimate, c.chao1.estimate, 1e-12, `${g.name} q0`);
    close(g.asymptotic[1].estimate, Math.exp(c.entropy), 1e-11, `${g.name} q1`);
    close(g.asymptotic[2].estimate, 1 / c.simpson_unbiased, 1e-12, `${g.name} q2`);
  }
});
