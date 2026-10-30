import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAPERS, DEFAULTS, negbinSize, poissonSeasonal, poissonHolidays, poissonTrend, countDispersion, ar1JointFit, analyze, findBursts, bocpd, defaultPoissonPrior, defaultNbPrior, defaultPrior, gammaPoissonLogMarginal, makeCost, lgamma, nigLogMarginal, optimalPartitioning, ar1Rho, longRunSd, prewhiten, seasonalAdjust, trendAdjust, lsKnots, lineRss, penaltyValue, parseSeries, peaks, pelt, robustSd,
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
  // Excel in a comma-decimal locale: semicolon-separated, 1,5 means 1.5 (was read as the column 5).
  const eu = parseSeries('t;v\n1;1,5\n2;2,25\n3;\"1.200,5\"');
  assert.deepEqual(eu.values, [1.5, 2.25, 1200.5]);
  assert.equal(eu.skipped, 0);
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
  assert.throws(() => analyze({ values: Array(40).fill(3), period: 7, model: 'poisson', drift: true }), /drifting/);
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
  assert.throws(() => analyze({ values: [1, 2, 3, 4, 5, 6], model: 'poisson', trend: 'wiggly' }), /counts/);
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

// ---- seasonal counts: multiplicative factors as Poisson exposures

const WEEK = [0.4, 0.8, 1.0, 1.1, 1.3, 1.6, 0.8]; // mean 1

function weeklyCounts(seed, n, rateAt) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, t) => poissons(r, 1, rateAt(t) * WEEK[t % 7])[0]);
}

test('Poisson cost with exposures equals the hand-computed -2 log-likelihood', () => {
  // x = [2, 4, 6] with exposures [1, 2, 3]: rate 12/6 = 2; -2 sum(x log(2 e) - 2 e) up to sum(x log e), dropped.
  const c = makeCost([2, 4, 6], 'poisson', 1, 0, [1, 2, 3]);
  assert.ok(Math.abs(c(0, 3) - 2 * (12 - 12 * Math.log(2))) < 1e-12);
  assert.equal(makeCost([3, 3, 3], 'poisson', 1, 0, [1, 1, 1])(0, 3), makeCost([3, 3, 3], 'poisson')(0, 3));
});

test('Poisson PELT with exposures equals brute-force optimal partitioning', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const x = weeklyCounts(seed, 70, (t) => (t < 30 ? 4 : t < 50 ? 10 : 3));
    const exposure = x.map((_, t) => WEEK[t % 7]);
    for (const penalty of ['bic', 'aic', 8]) {
      const a = pelt(x, { model: 'poisson', penalty, exposure });
      const b = optimalPartitioning(x, { model: 'poisson', penalty, exposure });
      assert.deepEqual(a.changepoints, b.changepoints);
      assert.ok(Math.abs(a.cost - b.cost) < 1e-9);
    }
  }
});

test('Poisson BOCPD with exposures: log evidence equals the closed-form marginal when the hazard vanishes', () => {
  const x = weeklyCounts(5, 49, () => 6);
  const exposure = x.map((_, t) => WEEK[t % 7]);
  const prior = defaultPoissonPrior(x);
  const b = bocpd(x, { hazardLambda: 1e15, prior, prune: 0, model: 'poisson', exposure });
  // alpha + sum x, beta + sum e; the exposure-weighted likelihood adds sum x log e
  const a = x.reduce((s, v) => s + v, 0), E = exposure.reduce((s, v) => s + v, 0);
  const exact = prior.alpha * Math.log(prior.beta) - lgamma(prior.alpha) + lgamma(prior.alpha + a) - (prior.alpha + a) * Math.log(prior.beta + E)
    + x.reduce((s, v, i) => s + v * Math.log(exposure[i]) - lgamma(v + 1), 0);
  assert.ok(Math.abs(b.logEvidence - exact) < 1e-6, `${b.logEvidence} vs ${exact}`);
});

test('poissonSeasonal recovers a weekly profile and keeps a rate shift out of it', () => {
  const x = weeklyCounts(11, 280, (t) => (t < 140 ? 8 : 16));
  const { factors } = poissonSeasonal(x, 7);
  assert.ok(Math.abs(factors.reduce((s, v) => s + v, 0) / 7 - 1) < 1e-9);
  factors.forEach((f, p) => assert.ok(Math.abs(f - WEEK[p]) < 0.12, `phase ${p}: ${f} vs ${WEEK[p]}`));
});

test('seasonal counts: --period removes the false alarms a weekly cycle causes, and still finds the shift', () => {
  const N = 20;
  let plainFalse = 0, adjFalse = 0, found = 0;
  for (let seed = 300; seed < 300 + N; seed++) {
    const flat = weeklyCounts(seed, 210, () => 12);
    if (analyze({ values: flat, model: 'poisson' }).pelt.changepoints.length) plainFalse++;
    if (analyze({ values: flat, model: 'poisson', period: 7 }).pelt.changepoints.length) adjFalse++;
    const shifted = weeklyCounts(seed + 1000, 210, (t) => (t < 105 ? 10 : 15));
    const cps = analyze({ values: shifted, model: 'poisson', period: 7 }).pelt.changepoints;
    if (cps.length === 1 && Math.abs(cps[0].index - 105) <= 8) found++;
  }
  assert.ok(adjFalse <= 2, `adjusted false runs ${adjFalse}/${N}`);
  assert.ok(plainFalse >= adjFalse + 5, `plain ${plainFalse} vs adjusted ${adjFalse}`);
  assert.ok(found >= 0.8 * N, `found ${found}/${N}`);
  console.log(`seasonal counts: false runs plain ${plainFalse}/${N}, adjusted ${adjFalse}/${N}; shift found ${found}/${N}`);
});

