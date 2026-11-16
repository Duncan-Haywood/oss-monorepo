// Kalman filter and smoother for structural time-series models (local level,
// local linear trend, random walk with drift, plus an optional dummy seasonal),
// with exact diffuse initialisation, maximum-likelihood variances, missing
// values, forecasts, auxiliary residuals for outliers and level shifts, and
// residual diagnostics.
//
// Implemented from the mathematics in Durbin & Koopman (2012), "Time Series
// Analysis by State Space Methods", 2nd ed., chapters 2, 4, 5 and 7 (filter,
// smoother, exact diffuse filter and smoother of section 5.2-5.3, the diffuse
// loglikelihood and AIC of section 7.2-7.4), Koopman (1997) for the exact
// diffuse recursions, Harvey (1989) for the structural models, and Harvey &
// Koopman (1992) / de Jong & Penzer (1998) for auxiliary residuals. No
// third-party code was ported; statsmodels (BSD-3) was used only to produce
// eval/reference.json, which the tests compare against.
//
// Pure functions, no DOM, no network, no randomness.

export const PAPERS = [
  {
    authors: "Durbin, J. & Koopman, S. J.",
    title: "Time Series Analysis by State Space Methods (2nd ed.)",
    venue: "Oxford University Press",
    year: 2012,
    url: "https://doi.org/10.1093/acprof:oso/9780199641178.001.0001",
    doi: "10.1093/acprof:oso/9780199641178.001.0001",
    implemented: "Kalman filter and state smoother (ch. 4), the exact diffuse filter and smoother (sec. 5.2-5.3), disturbance smoothing, the diffuse loglikelihood with the scale concentrated out and AIC counting diffuse elements (sec. 2.10, 7.2-7.4), forecasting and missing observations as skipped updates (sec. 4.10-4.11), and the residual diagnostics of sec. 2.12 (Ljung-Box Q, Bowman-Shenton normality, heteroscedasticity H).",
    deviations: "Variances are found by Nelder-Mead on log variance ratios from several starts rather than BFGS; a ratio below 1e-9 is reported as zero. Diffuse-period disturbances use the N(0) recursion only.",
  },
  {
    authors: "Koopman, S. J.",
    title: "Exact initial Kalman filtering and smoothing for nonstationary time series models",
    venue: "Journal of the American Statistical Association 92(440), 1630-1638",
    year: 1997,
    url: "https://doi.org/10.1080/01621459.1997.10473686",
    doi: "10.1080/01621459.1997.10473686",
    implemented: "The exact diffuse initialisation: the P-infinity / P-star split of the state variance and the recursions that end the diffuse period after the first observations.",
    deviations: "None for a univariate series.",
  },
  {
    authors: "Harvey, A. C.",
    title: "Forecasting, Structural Time Series Models and the Kalman Filter",
    venue: "Cambridge University Press",
    year: 1989,
    url: "https://doi.org/10.1017/CBO9781107049994",
    doi: "10.1017/CBO9781107049994",
    implemented: "The structural components: local level, local linear trend, random walk with drift and the dummy-variable seasonal.",
    deviations: "Trigonometric seasonals and cycles are not offered.",
  },
  {
    authors: "Harvey, A. C. & Koopman, S. J.",
    title: "Diagnostic checking of unobserved-components time series models",
    venue: "Journal of Business & Economic Statistics 10(4), 377-389",
    year: 1992,
    url: "https://doi.org/10.1080/07350015.1992.10509913",
    doi: "10.1080/07350015.1992.10509913",
    implemented: "Auxiliary residuals: the standardised smoothed irregular (outliers) and the standardised smoothed level disturbance (level shifts).",
    deviations: "Flags use a fixed |t| threshold (default 2.5) with no multiple-testing correction; the page says so.",
  },
  {
    authors: "de Jong, P. & Penzer, J.",
    title: "Diagnosing shocks in time series",
    venue: "Journal of the American Statistical Association 93(442), 796-806",
    year: 1998,
    url: "https://doi.org/10.1080/01621459.1998.10473731",
    doi: "10.1080/01621459.1998.10473731",
    implemented: "The reading of a standardised smoothed disturbance as the t-statistic for a one-off shock (an outlier or a break) at that time.",
    deviations: "None.",
  },
];

export const DEFAULTS = {
  slope: "auto", // "none" | "fixed" (drift) | "stochastic" | "auto" (lowest AIC)
  season: "auto", // 0 (none), a whole number >= 2, or "auto" (12 for YYYY-MM, 4 for quarters)
  log: false,
  level: 0.9, // band coverage
  horizon: 0,
  threshold: 2.5, // |t| for outlier / level-shift flags
  top: 8,
};

const LOG2PI = Math.log(2 * Math.PI);
const ZERO_RATIO = 1e-9;

// ---------------------------------------------------------------- linear algebra (small dense)

const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
const eye = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
function mm(A, B) {
  const n = A.length, k = B.length, m = B[0].length;
  const C = zeros(n, m);
  for (let i = 0; i < n; i++)
    for (let l = 0; l < k; l++) {
      const a = A[i][l];
      if (a === 0) continue;
      const Bl = B[l];
      const Ci = C[i];
      for (let j = 0; j < m; j++) Ci[j] += a * Bl[j];
    }
  return C;
}
const tr = (A) => A[0].map((_, j) => A.map((r) => r[j]));
const madd = (...Ms) => Ms[0].map((r, i) => r.map((_, j) => Ms.reduce((s, M) => s + M[i][j], 0)));
const msub = (A, B) => A.map((r, i) => r.map((v, j) => v - B[i][j]));
const mscale = (A, s) => A.map((r) => r.map((v) => v * s));
const mv = (A, x) => A.map((r) => r.reduce((s, v, j) => s + v * x[j], 0));
const vadd = (a, b) => a.map((v, i) => v + b[i]);
const vscale = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const outer = (a, b) => a.map((x) => b.map((y) => x * y));
const sym = (A) => A.map((r, i) => r.map((v, j) => 0.5 * (v + A[j][i])));
const maxAbs = (A) => A.reduce((m, r) => Math.max(m, ...r.map(Math.abs)), 0);

// ---------------------------------------------------------------- model

