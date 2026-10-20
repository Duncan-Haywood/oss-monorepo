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
  // 'poisson': change in the rate of a count series (whole numbers, 0 or more).
  // 'trend': change in level or slope, a straight line per segment (a series that climbs or falls).
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
  // Seasonal period in points (12 for monthly data with a yearly cycle, 7 for
  // daily data with a weekly one); 0 or null for none. The per-phase median of
  // the detrended series is subtracted before detection ('mean' and 'meanvar').
  period: 0,
  // true: let the seasonal shape drift (running median across cycles) instead of one fixed profile.
  drift: false,
  // true: widen the noise scale of the 'mean' model for lag-1 autocorrelation
  // so a drifting, sticky series is not cut into many false segments. 'joint': fit the
  // segment means and rho together on the exact AR(1) likelihood (more power on small shifts).
  ar1: false,
  // true: fit one linear trend under the steps and remove it, so a slow ramp is not read as many
  // small level changes (mean and meanvar models; applied after the seasonal adjustment).
  // 'bend': also allow the slope to change once (knot and second slope chosen by BIC).
  trend: false,
};

// ---------------------------------------------------------------- pre-steps

/**
 * Classical seasonal adjustment with medians. Detrend with a centred moving
 * average of one period, take the median of each phase, centre the profile at
 * zero and subtract it. The median keeps a level shift (which sits in the
 * detrended series only near the shift) out of the profile.
 * Returns { adjusted, profile } or throws when there are fewer than two cycles.
 */
export function seasonalAdjust(x, period, opts = {}) {
  const m = Math.floor(period);
  if (!(m >= 2)) throw new Error('The seasonal period must be a whole number of at least 2.');
  if (x.length < 2 * m) throw new Error(`A seasonal period of ${m} needs at least ${2 * m} points (two full cycles); got ${x.length}.`);
  const n = x.length;
  // centred moving average of length m (2 x m for even m)
  const trend = new Array(n).fill(null);
  const half = Math.floor(m / 2);
  for (let t = half; t < n - half; t++) {
    let sum = 0;
    if (m % 2) { for (let k = -half; k <= half; k++) sum += x[t + k]; trend[t] = sum / m; }
    else { sum = 0.5 * x[t - half] + 0.5 * x[t + half]; for (let k = -half + 1; k < half; k++) sum += x[t + k]; trend[t] = sum / m; }
  }
  const phases = Array.from({ length: m }, () => []);
  for (let t = 0; t < n; t++) if (trend[t] !== null) phases[t % m].push(x[t] - trend[t]);
  const raw = phases.map((a) => (a.length ? median(a) : 0));
  const centre = raw.reduce((s, v) => s + v, 0) / m;
  const profile = raw.map((v) => v - centre);
  if (opts.drift) return driftAdjust(x, m, trend, profile);
  return { adjusted: x.map((v, t) => v - profile[t % m]), profile };
}

/**
 * Drifting seasonal shape: each phase's detrended values are smoothed across
 * cycles: a Theil-Sen line through up to 9 cycles on series of 10 or more cycles,
 * a running median of 5 (3 when there are fewer than 6) on shorter ones, so a cycle whose amplitude grows or whose peak moves is followed instead
 * of averaged away. Each cycle's profile is re-centred at zero. Returns the
 * mean profile too, for display.
 */