test('seasonal counts report factors, a per-point rate and exposures-aware segments', () => {
  const x = weeklyCounts(21, 210, (t) => (t < 105 ? 10 : 20));
  const r = analyze({ values: x, model: 'poisson', period: 7 });
  assert.equal(r.seasonal.multiplicative, true);
  assert.equal(r.seasonal.profile.length, 7);
  assert.equal(r.pelt.segments.length, 2);
  assert.ok(Math.abs(r.pelt.segments[0].mean - 10) < 1.5 && Math.abs(r.pelt.segments[1].mean - 20) < 2.5);
  assert.equal(r.adjusted.length, 210);
});

test('poissonTrend recovers a log-linear growth rate and keeps a rate step out of it', () => {
  const r = rng(77);
  const n = 200;
  const x = [];
  for (let t = 0; t < n; t++) x.push(poissons(r, 1, 10 * Math.exp(1.2 * t / (n - 1)) * (t >= 100 ? 1.6 : 1))[0]);
  const { g, exposure } = poissonTrend(x, {});
  assert.ok(Math.abs(g - 1.2) < 0.35, `g ${g}`);
  assert.ok(Math.abs(exposure[n - 1] / exposure[0] - Math.exp(g)) < 1e-9);
  const a = analyze({ values: x, model: 'poisson', trend: true });
  assert.equal(a.trend.multiplicative, true);
  assert.ok(a.pelt.changepoints.some((c) => Math.abs(c.index - 100) <= 8));
  assert.ok(a.pelt.changepoints.length <= 2);
});

test('a count trend can bend once: the knot is found and a straight trend gets no bend', () => {
  const n = 200;
  const rb = rng(1602);
  const bent = Array.from({ length: n }, (_, t) => { const v = t / (n - 1); return poissons(rb, 1, 10 * Math.exp(v < 0.5 ? 0.8 * v : 0.4 + (v - 0.5) * 3.2))[0]; });
  const a = analyze({ values: bent, model: 'poisson', trend: 'bend' });
  assert.ok(Math.abs(a.trend.growthChangesAt - 100) <= 15, `knot ${a.trend.growthChangesAt}`);
  assert.ok(a.trend.logGrowthAcrossSeriesAfter > a.trend.logGrowthAcrossSeries + 1.5);
  assert.ok(a.pelt.changepoints.length <= 1);
  const r = rng(1603);
  const straight = Array.from({ length: n }, (_, t) => poissons(r, 1, 10 * Math.exp(0.8 * t / (n - 1)))[0]);
  assert.equal(analyze({ values: straight, model: 'poisson', trend: 'bend' }).trend.growthChangesAt, undefined);
});

