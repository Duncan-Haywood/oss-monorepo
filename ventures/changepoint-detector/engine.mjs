// Changepoint detection for a numeric series: when did its level or its
// volatility change, and how sure can we be?
//
// Two methods from the literature, run side by side:
//
//  * PELT (Killick, Fearnhead & Eckley 2012): the exact minimum of
//    -2 log-likelihood + penalty x (number of changes) over every possible
//    segmentation, found in about linear time by pruning candidates that can
//    never be optimal. Gives the segmentation.
//  * Bayesian online changepoint detection (Adams & MacKay 2007): a posterior
//    over the "run length" (time since the last change) updated one point at a
//    time, with a Normal-Inverse-Gamma prior on each segment's mean and
//    variance. Gives a probability for each candidate change.
//
// Pure functions, no DOM, no network, no randomness: the same input always
// gives the same output, in the browser, the CLI and `platform/agents/tools.mjs`.

import { NILE_CSV } from './example-data.mjs';

export const PAPERS = [
  {
    authors: 'Ryan Prescott Adams and David J. C. MacKay',
    title: 'Bayesian Online Changepoint Detection',
    venue: 'arXiv preprint arXiv:0710.3742',
    year: 2007,
    url: 'https://arxiv.org/abs/0710.3742',
    implemented:
      'The run-length recursion (Algorithm 1) with a constant hazard 1/lambda and a Normal-Inverse-Gamma conjugate model, so each segment has an unknown mean and variance and the predictive is Student-t.',
    deviations:
      'The prior is centred on the data (median and robust variance), an empirical-Bayes choice the paper leaves open. Run lengths whose posterior mass falls below 1e-10 are pruned. Because P(r_t = 0) equals the hazard under a constant hazard, a change is reported as the probability, seen `lag` points later, that the run started at that point.',
    bibtex: `@article{adams2007bayesian,
  title   = {Bayesian Online Changepoint Detection},
  author  = {Adams, Ryan Prescott and MacKay, David J. C.},
  journal = {arXiv preprint arXiv:0710.3742},
  year    = {2007}
}`,
  },
  {
    authors: 'Rebecca Killick, Paul Fearnhead and Idris A. Eckley',
    title: 'Optimal Detection of Changepoints With a Linear Computational Cost',
    venue: 'Journal of the American Statistical Association 107(500): 1590-1598',
    year: 2012,
    url: 'https://arxiv.org/abs/1101.1438',
    doi: '10.1080/01621459.2012.737745',
    implemented:
      'PELT with Gaussian -2 log-likelihood costs for a change in mean (variance estimated once, robustly) or in mean and variance, and K = 0 in the pruning rule, which is valid for these costs.',
    deviations:
      'The known variance of the mean-only model is estimated from the median absolute difference of successive points, so a few level shifts do not inflate it.',
    bibtex: `@article{killick2012optimal,
  title   = {Optimal Detection of Changepoints With a Linear Computational Cost},
  author  = {Killick, Rebecca and Fearnhead, Paul and Eckley, Idris A.},
  journal = {Journal of the American Statistical Association},
  volume  = {107},
  number  = {500},
  pages   = {1590--1598},
  year    = {2012},
  doi     = {10.1080/01621459.2012.737745}
}`,
  },
];

export const DEFAULTS = {
  // CSV text: one numeric column, or a label/time column and a value column.
  csv: NILE_CSV,
  // Value column by header name or 0-based index; null picks the last numeric column.
  column: null,
  // Label column (years, dates) by name or index; null uses the first column if it is not the value column.
  labelColumn: null,
  // 'mean': change in level only. 'meanvar': change in level and/or volatility.
  model: 'mean',
  // 'bic', 'aic', 'hannan-quinn', or a number (the cost of one extra change).
  penalty: 'bic',
  // Shortest segment PELT may return; null means 2 for 'mean' and 5 for
  // 'meanvar', where a variance fitted to two or three points is so unreliable
  // that its likelihood gain alone would justify a change.
  minSegment: null,
  // BOCPD prior expected run length (1 / hazard), in points.
  hazardLambda: 100,
  // BOCPD looks this many points past a candidate before scoring it.
  lag: 5,
  // BOCPD reports candidates whose probability reaches this.
  threshold: 0.5,
};