/**
 * Build the state-space system of a structural model.
 * spec: { slope: "none"|"fixed"|"stochastic", season: 0 | s >= 2 }
 * vars: { irregular, level, slope, seasonal }
 * State: [level, (slope), (gamma_1 .. gamma_{s-1})].
 */
export function buildModel(spec, vars) {
  const hasSlope = spec.slope === "fixed" || spec.slope === "stochastic";
  const s = spec.season >= 2 ? spec.season : 0;
  const m = 1 + (hasSlope ? 1 : 0) + (s ? s - 1 : 0);
  const T = zeros(m, m);
  const Z = new Array(m).fill(0);
  const RQR = zeros(m, m);
  T[0][0] = 1;
  Z[0] = 1;
  RQR[0][0] = vars.level ?? 0;
  const names = ["level"];
  let k = 1;
  if (hasSlope) {
    T[0][1] = 1;
    T[1][1] = 1;
    RQR[1][1] = spec.slope === "stochastic" ? vars.slope ?? 0 : 0;
    names.push("slope");
    k = 2;
  }
  if (s) {
    const g = k;
    for (let j = 0; j < s - 1; j++) T[g][g + j] = -1;
    for (let j = 1; j < s - 1; j++) T[g + j][g + j - 1] = 1;
    Z[g] = 1;
    RQR[g][g] = vars.seasonal ?? 0;
    for (let j = 0; j < s - 1; j++) names.push(j === 0 ? "seasonal" : `seasonal_lag${j}`);
  }
  return { m, T, Z, H: vars.irregular ?? 0, RQR, names, spec: { slope: hasSlope ? spec.slope : "none", season: s } };
}

// Which disturbance variances are free parameters in a spec.
export function freeVariances(spec) {
  const out = ["irregular", "level"];
  if (spec.slope === "stochastic") out.push("slope");
  if (spec.season >= 2) out.push("seasonal");
  return out;
}

// ---------------------------------------------------------------- exact diffuse Kalman filter

const DIFFUSE_TOL = 1e-8;

/**
 * Exact diffuse Kalman filter (Durbin & Koopman 2012, sec. 5.2; Koopman 1997).
 * y: array of numbers or null (missing). Returns per-step quantities for the
 * smoother and the diffuse loglikelihood (DK eq. 7.4).
 */
export function kalmanFilter(model, y) {
  const { m, T, Z, H, RQR } = model;
  const Tt = tr(T);
  let a = new Array(m).fill(0);
  let Pinf = eye(m);
  let Pstar = zeros(m, m);
  let diffuse = true;
  const steps = [];
  let loglik = 0;
  let sumSq = 0; // sum v^2/F over the non-diffuse observed steps (scale-dependent part)
  let sumLogF = 0; // sum log F over those steps
  let sumLogFinf = 0;
  let nScaled = 0; // number of steps whose contribution scales with the variances
  let nObs = 0;
  let dObs = 0; // observations used up by the diffuse period (F_inf > 0)
  let diffuseEnd = 0; // first step index after the diffuse period
  for (let t = 0; t < y.length; t++) {
    const st = { a, Pinf: diffuse ? Pinf : null, Pstar, diffuse, missing: y[t] == null };
    if (st.missing) {
      a = mv(T, a);
      if (diffuse) Pinf = mm(mm(T, Pinf), Tt);
      Pstar = madd(mm(mm(T, Pstar), Tt), RQR);
    } else {
      nObs++;
      const v = y[t] - dot(Z, a);
      const Mstar = mv(Pstar, Z);
      const Fstar = dot(Z, Mstar) + H;
      st.v = v;
      if (diffuse) {
        const Minf = mv(Pinf, Z);
        const Finf = dot(Z, Minf);
        if (Finf > DIFFUSE_TOL) {
          const F1 = 1 / Finf;
          const F2 = -Fstar / (Finf * Finf);
          const K0 = mv(T, vscale(Minf, F1));
          const K1 = mv(T, vadd(vscale(Mstar, F1), vscale(Minf, F2)));
          const L0 = msub(T, outer(K0, Z));
          const L1 = mscale(outer(K1, Z), -1);
          Object.assign(st, { kind: "inf", Finf, Fstar, F1, F2, K0, K1, L0, L1 });
          a = vadd(mv(T, a), vscale(K0, v));
          const TPinf = mm(T, Pinf);
          const newPinf = mm(TPinf, tr(L0));
          Pstar = sym(madd(mm(TPinf, tr(L1)), mm(mm(T, Pstar), tr(L0)), RQR));
          Pinf = sym(newPinf);
          loglik += -0.5 * (LOG2PI + Math.log(Finf));
          sumLogFinf += Math.log(Finf);
          dObs++;
        } else {
          const K = mv(T, vscale(Mstar, 1 / Fstar));
          const L = msub(T, outer(K, Z));
          Object.assign(st, { kind: "star", F: Fstar, K, L });
          a = vadd(mv(T, a), vscale(K, v));
          Pinf = mm(mm(T, Pinf), Tt);
          Pstar = sym(madd(mm(mm(T, Pstar), tr(L)), RQR));
          loglik += -0.5 * (LOG2PI + Math.log(Fstar) + (v * v) / Fstar);
          sumSq += (v * v) / Fstar;
          sumLogF += Math.log(Fstar);
          nScaled++;
        }
      } else {
        const K = mv(T, vscale(Mstar, 1 / Fstar));
        const L = msub(T, outer(K, Z));
        Object.assign(st, { kind: "std", F: Fstar, K, L });
        a = vadd(mv(T, a), vscale(K, v));
        Pstar = sym(madd(mm(mm(T, Pstar), tr(L)), RQR));
        loglik += -0.5 * (LOG2PI + Math.log(Fstar) + (v * v) / Fstar);
        sumSq += (v * v) / Fstar;
        sumLogF += Math.log(Fstar);
        nScaled++;
      }
    }
    steps.push(st);
    if (diffuse && maxAbs(Pinf) <= DIFFUSE_TOL) {
      diffuse = false;
      Pinf = zeros(m, m);
      diffuseEnd = t + 1;
    }
  }
  return {
    steps,
    aEnd: a,
    PinfEnd: diffuse ? Pinf : null,
    PstarEnd: Pstar,
    stillDiffuse: diffuse,
    diffuseEnd: diffuse ? y.length : diffuseEnd,
    loglik,
    sumSq,
    sumLogF,
    sumLogFinf,
    nScaled,
    nObs,
    dObs,
  };
}

