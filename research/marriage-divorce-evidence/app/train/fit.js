// In-browser training on the NSFG 1995–2023 women's first-marriage extract (no dependencies).
// Reproduces reproducibility/nsfg_pooled_first_marriage/train_pooled.py in plain JavaScript:
// marriage-year intervals, person-held-out folds, a constant rate, a duration-only spline
// Poisson GLM, the additive spline Poisson GLM (median impute -> quantile B-splines -> standard
// scaling, one-hot drop-first, L2 penalty, Newton's method), a Poisson decision tree and Poisson
// gradient boosting on histogram trees. tests/train.test.mjs checks the GLM against
// scikit-learn's coefficients and every model's held-out gain against scikit-learn's.
import { splineFeatures } from '../engine.js';

// Settings of train_pooled.py's pipelines.
export const SETTINGS = {
  duration_only: { durKnots: 5, num: [], cat: [], alpha: 1e-6 },
  additive_spline: { durKnots: 4, numKnots: 4, alpha: 1e-4 },
  tree_depth4: { maxDepth: 4, minLeaf: 3000 },
  gradient_boosting: { maxDepth: 3, iters: 250, rate: 0.05, minLeaf: 1000, l2: 1.0, maxBins: 255 },
};
// Relative CPU time of each model on one fold at 250 boosting rounds (used to schedule and
// to show progress).
export const MODEL_COST = { constant: 0.05, duration_only: 1, additive_spline: 2.5, tree_depth4: 0.6, gradient_boosting: 30 };
export const MODEL_LABELS = {
  constant: 'Constant rate (baseline)',
  duration_only: 'Marriage length only (spline GLM)',
  additive_spline: 'Additive spline Poisson GLM',
  tree_depth4: 'Poisson tree, depth 4',
  gradient_boosting: 'Poisson gradient boosting',
};

// ---------------------------------------------------------------- data
export function decode(doc) {
  const c = doc.columns;
  const n = doc.n;
  const num = {}, cat = {}, levels = {};
  for (const s of doc.numeric) {
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) a[i] = c[s.name][i] == null ? NaN : c[s.name][i] / s.scale;
    num[s.name] = a;
  }
  for (const s of doc.categorical) {
    cat[s.name] = Int32Array.from(c[s.name]);
    levels[s.name] = s.levels;
  }
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = (c.months[i] + 0.5) / 12;
  return {
    n, t, event: Uint8Array.from(c.event), weight: Float64Array.from(c.weight), fold: Uint8Array.from(c.fold),
    num, cat, levels, numNames: doc.numeric.map((s) => s.name), catNames: doc.categorical.map((s) => s.name),
  };
}

// One row per marriage-year (0 = first year); the event sits in the year it happens.
export function intervals(D) {
  let m = 0;
  for (let i = 0; i < D.n; i++) m += Math.max(1, Math.ceil(D.t[i]));
  const person = new Int32Array(m), k = new Uint8Array(m), e = new Float64Array(m), y = new Float64Array(m);
  let r = 0;
  for (let i = 0; i < D.n; i++) {
    const nk = Math.max(1, Math.ceil(D.t[i]));
    for (let j = 0; j < nk; j++, r++) {
      person[r] = i; k[r] = j;
      e[r] = Math.min(D.t[i], j + 1) - j;
      y[r] = j + 1 >= D.t[i] ? D.event[i] : 0;
    }
  }
  return { n: m, person, k, e, y };
}

export function rowsWhere(D, R, keep) {
  let m = 0;
  for (let r = 0; r < R.n; r++) if (keep(D.fold[R.person[r]])) m++;
  const out = new Int32Array(m);
  let j = 0;
  for (let r = 0; r < R.n; r++) if (keep(D.fold[R.person[r]])) out[j++] = r;
  return out;
}