// ---------------------------------------------------------------- input

/** Split one CSV line, honouring double quotes. */
function splitLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t' || c === ';') { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const num = (s) => {
  if (s == null) return NaN;
  const t = String(s).replace(/[$,\s]/g, '');
  return t === '' ? NaN : Number(t);
};

/**
 * Parse CSV text into { labels, values, column, skipped }. A header row is
 * detected when its value cell is not a number. Rows whose value is blank or
 * not numeric are skipped and counted.
 */
export function parseSeries(csv, column = null, labelColumn = null) {
  const lines = String(csv ?? '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) throw new Error('No data: paste a column of numbers or a CSV.');
  const rows = lines.map(splitLine);
  const width = Math.max(...rows.map((r) => r.length));
  const first = rows[0];
  const header = first.some((c) => c !== '' && Number.isNaN(num(c))) ? first : null;
  const body = header ? rows.slice(1) : rows;
  const resolve = (ref) => {
    if (ref == null || ref === '') return null;
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
      const i = Number(ref);
      if (i < 0 || i >= width) throw new Error(`Column ${i} does not exist (the data has ${width}).`);
      return i;
    }
    const i = header ? header.findIndex((h) => h.toLowerCase() === String(ref).toLowerCase()) : -1;
    if (i < 0) throw new Error(`No column named "${ref}".`);
    return i;
  };
  let vi = resolve(column);
  if (vi == null) {
    for (let c = width - 1; c >= 0 && vi == null; c--) {
      const ok = body.filter((r) => Number.isFinite(num(r[c]))).length;
      if (ok >= Math.max(1, body.length / 2)) vi = c;
    }
    if (vi == null) throw new Error('No numeric column found.');
  }
  let li = resolve(labelColumn);
  if (li == null && width > 1 && vi !== 0) li = 0;
  const labels = [];
  const values = [];
  let skipped = 0;
  body.forEach((r, i) => {
    const v = num(r[vi]);
    if (!Number.isFinite(v)) { skipped++; return; }
    values.push(v);
    labels.push(li == null ? String(i + 1) : (r[li] ?? String(i + 1)));
  });
  return { labels, values, column: header ? header[vi] : `column ${vi}`, skipped };
}

// ---------------------------------------------------------------- helpers

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Robust noise sd from successive differences: MAD(diff) / (0.6745 * sqrt 2). Immune to a few level shifts. */
export function robustSd(x) {
  if (x.length < 3) return 1;
  const d = [];
  for (let i = 1; i < x.length; i++) d.push(x[i] - x[i - 1]);
  const md = median(d);
  const mad = median(d.map((v) => Math.abs(v - md)));
  const sd = mad / (0.6744897501960817 * Math.SQRT2);
  if (sd > 0) return sd;
  const mu = x.reduce((s, v) => s + v, 0) / x.length;
  const v = x.reduce((s, y) => s + (y - mu) ** 2, 0) / x.length;
  return Math.sqrt(v) || 1;
}

function lgamma(z) {
  // Lanczos approximation (g = 7, n = 9), accurate to ~1e-15 for z > 0.
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}
export { lgamma };

// ---------------------------------------------------------------- PELT

/**
 * Segment cost function over prefix sums. cost(s, t) is -2 log-likelihood of
 * x[s..t) under the model, maximised over the segment's parameters.
 */
