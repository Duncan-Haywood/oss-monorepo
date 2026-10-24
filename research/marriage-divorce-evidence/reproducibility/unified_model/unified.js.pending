// Scorer for the pooled multi-survey model (models/unified_multisurvey.json): a Bayesian
// piecewise-exponential hazard fitted jointly on every survey with person-level records.
// Mirrors reproducibility/unified_model/score.py loop for loop; tests/unified.test.mjs checks
// both against Python to 1e-9 on synthetic profiles.
//
// scoreUnified(bundle, profile, opts):
//   profile  { input: value | null } using the codes in bundle.inputs (a blank input is
//            integrated over: its design columns are drawn from their Gaussian distribution
//            conditional on the inputs given, in the chosen population);
//   opts     { population: survey key or 'new', outcome: 'native' | 'separation_or_divorce' |
//            'legal_divorce', start: years married now (0 = from the wedding), horizons: [years] }
// Returns { horizons, risk: [{ mean, lo, hi }], draws, missing_columns }: the posterior mean and
// 90% interval of the chance of a break-up within each horizon after `start`, given the union
// lasted to `start`. The interval covers parameter uncertainty and the inputs left blank.
import { splineFeatures } from './engine.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a) >>> 0;
    t = ((t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normals(seed) {
  const u = mulberry32(seed);
  return () => {
    const u1 = 1 - u();
    const u2 = u();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}

function cholesky(A) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) L[i][i] = s > 1e-12 ? Math.sqrt(s) : 0;
      else L[i][j] = L[j][j] > 0 ? s / L[j][j] : 0;
    }
  }
  return L;
}

function cholSolve(L, b) {
  const n = L.length;
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = L[i][i] > 0 ? s / L[i][i] : 0;
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = L[i][i] > 0 ? s / L[i][i] : 0;
  }
  return x;
}

const given = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(v);

export function designRow(bundle, profile) {
  const ds = bundle.design;
  const row = new Array(ds.columns.length).fill(null);
  const pos = Object.fromEntries(ds.columns.map((c, i) => [c, i]));
  for (const [v, spec] of Object.entries(ds.splines)) {
    if (!given(profile[v])) continue;
    splineFeatures({ knots: [spec.knots], degree: spec.degree, include_bias: spec.include_bias }, 0, Number(profile[v]))
      .forEach((f, j) => { row[pos[`${v}[s${j}]`]] = f; });
  }
  for (const [v, levels] of Object.entries(ds.onehot)) {
    if (!given(profile[v])) continue;
    for (const lv of levels.slice(1)) row[pos[`${v}=${lv}`]] = String(profile[v]) === String(lv) ? 1 : 0;
  }
  for (const v of [...ds.linear, ...ds.binary, 'female', 'same_sex']) {
    if (given(profile[v])) row[pos[v]] = Number(profile[v]);
  }
  const ut = profile.union_type || 'Married';
  for (const u of ds.union_types.slice(1)) row[pos[`union_type=${u}`]] = ut === u ? 1 : 0;
  return row;
}

function primaryValue(dev, profile) {
  const x = profile[dev.input];
  if (!given(x)) return null;
  if (dev.kind === 'lvl') return String(x) === String(dev.level) ? 1 : 0;
  return Number(x);
}