// ---------------------------------------------------------------- exact diffuse smoother

/**
 * State and disturbance smoother (DK 2012 sec. 4.4-4.5, and sec. 5.3 for
 * the diffuse period). Returns smoothed states, their variances, and the
 * smoothed observation and state disturbances with variances.
 */
export function kalmanSmoother(model, filt) {
  const { m, T, Z, H, RQR } = model;
  const Tt = tr(T);
  const n = filt.steps.length;
  let r0 = new Array(m).fill(0);
  let r1 = new Array(m).fill(0);
  let N0 = zeros(m, m);
  let N1 = zeros(m, m);
  let N2 = zeros(m, m);
  const ZZ = outer(Z, Z);
  const state = new Array(n);
  const stateVar = new Array(n);
  const eps = new Array(n).fill(null); // { mean, var, t } for the irregular
  const eta = new Array(n).fill(null); // { mean: vector, varDiag: vector, r, N } for state disturbances
  for (let t = n - 1; t >= 0; t--) {
    const st = filt.steps[t];
    const P = st.Pstar;
    // disturbances at t use r_t, N_t (after t)
    const etaMean = mv(RQR, r0);
    const RNR = mm(mm(RQR, N0), RQR);
    eta[t] = {
      mean: etaMean,
      varDiag: RQR.map((row, i) => row[i] - RNR[i][i]),
      r: r0.slice(),
      Ndiag: N0.map((row, i) => row[i]),
    };
    if (st.missing) {
      eps[t] = { mean: 0, var: H, u: null, D: null };
      r0 = mv(Tt, r0);
      N0 = mm(mm(Tt, N0), T);
      if (st.diffuse) {
        r1 = mv(Tt, r1);
        N1 = mm(mm(Tt, N1), T);
        N2 = mm(mm(Tt, N2), T);
      }
    } else if (st.kind === "inf") {
      const { L0, L1, K0, F1, F2, v } = st;
      // DK 2012 eq. 5.39-ish: eps_hat = -H K0' r0_t
      const u = -dot(K0, r0);
      const D = dot(K0, mv(N0, K0));
      eps[t] = { mean: H * u, var: H - H * H * D, u, D };
      const L0t = tr(L0);
      const L1t = tr(L1);
      const nr1 = vadd(vadd(vscale(Z, F1 * v), mv(L0t, r1)), mv(L1t, r0));
      const nr0 = mv(L0t, r0);
      const nN2 = madd(
        mscale(ZZ, F2),
        mm(mm(L0t, N2), L0),
        mm(mm(L0t, N1), L1),
        mm(mm(L1t, N1), L0),
        mm(mm(L1t, N0), L1),
      );
      const nN1 = madd(mscale(ZZ, F1), mm(mm(L0t, N1), L0), mm(mm(L1t, N0), L0), mm(mm(L0t, N0), L1));
      const nN0 = mm(mm(L0t, N0), L0);
      [r0, r1, N0, N1, N2] = [nr0, nr1, nN0, nN1, nN2];
    } else {
      const { F, K, L, v } = st;
      const u = v / F - dot(K, r0);
      const D = 1 / F + dot(K, mv(N0, K));
      eps[t] = { mean: H * u, var: H - H * H * D, u, D };
      const Lt = tr(L);
      r0 = vadd(vscale(Z, v / F), mv(Lt, r0));
      N0 = madd(mscale(ZZ, 1 / F), mm(mm(Lt, N0), L));
      if (st.diffuse) {
        r1 = mv(Tt, r1);
        N1 = mm(mm(Tt, N1), L);
        N2 = mm(mm(Tt, N2), T);
      }
    }
    // smoothed state at t uses r_{t-1}, N_{t-1}
    if (st.diffuse) {
      const Pinf = st.Pinf;
      const mean = vadd(vadd(st.a, mv(P, r0)), mv(Pinf, r1));
      const PinfN1Pstar = mm(mm(Pinf, N1), P);
      const V = msub(
        msub(msub(msub(P, mm(mm(P, N0), P)), tr(PinfN1Pstar)), PinfN1Pstar),
        mm(mm(Pinf, N2), Pinf),
      );
      state[t] = mean;
      stateVar[t] = sym(V);
    } else {
      state[t] = vadd(st.a, mv(P, r0));
      stateVar[t] = sym(msub(P, mm(mm(P, N0), P)));
    }
    if (st.diffuse && (t === 0 || !filt.steps[t - 1].diffuse)) {
      // leaving the diffuse period backwards: nothing to carry beyond t = 0
    }
  }
  return { state, stateVar, eps, eta };
}

// ---------------------------------------------------------------- likelihood and estimation