// ---------------------------------------------------------------- order statistics on (value, count) pairs
function distribution(values, counts) {
  const map = new Map();
  for (let i = 0; i < values.length; i++) {
    if (!counts[i] || Number.isNaN(values[i])) continue;
    map.set(values[i], (map.get(values[i]) || 0) + counts[i]);
  }
  const v = Float64Array.from(map.keys()).sort();
  const cum = new Float64Array(v.length);
  let s = 0;
  for (let j = 0; j < v.length; j++) { s += map.get(v[j]); cum[j] = s; }
  return { v, cum, total: s };
}
function at(dist, idx) {           // the idx-th smallest value (0-based)
  let lo = 0, hi = dist.v.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (dist.cum[mid] > idx) hi = mid; else lo = mid + 1; }
  return dist.v[lo];
}
// numpy.percentile with linear interpolation.
function percentile(dist, q) {
  const pos = (q / 100) * (dist.total - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  const a = at(dist, lo), b = at(dist, hi);
  return a + (b - a) * (pos - lo);
}
const median = (dist) => percentile(dist, 50);

// SplineTransformer(knots='quantile', degree=2): base knots at evenly spaced percentiles,
// extended by `degree` knots at each end with the edge spacing.
function quantileKnots(dist, nKnots, degree = 2) {
  const base = [];
  for (let j = 0; j < nKnots; j++) base.push(percentile(dist, (100 * j) / (nKnots - 1)));
  const dmin = base[1] - base[0], dmax = base[nKnots - 1] - base[nKnots - 2];
  const pre = [], post = [];
  for (let j = degree; j >= 1; j--) pre.push(base[0] - j * dmin);
  for (let j = 1; j <= degree; j++) post.push(base[nKnots - 1] + j * dmax);
  return [...pre, ...base, ...post];
}

// Per-person and per-marriage-year training counts.
function trainingCounts(D, R, rows) {
  const perPerson = new Float64Array(D.n), perK = new Float64Array(256);
  for (const r of rows) { perPerson[R.person[r]]++; perK[R.k[r]]++; }
  return { perPerson, perK };
}
function kDistribution(perK) {
  const ks = Float64Array.from({ length: 256 }, (_, j) => j);
  return distribution(ks, perK);
}
function imputedColumn(col, fill) {
  const out = new Float64Array(col.length);
  for (let i = 0; i < col.length; i++) out[i] = Number.isNaN(col[i]) ? fill : col[i];
  return out;
}

// ---------------------------------------------------------------- linear algebra
function cholSolve(H, g, P) {   // solves H x = g for symmetric positive definite H (row-major P x P)
  const L = new Float64Array(P * P);
  for (let i = 0; i < P; i++) {
    for (let j = 0; j <= i; j++) {
      let s = H[i * P + j];
      for (let k = 0; k < j; k++) s -= L[i * P + k] * L[j * P + k];
      if (i === j) {
        if (!(s > 0)) throw new Error('Hessian not positive definite');
        L[i * P + i] = Math.sqrt(s);
      } else L[i * P + j] = s / L[j * P + j];
    }
  }
  const z = new Float64Array(P);
  for (let i = 0; i < P; i++) { let s = g[i]; for (let k = 0; k < i; k++) s -= L[i * P + k] * z[k]; z[i] = s / L[i * P + i]; }
  const x = new Float64Array(P);
  for (let i = P - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < P; k++) s -= L[k * P + i] * x[k]; x[i] = s / L[i * P + i]; }
  return x;
}