export function makeCost(x, model = 'mean', sigma = robustSd(x)) {
  const n = x.length;
  const S1 = new Float64Array(n + 1);
  const S2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { S1[i + 1] = S1[i] + x[i]; S2[i + 1] = S2[i] + x[i] * x[i]; }
  if (model === 'mean') {
    const s2 = sigma * sigma;
    // Constant n*log(2*pi*sigma^2) terms sum to the same total for every segmentation, so they are dropped.
    return (s, t) => {
      const m = t - s;
      const a = S1[t] - S1[s];
      return Math.max(0, S2[t] - S2[s] - (a * a) / m) / s2;
    };
  }
  if (model === 'meanvar') {
    // Floor the variance so a run of identical values cannot drive the cost to -infinity.
    const floor = Math.max(1e-12, (sigma * 1e-3) ** 2);
    return (s, t) => {
      const m = t - s;
      const a = S1[t] - S1[s];
      const v = Math.max(floor, (S2[t] - S2[s] - (a * a) / m) / m);
      return m * (Math.log(2 * Math.PI * v) + 1);
    };
  }
  throw new Error(`Unknown model "${model}": use "mean" or "meanvar".`);
}

/** Penalty per extra change. Parameters added by one change: its location plus the new segment's parameters. */
export function penaltyValue(penalty, n, model) {
  if (typeof penalty === 'number' && Number.isFinite(penalty) && penalty >= 0) return penalty;
  if (typeof penalty === 'string' && /^\d+(\.\d+)?$/.test(penalty.trim())) return Number(penalty);
  const k = model === 'meanvar' ? 3 : 2;
  switch (String(penalty).toLowerCase()) {
    case 'bic': return k * Math.log(n);
    case 'aic': return 2 * k;
    case 'hannan-quinn': case 'hq': return 2 * k * Math.log(Math.log(Math.max(n, 3)));
    default: throw new Error(`Unknown penalty "${penalty}": use bic, aic, hannan-quinn or a number.`);
  }
}

/**
 * PELT. Returns change locations as indices i where a new segment starts at
 * x[i] (so 0 < i < n), sorted, plus the optimal total cost.
 */
export function pelt(x, { model = 'mean', penalty = 'bic', minSegment = 2, sigma } = {}) {
  const n = x.length;
  const beta = penaltyValue(penalty, n, model);
  const minSeg = Math.max(1, Math.floor(minSegment));
  const cost = makeCost(x, model, sigma ?? robustSd(x));
  if (n < 2 * minSeg) return { changepoints: [], cost: n ? cost(0, n) : 0, penalty: beta };
  const F = new Float64Array(n + 1).fill(Infinity);
  const last = new Int32Array(n + 1).fill(-1);
  F[0] = -beta;
  let R = [0];
  for (let t = minSeg; t <= n; t++) {
    let best = Infinity;
    let arg = -1;
    const vals = [];
    for (const s of R) {
      if (t - s < minSeg) { vals.push(null); continue; }
      const v = F[s] + cost(s, t) + beta;
      vals.push(v);
      if (v < best) { best = v; arg = s; }
    }
    F[t] = best;
    last[t] = arg;
    // Prune: s can never be the last change for any t' > t if F(s) + C(s,t) > F(t) (K = 0).
    const next = [];
    R.forEach((s, i) => { if (vals[i] === null || vals[i] - beta <= best) next.push(s); });
    if (Number.isFinite(F[t])) next.push(t);
    R = next;
  }
  const cps = [];
  for (let t = n; last[t] > 0; t = last[t]) cps.push(last[t]);
  cps.reverse();
  return { changepoints: cps, cost: F[n], penalty: beta };
}

/** O(n^2) optimal partitioning with no pruning: the reference PELT must match (tests). */
export function optimalPartitioning(x, { model = 'mean', penalty = 'bic', minSegment = 2, sigma } = {}) {
  const n = x.length;
  const beta = penaltyValue(penalty, n, model);
  const cost = makeCost(x, model, sigma ?? robustSd(x));
  const F = new Float64Array(n + 1).fill(Infinity);
  const last = new Int32Array(n + 1).fill(-1);
  F[0] = -beta;
  for (let t = minSegment; t <= n; t++) {
    for (let s = 0; s <= t - minSegment; s++) {
      if (s > 0 && s < minSegment) continue;
      if (!Number.isFinite(F[s])) continue;
      const v = F[s] + cost(s, t) + beta;
      if (v < F[t]) { F[t] = v; last[t] = s; }
    }
  }
  const cps = [];
  for (let t = n; last[t] > 0; t = last[t]) cps.push(last[t]);
  return { changepoints: cps.reverse(), cost: F[n], penalty: beta };
}