test('--overdispersion nb --trend bend ranks knots with the negative-binomial likelihood (README "Bends on clumpy counts")', () => {
  // seed 5000 of data/measure_nb_bend.mjs: independent lognormal rates (sd 0.35), growth flat to 105 then 4.0 per series length
  const r = rng(5000), n = 210;
  const norm = () => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
  const pois = (l) => { if (l > 50) return Math.max(0, Math.round(l + Math.sqrt(l) * norm())); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  const x = Array.from({ length: n }, (_, t) => { const rate = 10 * Math.exp((t < 105 ? 0 : 4 * (t - 105) / n) - 1); return pois(rate * Math.exp(0.35 * norm() - 0.06)); });
  const a = analyze({ values: x, model: 'poisson', trend: 'bend', overdispersion: 'nb' });
  assert.ok(Math.abs(a.trend.growthChangesAt - 105) <= 15, `knot ${a.trend.growthChangesAt}`);
  const fit = poissonTrend(x, { bend: true, nbSize: 3.5 });
  assert.ok(Number.isFinite(fit.g) && fit.exposure.length === n);
  assert.match(a.trend.growthChangeRangeNote, /optimistic/);
  assert.equal(analyze({ values: x, model: 'poisson', trend: 'bend' }).trend.growthChangeRangeNote, undefined);
});

test('count trends refuse unknown modes, and a flat series gets a growth near zero', () => {
  assert.throws(() => analyze({ values: [1, 2, 3, 4, 5, 6, 7, 8], model: 'poisson', trend: 'wiggly' }), /up to two/);
  const r = rng(5);
  const a = analyze({ values: poissons(r, 150, 8), model: 'poisson', trend: true });
  assert.ok(Math.abs(a.trend.logGrowthAcrossSeries) < 0.4);
});

test('countDispersion reads Poisson counts as 1 and clumpy counts as large, and overdispersion stops the false steps', () => {
  const r = rng(1700);
  const n = 210;
  const plain = Array.from({ length: n }, (_, t) => poissons(r, 1, 10 * [1.6, 1.3, 1.1, 0.9, 0.8, 0.5, 0.8][t % 7])[0]);
  assert.ok(countDispersion(plain, 7) < 1.8);
  // a lognormal rate with memory (rho 0.6, sd 0.35 innovations): variance far above the mean
  let z = 0;
  const sticky = Array.from({ length: n }, (_, t) => {
    z = 0.6 * z + 0.35 * Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
    return poissons(r, 1, 10 * Math.exp(z) * [1.6, 1.3, 1.1, 0.9, 0.8, 0.5, 0.8][t % 7])[0];
  });
  assert.ok(countDispersion(sticky, 7) > 2.5, `dispersion ${countDispersion(sticky, 7)}`);
  assert.equal(countDispersion([1, 2, 3], 0), 1);
  const without = analyze({ values: sticky, model: 'poisson', period: 7 });
  const withOd = analyze({ values: sticky, model: 'poisson', period: 7, overdispersion: true });
  assert.ok(withOd.dispersion > 2.5);
  assert.ok(withOd.pelt.penalty > 2.5 * without.pelt.penalty);
  assert.ok(withOd.pelt.changepoints.length < without.pelt.changepoints.length);
  assert.ok(withOd.pelt.changepoints.length <= 2);
  assert.equal(analyze({ values: plain, model: 'poisson', overdispersion: 3 }).dispersion, 3);
  assert.throws(() => analyze({ values: plain, model: 'mean', overdispersion: true }), /counts/);
});

test('overdispersion tempers the Bayesian pass too: wandering counts stop raising false detections', () => {
  const r = rng(1710);
  const W = [1.6, 1.3, 1.1, 0.9, 0.8, 0.5, 0.8];
  let z = 0;
  const sticky = Array.from({ length: 210 }, (_, t) => {
    z = 0.6 * z + 0.35 * Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
    return poissons(r, 1, 10 * Math.exp(z) * W[t % 7])[0];
  });
  const plain = analyze({ values: sticky, model: 'poisson', period: 7 });
  const od = analyze({ values: sticky, model: 'poisson', period: 7, overdispersion: true });
  assert.ok(plain.bocpd.detections.length >= 2, `plain ${plain.bocpd.detections.length}`);
  assert.ok(od.bocpd.detections.length <= 1, `tempered ${od.bocpd.detections.length}`);
  // phi = 1 leaves the Poisson pass exactly as it was
  const x = [...poissons(rng(7), 60, 3), ...poissons(rng(8), 60, 12)];
  assert.deepEqual(bocpd(x, { model: 'poisson', dispersion: 1 }).changeProb, bocpd(x, { model: 'poisson' }).changeProb);
  assert.ok(bocpd(x, { model: 'poisson', dispersion: 4 }).changeProb[60] < bocpd(x, { model: 'poisson' }).changeProb[60]);
});

// ---- negative-binomial cost for independent clumpy counts
test('negative-binomial cost matches a hand-computed -2 log-likelihood and tends to Poisson for a large size', () => {
  // x = [2, 4, 6], mu = 4, r = 4: -2 [12 log(4/8) + 3 * 4 * log(4/8)] = -48 log(0.5).
  const c = makeCost([2, 4, 6], 'negbin', 1, 0, null, 4);
  assert.ok(Math.abs(c(0, 3) - -48 * Math.log(0.5)) < 1e-12);
  // The difference between two segmentations tends to the Poisson difference as r grows.
  const x = [1, 3, 2, 9, 11, 8];
  const big = makeCost(x, 'negbin', 1, 0, null, 1e7), p = makeCost(x, 'poisson');
  assert.ok(Math.abs((big(0, 3) + big(3, 6) - big(0, 6)) - (p(0, 3) + p(3, 6) - p(0, 6))) < 1e-4);
});

test('negbinSize finds r from independent clumpy counts and ignores Poisson counts', () => {
  const r = rng(77);
  const clumpy = [];
  for (let i = 0; i < 400; i++) {
    const g = Math.exp(0.5 * normals(r, 1)[0] - 0.125);
    clumpy.push(poissons(r, 1, 10 * g)[0]);
  }
  const size = negbinSize(clumpy);   // true: variance 10 + 100 (e^0.25 - 1) = 38.4, so r = 100 / 28.4 = 3.5
  assert.ok(size > 2 && size < 6, `size ${size}`);
  assert.equal(negbinSize(poissons(rng(78), 400, 10)), Infinity);
});

test('negative binomial PELT: independent clumpy counts, 40 seeded series (README "Independent clumpy counts")', () => {
  let poisFalse = 0, nbFalse = 0, hits = 0;
  for (let seed = 1700; seed < 1740; seed++) {
    const r = rng(seed);
    const gen = (n, rate) => Array.from({ length: n }, () => poissons(r, 1, rate * Math.exp(0.35 * normals(r, 1)[0] - 0.06))[0]);
    const flat = gen(200, 10);
    poisFalse += pelt(flat, { model: 'poisson' }).changepoints.length;
    nbFalse += pelt(flat, { model: 'negbin', size: negbinSize(flat) }).changepoints.length;
    const stepped = [...gen(100, 10), ...gen(100, 18)];
    const cp = pelt(stepped, { model: 'negbin', size: negbinSize(stepped) }).changepoints;
    if (cp.some((c) => Math.abs(c - 100) <= 10)) hits++;
  }
  assert.ok(poisFalse / 40 > 2, `Poisson false changes per series ${poisFalse / 40}`);
  assert.ok(nbFalse / 40 < 0.5, `negbin false changes per series ${nbFalse / 40}`);
  assert.ok(hits >= 36, `step found on ${hits} of 40`);
});

test('analyze --overdispersion nb uses the negative-binomial cost', () => {
  const r = rng(5);
  const x = Array.from({ length: 120 }, (_, i) => poissons(r, 1, (i < 60 ? 10 : 25) * Math.exp(0.35 * normals(r, 1)[0]))[0]);
  const res = analyze({ csv: x.join('\n'), model: 'poisson', overdispersion: 'nb' });
  assert.ok(res.pelt.changepoints.some((c) => Math.abs((c.index ?? c.start ?? c) - 60) <= 8), JSON.stringify(res.pelt.changepoints));
});

test('negative binomial with exposures: a constant exposure matches the closed form, and --period --overdispersion nb stops seasonal false steps', () => {
  const x = [2, 4, 6, 9, 1, 5];
  const plain = makeCost(x, 'negbin', 1, 0, null, 4), withE = makeCost(x, 'negbin', 1, 0, x.map(() => 1), 4);
  assert.ok(Math.abs(plain(0, 6) - withE(0, 6)) < 1e-6);
  const season = [1.6, 1.4, 1.2, 1, 0.8, 0.5, 0.5];
  let pois = 0, nb = 0, hits = 0;
  for (let seed = 1800; seed < 1815; seed++) {
    const r = rng(seed);
    const gen = (step) => Array.from({ length: 210 }, (_, i) => poissons(r, 1, 10 * season[i % 7] * (step && i >= 105 ? 1.8 : 1) * Math.exp(0.35 * normals(r, 1)[0] - 0.06))[0]);
    const flat = gen(false);
    pois += analyze({ values: flat, model: 'poisson', period: 7 }).pelt.changepoints.length;
    nb += analyze({ values: flat, model: 'poisson', period: 7, overdispersion: 'nb' }).pelt.changepoints.length;
    if (analyze({ values: gen(true), model: 'poisson', period: 7, overdispersion: 'nb' }).pelt.changepoints.some((c) => Math.abs((c.index ?? c) - 105) <= 10)) hits++;
  }
  assert.ok(pois / 15 > 2 && nb / 15 < 0.5, `false changes per series: Poisson ${pois / 15}, NB ${nb / 15}`);
  assert.ok(hits >= 14, `step found on ${hits} of 15`);
  const g = analyze({ values: Array.from({ length: 140 }, (_, i) => poissons(rng(i + 9), 1, 8 * Math.exp(0.01 * i))[0]), model: 'poisson', trend: true, overdispersion: 'nb' });
  assert.ok(Array.isArray(g.pelt.changepoints));
});

test('negative-binomial BOCPD log evidence equals the closed-form Beta-NB marginal when the hazard vanishes', () => {
  const x = [3, 12, 7, 0, 25, 9, 14, 2, 8, 19];
  const r = 6, p = defaultNbPrior(x, r);
  const lg = lgamma;
  const lb = (a, b) => lgamma(a) + lgamma(b) - lgamma(a + b);
  const exact = x.reduce((s, v) => s + lg(v + r) - lg(r) - lg(v + 1), 0) + lb(p.alpha + r * x.length, p.beta + x.reduce((a, b) => a + b, 0)) - lb(p.alpha, p.beta);
  const b = bocpd(x, { hazardLambda: 1e15, prior: p, prune: 0, model: 'poisson', nbSize: r });
  assert.ok(Math.abs(b.logEvidence - exact) < 1e-6, `${b.logEvidence} vs ${exact}`);
});

test('--overdispersion nb reaches the Bayesian pass: clumpy counts keep the power a tempered Poisson loses', () => {
  let falseNb = 0, falseQ = 0, hitNb = 0, hitQ = 0;
  for (let seed = 2000; seed < 2020; seed++) {
    const r = rng(seed);
    const gen = (step) => Array.from({ length: 120 }, (_, i) => poissons(r, 1, 10 * (step && i >= 60 ? 3 : 1) * Math.exp(0.35 * normals(r, 1)[0] - 0.06))[0]);
    falseNb += analyze({ values: gen(false), model: 'poisson', overdispersion: 'nb' }).bocpd.detections.length;
    falseQ += analyze({ values: gen(false), model: 'poisson', overdispersion: true }).bocpd.detections.length;
    if (analyze({ values: gen(true), model: 'poisson', overdispersion: 'nb' }).bocpd.detections.some((d) => Math.abs(d.index - 60) <= 8)) hitNb++;
    if (analyze({ values: gen(true), model: 'poisson', overdispersion: true }).bocpd.detections.some((d) => Math.abs(d.index - 60) <= 8)) hitQ++;
  }
  assert.ok(falseNb / 20 < 0.3, `false flags per series ${falseNb / 20}`);
  assert.ok(hitNb >= 14 && hitNb > hitQ + 5, `NB found ${hitNb} of 20, quasi-Poisson ${hitQ}`);
});

// Red-team guards (2026-10-20): mutants in the penalty formula, the poissonTrend bend threshold and the joint knot grid escaped.
test('penaltyValue: Hannan-Quinn is 2k ln ln n, with the log-log floored at n = 3', () => {
  assert.ok(Math.abs(penaltyValue('hq', 100, 'mean') - 4 * Math.log(Math.log(100))) < 1e-12);
  assert.ok(Math.abs(penaltyValue('hannan-quinn', 100, 'meanvar') - 6 * Math.log(Math.log(100))) < 1e-12);
  assert.equal(penaltyValue('hq', 2, 'mean'), penaltyValue('hq', 3, 'mean'));
});

test('poissonTrend with bend: true finds a clear bend at the default scale', () => {
  const r = rng(4);
  const x = [];
  for (let t = 0; t < 120; t++) {
    const lam = 20 * Math.exp(0.01 * t + 0.8 * 0.02 * Math.max(0, t - 60));
    let L = Math.exp(-lam), k = 0, p = 1;
    do { k++; p *= r(); } while (p > L);
    x.push(k - 1);
  }
  const fit = poissonTrend(x, { bend: true });
  assert.ok(fit.knot !== undefined, 'a bend of this size should be accepted at the default scale');
  assert.ok(fit.slopeAfter > fit.g);
});

test('trendAdjust joint search reaches the last grid knot', () => {
  const r = rng(2);
  const n = 40, x = [];
  const nrm = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
  for (let t = 0; t < n; t++) x.push(0.02 * t + 0.15 * Math.max(0, t - 22) - 0.5 * Math.max(0, t - 36) + 0.2 * nrm());
  const fit = trendAdjust(x, { bend: 2, joint: true });
  assert.deepEqual(fit.knots, [16, 36]);
});

test('negative-binomial BOCPD with exposures: the grid evidence matches the Gamma-Poisson closed form as r grows, up to the prior mass the grid cuts off', () => {
  const x = [3, 5, 4, 6, 2, 7, 4, 5, 3, 6, 5, 4];
  const m = x.reduce((a, b) => a + b, 0) / x.length;
  const b = bocpd(x, { hazardLambda: 1e15, prune: 0, model: 'poisson', nbSize: 1e7, exposure: x.map(() => 1) });
  const exact = gammaPoissonLogMarginal(x, { alpha: 1, beta: 1 / m });
  // the grid spans m/10 to 10 m and renormalises the Gamma(1) prior: it drops the mass below m/10, 1 - exp(-0.1)
  const cut = -Math.log(Math.exp(-0.1) - Math.exp(-10));
  assert.ok(Math.abs(b.logEvidence - (exact + cut)) < 0.02, `${b.logEvidence} vs ${exact + cut}`);
});

test('--overdispersion nb --period reaches the Bayesian pass: weekly clumpy counts, a 3.5x step found without false flags', () => {
  const season = [1.6, 1.4, 1.2, 1, 0.8, 0.5, 0.5];
  let falseNb = 0, hitNb = 0, hitQ = 0;
  for (let seed = 1800; seed < 1812; seed++) {
    const r = rng(seed);
    const gen = (step) => Array.from({ length: 210 }, (_, i) => poissons(r, 1, 10 * season[i % 7] * (step && i >= 105 ? 3.5 : 1) * Math.exp(0.35 * normals(r, 1)[0] - 0.06))[0]);
    falseNb += analyze({ values: gen(false), model: 'poisson', period: 7, overdispersion: 'nb' }).bocpd.detections.length;
    const step = gen(true);
    if (analyze({ values: step, model: 'poisson', period: 7, overdispersion: 'nb' }).bocpd.detections.some((d) => Math.abs(d.index - 105) <= 8)) hitNb++;
    if (analyze({ values: step, model: 'poisson', period: 7, overdispersion: true }).bocpd.detections.some((d) => Math.abs(d.index - 105) <= 8)) hitQ++;
  }
  assert.ok(falseNb / 12 < 0.3, `false flags per series ${falseNb / 12}`);
  assert.ok(hitNb >= 9 && hitNb > hitQ + 3, `NB found ${hitNb} of 12, quasi-Poisson ${hitQ}`);
});

test('--overdispersion nb --trend reaches the Bayesian pass: clumpy counts on a ramp, a 3.5x step found without false flags', () => {
  let falseNb = 0, hitNb = 0, hitQ = 0;
  for (let seed = 1800; seed < 1812; seed++) {
    const r = rng(seed);
    const gen = (step) => Array.from({ length: 210 }, (_, i) => poissons(r, 1, 10 * Math.exp(0.004 * i) * (step && i >= 105 ? 3.5 : 1) * Math.exp(0.35 * normals(r, 1)[0] - 0.06))[0]);
    falseNb += analyze({ values: gen(false), model: 'poisson', trend: true, overdispersion: 'nb' }).bocpd.detections.length;
    const step = gen(true);
    if (analyze({ values: step, model: 'poisson', trend: true, overdispersion: 'nb' }).bocpd.detections.some((d) => Math.abs(d.index - 105) <= 8)) hitNb++;
    if (analyze({ values: step, model: 'poisson', trend: true, overdispersion: true }).bocpd.detections.some((d) => Math.abs(d.index - 105) <= 8)) hitQ++;
  }
  assert.ok(falseNb / 12 < 0.3, `false flags per series ${falseNb / 12}`);
  assert.ok(hitNb >= 8 && hitNb > hitQ, `NB found ${hitNb} of 12, quasi-Poisson ${hitQ}`);
});

test('count trend bends: two changes of growth rate are found, a straight log-linear series gets none', () => {
  const n = 240, N = 40;
  const pois = (r, l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  const lr = (t) => Math.log(8) + 0.01 * Math.min(t, 80) + 0.03 * Math.max(0, Math.min(t, 160) - 80) - 0.02 * Math.max(0, t - 160);
  let one = 0, two = 0, near = 0, falseBend = 0;
  for (let s = 0; s < N; s++) {
    const r = rng(2000 + s);
    const x = Array.from({ length: n }, (_, t) => pois(r, Math.exp(lr(t))));
    one += analyze({ values: x, model: 'poisson', trend: 'bend' }).pelt.changepoints.length;
    const a = analyze({ values: x, model: 'poisson', trend: 'bends' });
    two += a.pelt.changepoints.length;
    const k = a.trend.growthChangesAtAll;
    near += !!k && k.length >= 2 && Math.abs(k[0] - 80) <= 15 && Math.abs(k[1] - 160) <= 15;
    const r2 = rng(3000 + s);
    const y = Array.from({ length: n }, (_, t) => pois(r2, Math.exp(Math.log(8) + 0.012 * t)));
    falseBend += analyze({ values: y, model: 'poisson', trend: 'bends' }).trend.growthChangesAt !== undefined;
  }
  // measured: 4.08 changes/series with one bend, 1.77 with bends; both knots within 15 points on 23 of 40; false bends 0 of 40
  console.log(`# count bends: ${one / N} -> ${two / N}; both knots ${near}/${N}; false bends ${falseBend}`);
  assert.ok(two < 0.6 * one && near >= 18 && falseBend <= 1);
});

test('negative-binomial cost with a season matches the per-point cost it replaces', () => {
  // Seven distinct exposures take the per-class prefix-sum path; a 1e-12 drift per point makes every exposure
  // distinct and forces the O(segment length) path. Same costs to rounding, same changes.
  const r = rng(11);
  const WEEKLY = [1, 1.1, 1.2, 1.0, 0.9, 0.5, 0.4];
  const n = 210;
  const exposure = Array.from({ length: n }, (_, t) => WEEKLY[t % 7]);
  const drifted = exposure.map((e, t) => e + 1e-12 * t);
  const x = exposure.map((e, t) => Math.round((t < 100 ? 6 : 15) * e * (0.5 + r())));
  const fast = makeCost(x, 'negbin', 1, 0, exposure, 3);
  const slow = makeCost(x, 'negbin', 1, 0, drifted, 3);
  for (const [s, t] of [[0, 10], [0, 100], [37, 180], [100, 210], [5, 6]]) {
    assert.ok(Math.abs(fast(s, t) - slow(s, t)) < 1e-6 * Math.max(1, Math.abs(slow(s, t))), `segment ${s}..${t}`);
  }
  assert.deepEqual(pelt(x, { model: 'negbin', size: 3, exposure }).changepoints, pelt(x, { model: 'negbin', size: 3, exposure: drifted }).changepoints);
});

test('known holidays: one fitted factor keeps the dips from reading as steps, and a planted step still shows', () => {
  const r = rng(77);
  const pois = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  const n = 200, hol = [];
  for (let i = 9; i < n; i += 17) hol.push(i);
  const x = Array.from({ length: n }, (_, t) => pois(40 * (t >= 100 ? 1.5 : 1) * (hol.includes(t) ? 0.3 : 1)));
  const plain = analyze({ values: x, model: 'poisson' });
  const withHol = analyze({ values: x, model: 'poisson', holidays: hol.map((h) => h + 1) });
  assert.ok(plain.pelt.changepoints.length > 2, 'without the calendar the dips are cut into steps');
  assert.ok(Math.abs(withHol.holidays.factor - 0.3) < 0.08, `factor ${withHol.holidays.factor}`);
  assert.ok(withHol.pelt.changepoints.some((c) => Math.abs(c.index - 100) <= 5));
  assert.ok(withHol.pelt.changepoints.length <= 2);
  assert.equal(withHol.holidays.count, hol.length);
  assert.ok(poissonHolidays(x, hol).exposure.every((e, t) => e === (hol.includes(t) ? poissonHolidays(x, hol).factor : 1)));
});

test('known holidays on one weekday are held out of the seasonal factors', () => {
  const r = rng(5);
  const week = [1.3, 1.0, 1.0, 0.9, 1.1, 0.8, 0.9], n = 224, hol = [];
  for (let i = 14; i < n; i += 28) hol.push(i);
  const x = Array.from({ length: n }, (_, t) => { const l = 40 * week[t % 7] * (hol.includes(t) ? 0.3 : 1); let u = 0; for (let i = 0; i < 12; i++) u += r(); return Math.max(0, Math.round(l + Math.sqrt(l) * (u - 6))); });
  const held = poissonSeasonal(x, 7, { skip: new Set(hol) });
  const leaky = poissonSeasonal(x, 7);
  assert.ok(Math.abs(held.factors[0] - 1.3 / 1.0) < 0.15 * 1.3, `held-out busy-day factor ${held.factors[0]}`);
  assert.ok(leaky.factors[0] < held.factors[0], 'without holding out, the holidays drag their weekday down');
  assert.ok(Math.abs(analyze({ values: x, model: 'poisson', period: 7, holidays: hol.map((h) => h + 1) }).holidays.factor - 0.3) < 0.06);
});

test('known holidays: input errors are plain', () => {
  const x = Array.from({ length: 40 }, () => 10);
  assert.throws(() => analyze({ values: x, model: 'poisson', holidays: ['3'] }), /at least 2/);
  assert.throws(() => analyze({ values: x, model: 'poisson', holidays: ['3', '99'] }), /not a row label/);
  assert.throws(() => analyze({ values: x, model: 'mean', holidays: ['3', '9'] }), /counts/);
});

test('known holidays: a factor per kind recovers two different dips', () => {
  const rng = (() => { let s = 7; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
  const pois = (m) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L); return k - 1; };
  const n = 240, a = [], b = [];
  for (let t = 0; t < n; t++) { if (t % 17 === 5) a.push(t); else if (t % 23 === 11) b.push(t); }
  const x = Array.from({ length: n }, (_, t) => pois(40 * (a.includes(t) ? 0.3 : b.includes(t) ? 1.8 : 1)));
  const kinds = [...a.map(() => 'closed'), ...b.map(() => 'sale')];
  const r = analyze({ values: x, model: 'poisson', holidays: [...a, ...b].map((h, j) => `${h + 1}=${kinds[j]}`) });
  const f = Object.fromEntries(r.holidays.kinds.map((k) => [k.kind, k.factor]));
  assert.ok(Math.abs(f.closed - 0.3) < 0.1, `closed ${f.closed}`);
  assert.ok(Math.abs(f.sale - 1.8) < 0.3, `sale ${f.sale}`);
  assert.throws(() => analyze({ values: x, model: 'poisson', holidays: ['3=a', '9=a', '12=b'] }), /kind "b"/);
});

test('known holidays with a season: alternating keeps the planted step, adds no changes, and tracks the weekly shape at least as well', () => {
  const week = [1.3, 1.0, 1.0, 0.9, 1.1, 0.8, 0.9], n = 224;
  const rng = (() => { let s = 11; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
  const hol = []; for (let i = 14; i < n; i += 28) hol.push(i);
  const x = Array.from({ length: n }, (_, t) => { let u = 0; for (let i = 0; i < 12; i++) u += rng(); const l = 40 * week[t % 7] * (hol.includes(t) ? 0.3 : 1) * (t >= 120 ? 1.5 : 1); return Math.max(0, Math.round(l + Math.sqrt(l) * (u - 6))); });
  const run = (extra) => analyze({ values: x, model: 'poisson', period: 7, holidays: hol.map((h) => h + 1), ...extra });
  const on = run({}), off = run({ noHolidayAlternation: true });
  assert.equal(on.pelt.changepoints.length, 1);
  assert.ok(Math.abs(on.pelt.changepoints[0].index - 120) <= 4);
  assert.ok(Math.abs(on.holidays.factor - 0.3) < 0.08, `factor ${on.holidays.factor}`);
  const mean = week.reduce((a, b) => a + b) / 7;
  const err = (r) => Math.max(...week.map((w, i) => Math.abs(r.seasonal.profile[i] - w / mean)));
  assert.ok(err(on) <= err(off) + 0.01, `alternating ${err(on)} vs ${err(off)}`);
});

test('lsKnots (prefix sums) picks the same pair as a brute-force pass over lineRss', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = rng(seed), n = 90, z = normals(r, n);
    const x = Array.from({ length: n }, (_, t) => 5 + 0.02 * t + 0.06 * Math.max(0, t - 35) - 0.1 * Math.max(0, t - 60) + z[t] * 0.5 + 100);
    let best = null;
    for (let a = 9; a <= 81; a++) for (let b = a + 13; b <= 81; b++) {
      const rss = lineRss(x, [a, b]);
      if (!best || rss < best.rss) best = { rss, knots: [a, b] };
    }
    assert.deepEqual(lsKnots(x, 9, 81, 13), best.knots, `seed ${seed}`);
  }
});

test('findBursts flags an isolated spike but not a step', () => {
  const flat = Array.from({ length: 60 }, (_, i) => 20 + (i % 3));
  flat[30] = 90;
  const b = findBursts(flat);
  assert.deepEqual(b.indexes, [30]);
  assert.ok(b.counts[30] <= 22);
  const step = flat.map((v, i) => (i >= 30 ? 60 + (i % 3) : 20 + (i % 3)));
  assert.deepEqual(findBursts(step).indexes, []);
});

test('--bursts stops a spike being read as two changes', () => {
  const x = Array.from({ length: 80 }, (_, i) => 30 + ((i * 7) % 5));
  x[40] = 160;
  const off = analyze({ values: x, model: 'poisson' });
  const on = analyze({ values: x, model: 'poisson', bursts: true });
  assert.ok(off.pelt.changepoints.length >= 2);
  assert.equal(on.pelt.changepoints.length, 0);
  assert.equal(on.bursts[0].index, 40);
  assert.equal(on.values[40], 160);
  assert.throws(() => analyze({ values: x, bursts: true }), /counts/);
});

test('negbinSize sizes a clumpy series from its first differences', () => {
  const x = Array.from({ length: 12 }, (_, i) => (i % 2 ? 20 : 0));
  const r = negbinSize(x);
  assert.ok(Number.isFinite(r));
  assert.ok(Math.abs(r - 100 / (400 / 0.9098 - 10)) < 1e-9);
});

test('findBursts needs both the ratio and a Poisson-sized excess', () => {
  const small = Array(12).fill(0); small[6] = 3; // 3 >= 2.5 x 1, but the excess 3 is within Poisson noise
  assert.deepEqual(findBursts(small).indexes, []);
  const big = Array(12).fill(100); big[6] = 145; // excess 45 is large, but only 1.45 x the neighbours
  assert.deepEqual(findBursts(big).indexes, []);
});

test('negbinSize counts every first difference, the first included', () => {
  // four calm differences against three jumps: the median is 0, so there is no excess spread to fit
  assert.equal(negbinSize([5, 5, 5, 5, 5, 25, 5, 25]), Infinity);
});

test('seasonalAdjust accepts a period of exactly 2, the smallest cycle', () => {
  const { adjusted, profile } = seasonalAdjust([1, 3, 1, 3, 1, 3, 1, 3], 2);
  assert.equal(profile.length, 2);
  assert.equal(adjusted.length, 8);
});

test('ar1mean cost of a perfectly constant segment is only the stationary-start term', () => {
  // x = 5 throughout: the fitted mean explains it exactly, so the residual is 0 and the cost is -log(1 - rho^2).
  const rho = 0.5;
  const cost = makeCost(Array(10).fill(5), 'ar1mean', 1, rho);
  assert.ok(Math.abs(cost(0, 10) - -Math.log(1 - rho * rho)) < 1e-9);
});

test('--burst-runs cuts a 3-day plateau that single-day bursts miss, and leaves a step alone', () => {
  const base = Array.from({ length: 80 }, (_, i) => 30 + ((i * 7) % 5));
  const run = base.slice(); for (const i of [40, 41, 42]) run[i] = 75;
  const one = analyze({ values: run, model: 'poisson', bursts: true });
  const many = analyze({ values: run, model: 'poisson', bursts: true, burstRuns: 5 });
  assert.equal(one.bursts.length, 0);
  assert.deepEqual(many.bursts.map((b) => b.index), [40, 41, 42]);
  assert.ok(many.pelt.changepoints.length < one.pelt.changepoints.length);
  const step = base.map((v, i) => (i >= 40 ? Math.round(v * 2.5) : v));
  assert.equal(analyze({ values: step, model: 'poisson', bursts: true, burstRuns: 5 }).bursts.length, 0);
});

test('each change carries a 95% range that holds the planted date and narrows with a bigger shift', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const width = (shift) => {
    const x = Array.from({ length: 160 }, (_, t) => gauss() + (t >= 80 ? shift : 0));
    const r = analyze({ values: x }).pelt.changepoints[0].range95;
    assert.ok(r.fromIndex <= 80 && 80 <= r.toIndex, `range ${r.fromIndex}-${r.toIndex} should hold 80`);
    return r.toIndex - r.fromIndex;
  };
  assert.ok(width(4) <= width(1.5));
  const nile = analyze({ csv: readFileSync(new URL('./data/nile.csv', import.meta.url), 'utf8') }).pelt.changepoints[0];
  assert.ok(nile.range95.fromIndex <= nile.index && nile.index <= nile.range95.toIndex);
  assert.equal(analyze({ csv: readFileSync(new URL('./data/nile.csv', import.meta.url), 'utf8'), intervals: false }).pelt.changepoints[0].range95, undefined);
});

test('sticky series without --ar1 carry a range warning, white noise and --ar1 do not', () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const make = (rho) => { let e = gauss(); return Array.from({ length: 200 }, (_, t) => { e = rho * e + Math.sqrt(1 - rho * rho) * gauss(); return e + (t >= 100 ? 2 : 0); }); };
  assert.ok(analyze({ values: make(0.7) }).rangeWarning);
  assert.equal(analyze({ values: make(0) }).rangeWarning, undefined);
  assert.equal(analyze({ values: make(0.7), ar1: true }).rangeWarning, undefined);
});

