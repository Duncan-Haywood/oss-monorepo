import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAPERS, DEFAULTS, ar1JointFit, analyze, bocpd, defaultPoissonPrior, defaultPrior, gammaPoissonLogMarginal, makeCost, lgamma, nigLogMarginal, optimalPartitioning, ar1Rho, longRunSd, prewhiten, seasonalAdjust, trendAdjust, parseSeries, peaks, pelt, robustSd,
} from './engine.mjs';

// Seeded PRNG (mulberry32) and Box-Muller normals, so every test is reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normals(r, n, mean = 0, sd = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = Math.max(r(), 1e-12);
    out.push(mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()));
  }
  return out;
}

test('lgamma matches known values', () => {
  assert.ok(Math.abs(lgamma(1)) < 1e-12);
  assert.ok(Math.abs(lgamma(0.5) - Math.log(Math.sqrt(Math.PI))) < 1e-12);
  assert.ok(Math.abs(lgamma(10) - Math.log(362880)) < 1e-10);
  assert.ok(Math.abs(lgamma(100) - 359.1342053695754) < 1e-9);
});

test('Nile: PELT finds the 1898 change, matching the literature', () => {
  // Cobb (1978) and the changepoint R package (cpt.mean(Nile, method = "PELT")
  // reports cpts = 28) both put the change after 1898, the year the first
  // Aswan dam works began. Index 28 here = first point of the new segment.
  const r = analyze({});
  assert.equal(r.n, 100);
  assert.deepEqual(r.pelt.changepoints.map((c) => c.index), [28]);
  assert.equal(r.pelt.changepoints[0].lastBefore, '1898');
  assert.equal(r.pelt.changepoints[0].label, '1899');
  assert.ok(Math.abs(r.pelt.changepoints[0].meanBefore - 1097.75) < 0.01);
  assert.ok(Math.abs(r.pelt.changepoints[0].meanAfter - 849.972) < 0.01);
  assert.deepEqual(r.bocpd.detections.map((d) => d.index), [28]);
  assert.ok(r.bocpd.detections[0].probability > 0.5);
  assert.match(r.summary, /1899 \(after 1898\)/);
  assert.deepEqual(analyze({ model: 'meanvar' }).pelt.changepoints.map((c) => c.index), [28]);
});

test('PELT returns exactly the optimal-partitioning segmentation (pruning loses nothing)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const r = rng(seed);
    const x = [];
    const k = 1 + Math.floor(r() * 4);
    for (let s = 0; s < k; s++) x.push(...normals(r, 10 + Math.floor(r() * 40), (r() - 0.5) * 6, 0.5 + r() * 2));
    for (const model of ['mean', 'meanvar']) {
      for (const penalty of ['bic', 'aic', 5]) {
        const minSegment = model === 'meanvar' ? 5 : 2;
        const a = pelt(x, { model, penalty, minSegment });
        const b = optimalPartitioning(x, { model, penalty, minSegment });
        assert.ok(Math.abs(a.cost - b.cost) < 1e-6 * Math.max(1, Math.abs(b.cost)), `seed ${seed} ${model} ${penalty}: ${a.cost} vs ${b.cost}`);
        assert.deepEqual(a.changepoints, b.changepoints, `seed ${seed} ${model} ${penalty}`);
      }
    }
  }
});

test('PELT recovers planted mean shifts and respects the minimum segment', () => {
  const r = rng(7);
  const x = [...normals(r, 60, 0), ...normals(r, 50, 3), ...normals(r, 70, -1)];
  const { changepoints } = pelt(x, { model: 'mean' });
  assert.equal(changepoints.length, 2);
  assert.ok(Math.abs(changepoints[0] - 60) <= 2 && Math.abs(changepoints[1] - 110) <= 2, String(changepoints));
  const m = pelt(x, { model: 'mean', penalty: 0, minSegment: 7 });
  const b = [0, ...m.changepoints, x.length];
  for (let i = 1; i < b.length; i++) assert.ok(b[i] - b[i - 1] >= 7);
});

test('meanvar finds a pure volatility change that the mean model cannot', () => {
  const r = rng(11);
  const x = [...normals(r, 120, 0, 1), ...normals(r, 120, 0, 4)];
  const mv = pelt(x, { model: 'meanvar' }).changepoints;
  assert.equal(mv.length, 1);
  assert.ok(Math.abs(mv[0] - 120) <= 8, String(mv));
});

test('BIC rarely invents a change in pure noise', () => {
  // BIC is a liberal penalty; on 300 standard normals it splits about one
  // series in ten. More than 3 of 30 would mean the cost or penalty is off.
  let falsePositives = 0;
  for (let seed = 100; seed < 130; seed++) if (pelt(normals(rng(seed), 300), { model: 'mean' }).changepoints.length) falsePositives++;
  assert.ok(falsePositives <= 3, String(falsePositives));
});

test('BOCPD log evidence equals the closed-form one-segment marginal when the hazard vanishes', () => {
  const x = normals(rng(3), 40, 2, 1.5);
  const prior = defaultPrior(x);
  const b = bocpd(x, { hazardLambda: 1e15, prior, prune: 0 });
  const exact = nigLogMarginal(x, prior);
  assert.ok(Math.abs(b.logEvidence - exact) < 1e-6, `${b.logEvidence} vs ${exact}`);
});

test('BOCPD flags a planted change with high probability and stays quiet before it', () => {
  const r = rng(21);
  const x = [...normals(r, 80, 0), ...normals(r, 80, 4)];
  const b = bocpd(x, { hazardLambda: 100, lag: 5 });
  const hit = Math.max(...b.changeProb.slice(77, 84));
  assert.ok(hit > 0.9, `prob near 80 = ${hit}`);
  assert.ok(Math.max(...b.changeProb.slice(1, 70)) < 0.5);
  assert.deepEqual(peaks(b.changeProb, 0.5), [b.changeProb.indexOf(hit)]);
  // MAP run length restarts at the change.
  assert.ok(b.mapRun[100] <= 25 && b.mapRun[100] >= 15, String(b.mapRun[100]));
});