// ---------------------------------------------------------------- BOCPD

/**
 * Bayesian online changepoint detection with a constant hazard and a
 * Normal-Inverse-Gamma prior (mu0, kappa0, alpha0, beta0).
 *
 * Returns, for each t, the MAP run length after seeing x[t], and
 * `changeProb[i]`: the posterior probability, given x[0..i+lag], that a new
 * segment started at x[i]. Also returns the log evidence sum log p(x_t | x_<t).
 */
export function bocpd(x, { hazardLambda = 100, lag = 5, prior, prune = 1e-10 } = {}) {
  const n = x.length;
  const H = 1 / Math.max(1, hazardLambda);
  const p0 = prior ?? defaultPrior(x);
  // Parallel arrays over current run lengths r = 0..R-1 (index = run length, possibly pruned to a tail).
  let mu = [p0.mu];
  let kappa = [p0.kappa];
  let alpha = [p0.alpha];
  let beta = [p0.beta];
  let rl = [0];
  let logR = [0];
  const mapRun = new Int32Array(n);
  const expRun = new Float64Array(n);
  const changeProb = new Float64Array(n);
  // Posterior P(r_t = r) for the last lag + 1 steps, as maps keyed by run length.
  const window = [];
  let logEvidence = 0;
  for (let t = 0; t < n; t++) {
    const xt = x[t];
    const m = rl.length;
    const logPred = new Float64Array(m);
    for (let i = 0; i < m; i++) logPred[i] = studentLogPdf(xt, mu[i], kappa[i], alpha[i], beta[i]);
    // Growth and changepoint masses (log space).
    const grow = new Float64Array(m);
    let cpTerms = -Infinity;
    for (let i = 0; i < m; i++) {
      const a = logR[i] + logPred[i];
      grow[i] = a + Math.log1p(-H);
      cpTerms = logAdd(cpTerms, a + Math.log(H));
    }
    // New run-length list: 0 then each old run length + 1.
    let nrl = [0, ...rl.map((r) => r + 1)];
    let nlog = [cpTerms, ...grow];
    let nmu = [p0.mu], nk = [p0.kappa], na = [p0.alpha], nb = [p0.beta];
    for (let i = 0; i < m; i++) {
      const k1 = kappa[i] + 1;
      nmu.push((kappa[i] * mu[i] + xt) / k1);
      nk.push(k1);
      na.push(alpha[i] + 0.5);
      nb.push(beta[i] + (kappa[i] * (xt - mu[i]) ** 2) / (2 * k1));
    }
    let z = -Infinity;
    for (const v of nlog) z = logAdd(z, v);
    logEvidence += z;
    nlog = nlog.map((v) => v - z);
    // Prune negligible run lengths, always keeping r = 0.
    const keep = nlog.map((v, i) => i === 0 || v > Math.log(prune));
    if (keep.some((k) => !k)) {
      const f = (arr) => arr.filter((_, i) => keep[i]);
      nrl = f(nrl); nmu = f(nmu); nk = f(nk); na = f(na); nb = f(nb); nlog = f(nlog);
      let z2 = -Infinity;
      for (const v of nlog) z2 = logAdd(z2, v);
      nlog = nlog.map((v) => v - z2);
    }
    rl = nrl; mu = nmu; kappa = nk; alpha = na; beta = nb; logR = nlog;
    let best = 0, bestV = -Infinity, e = 0;
    const post = new Map();
    for (let i = 0; i < rl.length; i++) {
      const p = Math.exp(logR[i]);
      post.set(rl[i], p);
      e += p * rl[i];
      if (logR[i] > bestV) { bestV = logR[i]; best = rl[i]; }
    }
    mapRun[t] = best;
    expRun[t] = e;
    window.push(post);
    if (window.length > lag + 1) window.shift();
    // r_t counts the points of the current run up to and including x[t], so
    // the run started at x[t - lag] iff r_t = lag + 1.
    if (t - lag >= 1) changeProb[t - lag] = post.get(lag + 1) ?? 0;
  }
  // Points within `lag` of the end are scored with the data available.
  for (let i = Math.max(0, n - lag); i < n; i++) {
    changeProb[i] = window[window.length - 1]?.get(n - i) ?? 0;
  }
  changeProb[0] = 0; // The series starts a segment by definition; not a change.
  return { mapRun: [...mapRun], expectedRun: [...expRun], changeProb: [...changeProb], logEvidence, prior: p0, hazard: H };
}