// Likelihood-only filter on flat arrays, with the steady-state shortcut: in a
// time-invariant model with no missing values, P converges and K, F stop
// changing (DK 2012 sec. 4.3.4), so the covariance update can be skipped.
// Returns the same sums as kalmanFilter.
export function likelihoodFilter(model, y) {
  const { m, T, Z, H, RQR } = model;
  const Q = new Float64Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) Q[i * m + j] = RQR[i][j];
  const Zi = []; for (let i = 0; i < m; i++) if (Z[i] !== 0) Zi.push(i);
  let a = new Float64Array(m), a2 = new Float64Array(m);
  let Pinf = new Float64Array(m * m), Pst = new Float64Array(m * m);
  for (let i = 0; i < m; i++) Pinf[i * m + i] = 1;
  const tmp = new Float64Array(m * m), tmp2 = new Float64Array(m * m), M1 = new Float64Array(m), M2 = new Float64Array(m);
  const K0 = new Float64Array(m), K1 = new Float64Array(m);
  let diffuse = true, steady = false;
  let sumSq = 0, sumLogF = 0, sumLogFinf = 0, nScaled = 0, nObs = 0;
  let Fss = 0;
  const Kss = new Float64Array(m);
  const zdot = (x) => { let s = 0; for (const i of Zi) s += Z[i] * x[i]; return s; };
  const Pz = (P, out) => { for (let i = 0; i < m; i++) { let s = 0; for (const j of Zi) s += P[i * m + j] * Z[j]; out[i] = s; } };
  // T is sparse in every structural model (about 2m non-zeros), so store its rows.
  const Trow = Array.from({ length: m }, (_, i) => T[i].flatMap((v, j) => (v !== 0 ? [[j, v]] : [])));
  const Tstart = new Int32Array(m + 1), Tcol = [], Tval = [];
  for (let i = 0; i < m; i++) { for (const [j, v] of Trow[i]) { Tcol.push(j); Tval.push(v); } Tstart[i + 1] = Tcol.length; }
  const TC = Int32Array.from(Tcol), TV = Float64Array.from(Tval);
  const Tv = (x, out) => { for (let i = 0; i < m; i++) { let s = 0; for (let p = Tstart[i]; p < Tstart[i + 1]; p++) s += TV[p] * x[TC[p]]; out[i] = s; } };
  // out = T A T'
  const TAT = (A, out) => {
    for (let i = 0; i < m; i++) {
      const p0 = Tstart[i], p1 = Tstart[i + 1], row = i * m;
      for (let j = 0; j < m; j++) { let s = 0; for (let p = p0; p < p1; p++) s += TV[p] * A[TC[p] * m + j]; tmp[row + j] = s; }
    }
    for (let j = 0; j < m; j++) {
      const p0 = Tstart[j], p1 = Tstart[j + 1];
      for (let i = 0; i <= j; i++) { const row = i * m; let s = 0; for (let p = p0; p < p1; p++) s += TV[p] * tmp[row + TC[p]]; out[row + j] = s; out[j * m + i] = s; }
    }
  };
  const Mi = new Float64Array(m);
  for (let t = 0; t < y.length; t++) {
    const yt = y[t];
    if (yt == null) {
      steady = false;
      Tv(a, a2); [a, a2] = [a2, a];
      if (diffuse) { TAT(Pinf, tmp2); Pinf.set(tmp2); }
      TAT(Pst, tmp2); for (let i = 0; i < m * m; i++) Pst[i] = tmp2[i] + Q[i];
    } else {
      nObs++;
      const v = yt - zdot(a);
      if (steady) {
        sumSq += (v * v) / Fss; sumLogF += Math.log(Fss); nScaled++;
        Tv(a, a2); for (let i = 0; i < m; i++) a2[i] += Kss[i] * v; [a, a2] = [a2, a];
        continue;
      }
      Pz(Pst, M2);
      const Fstar = zdot(M2) + H;
      let Finf = 0;
      if (diffuse) { Pz(Pinf, Mi); Finf = zdot(Mi); }
      if (diffuse && Finf > DIFFUSE_TOL) {
        const F1 = 1 / Finf, F2 = -Fstar / (Finf * Finf);
        for (let i = 0; i < m; i++) { M1[i] = Mi[i] * F1; tmp2[i] = M2[i] * F1 + Mi[i] * F2; }
        Tv(M1, K0); Tv(tmp2.subarray(0, m), K1);
        Tv(a, a2); for (let i = 0; i < m; i++) a2[i] += K0[i] * v; [a, a2] = [a2, a];
        // Pinf' = T Pinf T' - K0 (T Pinf Z')' ; Pstar' = T Pstar T' - K0 (T Pstar Z')' - K1 (T Pinf Z')' + Q
        // using L0 = T - K0 Z, L1 = -K1 Z:  T Pinf L0' = T Pinf T' - (T Pinf Z') K0'; T Pinf L1' = -(T Pinf Z') K1'; T Pstar L0' = T Pstar T' - (T Pstar Z') K0'
        const TPinfZ = new Float64Array(m), TPstZ = new Float64Array(m);
        Tv(Mi, TPinfZ); Tv(M2, TPstZ);
        TAT(Pinf, tmp2);
        const nPinf = new Float64Array(m * m);
        for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) nPinf[i * m + j] = tmp2[i * m + j] - TPinfZ[i] * K0[j];
        TAT(Pst, tmp2);
        for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) Pst[i * m + j] = tmp2[i * m + j] - TPstZ[i] * K0[j] - TPinfZ[i] * K1[j] + Q[i * m + j];
        for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) { const u = 0.5 * (Pst[i * m + j] + Pst[j * m + i]); Pst[i * m + j] = Pst[j * m + i] = u; const w = 0.5 * (nPinf[i * m + j] + nPinf[j * m + i]); nPinf[i * m + j] = nPinf[j * m + i] = w; }
        Pinf = nPinf;
        sumLogFinf += Math.log(Finf);
      } else {
        const K = K0;
        Tv(M2, K); for (let i = 0; i < m; i++) K[i] /= Fstar;
        Tv(a, a2); for (let i = 0; i < m; i++) a2[i] += K[i] * v; [a, a2] = [a2, a];
        if (diffuse) { TAT(Pinf, tmp2); Pinf.set(tmp2); }
        // Pstar' = T Pstar T' - K (T Pstar Z')' + Q = T P T' - Fstar K K' + Q
        TAT(Pst, tmp2);
        let change = 0, size = 0;
        for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
          const nv = tmp2[i * m + j] - Fstar * K[i] * K[j] + Q[i * m + j];
          change = Math.max(change, Math.abs(nv - Pst[i * m + j]));
          size = Math.max(size, Math.abs(nv));
          Pst[i * m + j] = nv;
        }
        sumSq += (v * v) / Fstar; sumLogF += Math.log(Fstar); nScaled++;
        if (!diffuse && change <= 1e-11 * size) { steady = true; Pz(Pst, M2); Fss = zdot(M2) + H; Tv(M2, Kss); for (let i = 0; i < m; i++) Kss[i] /= Fss; }
      }
    }
    if (diffuse) {
      let mx = 0; for (let i = 0; i < m * m; i++) mx = Math.max(mx, Math.abs(Pinf[i]));
      if (mx <= DIFFUSE_TOL) diffuse = false;
    }
  }
  return { stillDiffuse: diffuse, sumSq, sumLogF, sumLogFinf, nScaled, nObs };
}