test('robust noise sd ignores a level shift', () => {
  const r = rng(5);
  const x = [...normals(r, 200, 0, 2), ...normals(r, 200, 50, 2)];
  const sd = robustSd(x);
  assert.ok(sd > 1.6 && sd < 2.4, String(sd));
});

test('parseSeries: header detection, named columns, skipped rows, errors', () => {
  const a = parseSeries('date,sales,cost\n2024-01,10,3\n2024-02,,4\n2024-03,"1,200",5\n', 'sales');
  assert.deepEqual(a.values, [10, 1200]);
  assert.deepEqual(a.labels, ['2024-01', '2024-03']);
  assert.equal(a.skipped, 1);
  assert.equal(a.column, 'sales');
  const b = parseSeries('1\n2\n3');
  assert.deepEqual(b.values, [1, 2, 3]);
  assert.deepEqual(b.labels, ['1', '2', '3']);
  assert.deepEqual(parseSeries('t;v\n1;5\n2;6').values, [5, 6]);
  assert.throws(() => parseSeries(''), /No data/);
  assert.throws(() => parseSeries('a,b\n1,2', 'zzz'), /No column named/);
  assert.throws(() => parseSeries('a\nx\ny'), /No numeric column/);
});

test('analyze accepts a values array, rejects tiny input, and is JSON-serialisable', () => {
  const r = analyze({ values: [1, 1, 1, 1, 1, 9, 9, 9, 9, 9], model: 'mean', penalty: 1 });
  assert.deepEqual(r.pelt.changepoints.map((c) => c.index), [5]);
  assert.doesNotThrow(() => JSON.stringify(r));
  assert.throws(() => analyze({ values: [1, 2, 3] }), /at least 4/);
  assert.throws(() => analyze({ penalty: 'nope' }), /Unknown penalty/);
});

test('every paper is cited with a URL and BibTeX', () => {
  assert.equal(PAPERS.length, 2);
  for (const p of PAPERS) {
    assert.match(p.url, /^https:\/\//);
    assert.match(p.bibtex, /^@article\{/);
    assert.ok(p.implemented.length > 40 && p.deviations.length > 20);
  }
  assert.match(DEFAULTS.csv, /^year,volume\n1871,1120/);
});

// Poisson counts: Knuth's multiplication sampler on the seeded generator.
function poissons(r, n, lambda) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= r(); } while (p > L);
    out.push(k - 1);
  }
  return out;
}

test('Poisson cost matches a hand-computed -2 log-likelihood (constant dropped)', () => {
  // x = [2, 4, 6]: rate 4; -2 sum(x log 4 - 4) = -2 * (12 log 4 - 12) = 24 - 24 log 4.
  const c = makeCost([2, 4, 6], 'poisson');
  assert.ok(Math.abs(c(0, 3) - (24 - 24 * Math.log(4))) < 1e-12);
  assert.equal(makeCost([0, 0, 0], 'poisson')(0, 3), 0);
});

test('Poisson PELT equals brute-force optimal partitioning', () => {
  for (let seed = 40; seed < 55; seed++) {
    const r = rng(seed);
    const x = [...poissons(r, 25, 3), ...poissons(r, 20, 9), ...poissons(r, 25, 2)];
    for (const penalty of ['bic', 'aic', 6]) {
      const a = pelt(x, { model: 'poisson', penalty });
      const b = optimalPartitioning(x, { model: 'poisson', penalty });
      assert.deepEqual(a.changepoints, b.changepoints, `seed ${seed} ${penalty}`);
      assert.ok(Math.abs(a.cost - b.cost) < 1e-8);
    }
  }
});

test('Poisson model recovers a planted rate shift and stays quiet on a constant rate', () => {
  const r = rng(5);
  const x = [...poissons(r, 80, 4), ...poissons(r, 70, 12)];
  const res = analyze({ values: x, model: 'poisson' });
  assert.equal(res.pelt.changepoints.length, 1);
  assert.ok(Math.abs(res.pelt.changepoints[0].index - 80) <= 3, String(res.pelt.changepoints[0].index));
  assert.ok(res.bocpd.detections.some((d) => Math.abs(d.index - 80) <= 4));
  assert.match(res.summary, /change in rate/);
  let fp = 0;
  for (let seed = 200; seed < 220; seed++) if (pelt(poissons(rng(seed), 200, 5), { model: 'poisson' }).changepoints.length) fp++;
  assert.ok(fp <= 3, String(fp));
});

test('Poisson BOCPD log evidence equals the closed-form Gamma-Poisson marginal when the hazard vanishes', () => {
  const x = poissons(rng(9), 40, 6);
  const prior = defaultPoissonPrior(x);
  const b = bocpd(x, { hazardLambda: 1e15, prior, prune: 0, model: 'poisson' });
  const exact = gammaPoissonLogMarginal(x, prior);
  assert.ok(Math.abs(b.logEvidence - exact) < 1e-6, `${b.logEvidence} vs ${exact}`);
});

test('Poisson model rejects values that are not counts', () => {
  assert.throws(() => analyze({ values: [1, 2, 3.5, 4, 5], model: 'poisson' }), /needs counts/);
  assert.throws(() => analyze({ values: [1, 2, -3, 4, 5], model: 'poisson' }), /needs counts/);
});

// ---- seasonal adjustment and autocorrelation (measured on seeded synthetic series)

function ar1Series(seed, rho, n, shiftAt = null, shift = 0) {
  const r = rng(seed);
  const z = normals(r, n);
  const x = [];
  let e = 0;
  for (let i = 0; i < n; i++) { e = rho * e + z[i]; x.push(e + (shiftAt !== null && i >= shiftAt ? shift : 0)); }
  return x;
}