function quantile(sorted, p) {
  const n = sorted.length;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, n - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function scoreUnified(bundle, profile, opts = {}) {
  const ds = bundle.design;
  const post = bundle.posterior;
  const pops = bundle.populations;
  const pop = opts.population || bundle.default_population;
  const lay = post.layout;
  const S = post.draws.length;
  const raw = designRow(bundle, profile);
  const z = raw.map((r, i) => (r === null ? null : (r - ds.mean[i]) / ds.scale[i]));
  const cond = bundle.conditional;
  const mu = cond.mean[pop in cond.mean ? pop : 'new'];
  const Sig = cond.cov;
  const O = [];
  const M = [];
  z.forEach((v, i) => (v === null ? M : O).push(i));
  let cmean = [];
  let Lc = [];
  if (M.length) {
    let C;
    if (O.length) {
      const Loo = cholesky(O.map((i) => O.map((j) => Sig[i][j])));
      const r = cholSolve(Loo, O.map((i) => z[i] - mu[i]));
      cmean = M.map((m) => {
        let s = 0;
        O.forEach((o, k) => { s += Sig[m][o] * r[k]; });
        return mu[m] + s;
      });
      const W = M.map((m) => cholSolve(Loo, O.map((o) => Sig[o][m])));
      C = M.map((mi) => M.map((mj, b) => {
        let s = 0;
        O.forEach((o, k) => { s += Sig[mi][o] * W[b][k]; });
        return Sig[mi][mj] - s;
      }));
    } else {
      cmean = M.map((m) => mu[m]);
      C = M.map((mi) => M.map((mj) => Sig[mi][mj]));
    }
    Lc = cholesky(C);
  }
  const fitted = pops[pop] && pops[pop].fitted;
  const devs = [];
  if (fitted) {
    ds.deviation.forEach((dv, j) => {
      if (dv.survey !== pop) return;
      const x = primaryValue(dv, profile);
      if (x !== null) devs.push([lay.delta[0] + j, (x - dv.mean) / dv.scale]);
    });
  }
  let wy = profile.wedding_year;
  if (!given(wy)) wy = pops[pop] ? pops[pop].mean_wedding_year : 1990;
  const cz = (Number(wy) - 1990) / 10;
  const bands = bundle.bands;
  const NB = bands.length - 1;
  const native = pops[pop] ? pops[pop].outcome : 'separation_or_divorce';
  const want = opts.outcome || 'native';
  const gam = bundle.outcome_layer.legal_divorce.log_ratio;
  let shift = new Array(NB).fill(0);
  if (want === 'legal_divorce' && native !== 'legal_divorce') shift = gam.slice();
  else if (want === 'separation_or_divorce' && native === 'legal_divorce') shift = gam.map((g) => -g);
  const start = Number(opts.start || 0);
  const horizons = opts.horizons || [5, 10, 20];
  const rnd = normals(bundle.prng_seed);
  const res = horizons.map(() => []);
  const si = fitted ? pops[pop].index : null;
  for (let d = 0; d < S; d++) {
    const th = post.draws[d];
    const zm = cmean.slice();
    if (M.length) {
      const eps = M.map(() => rnd());
      for (let a = 0; a < M.length; a++) {
        let s = 0;
        for (let b = 0; b <= a; b++) s += Lc[a][b] * eps[b];
        zm[a] += s;
      }
    }
    let lp = 0;
    const b0 = lay.beta[0];
    let k = 0;
    for (let i = 0; i < z.length; i++) {
      if (z[i] !== null) lp += th[b0 + i] * z[i];
      else { lp += th[b0 + i] * zm[k]; k++; }
    }
    for (const [idx, x] of devs) lp += th[idx] * x;
    if (si !== null) lp += th[lay.c[0] + si] * cz;
    const base = [];
    for (let b = 0; b < NB; b++) {
      let v;
      if (si !== null) v = th[lay.g[0] + b] + th[lay.a[0] + si] + th[lay.r[0] + si * NB + b];
      else {
        const na = lay.a[1] - lay.a[0];
        let s = 0;
        for (let j = 0; j < na; j++) s += th[lay.a[0] + j];
        v = th[lay.g[0] + b] + s / na;
      }
      base.push(Math.exp(v + lp + shift[b]));
    }
    horizons.forEach((h, hi) => {
      let H = 0;
      for (let b = 0; b < NB; b++) {
        const ov = Math.min(start + h, bands[b + 1]) - Math.max(start, bands[b]);
        if (ov > 0) H += base[b] * ov;
      }
      res[hi].push(-Math.expm1(-H));
    });
  }
  const risk = res.map((vals) => {
    const sv = vals.slice().sort((x, y) => x - y);
    return { mean: vals.reduce((x, y) => x + y, 0) / vals.length, lo: quantile(sv, 0.05), hi: quantile(sv, 0.95) };
  });
  return { horizons: horizons.slice(), risk, draws: S, missing_columns: M.length };
}

// Which of the bundle's inputs a profile leaves blank, and which surveys measured each one.
export function unifiedCoverage(bundle, profile) {
  return bundle.inputs.map((inp) => ({ name: inp.name, label: inp.label, given: given(profile[inp.name]), measured_in: inp.measured_in }));
}