function driftAdjust(x, m, trend0, profile) {
  let trend = trend0;
  const n = x.length;
  const cycles = Math.ceil(n / m);
  const w = cycles >= 10 ? 4 : cycles >= 6 ? 2 : 1; // half-width in cycles
  // the moving average is missing half a period at each end: hold its nearest value so the end cycles keep their own shape
  const first = trend.findIndex((v) => v !== null), last = n - 1 - [...trend].reverse().findIndex((v) => v !== null);
  trend = trend.map((v, t) => (v !== null ? v : trend[t < first ? first : last]));
  const d = Array.from({ length: m }, (_, p) => {
    const col = [];
    for (let c = 0; c < cycles; c++) { const t = c * m + p; col.push(t < n && trend[t] !== null ? x[t] - trend[t] : null); }
    return col.map((_, c) => {
      const win = [];
      for (let k = Math.max(0, c - w); k <= Math.min(cycles - 1, c + w); k++) if (col[k] !== null) win.push([k, col[k]]);
      if (!win.length) return profile[p];
      if (win.length < 5) return median(win.map((e) => e[1]));
      // a robust line through the window, read at this cycle: a plain median lags a growing cycle at the ends
      const sl = [];
      for (let i = 0; i < win.length; i++) for (let j = i + 1; j < win.length; j++) sl.push((win[j][1] - win[i][1]) / (win[j][0] - win[i][0]));
      const slope = median(sl);
      return median(win.map((e) => e[1] - slope * (e[0] - c)));
    });
  });
  const adjusted = new Array(n);
  for (let c = 0; c < cycles; c++) {
    let centre = 0;
    for (let p = 0; p < m; p++) centre += d[p][c];
    centre /= m;
    for (let p = 0; p < m; p++) { const t = c * m + p; if (t < n) adjusted[t] = x[t] - (d[p][c] - centre); }
  }
  return { adjusted, profile };
}

/**
 * A common linear trend under the steps: the series is steps plus one slope.
 * Start from the median first difference (a step touches one difference, so it
 * barely moves the median), segment with PELT, re-estimate the slope as the
 * pooled within-segment least-squares slope, and repeat until it settles.
 * Returns { adjusted, slope } with the slope per point; the adjusted series
 * keeps the mean level of the input.
 */
export function trendAdjust(x, { penalty = 'bic', minSegment = 2, passes = 10, ar1 = false, bend = false } = {}) {
  const n = x.length;
  const d = [];
  for (let i = 1; i < n; i++) d.push(x[i] - x[i - 1]);
  const c = (n - 1) / 2;
  // the removed line: slope b1 up to the knot, b2 after it, continuous at the knot (knot null: one slope)
  const line = (b1, b2, knot) => (t) => (knot === null || t <= knot ? b1 * (t - c) : b1 * (knot - c) + b2 * (t - knot));
  const detrend = (f) => x.map((v, t) => v - f(t));
  // pooled within-segment least-squares slope over the points t in [lo, hi) of each segment
  const pooled = (bounds, lo, hi, fallback) => {
    let sxy = 0, sxx = 0;
    for (let i = 0; i + 1 < bounds.length; i++) {
      const a = Math.max(bounds[i], lo), e = Math.min(bounds[i + 1], hi), len = e - a;
      if (len < 8) continue; // a short segment fits its own noise, not the slope
      let mt = 0, mx = 0;
      for (let t = a; t < e; t++) { mt += t; mx += x[t]; }
      mt /= len; mx /= len;
      for (let t = a; t < e; t++) { sxy += (t - mt) * (x[t] - mx); sxx += (t - mt) ** 2; }
    }
    return sxx > 0 ? sxy / sxx : fallback;
  };
  const segment = (y, mult) => {
    const sd = robustSd(y);
    // a heavier penalty while the slope is unsettled: only large steps may shape it
    // with ar1, sticky noise widens the scale, so its wandering is not cut into steps that then bend the slope
    return pelt(y, { model: 'mean', penalty: mult * penaltyValue(penalty, n, 'mean'), minSegment, sigma: ar1 ? longRunSd(sd, ar1Rho(y)) : sd }).changepoints;
  };
  const fit = (knot) => {
    let b1 = median(d), b2 = b1;
    for (let k = 0; k < passes; k++) {
      const cps = segment(detrend(line(b1, b2, knot)), 3);
      const bounds = [0, ...cps, n];
      const n1 = pooled(bounds, 0, knot === null ? n : knot + 1, b1);
      const n2 = knot === null ? n1 : pooled(bounds, knot + 1, n, b2);
      const done = Math.abs(n1 - b1) < 1e-9 && Math.abs(n2 - b2) < 1e-9;
      b1 = n1; b2 = n2;
      if (done) break;
    }
    // BIC of steps under the final line: n ln(rss/n) plus ln n per step and per slope parameter
    const y = detrend(line(b1, b2, knot));
    const cps = segment(y, 1);
    const bounds = [0, ...cps, n];
    let rss = 0;
    for (let i = 0; i + 1 < bounds.length; i++) {
      let m = 0; for (let t = bounds[i]; t < bounds[i + 1]; t++) m += y[t];
      m /= bounds[i + 1] - bounds[i];
      for (let t = bounds[i]; t < bounds[i + 1]; t++) rss += (y[t] - m) ** 2;
    }
    const params = 1 + (knot === null ? 0 : 2) + 2 * cps.length;
    return { b1, b2, knot, y, bic: n * Math.log(Math.max(rss, 1e-12) / n) + params * Math.log(n) };
  };
  let best = fit(null);
  if (bend && n >= 40) {
    const step = Math.max(1, Math.round(n / 40));
    for (let knot = Math.ceil(0.2 * n); knot <= Math.floor(0.8 * n); knot += step) {
      const f = fit(knot);
      if (f.bic < best.bic) best = f;
    }
  }
  const out = { adjusted: detrend(line(best.b1, best.b2, best.knot)), slope: best.b1 };
  if (best.knot !== null) Object.assign(out, { slopeAfter: best.b2, knot: best.knot });
  return out;
}