test('ar1Rho recovers the autocorrelation of AR(1) noise, with and without a level shift', () => {
  for (const rho of [0, 0.5, 0.8]) {
    const est = [];
    for (let s = 1; s <= 20; s++) est.push(ar1Rho(ar1Series(s, rho, 400, 200, 6)));
    const mean = est.reduce((a, b) => a + b, 0) / est.length;
    assert.ok(Math.abs(mean - rho) < 0.1, `rho ${rho}: mean estimate ${mean}`);
  }
});

test('longRunSd is the identity at rho 0 and grows with rho', () => {
  assert.equal(longRunSd(2, 0), 2);
  assert.ok(longRunSd(2, 0.8) > longRunSd(2, 0.5));
});

test('ar1 correction: no-change AR(1) series stop showing false changes', () => {
  let plain = 0, fixed = 0;
  const N = 40;
  for (let s = 1; s <= N; s++) {
    const x = ar1Series(s, 0.8, 300);
    plain += analyze({ values: x }).pelt.changepoints.length > 0;
    fixed += analyze({ values: x, ar1: true }).pelt.changepoints.length > 0;
  }
  assert.ok(plain >= 0.9 * N, `uncorrected false-change runs ${plain}/${N}`); // measured 40/40
  assert.ok(fixed <= 0.2 * N, `corrected false-change runs ${fixed}/${N}`);   // measured 4/40
});

test('ar1 correction still finds a real shift in autocorrelated noise', () => {
  let hit = 0;
  const N = 40;
  for (let s = 1; s <= N; s++) {
    const c = analyze({ values: ar1Series(s + 100, 0.8, 300, 150, 8), ar1: true }).pelt.changepoints;
    if (c.length === 1 && Math.abs(c[0].index - 150) <= 10) hit++;
  }
  assert.ok(hit >= 0.8 * N, `found once near 150 in ${hit}/${N}`); // measured 35/40
});

test('bocpd with rho: evidence matches the closed form for a stationary AR(1) segment', () => {
  const rho = 0.7, x = ar1Series(3, rho, 40);
  const p = { mu: 0.5, kappa: 0.3, alpha: 2, beta: 1.5 };
  const b = bocpd(x, { hazardLambda: 1e12, prior: p, rho, prune: 0 });
  const a0 = Math.sqrt(1 - rho * rho);
  const a = x.map((_, t) => (t ? 1 - rho : a0));
  const z = x.map((v, t) => (t ? v - rho * x[t - 1] : v * a0));
  const n = x.length, saz = z.reduce((s, v, i) => s + a[i] * v, 0), sa2 = a.reduce((s, v) => s + v * v, 0), sz2 = z.reduce((s, v) => s + v * v, 0);
  const kn = p.kappa + sa2, mn = (p.kappa * p.mu + saz) / kn, an = p.alpha + n / 2;
  const bn = p.beta + (sz2 + p.kappa * p.mu ** 2 - kn * mn ** 2) / 2;
  const ref = lgamma(an) - lgamma(p.alpha) + p.alpha * Math.log(p.beta) - an * Math.log(bn) + 0.5 * (Math.log(p.kappa) - Math.log(kn)) - (n / 2) * Math.log(2 * Math.PI) + Math.log(a0);
  assert.ok(Math.abs(b.logEvidence - ref) < 1e-6, `${b.logEvidence} vs ${ref}`);
});

test('ar1 correction reaches the Bayesian pass (conditional AR(1) likelihood)', () => {
  assert.deepEqual(prewhiten([5, 7, 3], 0.5), [2.5, 4.5, -0.5]);
  let plain = 0, fixed = 0, hitPlain = 0, hitFixed = 0;
  const N = 40;
  const near = (a) => a.bocpd.detections.some((d) => Math.abs(d.index - 150) <= 10);
  for (let s = 1; s <= N; s++) {
    const x = ar1Series(s, 0.8, 300);
    plain += analyze({ values: x }).bocpd.detections.length > 0;
    fixed += analyze({ values: x, ar1: true }).bocpd.detections.length > 0;
    const y = ar1Series(s + 100, 0.8, 300, 150, 8);
    hitPlain += near(analyze({ values: y }));
    hitFixed += near(analyze({ values: y, ar1: true }));
  }
  assert.ok(plain >= 0.9 * N, `uncorrected false Bayesian runs ${plain}/${N}`); // measured 40/40
  assert.ok(fixed <= 0.1 * N, `corrected false Bayesian runs ${fixed}/${N}`);   // measured 1/40
  assert.ok(hitFixed >= 0.9 * N, `corrected hits ${hitFixed}/${N}`);            // measured 40/40 (prewhitening gave 25/40; uncorrected ${hitPlain} = 40)
});

test('seasonalAdjust removes a seasonal cycle and centres the profile', () => {
  const x = Array.from({ length: 48 }, (_, i) => 10 * Math.sin((2 * Math.PI * i) / 12) + 5);
  const { adjusted, profile } = seasonalAdjust(x, 12);
  assert.ok(Math.abs(profile.reduce((a, b) => a + b, 0)) < 1e-9);
  const mid = adjusted.slice(12, 36);
  assert.ok(Math.max(...mid) - Math.min(...mid) < 1e-6, 'a pure cycle adjusts to a flat line');
});

test('seasonal period: a level shift hidden by a strong cycle is found once, near the right place', () => {
  let plain = 0, adj = 0;
  const N = 40;
  for (let s = 1; s <= N; s++) {
    const r = rng(s + 200);
    const z = normals(r, 144);
    const x = z.map((e, i) => 10 * Math.sin((2 * Math.PI * i) / 12) + (i >= 84 ? 4 : 0) + e);
    plain += analyze({ values: x }).pelt.changepoints.length === 1;
    const c = analyze({ values: x, period: 12 }).pelt.changepoints;
    adj += c.length === 1 && Math.abs(c[0].index - 84) <= 1;
  }
  assert.equal(plain, 0);               // measured 0/40 without the adjustment
  assert.ok(adj >= 0.75 * N, `${adj}/${N}`); // measured 33/40
});