// ---------------------------------------------------------------- Poisson GLM (PoissonRegressor, newton-cholesky)
// Minimises sum_i s_i (mu_i - r_i log mu_i) + alpha/2 |beta|^2 (intercept unpenalised), with
// s_i = w_i e_i / sum(w e) and r_i = y_i / e_i, as scikit-learn does. A row's features are the
// marriage-year spline (shared by every row with that year) followed by the person's own; the
// Hessian is accumulated per person and per year, so each pass over the rows is O(rows).
export function fitGLM(D, R, rows, spec, onIter) {
  const num = spec.num ?? D.numNames, cat = spec.cat ?? D.catNames;
  const { perPerson, perK } = trainingCounts(D, R, rows);
  const durKnots = quantileKnots(kDistribution(perK), spec.durKnots);
  const impute = [], knots = [], cols = [];
  for (const name of num) {
    const fill = median(distribution(D.num[name], perPerson));
    impute.push(fill);
    const col = imputedColumn(D.num[name], fill);
    cols.push(col);
    knots.push(quantileKnots(distribution(col, perPerson), spec.numKnots));
  }
  const durSpec = { knots: [durKnots], degree: 2, include_bias: false };
  const numSpec = { knots, degree: 2, include_bias: false };
  const DD = spec.durKnots;                       // n_knots + degree - 1 - 1 (no bias column)
  const NB = spec.numKnots ?? 0;
  const PD = num.length * NB;
  // raw spline features
  const durRaw = new Float64Array(256 * DD);
  for (let k = 0; k < 256; k++) if (perK[k] || k < 64) durRaw.set(splineFeatures(durSpec, 0, k), k * DD);
  const personRaw = new Float64Array(D.n * PD);
  for (let j = 0; j < num.length; j++) {
    const cache = new Map();
    for (let i = 0; i < D.n; i++) {
      const x = cols[j][i];
      let f = cache.get(x);
      if (!f) { f = splineFeatures(numSpec, j, x); cache.set(x, f); }
      for (let b = 0; b < NB; b++) personRaw[i * PD + j * NB + b] = f[b];
    }
  }
  // StandardScaler over training rows (population SD)
  const nRows = rows.length;
  const mean = new Float64Array(DD + PD), sd = new Float64Array(DD + PD);
  for (let k = 0; k < 256; k++) if (perK[k]) for (let b = 0; b < DD; b++) {
    mean[b] += perK[k] * durRaw[k * DD + b];
  }
  for (let i = 0; i < D.n; i++) if (perPerson[i]) for (let b = 0; b < PD; b++) {
    mean[DD + b] += perPerson[i] * personRaw[i * PD + b];
  }
  for (let b = 0; b < DD + PD; b++) mean[b] /= nRows;
  const ss = new Float64Array(DD + PD);
  for (let k = 0; k < 256; k++) if (perK[k]) for (let b = 0; b < DD; b++) { const d = durRaw[k * DD + b] - mean[b]; ss[b] += perK[k] * d * d; }
  for (let i = 0; i < D.n; i++) if (perPerson[i]) for (let b = 0; b < PD; b++) { const d = personRaw[i * PD + b] - mean[DD + b]; ss[DD + b] += perPerson[i] * d * d; }
  for (let b = 0; b < DD + PD; b++) { const v = ss[b] / nRows; sd[b] = v > 0 ? Math.sqrt(v) : 1; }
  // one-hot (drop first) over the levels present in training
  const onehot = [], categories = [];
  let NC = 0;
  for (const name of cat) {
    const present = new Set();
    for (let i = 0; i < D.n; i++) if (perPerson[i]) present.add(D.cat[name][i]);
    const lv = D.levels[name].map((_, c) => c).filter((c) => present.has(c));
    const map = new Int32Array(D.levels[name].length).fill(-1);
    lv.slice(1).forEach((c) => { map[c] = DD + PD + NC++; });
    onehot.push(map);
    categories.push(lv.map((c) => D.levels[name][c]));
  }
  const P = DD + PD + NC + 1, ICP = P - 1;
  const PP = PD + NC + 1;                          // person block size (dense, one-hot, intercept)
  const durZ = new Float64Array(256 * DD);
  for (let k = 0; k < 256; k++) for (let b = 0; b < DD; b++) durZ[k * DD + b] = (durRaw[k * DD + b] - mean[b]) / sd[b];
  const personZ = new Float64Array(D.n * PD);
  for (let i = 0; i < D.n; i++) for (let b = 0; b < PD; b++) personZ[i * PD + b] = (personRaw[i * PD + b] - mean[DD + b]) / sd[DD + b];
  const personHot = new Int32Array(D.n * cat.length);
  for (let i = 0; i < D.n; i++) cat.forEach((name, j) => { personHot[i * cat.length + j] = onehot[j][D.cat[name][i]]; });

  // weights
  let S = 0, SY = 0;
  for (const r of rows) { const w = D.weight[R.person[r]]; S += w * R.e[r]; SY += w * R.y[r]; }
  const beta = new Float64Array(P);
  beta[ICP] = Math.log(SY / S);
  const alpha = spec.alpha;
  const personEta = new Float64Array(D.n), durEta = new Float64Array(256);
  const etas = (b) => {
    for (let k = 0; k < 256; k++) { let s = 0; for (let j = 0; j < DD; j++) s += durZ[k * DD + j] * b[j]; durEta[k] = s; }
    for (let i = 0; i < D.n; i++) {
      if (!perPerson[i]) continue;
      let s = b[ICP];
      for (let j = 0; j < PD; j++) s += personZ[i * PD + j] * b[DD + j];
      for (let j = 0; j < cat.length; j++) { const h = personHot[i * cat.length + j]; if (h >= 0) s += b[h]; }
      personEta[i] = s;
    }
  };
  const objective = (b) => {
    etas(b);
    let L = 0;
    for (const r of rows) {
      const i = R.person[r], eta = durEta[R.k[r]] + personEta[i], w = D.weight[i];
      L += (w * R.e[r] * Math.exp(eta) - w * R.y[r] * eta) / S;
    }
    let pen = 0;
    for (let j = 0; j < ICP; j++) pen += b[j] * b[j];
    return L + 0.5 * alpha * pen;
  };
  const A = new Float64Array(D.n), G = new Float64Array(D.n), B = new Float64Array(D.n * DD);
  const AK = new Float64Array(256), GK = new Float64Array(256);
  let loss = objective(beta), iter = 0, gmax = Infinity;
  for (; iter < 100; iter++) {
    A.fill(0); G.fill(0); B.fill(0); AK.fill(0); GK.fill(0);
    for (const r of rows) {
      const i = R.person[r], k = R.k[r], w = D.weight[i];
      const a = (w * R.e[r] * Math.exp(durEta[k] + personEta[i])) / S;
      const g = a - (w * R.y[r]) / S;
      A[i] += a; G[i] += g; AK[k] += a; GK[k] += g;
      for (let j = 0; j < DD; j++) B[i * DD + j] += a * durZ[k * DD + j];
    }
    const grad = new Float64Array(P), H = new Float64Array(P * P);
    for (let k = 0; k < 256; k++) {
      if (!AK[k] && !GK[k]) continue;
      for (let a = 0; a < DD; a++) {
        const va = durZ[k * DD + a];
        grad[a] += GK[k] * va;
        for (let b = 0; b <= a; b++) H[a * P + b] += AK[k] * va * durZ[k * DD + b];
      }
    }
    const idx = new Int32Array(PP), val = new Float64Array(PP);
    for (let i = 0; i < D.n; i++) {
      if (!perPerson[i]) continue;
      let m = 0;
      for (let j = 0; j < PD; j++) { idx[m] = DD + j; val[m++] = personZ[i * PD + j]; }
      for (let j = 0; j < cat.length; j++) { const h = personHot[i * cat.length + j]; if (h >= 0) { idx[m] = h; val[m++] = 1; } }
      idx[m] = ICP; val[m++] = 1;
      const ai = A[i], gi = G[i];
      for (let u = 0; u < m; u++) {
        const pu = idx[u], vu = val[u];
        grad[pu] += gi * vu;
        const avu = ai * vu;
        for (let v = 0; v <= u; v++) {             // idx is increasing, so pu >= idx[v]
          H[pu * P + idx[v]] += avu * val[v];
        }
        for (let d = 0; d < DD; d++) H[pu * P + d] += B[i * DD + d] * vu;   // cross block (pu > d)
      }
    }
    for (let j = 0; j < ICP; j++) { grad[j] += alpha * beta[j]; H[j * P + j] += alpha; }
    for (let a = 0; a < P; a++) for (let b = a + 1; b < P; b++) H[a * P + b] = H[b * P + a];
    gmax = 0;
    for (let j = 0; j < P; j++) gmax = Math.max(gmax, Math.abs(grad[j]));
    const step = cholSolve(H, grad, P);
    let decrement = 0;                             // Newton decrement: grad' H^-1 grad
    for (let j = 0; j < P; j++) decrement += grad[j] * step[j];
    if (onIter) onIter(iter, gmax);
    if (decrement < 1e-20) break;
    let t = 1, accepted = false;
    for (let ls = 0; ls < 30; ls++, t /= 2) {
      const next = beta.map((b, j) => b - t * step[j]);
      const nloss = objective(next);
      if (nloss <= loss - 1e-4 * t * decrement) { beta.set(next); loss = nloss; accepted = true; break; }
    }
    if (!accepted) { etas(beta); break; }           // no further decrease at machine precision
  }
  etas(beta);
  const featureNames = [
    ...Array.from({ length: DD }, (_, b) => `num__marriage_years_sp_${b}`),
    ...num.flatMap((name) => Array.from({ length: NB }, (_, b) => `num__${name}_sp_${b}`)),
    ...cat.flatMap((name, j) => categories[j].slice(1).map((l) => `cat__${name}_${l}`)),
  ];
  return {
    kind: 'glm', num, cat, impute, durKnots, knots, degree: 2, DD, NB, mean: Array.from(mean), sd: Array.from(sd),
    onehot: onehot.map((m) => Array.from(m)), categories, featureNames,
    intercept: beta[ICP], coef: Array.from(beta.slice(0, ICP)), iterations: iter, maxGradient: gmax, loss,
  };
}