/**
 * Lag-1 autocorrelation of the noise, robust to level shifts. For AR(1) noise
 * the first differences have lag-1 correlation -(1 - rho) / 2, and a level
 * shift touches one difference only, which is clipped at 3 robust sds.
 * Returns rho clipped to [0, 0.95].
 */
export function ar1Rho(x) {
  const d = [];
  for (let i = 1; i < x.length; i++) d.push(x[i] - x[i - 1]);
  if (d.length < 10) return 0;
  const md = median(d);
  const mad = median(d.map((v) => Math.abs(v - md))) / 0.6744897501960817;
  if (!(mad > 0)) return 0;
  const c = d.map((v) => Math.max(-3 * mad, Math.min(3 * mad, v - md)));
  let num = 0, den = 0;
  for (let i = 0; i < c.length; i++) { den += c[i] * c[i]; if (i) num += c[i] * c[i - 1]; }
  const rd = num / den;
  return Math.max(0, Math.min(0.95, 1 + 2 * rd));
}

/** Long-run noise sd of AR(1) noise from the difference-based sd: sd * sqrt(1 + rho) / (1 - rho). */
export function longRunSd(sd, rho) {
  return sd * Math.sqrt(1 + rho) / (1 - rho);
}

/**
 * AR(1) prewhitening: y[t] = x[t] - rho x[t-1] (y[0] = (1 - rho) x[0]). Independent noise
 * stays independent for the Bayesian pass, and a level shift of d becomes d at the
 * change point and d (1 - rho) after it. The change keeps its index.
 */
export function prewhiten(x, rho) {
  return x.map((v, t) => (t ? v - rho * x[t - 1] : (1 - rho) * v));
}

/**
 * Joint mean-plus-AR(1) fit: PELT on the exact AR(1) likelihood ('ar1mean'), then rho and the
 * innovation sd are re-estimated from the residuals about the fitted segment means (which a level
 * shift no longer pollutes) and PELT is run again, three passes in all.
 * Returns { changepoints, rho, sigma (innovation sd), penalty }.
 */