test('clumpy counts under the plain Poisson cost carry a range warning, the nb cost and clean Poisson counts do not', () => {
  let seed = 5;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
  // a clumpy count: a Poisson draw whose mean is multiplied by a random factor of mean 1 (variance 0.3)
  const pois = (m) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
  const clumpy = Array.from({ length: 200 }, (_, t) => pois((t >= 100 ? 20 : 10) * (0.05 + 1.9 * rnd())));
  const clean = Array.from({ length: 200 }, (_, t) => pois(t >= 100 ? 20 : 10));
  assert.match(analyze({ values: clumpy, model: 'poisson' }).rangeWarning, /negative-binomial/);
  assert.equal(analyze({ values: clumpy, model: 'poisson', overdispersion: 'nb' }).rangeWarning, undefined);
  assert.equal(analyze({ values: clean, model: 'poisson' }).rangeWarning, undefined);
});

test('a slope change carries a 95% range that holds the planted bend', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const at = 100;
  const x = Array.from({ length: 200 }, (_, t) => 0.1 * t + 0.25 * Math.max(0, t - at) + gauss());
  const r = analyze({ values: x, trend: 'bend' }).trend;
  assert.equal(r.slopeChangeRange95.length, 1);
  const c = r.slopeChangeRange95[0];
  assert.ok(c.fromIndex <= r.slopeChangesAt && r.slopeChangesAt <= c.toIndex);
  assert.ok(c.fromIndex <= at && at <= c.toIndex, `range ${c.fromIndex}-${c.toIndex}`);
  assert.ok(c.toIndex - c.fromIndex < 60);
  assert.equal(analyze({ values: x.map((_, t) => 0.1 * t + gauss()), trend: 'bend' }).trend.slopeChangeRange95, undefined);
});