/** Prior centred on the data: mean at the median, variance at the robust noise variance, weak (kappa=0.1, alpha=1). */
export function defaultPrior(x) {
  const sd = robustSd(x);
  return { mu: x.length ? median(x) : 0, kappa: 0.1, alpha: 1, beta: sd * sd };
}

function studentLogPdf(x, mu, kappa, alpha, beta) {
  const nu = 2 * alpha;
  const scale2 = (beta * (kappa + 1)) / (alpha * kappa);
  const z = (x - mu) ** 2 / (nu * scale2);
  return lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI * scale2) - ((nu + 1) / 2) * Math.log1p(z);
}

function logAdd(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  return a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b));
}

/** Closed-form log marginal likelihood of x under one Normal-Inverse-Gamma segment (test reference for hazard -> 0). */
export function nigLogMarginal(x, { mu, kappa, alpha, beta }) {
  const n = x.length;
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const ss = x.reduce((s, v) => s + (v - mean) ** 2, 0);
  const kn = kappa + n;
  const an = alpha + n / 2;
  const bn = beta + ss / 2 + (kappa * n * (mean - mu) ** 2) / (2 * kn);
  return lgamma(an) - lgamma(alpha) + alpha * Math.log(beta) - an * Math.log(bn) + 0.5 * (Math.log(kappa) - Math.log(kn)) - (n / 2) * Math.log(2 * Math.PI);
}

/** Local maxima of changeProb at or above threshold, at least `gap` apart (strongest kept). */
export function peaks(prob, threshold = 0.5, gap = 3) {
  const cand = [];
  for (let i = 1; i < prob.length; i++) {
    if (prob[i] < threshold) continue;
    if ((prob[i - 1] ?? 0) > prob[i] || (prob[i + 1] ?? 0) > prob[i]) continue;
    cand.push(i);
  }
  cand.sort((a, b) => prob[b] - prob[a]);
  const kept = [];
  for (const i of cand) if (kept.every((k) => Math.abs(k - i) >= gap)) kept.push(i);
  return kept.sort((a, b) => a - b);
}

// ---------------------------------------------------------------- analyze

function stats(a) {
  const n = a.length;
  const mean = a.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd };
}

const round = (v, d = 4) => (Number.isFinite(v) ? Number(v.toPrecision(d + 2)) : v);
const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));

/**
 * Run both methods on a series. Input: DEFAULTS overlaid with the caller's
 * fields; `values` (array of numbers) may replace `csv`.
 */