// Log-rate of a person (raw inputs: numeric values or NaN, category codes) at marriage years ks.
export function glmEta(m, numVals, catCodes, ks) {
  const durSpec = { knots: [m.durKnots], degree: 2, include_bias: false };
  const numSpec = { knots: m.knots, degree: 2, include_bias: false };
  let base = m.intercept;
  m.num.forEach((_, j) => {
    const x = Number.isNaN(numVals[j]) || numVals[j] == null ? m.impute[j] : numVals[j];
    const f = splineFeatures(numSpec, j, x);
    for (let b = 0; b < m.NB; b++) base += ((f[b] - m.mean[m.DD + j * m.NB + b]) / m.sd[m.DD + j * m.NB + b]) * m.coef[m.DD + j * m.NB + b];
  });
  m.cat.forEach((_, j) => { const h = m.onehot[j][catCodes[j]]; if (h != null && h >= 0) base += m.coef[h]; });
  return ks.map((k) => {
    const f = splineFeatures(durSpec, 0, k);
    let s = base;
    for (let b = 0; b < m.DD; b++) s += ((f[b] - m.mean[b]) / m.sd[b]) * m.coef[b];
    return s;
  });
}

// ---------------------------------------------------------------- features shared by the trees
// Feature 0 is the marriage year (row level); then the person's numeric inputs (imputed with
// training medians); then one equality test per one-hot column (category level != first level).
function treeFeatures(D, R, rows, maxBins) {
  const { perPerson, perK } = trainingCounts(D, R, rows);
  const feats = [];
  const kd = kDistribution(perK);
  feats.push({ type: 'k', name: 'marriage_years', ...bins(kd, maxBins) });
  for (const name of D.numNames) {
    const fill = median(distribution(D.num[name], perPerson));
    const col = imputedColumn(D.num[name], fill);
    const b = bins(distribution(col, perPerson), maxBins);
    const code = new Uint16Array(D.n);
    for (let i = 0; i < D.n; i++) code[i] = binOf(b.thresholds, col[i]);
    feats.push({ type: 'num', name, fill, code, ...b });
  }
  for (const name of D.catNames) {
    const present = new Set();
    for (let i = 0; i < D.n; i++) if (perPerson[i]) present.add(D.cat[name][i]);
    const lv = D.levels[name].map((_, c) => c).filter((c) => present.has(c));
    feats.push({ type: 'cat', name, code: D.cat[name], nbins: D.levels[name].length, splittable: lv.slice(1) });
  }
  return feats;
}
// Exact bins at each distinct value when there are few; otherwise quantile thresholds
// (HistGradientBoosting's rule); thresholds are midpoints between neighbouring values.
function bins(dist, maxBins) {
  let thr;
  if (!maxBins || dist.v.length <= maxBins) {
    thr = [];
    for (let j = 0; j + 1 < dist.v.length; j++) thr.push((dist.v[j] + dist.v[j + 1]) / 2);
    return { thresholds: Float64Array.from(thr), nbins: thr.length + 1, values: dist.v };
  } else {
    const set = new Set();
    for (let j = 1; j < maxBins; j++) {
      const pos = (j / maxBins) * (dist.total - 1);
      set.add((at(dist, Math.floor(pos)) + at(dist, Math.ceil(pos))) / 2);   // method='midpoint'
    }
    thr = [...set].sort((a, b) => a - b);
  }
  return { thresholds: Float64Array.from(thr), nbins: thr.length + 1 };
}
function binOf(thr, x) {   // number of thresholds strictly below x: x <= thr[j] goes to bin j
  let lo = 0, hi = thr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (x <= thr[mid]) hi = mid; else lo = mid + 1; }
  return lo;
}
function rowBin(f, D, R, r) {
  if (f.type === 'k') return f.kbin[R.k[r]];
  return f.code[R.person[r]];
}
function prepareK(f) {
  f.kbin = new Uint16Array(256);
  for (let k = 0; k < 256; k++) f.kbin[k] = binOf(f.thresholds, k);
}
// Value used at prediction time for feature f of a person with raw inputs.
function rawValue(f, numVals, catCodes, k, D) {
  if (f.type === 'k') return k;
  if (f.type === 'num') { const j = D.numNames.indexOf(f.name); const x = numVals[j]; return x == null || Number.isNaN(x) ? f.fill : x; }
  return catCodes[D.catNames.indexOf(f.name)];
}
function exportFeatures(feats) {
  return feats.map((f) => ({ type: f.type, name: f.name, fill: f.fill }));
}