export function ar1JointFit(x, { penalty = 'bic', minSegment = 2, passes = 3 } = {}) {
  let rho = ar1Rho(x);
  let sigma = robustSd(x) * Math.sqrt(1 + rho);
  let p;
  for (let it = 0; it < passes; it++) {
    p = pelt(x, { model: 'ar1mean', penalty, minSegment, sigma, rho });
    if (it === passes - 1) break;
    const b = [0, ...p.changepoints, x.length];
    const res = new Array(x.length);
    for (let k = 0; k + 1 < b.length; k++) {
      let m = 0;
      for (let i = b[k]; i < b[k + 1]; i++) m += x[i];
      m /= b[k + 1] - b[k];
      for (let i = b[k]; i < b[k + 1]; i++) res[i] = x[i] - m;
    }
    let num = 0, den = 0;
    for (let i = 1; i < x.length; i++) { num += res[i] * res[i - 1]; den += res[i - 1] ** 2; }
    rho = den > 0 ? Math.max(0, Math.min(0.95, num / den)) : 0;
    let ss = 0;
    for (let i = 1; i < x.length; i++) ss += (res[i] - rho * res[i - 1]) ** 2;
    sigma = Math.sqrt(ss / (x.length - 1)) || sigma;
  }
  return { ...p, rho, sigma };
}

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
export function makeCost(x, model = 'mean', sigma = robustSd(x), rho = 0) {
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
  if (model === 'ar1mean') {
    // Segment means with AR(1) noise of known rho and innovation sd sigma, conditional on
    // the segment start being a stationary draw: u[i] = x[i] - rho x[i-1] has mean (1-rho) mu,
    // x[s] has precision weight 1-rho^2. Minimising over mu is a quadratic with prefix sums.
    const U1 = new Float64Array(n + 1);
    const U2 = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const u = i ? x[i] - rho * x[i - 1] : 0;
      U1[i + 1] = U1[i] + u; U2[i + 1] = U2[i] + u * u;
    }
    const c = 1 - rho, w0 = 1 - rho * rho, s2 = sigma * sigma;
    return (s, t) => {
      const m = t - s;
      const su = U1[t] - U1[s + 1], suu = U2[t] - U2[s + 1];
      const A = w0 + (m - 1) * c * c;
      const B = w0 * x[s] + c * su;
      const C = w0 * x[s] * x[s] + suu;
      return Math.max(0, C - (B * B) / A) / s2 - Math.log(w0);
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
  if (model === 'trend') {
    // One straight line per segment, noise sd sigma: the cost is the segment's residual sum of squares
    // about its least-squares line over sigma^2, from prefix sums of x, t, t^2, t x. t is scaled to [0, 1]
    // so the cancellation in the sums stays small on long series.
    const T1 = new Float64Array(n + 1), T2 = new Float64Array(n + 1), TX = new Float64Array(n + 1);
    const sc = 1 / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      const u = i * sc;
      T1[i + 1] = T1[i] + u; T2[i + 1] = T2[i] + u * u; TX[i + 1] = TX[i] + u * x[i];
    }
    const s2 = sigma * sigma;
    return (s, t) => {
      const m = t - s;
      const st = T1[t] - T1[s], sx = S1[t] - S1[s];
      const sxx = (T2[t] - T2[s]) - (st * st) / m;
      const sxy = (TX[t] - TX[s]) - (st * sx) / m;
      const syy = (S2[t] - S2[s]) - (sx * sx) / m;
      return Math.max(0, sxx > 1e-12 ? syy - (sxy * sxy) / sxx : syy) / s2;
    };
  }
  if (model === 'poisson') {
    // -2 log-likelihood of counts with one rate per segment, the constant sum(log x!) dropped:
    // 2 * (a - a log(a / m)), where a is the segment total and m its length (0 when a = 0).
    return (s, t) => {
      const m = t - s;
      const a = S1[t] - S1[s];
      return a > 0 ? 2 * (a - a * Math.log(a / m)) : 0;
    };
  }
  throw new Error(`Unknown model "${model}": use "mean", "meanvar", "trend" or "poisson".`);
}