export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  let labels, values, column, skipped = 0;
  if (Array.isArray(o.values)) {
    values = o.values.map(Number).filter(Number.isFinite);
    labels = Array.isArray(o.labels) ? o.labels.map(String) : values.map((_, i) => String(i + 1));
    column = 'values';
    skipped = o.values.length - values.length;
  } else {
    ({ labels, values, column, skipped } = parseSeries(o.csv, o.column, o.labelColumn));
  }
  if (values.length < 4) throw new Error(`Need at least 4 numbers; got ${values.length}.`);
  if (values.length > 100000) throw new Error('More than 100,000 points: aggregate the series first.');
  const model = o.model === 'meanvar' ? 'meanvar' : 'mean';
  const sigma = robustSd(values);
  const minSegment = Math.max(1, Math.floor(Number(o.minSegment) || (model === 'meanvar' ? 5 : 2)));
  const p = pelt(values, { model, penalty: o.penalty, minSegment, sigma });
  const bounds = [0, ...p.changepoints, values.length];
  const segments = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const s = stats(values.slice(bounds[i], bounds[i + 1]));
    segments.push({ start: bounds[i], end: bounds[i + 1] - 1, from: labels[bounds[i]], to: labels[bounds[i + 1] - 1], n: s.n, mean: round(s.mean), sd: round(s.sd) });
  }
  const b = bocpd(values, { hazardLambda: Number(o.hazardLambda) || 100, lag: Math.max(1, Math.floor(Number(o.lag) || 5)) });
  const det = peaks(b.changeProb, Number(o.threshold) || 0.5);
  const changes = p.changepoints.map((i, k) => {
    const before = segments[k];
    const after = segments[k + 1];
    let near = 0;
    for (let j = Math.max(1, i - 3); j <= Math.min(values.length - 1, i + 3); j++) near = Math.max(near, b.changeProb[j]);
    return {
      index: i,
      label: labels[i],
      lastBefore: labels[i - 1],
      meanBefore: before.mean,
      meanAfter: after.mean,
      shift: round(after.mean - before.mean),
      shiftInNoiseSd: round((after.mean - before.mean) / sigma, 3),
      sdBefore: before.sd,
      sdAfter: after.sd,
      bocpdProbWithin3: round(near, 3),
    };
  });
  const summary = summarize({ n: values.length, column, model, changes, det, labels, prob: b.changeProb, skipped });
  return {
    n: values.length,
    column,
    skipped,
    model,
    noiseSd: round(sigma),
    pelt: { penalty: round(p.penalty), minSegment, changepoints: changes, segments },
    bocpd: {
      hazardLambda: Number(o.hazardLambda) || 100,
      lag: Math.max(1, Math.floor(Number(o.lag) || 5)),
      threshold: Number(o.threshold) || 0.5,
      detections: det.map((i) => ({ index: i, label: labels[i], probability: round(b.changeProb[i], 3) })),
      changeProb: b.changeProb.map((v) => round(v, 3)),
      mapRunLength: b.mapRun,
    },
    labels,
    values,
    summary,
  };
}

function summarize({ n, column, model, changes, det, labels, skipped }) {
  const what = model === 'meanvar' ? 'level or volatility' : 'level';
  const lines = [];
  if (!changes.length) {
    lines.push(`PELT finds no change in ${what} across the ${n} points of ${column}: one segment explains the data better than any split, after the penalty.`);
  } else {
    lines.push(`PELT splits the ${n} points of ${column} into ${changes.length + 1} segments (${changes.length} change${changes.length > 1 ? 's' : ''} in ${what}).`);
    for (const c of changes) {
      const dir = c.shift > 0 ? 'up' : 'down';
      lines.push(`From ${c.label} (after ${c.lastBefore}) the mean moves ${dir} from ${fmt(c.meanBefore)} to ${fmt(c.meanAfter)}, ${fmt(Math.abs(c.shiftInNoiseSd))} noise standard deviations; the Bayesian method puts ${Math.round(c.bocpdProbWithin3 * 100)}% probability on a change within 3 points of it.`);
    }
  }
  const extra = det.filter((i) => !changes.some((c) => Math.abs(c.index - i) <= 3));
  if (extra.length) lines.push(`The Bayesian method also flags ${extra.map((i) => labels[i]).join(', ')}, which PELT's penalty did not keep: worth a look, weaker evidence.`);
  if (skipped) lines.push(`${skipped} row${skipped > 1 ? 's were' : ' was'} skipped as blank or not numeric.`);
  return lines.join(' ');
}