// Histogram over a node's rows: per feature and bin, three sums.
// Histogram over a node's rows: per feature and bin, the row count and two sums. Slots
// (3 x the bin's position) are precomputed per marriage year and per person by layout().
function histogram(feats, D, R, rows, lo, hi, a, b, out) {
  out.fill(0);
  const { kslot, pslot, PF } = feats;
  const person = R.person, kk = R.k;
  // Rows arrive grouped by person (intervals are person-major and partitions are stable), so
  // the person's inputs are added once per run of that person's rows.
  let p = lo;
  while (p < hi) {
    const i = person[rows[p]];
    let n = 0, sa = 0, sb = 0;
    for (; p < hi && person[rows[p]] === i; p++) {
      const r = rows[p], ar = a[r], br = b[r];
      const o = kslot[kk[r]];
      out[o] += 1; out[o + 1] += ar; out[o + 2] += br;
      n++; sa += ar; sb += br;
    }
    const base = i * PF;
    for (let j = 0; j < PF; j++) {
      const o = pslot[base + j];
      out[o] += n; out[o + 1] += sa; out[o + 2] += sb;
    }
  }
}
function layout(feats, D) {
  let off = 0;
  for (const f of feats) { f.offset = off; off += f.nbins; if (f.type === 'k') prepareK(f); }
  const PF = feats.length - 1;                 // feature 0 is the marriage year
  feats.PF = PF;
  feats.kslot = Uint32Array.from(feats[0].kbin, (b) => 3 * (feats[0].offset + b));
  feats.pslot = new Uint32Array(D.n * PF);
  for (let i = 0; i < D.n; i++) for (let j = 0; j < PF; j++) feats.pslot[i * PF + j] = 3 * (feats[j + 1].offset + feats[j + 1].code[i]);
  return off;
}
// Stable partition of rows[lo:hi] (left-going rows first, both sides keep their order, so
// later passes read memory in order); returns the split point.
let scratch = new Int32Array(0);
function partition(f, split, D, R, rows, lo, hi) {
  if (scratch.length < hi - lo) scratch = new Int32Array(rows.length);
  const cat = f.type === 'cat', isK = f.type === 'k';
  const code = isK ? f.kbin : f.code, src = isK ? R.k : R.person;
  const lev = split.level, bin = split.bin;
  let a = lo, b = 0;
  for (let p = lo; p < hi; p++) {
    const r = rows[p], c = code[src[r]];
    if (cat ? c !== lev : c <= bin) rows[a++] = r; else scratch[b++] = r;
  }
  rows.set(scratch.subarray(0, b), a);
  return a;
}
// Candidate splits of one feature from its histogram; `score(nl, al, bl, nr, ar, br)` returns
// the gain or -Infinity. Numeric splits fall between non-empty bins; categorical ones isolate a level.
function bestSplitOf(f, h, tot, score) {
  let best = { gain: -Infinity };
  if (f.type === 'cat') {
    for (const c of f.splittable) {
      const o = 3 * (f.offset + c);
      if (!h[o]) continue;
      const g = score(tot[0] - h[o], tot[1] - h[o + 1], tot[2] - h[o + 2], h[o], h[o + 1], h[o + 2]);
      if (g > best.gain) best = { gain: g, level: c, left: [tot[0] - h[o], tot[1] - h[o + 1], tot[2] - h[o + 2]] };
    }
    return best;
  }
  let nl = 0, al = 0, bl = 0, last = -1;
  for (let bin = 0; bin < f.nbins; bin++) {
    const o = 3 * (f.offset + bin);
    if (!h[o]) continue;
    if (last >= 0) {
      const g = score(nl, al, bl, tot[0] - nl, tot[1] - al, tot[2] - bl);
      if (g > best.gain) best = { gain: g, bin: last, next: bin, left: [nl, al, bl] };
    }
    nl += h[o]; al += h[o + 1]; bl += h[o + 2]; last = bin;
  }
  return best;
}
// The split threshold in raw units: midpoint between the last value on the left and the first on the right.
function splitThreshold(f, s) {
  if (f.type === 'cat') return { level: s.level };
  if (f.values) return { thr: (f.values[s.bin] + f.values[s.next]) / 2 };
  return { thr: f.thresholds[s.bin] };
}
function walk(nodes, feats, vals) {
  let n = nodes[0];
  while (n.f !== undefined) {
    const x = vals[n.f];
    const left = feats[n.f].type === 'cat' ? x !== n.level : x <= n.thr;
    n = nodes[left ? n.l : n.r];
  }
  return n.v;
}

