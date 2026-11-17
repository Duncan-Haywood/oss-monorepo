// A synthetic control for a date you name (Abadie, Diamond and Hainmueller 2010, J. Am. Stat. Assoc. 105(490),
// 493-505; Abadie 2021, J. Econ. Lit. 59(2), 391-425). The treated series is matched, over the points before the date,
// by a weighted average of donor series (weights at least zero, summing to one), and the gap after the date is the
// estimate. Inference is the in-space placebo test of the 2010 paper: every donor is put through the same fit as if
// it were the treated one, and the treated series' ratio of after-date to before-date root mean squared gap is ranked
// among them (since 2026-11-17 the ratio's before-gap is floored at the median before-gap of all units, README "A
// floored ratio"). p = (units whose statistic is at least the treated's) / (donors + 1), so the smallest p with 38 donors is
// 1/39 = 0.026, and the test is exact when the treated unit is no different from a donor before the date.
//
// This version matches on the outcome's own before-period values only (no covariates and no V matrix: the
// "all pre-treatment outcomes" variant; Kaul, Klossner, Pfeifer and Schieler 2022 show that with every lag in the
// predictor set the covariates get no weight anyway). Evaluation and bars: README "A synthetic control",
// eval/synth-prereg-2026-11-17.md.

// Weights w >= 0, sum w = 1, minimising ||y - X w||^2, where X is T0 x J (row t = the J donors at time t).
// Accelerated projected gradient (FISTA) onto the simplex; the problem is a small convex QP, so this converges to the
// minimum value (the weights themselves can be non-unique when T0 < J; any minimiser is returned, deterministically).
export function simplexLeastSquares(X, y, { iters = 5000, tol = 1e-10 } = {}) {
  const T = X.length, J = X[0].length;
  // L = largest eigenvalue of X'X, by power iteration
  const G = Array.from({ length: J }, () => new Float64Array(J));
  const b = new Float64Array(J);
  for (let t = 0; t < T; t++) {
    const r = X[t];
    for (let i = 0; i < J; i++) { b[i] += r[i] * y[t]; for (let j = i; j < J; j++) G[i][j] += r[i] * r[j]; }
  }
  for (let i = 0; i < J; i++) for (let j = 0; j < i; j++) G[i][j] = G[j][i];
  let v = new Float64Array(J).fill(1 / Math.sqrt(J)), L = 0;
  for (let it = 0; it < 200; it++) {
    const u = new Float64Array(J);
    for (let i = 0; i < J; i++) { let s = 0; for (let j = 0; j < J; j++) s += G[i][j] * v[j]; u[i] = s; }
    const n = Math.hypot(...u);
    if (!(n > 0)) break;
    L = n; v = u.map((e) => e / n);
  }
  if (!(L > 0)) L = 1;
  const step = 1 / (L * 1.0001);
  let w = new Float64Array(J).fill(1 / J), z = w.slice(), tk = 1;
  const obj = (w0) => { let s = 0; for (let t = 0; t < T; t++) { let f = 0; for (let j = 0; j < J; j++) f += X[t][j] * w0[j]; s += (y[t] - f) ** 2; } return s; };
  let prev = obj(w);
  for (let it = 0; it < iters; it++) {
    const g = new Float64Array(J);
    for (let i = 0; i < J; i++) { let s = -b[i]; for (let j = 0; j < J; j++) s += G[i][j] * z[j]; g[i] = s; }
    const wn = projectSimplex(z.map((e, i) => e - step * g[i]));
    const tn = (1 + Math.sqrt(1 + 4 * tk * tk)) / 2;
    z = wn.map((e, i) => e + ((tk - 1) / tn) * (e - w[i]));
    w = wn; tk = tn;
    if (it % 50 === 49) {
      const cur = obj(w);
      if (cur > prev) { z = w.slice(); tk = 1; } // restart (O'Donoghue and Candes 2015)
      if (Math.abs(prev - cur) <= tol * Math.max(1, prev)) { prev = cur; break; }
      prev = cur;
    }
  }
  return Array.from(w);
}

// Euclidean projection onto { w >= 0, sum w = 1 } (Held, Wolfe and Crowder 1974; Duchi et al. 2008).
export function projectSimplex(v) {
  const u = Array.from(v).sort((a, b) => b - a);
  let css = 0, theta = 0;
  for (let i = 0; i < u.length; i++) {
    css += u[i];
    const t = (css - 1) / (i + 1);
    if (u[i] - t > 0) theta = t;
  }
  return Float64Array.from(v, (e) => Math.max(0, e - theta));
}

const rms = (a) => Math.sqrt(a.reduce((s, e) => s + e * e, 0) / a.length);

// One fit: treated series y (length n), donors as an array of series (each length n), date index k (the first point
// after the change; points 0..k-1 are the before-period).
export function synthFit(y, donors, k) {
  const X = Array.from({ length: k }, (_, t) => donors.map((d) => d[t]));
  const w = simplexLeastSquares(X, y.slice(0, k));
  const synth = y.map((_, t) => donors.reduce((s, d, j) => s + w[j] * d[t], 0));
  const gap = y.map((v, t) => v - synth[t]);
  const pre = rms(gap.slice(0, k)), post = rms(gap.slice(k));
  return { weights: w, synth, gap, preRmspe: pre, postRmspe: post, ratio: post / Math.max(pre, 1e-12) };
}