/** Concentrated diffuse loglikelihood for variance ratios relative to the irregular (DK sec. 2.10.2, 7.3). */
export function concentratedLoglik(spec, ratios, y) {
  const vars = { irregular: 1, ...ratios };
  const model = buildModel(spec, vars);
  const f = likelihoodFilter(model, y);
  if (f.stillDiffuse || f.nScaled < 1) return { loglik: -Infinity, scale: NaN, filter: f };
  const scale = f.sumSq / f.nScaled;
  if (!(scale > 0)) return { loglik: -Infinity, scale, filter: f };
  const n = f.nObs;
  const loglik = -0.5 * n * LOG2PI - 0.5 * f.sumLogFinf - 0.5 * f.nScaled * (Math.log(scale) + 1) - 0.5 * f.sumLogF;
  return { loglik, scale, filter: f };
}

// Nelder-Mead minimiser (Nelder & Mead 1965), standard coefficients.
export function nelderMead(fn, x0, { step = 1, maxIter = 2000, tol = 1e-10, xtol = 1e-4 } = {}) {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const x = x0.slice();
    x[i] += step;
    simplex.push(x);
  }
  let values = simplex.map(fn);
  for (let iter = 0; iter < maxIter; iter++) {
    const order = values.map((v, i) => i).sort((i, j) => values[i] - values[j]);
    simplex = order.map((i) => simplex[i]);
    values = order.map((i) => values[i]);
    if (Math.abs(values[n] - values[0]) <= tol * (Math.abs(values[0]) + tol) && iter > 10) {
      const spread = Math.max(...simplex.slice(1).map((x) => Math.max(...x.map((v, k) => Math.abs(v - simplex[0][k])))));
      if (spread < xtol) break;
    }
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) centroid[k] += simplex[i][k] / n;
    const at = (c) => centroid.map((v, k) => v + c * (simplex[n][k] - v));
    const xr = at(-1);
    const fr = fn(xr);
    if (fr < values[0]) {
      const xe = at(-2);
      const fe = fn(xe);
      if (fe < fr) [simplex[n], values[n]] = [xe, fe];
      else [simplex[n], values[n]] = [xr, fr];
    } else if (fr < values[n - 1]) {
      [simplex[n], values[n]] = [xr, fr];
    } else {
      const outside = fr < values[n];
      const xc = outside ? at(-0.5) : at(0.5);
      const fc = fn(xc);
      if (fc < (outside ? fr : values[n])) [simplex[n], values[n]] = [xc, fc];
      else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, k) => simplex[0][k] + 0.5 * (v - simplex[0][k]));
          values[i] = fn(simplex[i]);
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i <= n; i++) if (values[i] < values[best]) best = i;
  return { x: simplex[best], value: values[best] };
}

const LOG_LO = -30;
const LOG_HI = 25;
const clampLog = (x) => Math.min(LOG_HI, Math.max(LOG_LO, x));

/**
 * Maximum-likelihood variances for a spec. Returns variances, loglik, and
 * the counts used by AIC (DK 2012 sec. 7.4: q free variances + w diffuse elements).
 */
export function fitModel(spec, y) {
  const free = freeVariances(spec).slice(1); // ratios relative to the irregular
  const k = free.length;
  const toRatios = (x) => Object.fromEntries(free.map((name, i) => [name, Math.exp(clampLog(x[i]))]));
  const obj = (x) => {
    const r = concentratedLoglik(spec, toRatios(x), y);
    const pen = x.reduce((s, v) => s + (v < LOG_LO ? (LOG_LO - v) ** 2 : v > LOG_HI ? (v - LOG_HI) ** 2 : 0), 0);
    return Number.isFinite(r.loglik) ? -r.loglik + pen : 1e300;
  };
  // A small grid of starts, best few refined.
  const grid = k >= 3 ? [-7, -2, 2] : [-8, -3, 0, 3];
  let starts = [[]];
  for (let i = 0; i < k; i++) starts = starts.flatMap((s) => grid.map((g) => [...s, g]));
  const scored = starts.map((x) => ({ x, v: obj(x) })).sort((a, b) => a.v - b.v);
  let best = null;
  for (const s of scored.slice(0, Math.min(3, scored.length))) {
    let r = nelderMead(obj, s.x, { step: 1.5 });
    r = nelderMead(obj, r.x, { step: 0.3 });
    if (!best || r.value < best.value) best = r;
  }
  // A tight polish of the winner only (cheap: one start).
  {
    const r = nelderMead(obj, best.x, { step: 0.05, tol: 1e-13, xtol: 1e-7 });
    if (r.value <= best.value) best = r;
  }
  // Also try each ratio pinned at zero (the boundary Nelder-Mead approaches slowly).
  for (let i = 0; i < k; i++) {
    const x = best.x.slice();
    x[i] = LOG_LO;
    const v = obj(x);
    if (v < best.value - 1e-9) best = { x, value: v };
  }
  const ratios = toRatios(best.x);
  for (const name of free) if (ratios[name] < ZERO_RATIO) ratios[name] = 0;
  const c = concentratedLoglik(spec, ratios, y);
  const variances = { irregular: c.scale };
  for (const name of free) variances[name] = ratios[name] * c.scale;
  const q = freeVariances(spec).length;
  const w = buildModel(spec, {}).m;
  return {
    spec,
    variances,
    ratios,
    loglik: c.loglik,
    q,
    w,
    aic: -2 * c.loglik + 2 * (q + w),
  };
}

// ---------------------------------------------------------------- special functions
// lgamma, gser, gcf, gammaQ: as in ventures/mann-kendall-trend/engine.mjs (this repository, MIT).

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function gser(a, x) {
  let sum = 1 / a;
  let del = sum;
  let ap = a;
  for (let n = 0; n < 1000; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-17) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
}
function gcf(a, x) {
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - gser(a, x) : gcf(a, x);
}
/** Upper tail of chi-square with df degrees of freedom. */
export const chiSquareSf = (x, df) => gammaQ(df / 2, x / 2);

// Regularised incomplete beta I_x(a, b) by the continued fraction (modified Lentz).
function betacf(a, b, x) {
  const FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}
export function betaInc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(lbt) * betacf(a, b, x)) / a;
  return 1 - (Math.exp(lbt) * betacf(b, a, 1 - x)) / b;
}
/** CDF of the F distribution. */
export const fCdf = (x, d1, d2) => (x <= 0 ? 0 : betaInc(d1 / 2, d2 / 2, (d1 * x) / (d1 * x + d2)));