// ---------------------------------------------------------------- Poisson decision tree (criterion='poisson')
export function fitTree(D, R, rows, spec) {
  const feats = treeFeatures(D, R, rows, 0);
  const nb = layout(feats, D);
  const W = new Float64Array(R.n), SY = new Float64Array(R.n);
  for (const r of rows) { const w = D.weight[R.person[r]]; W[r] = w * R.e[r]; SY[r] = w * R.y[r]; }
  const idx = Int32Array.from(rows);
  const h = new Float64Array(3 * nb);
  const xlogx = (sy, w) => (sy > 0 ? sy * Math.log(sy / w) : 0);
  const nodes = [];
  const grow = (lo, hi, depth) => {
    let n = 0, w = 0, sy = 0;
    for (let p = lo; p < hi; p++) { n++; w += W[idx[p]]; sy += SY[idx[p]]; }
    const id = nodes.length;
    nodes.push({ v: sy / w, n, w });
    if (depth >= spec.maxDepth || n < 2 * spec.minLeaf || sy <= 0) return id;
    histogram(feats, D, R, idx, lo, hi, W, SY, h);
    const parent = xlogx(sy, w);
    const score = (nl, wl, sl, nr, wr, sr) => (nl < spec.minLeaf || nr < spec.minLeaf || sl <= 1e-12 || sr <= 1e-12
      ? -Infinity : xlogx(sl, wl) + xlogx(sr, wr) - parent);
    let best = { gain: -Infinity }, bf = -1;
    feats.forEach((f, j) => { const s = bestSplitOf(f, h, [n, w, sy], score); if (s.gain > best.gain) { best = s; bf = j; } });
    if (bf < 0 || !(best.gain > 0)) return id;
    const mid = partition(feats[bf], best, D, R, idx, lo, hi);
    Object.assign(nodes[id], { f: bf, ...splitThreshold(feats[bf], best) });
    nodes[id].l = grow(lo, mid, depth + 1);
    nodes[id].r = grow(mid, hi, depth + 1);
    return id;
  };
  grow(0, idx.length, 0);
  return { kind: 'tree', features: exportFeatures(feats), nodes };
}
// ---------------------------------------------------------------- Poisson gradient boosting (histogram trees)
export function fitBoosting(D, R, rows, spec, onIter) {
  const feats = treeFeatures(D, R, rows, spec.maxBins);
  const nb = layout(feats, D);
  const sw = new Float64Array(R.n), yr = new Float64Array(R.n);
  let S = 0, SY = 0;
  for (const r of rows) { const w = D.weight[R.person[r]]; sw[r] = w * R.e[r]; yr[r] = R.y[r] / R.e[r]; S += sw[r]; SY += w * R.y[r]; }
  const baseline = Math.log(SY / S);
  const raw = new Float64Array(R.n).fill(baseline);
  const g = new Float64Array(R.n), hs = new Float64Array(R.n);
  const idx = Int32Array.from(rows);
  const trees = [];
  const lam = spec.l2;
  const q = (G, H) => (G * G) / (H + lam);
  for (let it = 0; it < spec.iters; it++) {
    for (const r of rows) { const mu = Math.exp(raw[r]); g[r] = sw[r] * (mu - yr[r]); hs[r] = sw[r] * mu; }
    idx.set(rows);
    const nodes = [];
    const grow = (lo, hi, depth, h, n, G, H) => {
      const id = nodes.length;
      nodes.push({ v: (-spec.rate * G) / (H + lam) });
      const leaf = () => { for (let p = lo; p < hi; p++) raw[idx[p]] += nodes[id].v; return id; };
      if (depth >= spec.maxDepth || n < 2 * spec.minLeaf || H < 2e-3) return leaf();
      if (!h) { h = new Float64Array(3 * nb); histogram(feats, D, R, idx, lo, hi, g, hs, h); }
      const parent = q(G, H);
      const score = (nl, gl, hl, nr, gr, hr) => (nl < spec.minLeaf || nr < spec.minLeaf || hl < 1e-3 || hr < 1e-3
        ? -Infinity : q(gl, hl) + q(gr, hr) - parent);
      let best = { gain: -Infinity }, bf = -1;
      feats.forEach((f, j) => { const s = bestSplitOf(f, h, [n, G, H], score); if (s.gain > best.gain) { best = s; bf = j; } });
      if (bf < 0 || !(best.gain > 0)) return leaf();
      const mid = partition(feats[bf], best, D, R, idx, lo, hi);
      nodes[id] = { f: bf, ...splitThreshold(feats[bf], best) };
      let hl = null, hr = null;
      if (depth + 1 < spec.maxDepth) {               // children that will split need histograms:
        const small = new Float64Array(3 * nb);      // build the smaller one, subtract for the other
        const leftSmall = mid - lo <= hi - mid;
        if (leftSmall) histogram(feats, D, R, idx, lo, mid, g, hs, small);
        else histogram(feats, D, R, idx, mid, hi, g, hs, small);
        for (let j = 0; j < h.length; j++) h[j] -= small[j];
        [hl, hr] = leftSmall ? [small, h] : [h, small];
      }
      const [nl, gl, hl2] = best.left;
      nodes[id].l = grow(lo, mid, depth + 1, hl, nl, gl, hl2);
      nodes[id].r = grow(mid, hi, depth + 1, hr, n - nl, G - gl, H - hl2);
      return id;
    };
    let G0 = 0, H0 = 0;
    for (const r of rows) { G0 += g[r]; H0 += hs[r]; }
    grow(0, idx.length, 0, null, rows.length, G0, H0);
    trees.push(nodes);
    if (onIter) onIter(it, spec.iters);
  }
  return { kind: 'boosting', features: exportFeatures(feats), baseline, trees };
}