test('a change of growth rate in counts carries a 95% range that holds the planted bend', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
  const pois = (m) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
  const at = 100;
  const x = Array.from({ length: 200 }, (_, t) => pois(Math.exp(2 + 0.004 * t + 0.025 * Math.max(0, t - at))));
  const r = analyze({ values: x, model: 'poisson', trend: 'bend' }).trend;
  assert.equal(r.growthChangeRange95.length, 1);
  const c = r.growthChangeRange95[0];
  assert.ok(c.fromIndex <= r.growthChangesAt && r.growthChangesAt <= c.toIndex);
  // coverage of the planted point is measured in eval/growth-change-interval.mjs (about 86%); here the knot must be near it
  assert.ok(Math.abs(r.growthChangesAt - at) <= 10 && Math.abs(c.fromIndex - at) <= 40 && Math.abs(c.toIndex - at) <= 40, `range ${c.fromIndex}-${c.toIndex}`);
  assert.ok(c.toIndex - c.fromIndex < 60);
  const flat = Array.from({ length: 200 }, (_, t) => pois(Math.exp(2 + 0.004 * t)));
  assert.equal(analyze({ values: flat, model: 'poisson', trend: 'bend' }).trend.growthChangeRange95, undefined);
});

test('garchSigma: constant for white noise, rises after a volatility burst', async () => {
  const { garchSigma } = await import('./engine.mjs');
  let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const g = () => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
  const white = Array.from({ length: 200 }, g);
  const sg = garchSigma(white);
  assert.equal(sg.length, 200);
  assert.ok(sg.every((v) => v > 0 && isFinite(v)));
  const burst = white.map((v, i) => (i >= 100 && i < 110 ? 6 * v : v));
  const sb = garchSigma(burst);
  assert.ok(sb[110] > sb[90]);
});
