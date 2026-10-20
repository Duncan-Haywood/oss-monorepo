import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAPERS, DEFAULTS, analyze, bocpd, defaultPoissonPrior, defaultPrior, gammaPoissonLogMarginal, makeCost, lgamma, nigLogMarginal, optimalPartitioning, parseSeries, peaks, pelt, robustSd,
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