// ---------------------------------------------------------------- prediction
export function constantModel(D, R, rows) {
  let S = 0, SY = 0;
  for (const r of rows) { const w = D.weight[R.person[r]]; S += w * R.e[r]; SY += w * R.y[r]; }
  return { kind: 'constant', rate: SY / S };
}
// Annual rates for one person (raw numeric inputs in D.numNames order, NaN = unknown; category
// codes in D.catNames order) at each marriage year in ks.
export function rates(model, numVals, catCodes, ks, D) {
  if (model.kind === 'constant') return ks.map(() => model.rate);
  if (model.kind === 'glm') {
    const nv = model.num.map((n) => numVals[D.numNames.indexOf(n)]);
    const cv = model.cat.map((n) => catCodes[D.catNames.indexOf(n)]);
    return glmEta(model, nv, cv, ks).map(Math.exp);
  }
  const vals = model.features.map((f) => rawValue(f, numVals, catCodes, 0, D));
  const kf = model.features.findIndex((f) => f.type === 'k');
  return ks.map((k) => {
    vals[kf] = k;
    if (model.kind === 'tree') return walk(model.nodes, model.features, vals);
    let s = model.baseline;
    for (const t of model.trees) s += walk(t, model.features, vals);
    return Math.exp(s);
  });
}
export function personInputs(D, i) {
  return [D.numNames.map((n) => D.num[n][i]), D.catNames.map((n) => D.cat[n][i])];
}