test('seasonal period and ar1 reject inputs they cannot handle', () => {
  assert.throws(() => analyze({ values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], period: 12 }), /two full cycles/);
  assert.throws(() => analyze({ values: Array(40).fill(3), period: 7, model: 'poisson' }), /counts/);
  assert.throws(() => analyze({ values: [1, 2, 3, 4, 5, 6, 7, 8], ar1: true, model: 'meanvar' }), /"mean" model only/);
  const r = analyze({ values: ar1Series(1, 0.8, 100), ar1: true });
  assert.ok(r.ar1.rho > 0.5);
});

test('joint AR(1) fit: exact against brute force, and more power on small shifts', () => {
  // PELT on the AR(1) likelihood equals optimal partitioning on the same cost.
  const y = ar1Series(7, 0.6, 80, 40, 5);
  const opt = { model: 'ar1mean', penalty: 'bic', sigma: 1, rho: 0.6 };
  assert.deepEqual(pelt(y, opt).changepoints, optimalPartitioning(y, opt).changepoints);
  const N = 40;
  let fp = 0, longHit = 0, jointHit = 0;
  const once = (c) => c.length === 1 && Math.abs(c[0].index - 150) <= 10;
  for (let s = 1; s <= N; s++) {
    fp += analyze({ values: ar1Series(s, 0.8, 300), ar1: 'joint' }).pelt.changepoints.length > 0;
    const z = ar1Series(s + 100, 0.8, 300, 150, 4);
    longHit += once(analyze({ values: z, ar1: true }).pelt.changepoints);
    const j = analyze({ values: z, ar1: 'joint' });
    jointHit += once(j.pelt.changepoints);
    assert.ok(j.ar1.rho > 0.5);
  }
  assert.ok(fp <= 0.15 * N, `false runs ${fp}/${N}`);                 // measured 4/40
  assert.ok(jointHit >= longHit, `joint ${jointHit} vs long-run ${longHit}`); // measured 34 vs 28 at shift 4
  assert.ok(jointHit >= 0.75 * N);
});

test('PELT agrees with an independent implementation (ruptures) on 100 seeded cases', () => {
  // data/ruptures-crosscheck.json holds series and the changepoints ruptures'
  // Pelt (CostL2 for mean, CostNormal for meanvar) returns at the same numeric
  // penalty; data/make_ruptures_fixture.py regenerates it. sigma = 1 matches the
  // unit-noise L2 cost.
  const fixture = JSON.parse(readFileSync(new URL('./data/ruptures-crosscheck.json', import.meta.url), 'utf8'));
  assert.equal(fixture.cases.length, 100);
  assert.ok(fixture.cases.filter((c) => c.changepoints.length > 0).length >= 50);
  for (const c of fixture.cases) {
    const got = pelt(c.values, { model: c.model, penalty: c.penalty, minSegment: c.minSegment, sigma: 1 });
    assert.deepEqual(got.changepoints, c.changepoints, `${c.model} penalty ${c.penalty} n=${c.values.length}`);
  }
});

test('Poisson PELT agrees with an independent implementation (ruptures + scipy cost) on 90 seeded cases', () => {
  // data/poisson-crosscheck.json: ruptures' Pelt with a custom cost built from
  // scipy.stats.poisson.logpmf at each segment's maximum-likelihood rate;
  // data/make_poisson_fixture.py regenerates it.
  const fixture = JSON.parse(readFileSync(new URL('./data/poisson-crosscheck.json', import.meta.url), 'utf8'));
  assert.equal(fixture.cases.length, 90);
  assert.ok(fixture.cases.filter((c) => c.changepoints.length > 0).length >= 40);
  for (const c of fixture.cases) {
    const got = pelt(c.values, { model: 'poisson', penalty: c.penalty, minSegment: c.minSegment });
    assert.deepEqual(got.changepoints, c.changepoints, `poisson penalty ${c.penalty} n=${c.values.length}`);
  }
});

test('seasonal drift: a cycle whose amplitude triples leaves far fewer false changes, and a real shift is still found', () => {
  let fixedN = 0, driftN = 0, found = 0, foundFixed = 0, exact = 0;
  const N = 40;
  for (let s = 1; s <= N; s++) {
    const z = normals(rng(s + 400), 144);
    const x = z.map((e, i) => (4 + (8 * i) / 144) * Math.sin((2 * Math.PI * i) / 12) + (i >= 84 ? 5 : 0) + e);
    const hit = (c) => c.some((p) => Math.abs(p.index - 84) <= 3);
    const f = analyze({ values: x, period: 12 }).pelt.changepoints;
    const d = analyze({ values: x, period: 12, drift: true }).pelt.changepoints;
    fixedN += f.length; driftN += d.length;
    foundFixed += f.length === 1 && hit(f);
    found += hit(d); exact += d.length === 1 && hit(d);
  }
  // measured (seeds 401..440): changes per series fixed profile vs drift, shift found within 3 points, exactly one change
  // with the Theil-Sen window (9 cycles) the same seeds gave 1.95 changes/series, shift found 40/40, exactly one 24/40
  console.log(`# drift: ${fixedN / N} vs ${driftN / N} changes/series; shift found ${found}/${N}; exactly one ${exact}/${N} (fixed ${foundFixed}/${N})`);
  assert.ok(driftN / N < 0.4 * (fixedN / N), `${driftN / N} vs ${fixedN / N}`);
  assert.ok(found >= 0.9 * N && exact > foundFixed, `${found}/${N} exact ${exact} vs ${foundFixed}`);
});