// The test. y: the treated series; donors: { name: series }; k: date index. Returns the fit, the gap after the date,
// each donor's placebo ratio, the rank-based p, and a fit warning when the treated series is matched worse before
// the date than most donors are (the placebo distribution then says little: Abadie et al. 2010, section 4.3).
// placeboPool 'without' (the pre-registered default): each placebo is fitted against the other donors, the treated
// unit left out, so it has one donor fewer than the treated fit. 'with': the treated unit is moved into each placebo's
// pool (Abadie et al. 2010: "shifting California to the donor pool"), so every unit is fitted against the same number
// of others and the ranks are exchangeable when nothing happened (README "A synthetic control", the diagnostic).
export function synthControlTest(y, donors, k, { minBefore = 5, minAfter = 2, fitWarnQuantile = 0.8, placeboPool = 'without', statistic = 'floored' } = {}) {
  const names = Object.keys(donors);
  const n = y.length;
  if (names.length < 4) throw new Error(`a synthetic control needs at least 4 donor series (got ${names.length})`);
  if (k < minBefore || n - k < minAfter) throw new Error(`the date leaves ${k} points before and ${n - k} after; a synthetic control needs at least ${minBefore} before and ${minAfter} after`);
  for (const s of names) if (donors[s].length !== n) throw new Error(`donor ${s} has ${donors[s].length} points, the treated series ${n}`);
  if ([y, ...names.map((s) => donors[s])].some((a) => a.some((v) => !Number.isFinite(v)))) throw new Error('a synthetic control needs every series complete (no blanks) over the window');
  const series = names.map((s) => donors[s]);
  const fit = synthFit(y, series, k);
  const placebos = names.map((s, j) => {
    const others = series.filter((_, i) => i !== j);
    if (placeboPool === 'with') others.push(y);
    const f = synthFit(series[j], others, k);
    return { name: s, preRmspe: f.preRmspe, postRmspe: f.postRmspe, ratio: f.ratio };
  });
  // Three placebo statistics, each ranked the same way (README "A floored ratio"): 'ratio' (the 2010 paper's),
  // 'floored' (the default since 2026-11-17, eval/synth-floor-prereg-2026-11-17.md) (the after-gap over the before-gap floored at the median before-gap of all units, treated and
  // donors alike, so a donor fitted almost exactly before the date cannot win on a tiny denominator; the floor is a
  // symmetric function of every unit's fit, so the ranks stay exchangeable when nothing happened) and 'post' (the
  // after-gap alone).
  const median = (a) => { const b = [...a].sort((x, z) => x - z), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const floor = median([fit.preRmspe, ...placebos.map((q) => q.preRmspe)]);
  const stat = {
    ratio: (u) => u.ratio,
    floored: (u) => u.postRmspe / Math.max(u.preRmspe, floor, 1e-12),
    post: (u) => u.postRmspe,
  };
  if (!stat[statistic]) throw new Error(`unknown statistic ${statistic} (ratio, floored or post)`);
  const tests = Object.fromEntries(Object.entries(stat).map(([key, s]) => {
    const own = s(fit), atLeast = placebos.filter((q) => s(q) >= own - 1e-12 * Math.abs(own)).length;
    return [key, { value: own, rank: atLeast + 1, p: (atLeast + 1) / (names.length + 1) }];
  }));
  for (const q of placebos) q.floored = stat.floored(q);
  const { rank, p } = tests[statistic];
  const preSorted = placebos.map((q) => q.preRmspe).sort((a, b) => a - b);
  const preRankShare = preSorted.filter((v) => v < fit.preRmspe).length / preSorted.length;
  const after = fit.gap.slice(k);
  const weights = names.map((s, j) => ({ name: s, weight: fit.weights[j] })).filter((e) => e.weight >= 0.001).sort((a, b) => b.weight - a.weight);
  return {
    k, n, donors: names.length, weights, synth: fit.synth, gap: fit.gap,
    preRmspe: fit.preRmspe, postRmspe: fit.postRmspe, ratio: fit.ratio,
    effectAverage: after.reduce((s, e) => s + e, 0) / after.length, effectAtEnd: after[after.length - 1],
    rank, p, statistic, tests, floor, minP: 1 / (names.length + 1), placebos,
    preFitShare: preRankShare, fitWarning: preRankShare >= fitWarnQuantile,
  };
}

// In-time placebo for the synthetic control: the same test with the date moved back into the before-period and the
// window cut at the real date, where the named event cannot act yet.
export function synthInTimePlacebo(y, donors, k, kFake, opts = {}) {
  const cut = (a) => a.slice(0, k);
  const d = Object.fromEntries(Object.entries(donors).map(([s, a]) => [s, cut(a)]));
  return synthControlTest(cut(y), d, kFake, opts);
}