/** Standard normal quantile, Newton's method on the exact CDF (as in ventures/survival-analysis). */
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new Error("normalQuantile needs 0 < p < 1");
  if (p < 0.5) return -normalQuantile(1 - p);
  if (p === 0.5) return 0;
  const cdf = (z) => 1 - 0.5 * gammaQ(0.5, (z * z) / 2);
  let z = Math.sqrt(-2 * Math.log(1 - p));
  z = Math.max(0.1, z - (2.515517 + 0.802853 * z + 0.010328 * z * z) / (1 + 1.432788 * z + 0.189269 * z * z + 0.001308 * z * z * z));
  for (let i = 0; i < 60; i++) {
    const step = (cdf(z) - p) / (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI));
    z -= step;
    if (Math.abs(step) < 1e-14) break;
  }
  return z;
}

// ---------------------------------------------------------------- diagnostics (DK 2012 sec. 2.12)

/** Ljung-Box Q(k), Bowman-Shenton normality N, heteroscedasticity H(h) on standardised one-step errors. */
export function diagnostics(e, nParams) {
  const n = e.length;
  const out = { n };
  if (n < 8) return out;
  const mean = e.reduce((s, v) => s + v, 0) / n;
  const c = (k) => {
    let s = 0;
    for (let t = k; t < n; t++) s += (e[t] - mean) * (e[t - k] - mean);
    return s / n;
  };
  const c0 = c(0);
  const k = Math.max(1, Math.min(10, Math.floor(n / 5)));
  let Q = 0;
  for (let j = 1; j <= k; j++) {
    const rj = c(j) / c0;
    Q += (rj * rj) / (n - j);
  }
  Q *= n * (n + 2);
  const df = Math.max(1, k - nParams + 1);
  out.ljungBox = { lags: k, df, Q, p: chiSquareSf(Q, df) };
  const m2 = c0;
  const m3 = e.reduce((s, v) => s + (v - mean) ** 3, 0) / n;
  const m4 = e.reduce((s, v) => s + (v - mean) ** 4, 0) / n;
  const S = m3 / m2 ** 1.5;
  const K = m4 / (m2 * m2);
  const N = n * ((S * S) / 6 + ((K - 3) ** 2) / 24);
  out.normality = { skewness: S, kurtosis: K, N, p: Math.exp(-N / 2) };
  const h = Math.round(n / 3);
  if (h >= 2) {
    let num = 0, den = 0;
    for (let t = n - h; t < n; t++) num += e[t] * e[t];
    for (let t = 0; t < h; t++) den += e[t] * e[t];
    const Hs = num / den;
    const lower = fCdf(Hs, h, h);
    out.heteroscedasticity = { h, H: Hs, p: Math.min(1, 2 * Math.min(lower, 1 - lower)) };
  }
  return out;
}

// ---------------------------------------------------------------- CSV input

const MISSING = new Set(["", "na", "n/a", "nan", "null", ".", "-", "none", "missing", "#n/a"]);