test('seasonal drift with --ar1: sticky noise on a growing cycle stays one change, not nine', () => {
  const N = 40, n = 144, rho = 0.5;
  let plain = 0, ar = 0, found = 0, exact = 0, falseRuns = 0;
  for (let s = 1; s <= N; s++) {
    const z = normals(rng(s + 400), n);
    const e = [z[0]];
    for (let i = 1; i < n; i++) e.push(rho * e[i - 1] + Math.sqrt(1 - rho * rho) * z[i]);
    const base = e.map((v, i) => (4 + (8 * i) / n) * Math.sin((2 * Math.PI * i) / 12) + v);
    const x = base.map((v, i) => v + (i >= 84 ? 5 : 0));
    const p = analyze({ values: x, period: 12, drift: true }).pelt.changepoints;
    const a = analyze({ values: x, period: 12, drift: true, ar1: true }).pelt.changepoints;
    plain += p.length; ar += a.length;
    const hit = a.some((c) => Math.abs(c.index - 84) <= 3);
    found += hit; exact += a.length === 1 && hit;
    falseRuns += analyze({ values: base, period: 12, drift: true, ar1: true }).pelt.changepoints.length > 0;
  }
  // measured (seeds 401..440): without --ar1 9.47 changes/series, with it 1.30; shift found 39/40, exactly one 33/40, false runs 9/40
  console.log(`# period+drift+ar1: ${plain / N} vs ${ar / N} changes/series; found ${found}/${N}; exactly one ${exact}/${N}; false ${falseRuns}/${N}`);
  assert.ok(ar / N < 0.3 * (plain / N), `${ar / N} vs ${plain / N}`);
  assert.ok(found >= 0.9 * N && exact >= 0.6 * N && falseRuns <= 0.4 * N);
});

test('trend model: the segment cost equals a direct least-squares fit, and PELT equals optimal partitioning', () => {
  const x = normals(rng(77), 60).map((e, i) => 0.2 * i + (i >= 30 ? 6 : 0) + e);
  const cost = makeCost(x, 'trend', 1);
  for (const [s, t] of [[0, 60], [0, 30], [30, 60], [10, 25]]) {
    const m = t - s;
    const tb = (s + t - 1) / 2, xb = x.slice(s, t).reduce((a, v) => a + v, 0) / m;
    let sxx = 0, sxy = 0;
    for (let i = s; i < t; i++) { sxx += (i - tb) ** 2; sxy += (i - tb) * (x[i] - xb); }
    let rss = 0;
    for (let i = s; i < t; i++) rss += (x[i] - xb - (sxy / sxx) * (i - tb)) ** 2;
    assert.ok(Math.abs(cost(s, t) - rss) < 1e-8, `${s}..${t}: ${cost(s, t)} vs ${rss}`);
  }
  for (const penalty of ['bic', 'aic', 5]) {
    const a = pelt(x, { model: 'trend', penalty, minSegment: 4, sigma: 1 });
    const b = optimalPartitioning(x, { model: 'trend', penalty, minSegment: 4, sigma: 1 });
    assert.deepEqual(a.changepoints, b.changepoints);
  }
});

test('trend model: a steady ramp is not cut into steps, and a slope break or a jump on a ramp is found', () => {
  const N = 40, n = 120;
  const tally = { rampMean: 0, rampTrend: 0, brkMean: 0, brkTrend: 0, brkHit: 0, brkExact: 0, jumpExact: 0 };
  for (let s = 1; s <= N; s++) {
    const ramp = normals(rng(s), n).map((e, i) => 0.1 * i + e);
    tally.rampMean += analyze({ values: ramp }).pelt.changepoints.length;
    tally.rampTrend += analyze({ values: ramp, model: 'trend' }).pelt.changepoints.length;
    const brk = normals(rng(s + 100), n).map((e, i) => 0.1 * i + (i > 60 ? 0.3 * (i - 60) : 0) + e);
    tally.brkMean += analyze({ values: brk }).pelt.changepoints.length;
    const bt = analyze({ values: brk, model: 'trend' }).pelt.changepoints;
    tally.brkTrend += bt.length;
    tally.brkHit += bt.some((c) => Math.abs(c.index - 60) <= 5);
    tally.brkExact += bt.length === 1 && Math.abs(bt[0].index - 60) <= 5;
    const jump = normals(rng(s + 200), n).map((e, i) => 0.1 * i + (i >= 60 ? 5 : 0) + e);
    const jt = analyze({ values: jump, model: 'trend' }).pelt.changepoints;
    tally.jumpExact += jt.length === 1 && Math.abs(jt[0].index - 60) <= 5;
  }
  // measured (seeds 1..40, 120 points, noise sd 1): changes per series on a pure ramp of slope 0.1, level model vs
  // trend model 5.5 vs 0.15; on a slope break at 60 (0.1 -> 0.4) 10.4 vs 1.1, break found within 5 points 30/40,
  // exactly one change near it 27/40; ramp plus a jump of 5 at 60: exactly one change near it 38/40
  console.log(`# trend: ${JSON.stringify(tally)}`);
  assert.ok(tally.rampTrend / N < 0.5 && tally.rampMean / N > 3, JSON.stringify(tally));
  assert.ok(tally.brkTrend / N < 0.25 * (tally.brkMean / N) && tally.brkHit >= 0.7 * N, JSON.stringify(tally));
  assert.ok(tally.jumpExact >= 0.85 * N, JSON.stringify(tally));
});

test('trend model: reports the jump and the slope on each side, and the summary says so', () => {
  const x = normals(rng(5), 120).map((e, i) => 0.1 * i + (i > 60 ? 0.3 * (i - 60) : 0) + e);
  const r = analyze({ values: x, model: 'trend' });
  const c = r.pelt.changepoints[0];
  assert.ok(Math.abs(c.slopeBefore - 0.1) < 0.1 && Math.abs(c.slopeAfter - 0.4) < 0.15, JSON.stringify(c));
  assert.ok(r.pelt.segments.every((sg) => typeof sg.slope === 'number'));
  assert.match(r.summary, /slope goes from/);
  assert.equal(r.bocpd.changeProb.length, 120);
});