// ---------------------------------------------------------------- metrics (as train_pooled.py / metrics.py)
export function deviance(D, R, rows, pred) {
  let s = 0, we = 0;
  rows.forEach((r, j) => {
    const w = D.weight[R.person[r]], mu = R.e[r] * pred[j], y = R.y[r];
    s += w * ((y > 0 ? y * Math.log(y / mu) : 0) - y + mu);
    we += w * R.e[r];
  });
  return (2 * s) / we;
}
// Weighted Harrell's C: comparable pairs (i dissolved at t_i < t_j), concordant when score_i > score_j.
export function harrellC(t, d, score, w) {
  const keep = [];
  for (let i = 0; i < t.length; i++) if (w[i] > 0) keep.push(i);
  const uniq = [...new Set(keep.map((i) => score[i]))].sort((a, b) => a - b);
  const rank = new Map(uniq.map((v, j) => [v, j]));
  const n = uniq.length;
  const tree = new Float64Array(n + 1);
  const add = (i, v) => { for (i += 1; i <= n; i += i & -i) tree[i] += v; };
  const prefix = (i) => { let s = 0; for (; i > 0; i -= i & -i) s += tree[i]; return s; };
  const order = keep.slice().sort((a, b) => t[b] - t[a] || a - b);
  let conc = 0, ties = 0, total = 0, totW = 0;
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j < order.length && t[order[j]] === t[order[i]]) j++;
    for (let p = i; p < j; p++) {
      const k = order[p];
      if (d[k]) {
        const rk = rank.get(score[k]);
        const below = prefix(rk), atv = prefix(rk + 1) - below;
        conc += w[k] * below; ties += w[k] * atv; total += w[k] * totW;
      }
    }
    for (let p = i; p < j; p++) { add(rank.get(score[order[p]]), w[order[p]]); totW += w[order[p]]; }
    i = j;
  }
  return total > 0 ? (conc + 0.5 * ties) / total : NaN;
}
function weightedQuantiles(x, w, qs) {
  const o = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
  const xs = o.map((i) => x[i]);
  const W = o.reduce((s, i) => s + w[i], 0);
  const cw = [];
  let c = 0;
  for (const i of o) { c += w[i]; cw.push((c - 0.5 * w[i]) / W); }
  return qs.map((q) => {
    if (q <= cw[0]) return xs[0];
    if (q >= cw[cw.length - 1]) return xs[xs.length - 1];
    let lo = 0, hi = cw.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cw[mid] <= q) lo = mid; else hi = mid; }
    return xs[lo] + ((xs[hi] - xs[lo]) * (q - cw[lo])) / (cw[hi] - cw[lo]);
  });
}
// Person deciles of the 10-year score; observed and predicted annual rates per decile (intervals).
export function calibration(D, R, rows, pred, people, score10) {
  const pw = people.map((i) => D.weight[i]);
  const edges = weightedQuantiles(score10, pw, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
  const dec = new Int8Array(D.n).fill(-1);
  people.forEach((i, j) => { let k = 0; while (k < 9 && edges[k] <= score10[j]) k++; dec[i] = k; });
  const o = new Float64Array(10), p = new Float64Array(10), e = new Float64Array(10);
  rows.forEach((r, j) => {
    const i = R.person[r], k = dec[i], w = D.weight[i];
    if (k < 0) return;
    o[k] += w * R.y[r]; p[k] += w * R.e[r] * pred[j]; e[k] += w * R.e[r];
  });
  return Array.from({ length: 10 }, (_, k) => ({ decile: k + 1, observed: o[k] / e[k], predicted: p[k] / e[k] }));
}

// ---------------------------------------------------------------- cross-validation driver
export const KINDS = ['constant', 'duration_only', 'additive_spline', 'tree_depth4', 'gradient_boosting'];
export function fitKind(kind, D, R, rows, opts = {}, onIter) {
  if (kind === 'constant') return constantModel(D, R, rows);
  if (kind === 'duration_only') return fitGLM(D, R, rows, SETTINGS.duration_only, onIter);
  if (kind === 'additive_spline') return fitGLM(D, R, rows, SETTINGS.additive_spline, onIter);
  if (kind === 'tree_depth4') return fitTree(D, R, rows, SETTINGS.tree_depth4);
  if (kind === 'gradient_boosting') return fitBoosting(D, R, rows, { ...SETTINGS.gradient_boosting, ...(opts.boosting || {}) }, onIter);
  throw new Error(`unknown model ${kind}`);
}

// Held-out predictions for one fold: fit each model on the other four folds and predict the
// fold's marriage-years (`pred`, aligned with `rows`) and its women's 10-year cumulative
// hazard (`score10`, aligned with `people`). Folds are independent, so a page can run them
// in parallel workers and merge the results with mergeFolds().
export function foldPredictions(D, R, kinds, f, opts = {}, progress = () => {}) {
  const rows = rowsWhere(D, R, (x) => x === f);
  const people = Int32Array.from({ length: D.n }, (_, i) => i).filter((i) => D.fold[i] === f);
  const train = rowsWhere(D, R, (x) => x !== f);
  const out = {};
  for (const kind of kinds) {
    const t0 = Date.now();
    progress({ fold: f, kind, phase: 'fit' });
    const m = fitKind(kind, D, R, train, opts, (it, of) => progress({ fold: f, kind, phase: 'iter', it, of }));
    const byPerson = new Map(), score10 = new Float64Array(people.length);
    people.forEach((i, j) => {
      const [nv, cv] = personInputs(D, i);
      const ks = Array.from({ length: Math.max(10, Math.ceil(D.t[i])) }, (_, y) => y);
      const rr = rates(m, nv, cv, ks, D);
      score10[j] = rr.slice(0, 10).reduce((a, b) => a + b, 0);
      byPerson.set(i, rr);
    });
    const pred = new Float64Array(rows.length);
    rows.forEach((r, j) => { pred[j] = byPerson.get(R.person[r])[R.k[r]]; });
    // the fitted model travels with its predictions, so a page can score a profile with each
    // fold's model and show how much the estimate moves with the training sample
    out[kind] = { rows, pred, people, score10, seconds: (Date.now() - t0) / 1000, model: m };
    progress({ fold: f, kind, phase: 'done' });
  }
  return out;
}

// Pool the five folds' predictions into one held-out prediction per marriage-year and woman.
export function mergeFolds(D, R, kinds, folds) {
  const pred = Object.fromEntries(kinds.map((k) => [k, new Float64Array(R.n)]));
  const score10 = Object.fromEntries(kinds.map((k) => [k, new Float64Array(D.n)]));
  const seconds = Object.fromEntries(kinds.map((k) => [k, 0]));
  for (const fold of folds) {
    for (const k of kinds) {
      const { rows, pred: p, people, score10: s, seconds: t } = fold[k];
      rows.forEach((r, j) => { pred[k][r] = p[j]; });
      people.forEach((i, j) => { score10[k][i] = s[j]; });
      seconds[k] += t;
    }
  }
  return { pred, score10, seconds };
}

// Held-out deviance gain over the constant rate, Harrell's C, O/E and decile calibration.
export function summarize(D, R, kinds, { pred, score10, seconds }) {
  const all = Int32Array.from({ length: R.n }, (_, r) => r);
  const people = Array.from({ length: D.n }, (_, i) => i);
  const devs = Object.fromEntries(kinds.map((k) => [k, deviance(D, R, all, pred[k])]));
  const ref = devs.constant;
  const out = {};
  for (const k of kinds) {
    let oy = 0, pe = 0;
    for (let r = 0; r < R.n; r++) { const w = D.weight[R.person[r]]; oy += w * R.y[r]; pe += w * R.e[r] * pred[k][r]; }
    out[k] = {
      heldout_mean_deviance: devs[k],
      deviance_gain_percent: ref ? 100 * (1 - devs[k] / ref) : null,
      harrell_c: k === 'constant' ? null : harrellC(D.t, D.event, score10[k], D.weight),
      observed_expected: oy / pe,
      calibration: k === 'constant' ? null : calibration(D, R, all, pred[k], people, score10[k]),
      seconds: seconds[k],
    };
  }
  return out;
}

// Five-fold person-held-out evaluation in one thread. `progress(info)` is called often.
export function crossValidate(D, R, kinds, opts = {}, progress = () => {}) {
  const folds = [0, 1, 2, 3, 4].map((f) => foldPredictions(D, R, kinds, f, opts, progress));
  return summarize(D, R, kinds, mergeFolds(D, R, kinds, folds));
}