/** Penalty per extra change. Parameters added by one change: its location plus the new segment's parameters. */
export function penaltyValue(penalty, n, model) {
  if (typeof penalty === 'number' && Number.isFinite(penalty) && penalty >= 0) return penalty;
  if (typeof penalty === 'string' && /^\d+(\.\d+)?$/.test(penalty.trim())) return Number(penalty);
  const k = model === 'meanvar' || model === 'trend' ? 3 : 2;  // trend: location plus a level and a slope; poisson, like mean: location plus one rate
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
export function pelt(x, { model = 'mean', penalty = 'bic', minSegment = 2, sigma, rho = 0 } = {}) {
  const n = x.length;
  const beta = penaltyValue(penalty, n, model);
  const minSeg = Math.max(1, Math.floor(minSegment));
  const cost = makeCost(x, model, sigma ?? robustSd(x), rho);
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
export function optimalPartitioning(x, { model = 'mean', penalty = 'bic', minSegment = 2, sigma, rho = 0 } = {}) {
  const n = x.length;
  const beta = penaltyValue(penalty, n, model);
  const cost = makeCost(x, model, sigma ?? robustSd(x), rho);
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
export function bocpd(x, { hazardLambda = 100, lag = 5, prior, prune = 1e-10, model = 'mean', rho = 0 } = {}) {
  const n = x.length;
  const H = 1 / Math.max(1, hazardLambda);
  const pois = model === 'poisson';
  // Poisson counts: Gamma(alpha, beta) rate prior, negative-binomial predictive; mu and kappa are unused.
  const p0 = prior ?? (pois ? defaultPoissonPrior(x) : defaultPrior(x));
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
    // AR(1) noise (rho > 0, mean model): the first point of a run is stationary, x ~ N(mu, s2 / (1 - rho^2)),
    // i.e. z = x sqrt(1 - rho^2) has regressor a0 on mu; later points are x[t] - rho x[t-1] = (1 - rho) mu + e.
    // Each run keeps a scalar-regression NIG posterior; a = 1 and no Jacobian when rho = 0.
    const a0 = Math.sqrt(1 - rho * rho);
    const zAt = (i) => (rl[i] === 0 ? xt * a0 : t ? xt - rho * x[t - 1] : (1 - rho) * xt);
    const aAt = (i) => (rl[i] === 0 ? a0 : 1 - rho);
    for (let i = 0; i < m; i++) {
      if (pois) logPred[i] = gammaPoissonLogPmf(xt, alpha[i], beta[i]);
      else if (!rho) logPred[i] = studentLogPdf(xt, mu[i], kappa[i], alpha[i], beta[i]);
      else logPred[i] = studentLogPdfReg(zAt(i), aAt(i), mu[i], kappa[i], alpha[i], beta[i]) + (rl[i] === 0 ? Math.log(a0) : 0);
    }
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
      if (rho && !pois) {
        const a = aAt(i), z = zAt(i), k1 = kappa[i] + a * a;
        nmu.push((kappa[i] * mu[i] + a * z) / k1);
        nk.push(k1);
        na.push(alpha[i] + 0.5);
        nb.push(beta[i] + (kappa[i] * (z - a * mu[i]) ** 2) / (2 * k1));
        continue;
      }
      const k1 = kappa[i] + 1;
      nmu.push((kappa[i] * mu[i] + xt) / k1);
      nk.push(k1);
      if (pois) {
        na.push(alpha[i] + xt);
        nb.push(beta[i] + 1);
      } else {
        na.push(alpha[i] + 0.5);
        nb.push(beta[i] + (kappa[i] * (xt - mu[i]) ** 2) / (2 * k1));
      }
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

/** Weak Gamma prior on the rate, centred on the series mean (prior weight of 1 observation). */
export function defaultPoissonPrior(x) {
  const mean = x.length ? x.reduce((s, v) => s + v, 0) / x.length : 1;
  const m = Math.max(mean, 1e-3);
  return { mu: 0, kappa: 1, alpha: m, beta: 1 };
}

/** log P(k) for a Poisson count whose rate has a Gamma(alpha, beta) posterior: negative binomial. */
function gammaPoissonLogPmf(k, alpha, beta) {
  return lgamma(k + alpha) - lgamma(alpha) - lgamma(k + 1) + alpha * Math.log(beta / (beta + 1)) - k * Math.log(beta + 1);
}

/** Closed-form log marginal likelihood of counts under one Gamma-Poisson segment (test reference for hazard -> 0). */
export function gammaPoissonLogMarginal(x, { alpha, beta }) {
  const a = x.reduce((s, v) => s + v, 0);
  const logFact = x.reduce((s, v) => s + lgamma(v + 1), 0);
  return alpha * Math.log(beta) - lgamma(alpha) + lgamma(alpha + a) - (alpha + a) * Math.log(beta + x.length) - logFact;
}

function studentLogPdf(x, mu, kappa, alpha, beta) {
  const nu = 2 * alpha;
  const scale2 = (beta * (kappa + 1)) / (alpha * kappa);
  const z = (x - mu) ** 2 / (nu * scale2);
  return lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI * scale2) - ((nu + 1) / 2) * Math.log1p(z);
}

/** Student-t log density of z = a mu + e under the NIG posterior of mu (regressor a); a = 1 is studentLogPdf. */
function studentLogPdfReg(z, a, mu, kappa, alpha, beta) {
  const nu = 2 * alpha;
  const scale2 = (beta * (1 + (a * a) / kappa)) / alpha;
  const d = (z - a * mu) ** 2 / (nu * scale2);
  return lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI * scale2) - ((nu + 1) / 2) * Math.log1p(d);
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
  const model = o.model === 'meanvar' || o.model === 'poisson' || o.model === 'trend' ? o.model : 'mean';
  if (model === 'poisson') {
    const bad = values.findIndex((v) => v < 0 || !Number.isInteger(v));
    if (bad >= 0) throw new Error(`The Poisson model needs counts (whole numbers, 0 or more); row ${bad + 1} is ${values[bad]}.`);
  }
  const period = Math.floor(Number(o.period) || 0);
  let profile = null;
  const original = values;
  if (period) {
    if (model === 'poisson') throw new Error('The seasonal adjustment subtracts a profile, which breaks counts: use "mean" or "meanvar" with a period.');
    ({ adjusted: values, profile } = seasonalAdjust(original, period, { drift: !!o.drift }));
  }
  let slope = null, slopeAfter, knot;
  if (o.trend) {
    if (model === 'poisson') throw new Error('The trend removal subtracts a line, which breaks counts: use "mean" or "meanvar" with a trend.');
    ({ adjusted: values, slope, slopeAfter, knot } = trendAdjust(values, { penalty: o.penalty, minSegment: Math.max(1, Math.floor(Number(o.minSegment) || (model === 'meanvar' ? 5 : 2))), ar1: !!o.ar1 && model === 'mean', bend: o.trend === 'bend' }));
  }
  let sigma = robustSd(values);
  let rho = null;
  const joint = o.ar1 === 'joint';
  if (o.ar1) {
    if (model !== 'mean') throw new Error('The autocorrelation correction is for the "mean" model only.');
    rho = ar1Rho(values);
    if (!joint) sigma = longRunSd(sigma, rho);
  }
  const minSegment = Math.max(1, Math.floor(Number(o.minSegment) || (model === 'meanvar' ? 5 : model === 'trend' ? 4 : 2)));
  let p;
  if (joint) {
    p = ar1JointFit(values, { penalty: o.penalty, minSegment });
    ({ rho, sigma } = p);
  } else p = pelt(values, { model, penalty: o.penalty, minSegment, sigma });
  const bounds = [0, ...p.changepoints, values.length];
  const segments = [];
  const lines = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const s = stats(values.slice(bounds[i], bounds[i + 1]));
    const seg = { start: bounds[i], end: bounds[i + 1] - 1, from: labels[bounds[i]], to: labels[bounds[i + 1] - 1], n: s.n, mean: round(s.mean), sd: round(s.sd) };
    if (model === 'trend') {
      const f = lineFit(values, bounds[i], bounds[i + 1]);
      lines.push(f);
      Object.assign(seg, { slope: round(f.slope, 4), sd: round(f.sd) });
    }
    segments.push(seg);
  }
  // With --ar1 the Bayesian pass uses the conditional AR(1) likelihood on the original series (rho fixed),
  // not the prewhitened one: prewhitening turns a shift into a spike plus a (1 - rho)-sized step.
  // The trend model's Bayesian pass runs the level model on the series minus a straight line whose slope is the
  // median first difference: a level shift touches one difference only, so the slope estimate ignores it.
  let bvals = values;
  if (model === 'trend') {
    const slope = median(values.slice(1).map((v, i) => v - values[i]));
    bvals = values.map((v, i) => v - slope * i);
  }
  const b = bocpd(bvals, { ...(rho ? { rho, prior: { ...defaultPrior(prewhiten(values, rho)), mu: median(values) } } : {}), hazardLambda: Number(o.hazardLambda) || 100, lag: Math.max(1, Math.floor(Number(o.lag) || 5)), model: model === 'trend' ? 'mean' : model });
  const det = peaks(b.changeProb, Number(o.threshold) || 0.5);
  const changes = p.changepoints.map((i, k) => {
    const before = segments[k];
    const after = segments[k + 1];
    let near = 0;
    for (let j = Math.max(1, i - 3); j <= Math.min(values.length - 1, i + 3); j++) near = Math.max(near, b.changeProb[j]);
    const trend = model === 'trend' ? {
      // the jump between the two fitted lines at the change, and the slope on each side
      jump: round(lines[k + 1].at(i) - lines[k].at(i)),
      slopeBefore: before.slope,
      slopeAfter: after.slope,
    } : null;
    return {
      index: i,
      label: labels[i],
      lastBefore: labels[i - 1],
      meanBefore: before.mean,
      meanAfter: after.mean,
      shift: trend ? trend.jump : round(after.mean - before.mean),
      ...(trend ? { jump: trend.jump, slopeBefore: trend.slopeBefore, slopeAfter: trend.slopeAfter } : {}),
      shiftInNoiseSd: round((trend ? trend.jump : after.mean - before.mean) / (joint ? longRunSd(sigma / Math.sqrt(1 + rho), rho) : sigma), 3),
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
    ...(period ? { seasonal: { period, profile: profile.map((v) => round(v)) } } : {}),
    ...(slope !== null ? { trend: { slopePerPoint: round(slope, 6), ...(knot !== undefined ? { slopeAfter: round(slopeAfter, 6), slopeChangesAt: knot } : {}) } } : {}),
    ...(rho !== null ? { ar1: { rho: round(rho, 3) } } : {}),
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
    values: original,
    ...(period || o.trend ? { adjusted: values.map((v) => round(v)) } : {}),
    summary,
  };
}

/** Least-squares line through x[s..t): slope per index, residual sd, and the fitted value at any index. */
function lineFit(x, s, t) {
  const m = t - s;
  let st = 0, sx = 0;
  for (let i = s; i < t; i++) { st += i; sx += x[i]; }
  const tb = st / m, xb = sx / m;
  let sxx = 0, sxy = 0;
  for (let i = s; i < t; i++) { sxx += (i - tb) ** 2; sxy += (i - tb) * (x[i] - xb); }
  const slope = sxx > 0 ? sxy / sxx : 0;
  let rss = 0;
  for (let i = s; i < t; i++) rss += (x[i] - xb - slope * (i - tb)) ** 2;
  return { slope, sd: Math.sqrt(rss / Math.max(1, m - 2)), at: (i) => xb + slope * (i - tb) };
}

function summarize({ n, column, model, changes, det, labels, skipped }) {
  const what = model === 'meanvar' ? 'level or volatility' : model === 'poisson' ? 'rate' : model === 'trend' ? 'level or slope' : 'level';
  const lines = [];
  if (!changes.length) {
    lines.push(`PELT finds no change in ${what} across the ${n} points of ${column}: one segment explains the data better than any split, after the penalty.`);
  } else {
    lines.push(`PELT splits the ${n} points of ${column} into ${changes.length + 1} segments (${changes.length} change${changes.length > 1 ? 's' : ''} in ${what}).`);
    for (const c of changes) {
      const dir = c.shift > 0 ? 'up' : 'down';
      if (model === 'trend') {
        lines.push(`From ${c.label} (after ${c.lastBefore}) the line jumps ${c.jump > 0 ? 'up' : 'down'} by ${fmt(Math.abs(c.jump))} and its slope goes from ${fmt(c.slopeBefore)} to ${fmt(c.slopeAfter)} per point; the Bayesian method (level changes only, on the series minus its median slope) puts ${Math.round(c.bocpdProbWithin3 * 100)}% probability on a change within 3 points of it.`);
        continue;
      }
      lines.push(`From ${c.label} (after ${c.lastBefore}) the mean moves ${dir} from ${fmt(c.meanBefore)} to ${fmt(c.meanAfter)}, ${fmt(Math.abs(c.shiftInNoiseSd))} noise standard deviations; the Bayesian method puts ${Math.round(c.bocpdProbWithin3 * 100)}% probability on a change within 3 points of it.`);
    }
  }
  const extra = det.filter((i) => !changes.some((c) => Math.abs(c.index - i) <= 3));
  if (extra.length) lines.push(`The Bayesian method also flags ${extra.map((i) => labels[i]).join(', ')}, which PELT's penalty did not keep: worth a look, weaker evidence.`);
  if (skipped) lines.push(`${skipped} row${skipped > 1 ? 's were' : ' was'} skipped as blank or not numeric.`);
  return lines.join(' ');
}