test('trend: a ramp under one step leaves one change, not ten, and the slope is recovered', () => {
  const N = 40, n = 200;
  let plain = 0, tr = 0, found = 0, exact = 0, falseRuns = 0, slope = 0;
  for (let s = 1; s <= N; s++) {
    const z = normals(rng(s + 500), n);
    const base = z.map((e, i) => 0.1 * i + e);
    const x = base.map((v, i) => v + (i >= 100 ? 5 : 0));
    plain += analyze({ values: x }).pelt.changepoints.length;
    const r = analyze({ values: x, trend: true });
    const c = r.pelt.changepoints;
    tr += c.length; slope += r.trend.slopePerPoint;
    const hit = c.some((p) => Math.abs(p.index - 100) <= 3);
    found += hit; exact += hit && c.length === 1;
    falseRuns += analyze({ values: base, trend: true }).pelt.changepoints.length > 0;
  }
  // measured (seeds 501..540, slope 0.1, shift 5 at 100): 10.1 changes/series without, 1.13 with; slope 0.1003;
  // shift found 40/40, exactly one 37/40, false changes on 3/40 no-shift series
  console.log(`# trend: ${plain / N} vs ${tr / N} changes/series; slope ${(slope / N).toFixed(4)}; found ${found}/${N}; exact ${exact}/${N}; false ${falseRuns}/${N}`);
  assert.ok(tr / N < 0.25 * (plain / N));
  assert.ok(Math.abs(slope / N - 0.1) < 0.005);
  assert.ok(found >= 0.95 * N && exact >= 0.8 * N && falseRuns <= 0.2 * N);
});

test('trend with ar1: sticky noise over a ramp with one step is not cut into extra changes', () => {
  const N = 40, n = 200, rho = 0.5;
  let plainCh = 0, ar = 0, found = 0, falsePelt = 0, falsePlain = 0, falseBayes = 0, exactBayes = 0;
  const gen = (seed, step) => {
    const z = normals(rng(seed), n);
    let e = 0;
    return z.map((v, i) => { e = rho * e + v; return 0.1 * i + e + (step && i >= 100 ? 5 : 0); });
  };
  for (let s = 701; s <= 700 + N; s++) {
    const x = gen(s, true), base = gen(s, false);
    plainCh += analyze({ values: x, trend: true }).pelt.changepoints.length;
    const r = analyze({ values: x, trend: true, ar1: true });
    const c = r.pelt.changepoints;
    ar += c.length;
    found += c.some((p) => Math.abs(p.index - 100) <= 3);
    const d = r.bocpd.detections;
    exactBayes += d.length === 1 && Math.abs(d[0].index - 100) <= 3;
    falsePlain += analyze({ values: base, trend: true }).pelt.changepoints.length > 0;
    const q = analyze({ values: base, trend: true, ar1: true });
    falsePelt += q.pelt.changepoints.length > 0;
    falseBayes += q.bocpd.detections.length > 0;
  }
  // measured (seeds 701..740, 200 points, slope 0.1, AR(1) rho 0.5, shift 5 at 100): PELT changes/series 8.68 with
  // --trend, 1.38 with --trend --ar1; false runs on no-shift series 39 -> 3 (PELT), Bayesian 30 -> 0; shift found 36/40,
  // Bayesian exactly one change near it 34/40. Before the ar1-aware slope loop: PELT false 28/40, Bayesian 5/40.
  console.log(`# trend+ar1: ${plainCh / N} vs ${ar / N} changes/series; found ${found}/${N}; false pelt ${falsePlain} -> ${falsePelt}, bayes ${falseBayes}; bayes exact ${exactBayes}`);
  assert.ok(ar / N < 0.3 * (plainCh / N));
  assert.ok(found >= 0.85 * N && falsePelt <= 0.15 * N && falseBayes <= 0.1 * N && exactBayes >= 0.75 * N);
});

test('trend with a seasonal cycle, and counts are refused', () => {
  const N = 40;
  let plain = 0, tr = 0, found = 0;
  for (let s = 1; s <= N; s++) {
    const z = normals(rng(s + 600), 144);
    const x = z.map((e, i) => 0.08 * i + 8 * Math.sin((2 * Math.PI * i) / 12) + (i >= 84 ? 5 : 0) + e);
    plain += analyze({ values: x, period: 12 }).pelt.changepoints.length;
    const c = analyze({ values: x, period: 12, trend: true }).pelt.changepoints;
    tr += c.length; found += c.some((p) => Math.abs(p.index - 84) <= 3);
  }
  // measured (seeds 601..640): 6.6 changes/series with --period alone, 1.25 with --trend; found 40/40
  console.log(`# period+trend: ${plain / N} vs ${tr / N}; found ${found}/${N}`);
  assert.ok(tr / N < 0.3 * (plain / N) && found >= 0.95 * N);
  assert.throws(() => analyze({ values: [1, 2, 3, 4, 5, 6], model: 'poisson', trend: true }), /counts/);
});

test('trendAdjust keeps the mean level and returns the slope', () => {
  const x = Array.from({ length: 60 }, (_, i) => 2 + 0.5 * i);
  const { adjusted, slope } = trendAdjust(x);
  assert.ok(Math.abs(slope - 0.5) < 1e-9);
  const mean = adjusted.reduce((a, b) => a + b, 0) / 60;
  assert.ok(Math.abs(mean - x.reduce((a, b) => a + b, 0) / 60) < 1e-9);
  assert.ok(Math.max(...adjusted) - Math.min(...adjusted) < 1e-9);
});