function splitLine(line, sep) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseNumber(s) {
  if (s == null) return null;
  let t = String(s).trim();
  if (MISSING.has(t.toLowerCase())) return null;
  t = t.replace(/[\s,](?=\d{3}(\D|$))/g, "").replace(/^\$/, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return undefined;
  return Number(t);
}

export function parseCsv(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { error: "Paste a CSV with a header row and at least a few rows." };
  const head = lines[0];
  const sep = [",", "\t", ";"].map((c) => [c, head.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const header = splitLine(head, sep);
  const rows = lines.slice(1).map((l) => splitLine(l, sep));
  return { header, rows };
}

function seasonFromTime(labels) {
  const sample = labels.filter(Boolean).slice(0, 24);
  if (sample.length < 4) return 0;
  if (sample.every((s) => /^\d{4}[-/.](0?[1-9]|1[0-2])$/.test(s) || /^\d{4}[-/](0[1-9]|1[0-2])[-/]01$/.test(s))) return 12;
  if (sample.every((s) => /^\d{4}\s*[-_ ]?\s*Q[1-4]$/i.test(s) || /^Q[1-4]\s*[-_ ]?\s*\d{4}$/i.test(s))) return 4;
  return 0;
}

/** Pick the time and value columns from a parsed CSV. */
export function readSeries(text, { column, timeColumn } = {}) {
  const p = parseCsv(text);
  if (p.error) return p;
  const { header, rows } = p;
  const lower = header.map((h) => h.toLowerCase());
  const numericShare = header.map((_, j) => {
    let ok = 0, seen = 0;
    for (const r of rows) {
      const v = parseNumber(r[j]);
      if (v === null) continue;
      seen++;
      if (v !== undefined) ok++;
    }
    return seen ? ok / seen : 0;
  });
  let tj = -1;
  if (timeColumn != null) {
    tj = lower.indexOf(String(timeColumn).toLowerCase());
    if (tj < 0) return { error: `No column named "${timeColumn}". Columns: ${header.join(", ")}.` };
  } else {
    tj = lower.findIndex((h) => /^(date|time|year|month|quarter|period|week|day|timestamp|t)$/.test(h));
    if (tj < 0) tj = numericShare.findIndex((s) => s < 0.9);
  }
  let vj = -1;
  if (column != null) {
    vj = lower.indexOf(String(column).toLowerCase());
    if (vj < 0) return { error: `No column named "${column}". Columns: ${header.join(", ")}.` };
  } else {
    vj = numericShare.findIndex((s, j) => j !== tj && s >= 0.6);
    if (vj < 0) return { error: "No numeric column found. The series needs one column of numbers (blank or NA for missing values)." };
  }
  const labels = [];
  const y = [];
  const bad = [];
  rows.forEach((r, i) => {
    const v = parseNumber(r[vj]);
    labels.push(tj >= 0 ? r[tj] ?? String(i + 1) : String(i + 1));
    if (v === undefined) {
      bad.push(i + 2);
      y.push(null);
    } else y.push(v);
  });
  return { header, labels, y, column: header[vj], timeColumn: tj >= 0 ? header[tj] : null, badLines: bad };
}

// ---------------------------------------------------------------- formatting

export function fmt(x, digits = 4) {
  if (x == null || !Number.isFinite(x)) return String(x);
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-3) return x.toExponential(2);
  return Number(x.toPrecision(digits)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

const SPEC_NAMES = {
  none: "local level (random walk plus noise)",
  fixed: "random walk with drift plus noise",
  stochastic: "local linear trend (level and slope both drift)",
};

// ---------------------------------------------------------------- top level

/**
 * analyze({ csv | y, labels?, column?, timeColumn?, slope?, season?, log?, level?, horizon?, threshold?, top? })
 * Returns a JSON-serialisable result with a plain-language summary.
 */
export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
  let labels, yRaw, column = "value", timeColumn = null;
  const warnings = [];
  if (Array.isArray(o.y)) {
    yRaw = o.y.map((v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v)));
    labels = Array.isArray(o.labels) && o.labels.length === yRaw.length ? o.labels.map(String) : yRaw.map((_, i) => String(i + 1));
  } else if (typeof o.csv === "string") {
    const s = readSeries(o.csv, { column: o.column, timeColumn: o.timeColumn });
    if (s.error) return { error: s.error };
    ({ labels, column, timeColumn } = s);
    yRaw = s.y;
    if (s.badLines.length) warnings.push(`${s.badLines.length} value(s) were not numbers and were treated as missing (line ${s.badLines.slice(0, 5).join(", ")}${s.badLines.length > 5 ? ", ..." : ""}).`);
  } else return { error: "Give a CSV (csv) or an array of numbers (y)." };

  const n = yRaw.length;
  const nObs = yRaw.filter((v) => v != null).length;
  if (nObs < 6) return { error: `Need at least 6 observed values; found ${nObs}.` };
  if (n > 20000) return { error: `At most 20,000 time points; found ${n}.` };
  if (o.log && yRaw.some((v) => v != null && v <= 0)) return { error: "The log option needs every value above zero." };
  const y = o.log ? yRaw.map((v) => (v == null ? null : Math.log(v))) : yRaw;
  const level = Number(o.level);
  if (!(level > 0.5 && level < 0.9999)) return { error: "level (band coverage) must be between 0.5 and 0.9999." };
  const horizon = Math.max(0, Math.min(1000, Math.floor(Number(o.horizon) || 0)));
  const threshold = Number(o.threshold) > 0 ? Number(o.threshold) : DEFAULTS.threshold;

  let season = o.season;
  if (season === "auto" || season == null) season = seasonFromTime(labels);
  season = Math.floor(Number(season)) || 0;
  if (season === 1 || season < 0) season = 0;
  if (season > 0 && nObs < 2 * season + 3) {
    warnings.push(`Too few observations for a season of ${season}; fitted without a seasonal.`);
    season = 0;
  }
  if (season > 53) return { error: "season must be at most 53 (use 7 for daily data with a weekly pattern, 12 for monthly, 4 for quarterly)." };

  const slopeChoices = o.slope === "auto" ? ["none", "fixed", "stochastic"] : [o.slope];
  if (!slopeChoices.every((s) => ["none", "fixed", "stochastic"].includes(s))) return { error: 'slope must be "none", "fixed", "stochastic" or "auto".' };
  const fits = [];
  for (const slope of slopeChoices) {
    const spec = { slope, season };
    const m = buildModel(spec, {}).m;
    if (nObs < m + 3) continue;
    fits.push(fitModel(spec, y));
  }
  if (!fits.length) return { error: "Too few observations for this model." };
  fits.sort((a, b) => a.aic - b.aic);
  const fit = fits[0];
  const model = buildModel(fit.spec, fit.variances);
  const filt = kalmanFilter(model, y);
  const sm = kalmanSmoother(model, filt);
  const z = normalQuantile(0.5 + level / 2);
  const back = o.log ? Math.exp : (x) => x;
  const hasSlope = fit.spec.slope !== "none";
  const gIdx = hasSlope ? 2 : 1;

  const points = [];
  const stdErrors = [];
  for (let t = 0; t < n; t++) {
    const st = filt.steps[t];
    const lv = sm.state[t][0];
    const lvSd = Math.sqrt(Math.max(0, sm.stateVar[t][0][0]));
    const seas = season ? sm.state[t][gIdx] : 0;
    const p = {
      t,
      label: labels[t],
      y: yRaw[t],
      level: back(lv),
      levelLo: back(lv - z * lvSd),
      levelHi: back(lv + z * lvSd),
      levelSd: o.log ? null : lvSd,
    };
    if (hasSlope) {
      p.slope = sm.state[t][1];
      p.slopeSd = Math.sqrt(Math.max(0, sm.stateVar[t][1][1]));
    }
    if (season) {
      p.seasonal = seas;
      p.adjusted = yRaw[t] == null ? null : o.log ? yRaw[t] / Math.exp(seas) : yRaw[t] - seas;
    }
    // filtered level (one-step-ahead prediction of the level at t uses data before t)
    if (!st.missing && st.kind === "std") {
      const e = st.v / Math.sqrt(st.F);
      p.stdError = e;
      stdErrors.push(e);
    }
    // auxiliary residuals
    const ep = sm.eps[t];
    if (ep && ep.D != null && ep.D > 1e-12 && fit.variances.irregular > 0) p.outlierT = ep.u / Math.sqrt(ep.D);
    const et = sm.eta[t];
    if (t < n - 1 && et.Ndiag[0] > 1e-12 && fit.variances.level > 0) p.shiftT = et.r[0] / Math.sqrt(et.Ndiag[0]);
    points.push(p);
  }

  // forecasts
  const forecast = [];
  if (horizon > 0) {
    if (filt.stillDiffuse) warnings.push("The series is too short to forecast from (the start-up period has not ended).");
    else {
      let a = filt.aEnd;
      let P = filt.PstarEnd;
      const Tt = tr(model.T);
      for (let h = 1; h <= horizon; h++) {
        const mean = dot(model.Z, a);
        const varY = dot(model.Z, mv(P, model.Z)) + model.H;
        const varL = P[0][0];
        const sdY = Math.sqrt(Math.max(0, varY));
        const sdL = Math.sqrt(Math.max(0, varL));
        forecast.push({
          h,
          mean: back(mean),
          lo: back(mean - z * sdY),
          hi: back(mean + z * sdY),
          level: back(a[0]),
          levelLo: back(a[0] - z * sdL),
          levelHi: back(a[0] + z * sdL),
          sd: o.log ? null : sdY,
        });
        a = mv(model.T, a);
        P = madd(mm(mm(model.T, P), Tt), model.RQR);
      }
    }
  }

  const nParams = fit.q;
  const diag = diagnostics(stdErrors, nParams);

  const outliers = points
    .filter((p) => p.outlierT != null && Math.abs(p.outlierT) >= threshold)
    .sort((a, b) => Math.abs(b.outlierT) - Math.abs(a.outlierT))
    .slice(0, o.top)
    .map((p) => ({ t: p.t, label: p.label, y: p.y, level: p.level, tStat: p.outlierT }));
  const shifts = points
    .filter((p) => p.shiftT != null && Math.abs(p.shiftT) >= threshold)
    .sort((a, b) => Math.abs(b.shiftT) - Math.abs(a.shiftT))
    .slice(0, o.top)
    .map((p) => ({ t: p.t, from: p.label, to: points[p.t + 1].label, before: p.level, after: points[p.t + 1].level, tStat: p.shiftT }));

  const v = fit.variances;
  const snr = v.irregular > 0 ? v.level / v.irregular : Infinity;
  const last = points[n - 1];
  const parts = [];
  const unitNote = o.log ? " (the model runs on logs; levels are shown back on the original scale, as medians)" : "";
  parts.push(`Best model by AIC: ${SPEC_NAMES[fit.spec.slope]}${season ? ` with a ${season}-period seasonal` : ""}${unitNote}.`);
  parts.push(`The underlying level ends at ${fmt(last.level)} (${Math.round(level * 100)}% band ${fmt(last.levelLo)} to ${fmt(last.levelHi)}).`);
  if (v.level === 0) parts.push("The level does not drift: the data are best read as a fixed line plus noise.");
  else if (snr < 0.1) parts.push(`Most period-to-period movement is noise: the level variance is ${fmt(snr, 2)} times the irregular variance, so the smoothed line moves slowly.`);
  else if (snr > 10) parts.push(`Most period-to-period movement is real: the level variance is ${fmt(snr, 2)} times the irregular variance, so the smoothed line follows the data closely.`);
  else parts.push(`Signal-to-noise ratio ${fmt(snr, 2)}: both real level changes and noise matter.`);
  if (hasSlope) {
    const s = last.slope;
    const sd = last.slopeSd;
    const sig = Math.abs(s) > z * sd;
    parts.push(`The slope at the end is ${fmt(o.log ? 100 * (Math.exp(s) - 1) : s, 3)}${o.log ? "% per period" : " per period"} (${sig ? "clearly" : "not clearly"} different from zero at ${Math.round(level * 100)}%).`);
  }
  if (shifts.length) parts.push(`Largest level shift: between ${shifts[0].from} and ${shifts[0].to} (t = ${shifts[0].tStat.toFixed(1)}).`);
  else parts.push(`No level shift reaches |t| ${threshold}.`);
  if (outliers.length) parts.push(`${outliers.length === 1 ? "One point stands" : `${outliers.length} points stand`} out from the level as outliers, the largest at ${outliers[0].label} (t = ${outliers[0].tStat.toFixed(1)}).`);
  else parts.push(`No outlier reaches |t| ${threshold}.`);
  if (forecast.length) {
    const f = forecast[forecast.length - 1];
    parts.push(`Forecast ${forecast.length} period(s) ahead: ${fmt(f.mean)} (${Math.round(level * 100)}% interval ${fmt(f.lo)} to ${fmt(f.hi)}).`);
  }
  const missing = n - nObs;
  if (missing) parts.push(`${missing} missing value(s) were filled by the smoother, with wider bands there.`);
  const flags = [];
  if (diag.ljungBox && diag.ljungBox.p < 0.05) flags.push("the one-step errors are autocorrelated (Ljung-Box p < 0.05): a seasonal, a slope or a different model may fit better");
  if (diag.normality && diag.normality.p < 0.05) flags.push("the errors are not normal (p < 0.05), so treat the bands as approximate");
  if (diag.heteroscedasticity && diag.heteroscedasticity.p < 0.05) flags.push("the noise level changes over the series (H test p < 0.05)");
  if (flags.length) parts.push(`Checks: ${flags.join("; ")}.`);

  return {
    summary: parts.join(" "),
    warnings,
    column,
    timeColumn,
    n,
    nObserved: nObs,
    log: Boolean(o.log),
    model: {
      slope: fit.spec.slope,
      season,
      description: SPEC_NAMES[fit.spec.slope] + (season ? ` + ${season}-period dummy seasonal` : ""),
      variances: v,
      signalToNoise: snr,
      loglik: fit.loglik,
      aic: fit.aic,
      freeVariances: fit.q,
      diffuseElements: fit.w,
    },
    candidates: fits.map((f) => ({ slope: f.spec.slope, season: f.spec.season, loglik: f.loglik, aic: f.aic, variances: f.variances })),
    level,
    threshold,
    points,
    forecast,
    outliers,
    shifts,
    diagnostics: diag,
    papers: PAPERS.map((p) => `${p.authors} (${p.year})`),
  };
}

/** One CSV row per time point. */
export function toCsv(r) {
  const cols = ["label", "y", "level", "level_lo", "level_hi"];
  const hasSlope = r.points.some((p) => p.slope != null);
  const hasSeason = r.points.some((p) => p.seasonal != null);
  if (hasSlope) cols.push("slope");
  if (hasSeason) cols.push("seasonal", "seasonally_adjusted");
  cols.push("one_step_std_error", "outlier_t", "shift_t");
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const num = (x) => (x == null || !Number.isFinite(x) ? "" : String(Number(x.toPrecision(10))));
  const lines = [cols.join(",")];
  for (const p of r.points) {
    const row = [q(String(p.label)), num(p.y), num(p.level), num(p.levelLo), num(p.levelHi)];
    if (hasSlope) row.push(num(p.slope));
    if (hasSeason) row.push(num(p.seasonal), num(p.adjusted));
    row.push(num(p.stdError), num(p.outlierT), num(p.shiftT));
    lines.push(row.join(","));
  }
  for (const f of r.forecast) lines.push([q(`+${f.h}`), "", num(f.level), num(f.levelLo), num(f.levelHi), ...(hasSlope ? [""] : []), ...(hasSeason ? ["", ""] : []), "", "", ""].join(","));
  return lines.join("\n") + "\n";
}