test('trend bend: a ramp whose slope doubles is one line with a bend, not a step', () => {
  const N = 40, n = 200;
  let plain = 0, bent = 0, falseBend = 0, knot = 0, s2 = 0, found = 0;
  const ramp = (seed, step) => normals(rng(seed), n).map((e, i) => 0.1 * i + 0.1 * Math.max(0, i - 100) + e + (step && i >= 150 ? 5 : 0));
  for (let s = 801; s <= 800 + N; s++) {
    const x = ramp(s, false);
    plain += analyze({ values: x, trend: true }).pelt.changepoints.length;
    const r = analyze({ values: x, trend: 'bend' });
    bent += r.pelt.changepoints.length;
    if (r.trend.slopeChangesAt !== undefined) { knot += r.trend.slopeChangesAt; s2 += r.trend.slopeAfter; }
    const y = analyze({ values: ramp(s, true), trend: 'bend' }).pelt.changepoints;
    found += y.some((p) => Math.abs(p.index - 150) <= 3);
    const straight = normals(rng(s + 100), n).map((e, i) => 0.1 * i + e);
    falseBend += analyze({ values: straight, trend: 'bend' }).trend.slopeChangesAt !== undefined;
  }
  console.log(`# bend: ${plain / N} vs ${bent / N} changes/series; knot ${(knot / N).toFixed(1)}; slope after ${(s2 / N).toFixed(3)}; step found ${found}/${N}; false bend ${falseBend}/${N}`);
  assert.ok(bent / N < 0.5 * (plain / N));
  assert.ok(found >= 0.85 * N && falseBend <= 0.15 * N);
});

test('trend bends: a ramp with two slope changes is lines with two knots, not steps', () => {
  const N = 15, n = 240;
  let plain = 0, one = 0, many = 0, two = 0, k1 = 0, k2 = 0, falseBend = 0;
  const three = (i) => 0.1 * i + 0.1 * Math.max(0, i - 80) - 0.25 * Math.max(0, i - 160);
  for (let s = 901; s <= 900 + N; s++) {
    const x = normals(rng(s), n).map((e, i) => three(i) + e);
    plain += analyze({ values: x, trend: true }).pelt.changepoints.length;
    one += analyze({ values: x, trend: 'bend' }).pelt.changepoints.length;
    const r = analyze({ values: x, trend: 'bends' });
    many += r.pelt.changepoints.length;
    const k = r.trend.slopeChangesAtAll || [];
    if (k.length === 2) { two++; k1 += k[0]; k2 += k[1]; }
    const straight = normals(rng(s + 100), n).map((e, i) => 0.1 * i + e);
    falseBend += analyze({ values: straight, trend: 'bends' }).trend.slopeChangesAt !== undefined;
  }
  console.log(`# bends: ${plain / N} / ${one / N} / ${many / N} changes/series (steps / one bend / bends); two knots ${two}/${N} at ${(k1 / two).toFixed(1)} and ${(k2 / two).toFixed(1)}; false bend ${falseBend}/${N}`);
  assert.ok(many / N < 0.5 * (one / N));
  assert.ok(two >= 0.8 * N && Math.abs(k1 / two - 80) < 5 && Math.abs(k2 / two - 160) < 5 && falseBend <= 0.15 * N);
});

test('trend bends: knots are refined to the point on long series, not left on the n/40 grid', () => {
  // 288 points: the grid step is 7, so before refinement a knot sat up to 3 points (often 6) from the truth.
  // Slope 0.05, then 0.15 from point 96, then -0.03 from point 192; seeds 1101..1108.
  let near = 0;
  for (let seed = 1101; seed <= 1108; seed++) {
    const r = rng(seed);
    let level = 0;
    const x = normals(r, 288).map((e, i) => { if (i > 0) level += i < 96 ? 0.05 : i < 192 ? 0.15 : -0.03; return level + e; });
    const { knots } = trendAdjust(x, { bend: 3 });
    if (knots.length === 2 && Math.abs(knots[1] - 192) <= 3) near++;
  }
  assert.ok(near >= 6, `second knot within 3 points on ${near} of 8`);
});

test('trend bends with sticky noise: --ar1 keeps the wandering from being cut into steps', () => {
  const N = 40, n = 240;
  const f = (i) => 0.1 * i + 0.1 * Math.max(0, i - 80) - 0.25 * Math.max(0, i - 160);
  const runs = { plain: 0, ar1: 0, both: 0 };
  let two = 0;
  for (let s = 1001; s <= 1000 + N; s++) {
    const e = normals(rng(s), n);
    let p = 0;
    const x = e.map((v, i) => { p = 0.5 * p + v; return f(i) + p; });
    const seasonal = x.map((v, i) => v + 4 * Math.sin((2 * Math.PI * i) / 12));
    runs.plain += analyze({ values: x, trend: 'bends' }).pelt.changepoints.length;
    const a = analyze({ values: x, trend: 'bends', ar1: true });
    runs.ar1 += a.pelt.changepoints.length;
    two += (a.trend.slopeChangesAtAll || []).length === 2;
    runs.both += analyze({ values: seasonal, trend: 'bends', ar1: true, period: 12 }).pelt.changepoints.length;
  }
  console.log(`# bends, AR(1) rho 0.5: ${runs.plain / N} changes/series plain, ${runs.ar1 / N} with --ar1, ${runs.both / N} with --ar1 --period 12; two knots ${two}/${N}`);
  assert.ok(runs.ar1 < 0.4 * runs.plain);
  assert.ok(runs.both / N < 3);
  // straight ramp with the same sticky noise: the AR(1)-aware BIC must not invent a bend (11 of 40 before it)
  let falseBend = 0;
  for (let s = 1001; s <= 1000 + N; s++) {
    let p = 0;
    const st = normals(rng(s + 100), n).map((v, i) => { p = 0.5 * p + v; return 0.1 * i + p; });
    falseBend += analyze({ values: st, trend: 'bends', ar1: true }).trend.slopeChangesAt !== undefined;
  }
  assert.ok(falseBend <= 3, `false bends ${falseBend}/${N}`);
});

test('trend bends --joint-knots: scoring every pair of knots finds both bends on sticky noise more often than the greedy search', () => {
  // 240 points, slope 0.1, 0.2 from point 80, -0.05 from point 160, AR(1) rho 0.5, seeds 1001..1012 (README: 20 of 40 greedy, 36 of 40 joint)
  const n = 240, f = (i) => 0.1 * i + 0.1 * Math.max(0, i - 80) - 0.25 * Math.max(0, i - 160);
  let greedy = 0, joint = 0;
  for (let s = 1001; s <= 1012; s++) {
    let p = 0;
    const x = normals(rng(s), n).map((v, i) => { p = 0.5 * p + v; return f(i) + p; });
    greedy += (trendAdjust(x, { bend: 3, ar1: true }).knots || []).length === 2;
    joint += (trendAdjust(x, { bend: 3, ar1: true, joint: true }).knots || []).length === 2;
  }
  console.log(`# joint knots, 12 series: two knots ${greedy} greedy, ${joint} joint`);
  assert.ok(joint >= greedy + 3, `${joint} joint against ${greedy} greedy`);
});

test('trend bends --joint-knots: the refined pair places knots as well as the greedy search on white noise', () => {
  // same ramp, independent noise, seeds 1001..1012; the coarse pair alone placed knots worse than greedy (README, "Scoring every pair of knots")
  const n = 240, f = (i) => 0.1 * i + 0.1 * Math.max(0, i - 80) - 0.25 * Math.max(0, i - 160);
  const near = (o) => { const k = o.knots || []; return k.length === 2 && Math.abs(k[0] - 80) <= 8 && Math.abs(k[1] - 160) <= 8; };
  let greedy = 0, joint = 0;
  for (let s = 1001; s <= 1012; s++) {
    const x = normals(rng(s), n).map((v, i) => f(i) + v);
    greedy += near(trendAdjust(x, { bend: 3 }));
    joint += near(trendAdjust(x, { bend: 3, joint: true }));
  }
  console.log(`# joint knots, white noise, 12 series: both within 8 points ${greedy} greedy, ${joint} joint`);
  assert.ok(joint >= greedy - 1, `${joint} joint against ${greedy} greedy`); // 40 series: 33 and 33 (was 27 joint before the pair was refined)
});

test('trend bend knot margin: a slope change at 12% of the series is found only when the knot range reaches it (0.1, now the default, against the old 0.2)', () => {
  // 200 points, slope 0.05 then 0.35 from point 24, seeds 1201..1212 (README "Knot range": 34 of 40 within 6 points at 0.1, 0 of 40 at the old default 0.2)
  const n = 200, near = (o) => o.knot !== undefined && Math.abs(o.knot - 24) <= 6;
  let dflt = 0, wide = 0, falseBends = 0;
  for (let s = 1201; s <= 1212; s++) {
    const x = normals(rng(s), n).map((v, i) => 0.05 * i + 0.3 * Math.max(0, i - 24) + v);
    dflt += near(trendAdjust(x, { bend: 1, knotMargin: 0.2 }));
    wide += near(trendAdjust(x, { bend: 1 }));
    assert.equal(near(trendAdjust(x, { bend: 1 })), near(trendAdjust(x, { bend: 1, knotMargin: 0.1 })));
  }
  for (let s = 1301; s <= 1312; s++) {
    const x = normals(rng(s), n).map((v, i) => 0.1 * i + v);
    falseBends += trendAdjust(x, { bend: 3, knotMargin: 0.1 }).knot !== undefined;
  }
  console.log(`# knot margin, 12 series: knot near 24 ${dflt} at 0.2, ${wide} at 0.1; false bends on straight ramps ${falseBends}`);
  assert.ok(wide >= dflt + 6, `${wide} at 0.1 against ${dflt} at 0.2`);
  assert.ok(falseBends <= 1);
});

test('trend bend --knot-margin 0.1 with --ar1: an early slope change under sticky noise is still found', () => {
  // 200 points, slope 0.05 then 0.35 from point 24, AR(1) rho 0.5, seeds 1201..1212 (README "Knot range": 25 of 40 within 6 points at 0.1, 0 of 40 at 0.2)
  const n = 200, near = (o) => o.knot !== undefined && Math.abs(o.knot - 24) <= 6;
  let dflt = 0, wide = 0;
  for (let s = 1201; s <= 1212; s++) {
    let p = 0;
    const x = normals(rng(s), n).map((v, i) => { p = 0.5 * p + v; return 0.05 * i + 0.3 * Math.max(0, i - 24) + p; });
    dflt += near(trendAdjust(x, { bend: 1, ar1: true, knotMargin: 0.2 }));
    wide += near(trendAdjust(x, { bend: 1, ar1: true, knotMargin: 0.1 }));
  }
  console.log(`# knot margin with ar1, 12 series: knot near 24 ${dflt} at 0.2, ${wide} at 0.1`);
  assert.ok(wide >= dflt + 5, `${wide} at 0.1 against ${dflt} at 0.2`);
});

test('trend bends --joint-knots: the least-squares pair places both knots near the truth on clean data, and invents no bend on a ramp', () => {
  // 240 points, slope 0.1, 0.2 from point 80, -0.05 from point 160, white noise, seeds 1001..1012 (README: 35 of 40 within 8 points)
  const n = 240, f = (i) => 0.1 * i + 0.1 * Math.max(0, i - 80) - 0.25 * Math.max(0, i - 160);
  let near = 0, falseBend = 0;
  for (let s = 1001; s <= 1012; s++) {
    const x = normals(rng(s), n).map((v, i) => f(i) + v);
    const k = trendAdjust(x, { bend: 3, joint: true }).knots || [];
    near += k.length === 2 && Math.abs(k[0] - 80) <= 8 && Math.abs(k[1] - 160) <= 8;
    const ramp = normals(rng(s + 100), n).map((v, i) => 0.1 * i + v);
    falseBend += (trendAdjust(ramp, { bend: 3, joint: true }).knots || []).length > 0;
  }
  assert.ok(near >= 8, `${near} of 12 within 8 points`);
  assert.ok(falseBend <= 1, `${falseBend} false bends`);
});
