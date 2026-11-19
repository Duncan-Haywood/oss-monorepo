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

// Weights w >= 0, sum w = 1, minimising ||b - A w||^2 with A given by its rows (p x J, p small). The gradient is
// formed through the p residuals, so a step costs p*J rather than J^2: the inner solve of the covariate fit below runs
// thousands of times per test.
export function simplexLeastSquaresRows(A, b, { iters = 2000, tol = 1e-10, start = null } = {}) {
  const P = A.length, J = A[0].length;
  const a = new Float64Array(P * J);
  for (let i = 0; i < P; i++) for (let j = 0; j < J; j++) a[i * J + j] = A[i][j];
  // L = largest eigenvalue of A A' (equal to that of A'A), by power iteration on the p x p matrix
  const M = new Float64Array(P * P);
  for (let i = 0; i < P; i++) for (let q = 0; q < P; q++) { let s = 0; for (let j = 0; j < J; j++) s += a[i * J + j] * a[q * J + j]; M[i * P + q] = s; }
  let v = new Float64Array(P).fill(1 / Math.sqrt(P)), L = 0;
  for (let it = 0; it < 100; it++) {
    const u = new Float64Array(P);
    for (let i = 0; i < P; i++) { let s = 0; for (let q = 0; q < P; q++) s += M[i * P + q] * v[q]; u[i] = s; }
    let n = 0; for (let i = 0; i < P; i++) n += u[i] * u[i]; n = Math.sqrt(n);
    if (!(n > 0)) break;
    L = n; for (let i = 0; i < P; i++) v[i] = u[i] / n;
  }
  if (!(L > 0)) L = 1;
  const step = 1 / (L * 1.0001);
  let bb = 0; for (let i = 0; i < P; i++) bb += b[i] * b[i];
  const r = new Float64Array(P), tmp = new Float64Array(J), srt = new Float64Array(J);
  const resid = (w0) => { let s = 0; for (let i = 0; i < P; i++) { let f = 0; const o = i * J; for (let j = 0; j < J; j++) f += a[o + j] * w0[j]; r[i] = b[i] - f; s += r[i] * r[i]; } return s; };
  const project = (x, out) => { // onto the simplex, into out
    srt.set(x); srt.sort();
    let css = 0, theta = 0;
    for (let q = J - 1, c = 1; q >= 0; q--, c++) { css += srt[q]; const t = (css - 1) / c; if (srt[q] - t > 0) theta = t; }
    for (let j = 0; j < J; j++) out[j] = Math.max(0, x[j] - theta);
  };
  let w = new Float64Array(J);
  if (start) project(Float64Array.from(start), w); else w.fill(1 / J);
  let z = w.slice(), wn = new Float64Array(J), tk = 1, prev = resid(w);
  for (let it = 0; it < iters; it++) {
    resid(z);
    for (let j = 0; j < J; j++) tmp[j] = z[j];
    for (let i = 0; i < P; i++) { const o = i * J, ri = step * r[i]; for (let j = 0; j < J; j++) tmp[j] += a[o + j] * ri; }
    project(tmp, wn);
    const tn = (1 + Math.sqrt(1 + 4 * tk * tk)) / 2, beta = (tk - 1) / tn;
    for (let j = 0; j < J; j++) { z[j] = wn[j] + beta * (wn[j] - w[j]); }
    const sw = w; w = wn; wn = sw; tk = tn;
    if (it % 20 === 19) {
      const cur = resid(w);
      if (cur > prev) { z.set(w); tk = 1; }
      if (Math.abs(prev - cur) <= tol * Math.max(bb, 1e-300)) { prev = cur; break; }
      prev = cur;
    }
  }
  return Array.from(w);
}

// Nelder-Mead on R^d (deterministic; Lagarias et al. 1998 coefficients), at most maxEval objective calls.
function nelderMead(f, x0, { step = 1, maxEval = 160, tol = 1e-9 } = {}) {
  const d = x0.length;
  let pts = [x0.slice(), ...x0.map((_, i) => x0.map((v, j) => v + (i === j ? step : 0)))].map((x) => ({ x, f: f(x) }));
  let evals = d + 1;
  const comb = (a, b, t) => a.map((v, i) => v + t * (b[i] - v));
  while (evals < maxEval) {
    pts.sort((p, q) => p.f - q.f);
    if (Math.abs(pts[d].f - pts[0].f) <= tol * Math.max(1e-12, Math.abs(pts[0].f))) break;
    const c = new Array(d).fill(0);
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) c[j] += pts[i].x[j] / d;
    const worst = pts[d];
    const xr = comb(c, worst.x, -1), fr = f(xr); evals++;
    if (fr < pts[0].f) {
      const xe = comb(c, worst.x, -2), fe = f(xe); evals++;
      pts[d] = fe < fr ? { x: xe, f: fe } : { x: xr, f: fr };
    } else if (fr < pts[d - 1].f) pts[d] = { x: xr, f: fr };
    else {
      const xc = fr < worst.f ? comb(c, worst.x, -0.5) : comb(c, worst.x, 0.5), fc = f(xc); evals++;
      if (fc < Math.min(fr, worst.f)) pts[d] = { x: xc, f: fc };
      else {
        for (let i = 1; i <= d; i++) { const x = comb(pts[0].x, pts[i].x, 0.5); pts[i] = { x, f: f(x) }; evals++; }
      }
    }
  }
  pts.sort((p, q) => p.f - q.f);
  return pts[0];
}

// One fit matched on predictors (Abadie, Diamond and Hainmueller 2010, section 2.3; Abadie 2021, section 3.2): x1 (p
// predictor values of the treated unit, already scaled) and X0 (p x J, the donors'). For a diagonal V (v >= 0, sum 1),
// W(V) minimises sum_m v_m (x1_m - X0_m W)^2 on the simplex; V is chosen to minimise the before-date squared gap of
// the outcome under W(V) (the "data-driven" V of Synth). v = softmax(theta), theta by Nelder-Mead from equal weights.
// The same procedure, with the same starting point, is applied to every placebo, so the test stays symmetric.
// vSearch 'multi' (README "Several starts for V", eval/synth-multi-prereg-2026-11-17.md): Nelder-Mead runs from equal
// weights and then once from each predictor's corner (theta_m = startTilt, the rest 0, so v_m is about 0.83 with five
// predictors), each start with its own maxEval budget and a fresh inner warm start; the best V seen by any start is
// kept. The before-gap is piecewise flat in V (W jumps between donor sets), and one start can stall on a plateau.
export function synthFitCovariates(y, donors, k, x1, X0, { maxEval = 160, vSearch = 'single', startTilt = 3 } = {}) {
  const P = x1.length, J = donors.length;
  const yb = y.slice(0, k);
  let warm = null; // each inner solve starts from the last weights (deterministic: the same sequence for every unit)
  const weightsFor = (v) => (warm = simplexLeastSquaresRows(X0.map((r, m) => r.map((e) => e * Math.sqrt(v[m]))), x1.map((e, m) => e * Math.sqrt(v[m])), { start: warm }));
  const preLoss = (w) => { let s = 0; for (let t = 0; t < k; t++) { let f = 0; for (let j = 0; j < J; j++) f += w[j] * donors[j][t]; s += (yb[t] - f) ** 2; } return s; };
  const softmax = (th) => { const mx = Math.max(...th), e = th.map((a) => Math.exp(a - mx)), s = e.reduce((a, b) => a + b, 0); return e.map((a) => a / s); };
  let best = null;
  const f = (th) => { const v = softmax(th), w = weightsFor(v), l = preLoss(w); if (!best || l < best.l) best = { l, v, w }; return l; };
  if (P === 1) f([0]);
  else {
    const starts = [new Array(P).fill(0)];
    if (vSearch === 'multi') for (let m = 0; m < P; m++) starts.push(Array.from({ length: P }, (_, i) => (i === m ? startTilt : 0)));
    else if (vSearch !== 'single') throw new Error(`unknown vSearch ${vSearch} (single or multi)`);
    for (const x0 of starts) { warm = null; nelderMead(f, x0, { maxEval }); }
  }
  const w = best.w;
  const synth = y.map((_, t) => donors.reduce((s, d, j) => s + w[j] * d[t], 0));
  const gap = y.map((val, t) => val - synth[t]);
  const pre = rms(gap.slice(0, k)), post = rms(gap.slice(k));
  const xfit = rms(x1.map((e, m) => e - X0[m].reduce((s, q, j) => s + q * w[j], 0)));
  return { weights: w, v: best.v, synth, gap, preRmspe: pre, postRmspe: post, ratio: post / Math.max(pre, 1e-12), predictorRmse: xfit };
}

// The shape of a gap after the date (README "A donor's own event that is not a step"): the mean square of the first
// third of the after-points against the last third's. 'faded' when the first is at least GAP_SHAPE_RATIO times the
// last (a pulse that wore off), 'grew' when the last is at least that times the first (a slope from the date), else
// 'held' (a step, or noise); null with fewer than 6 points after the date. The ratio, 6, was read off an exploratory
// run (eval/synth-donor-shape-explore.out.txt) and frozen in eval/synth-donor-shape-prereg-2026-11-18.md. A
// description of a placebo's own gap for the "ranked above" note; it changes no p.
export const GAP_SHAPE_RATIO = 6;
export function gapShape(after) {
  const m = after.length;
  if (m < 6) return null;
  const t = Math.floor(m / 3), ms = (a) => a.reduce((s, e) => s + e * e, 0) / a.length;
  const early = ms(after.slice(0, t)), late = ms(after.slice(m - t));
  const shape = early >= GAP_SHAPE_RATIO * late ? 'faded' : late >= GAP_SHAPE_RATIO * early ? 'grew' : 'held';
  return { shape, early: Math.sqrt(early), late: Math.sqrt(late), bend: gapBend(after) };
}

// How a gap after the date bends (README "A curvature word"): the signed mean of the middle third against the line
// through the first and last thirds' signed means, as a share of that line's rise. 0 for a straight line from the
// date (a slope), below 0 when the gap speeds up (compounding: the middle sits nearer the start), above 0 when it
// slows (a pulse wearing off, a level reached). Between -0.5 and 0.5 when the middle third lies between the outer two;
// null when the outer thirds are equal or there are fewer than 6 points. A description; it changes no p.
export function gapBend(after) {
  const m = after.length;
  if (m < 6) return null;
  const t = Math.floor(m / 3), mean = (a) => a.reduce((s, e) => s + e, 0) / a.length;
  const a = mean(after.slice(0, t)), b = mean(after.slice(t, m - t)), c = mean(after.slice(m - t));
  const rise = c - a;
  if (!(Math.abs(rise) > 1e-12 * (Math.abs(a) + Math.abs(c)))) return null;
  return (b - (a + c) / 2) / rise;
}
// 'straight' (README "A curvature word"): the plain word is 'grew' and the bend lies in STRAIGHT_BAND, a gap that grew
// along a straight line from the date, the shape of a slope of the unit's own, rather than bending like a compounding
// panel's gaps (each a smooth random path that bends either way). The band was read off an exploratory run
// (eval/synth-shape-curve-explore.out.txt) and frozen in eval/synth-shape-curve-prereg-2026-11-18.md; all six bars held
// on the confirmatory run. A pointer for the "ranked above" note under --shape-word panel; it changes no p.
export const STRAIGHT_BAND = [-0.15, 0.1];
export function gapStraight(shape) {
  return !!shape && shape.shape === 'grew' && shape.bend != null && shape.bend >= STRAIGHT_BAND[0] && shape.bend <= STRAIGHT_BAND[1];
}

// The same word read against the panel's own trend (README "The shape word against the panel's own trend"). On series
// whose gaps spread with time (GDP that compounds, a growth rate that wanders), most units' gaps grow whatever
// happened, so gapShape calls most of them 'grew' (12 of West Germany's 16 placebos). panelShapes takes every unit's
// gapShape (treated and placebos, so the centre is a symmetric function of the panel) and finds the median of
// log(late / early mean square), the panel's centre. When the centre itself reaches GAP_SHAPE_RATIO (the median unit
// would be called 'grew'), each unit is worded by how far its own log ratio sits from the centre, at the same ratio:
// 'grew' (faster than the panel's gaps) at log 6 above it, 'faded' at log 6 below, else 'held'; otherwise the plain
// word stands. No new constant: the switch and the cut are the frozen GAP_SHAPE_RATIO. Returns { centre (a ratio of
// mean squares), relative (whether the centre was used), shapes: [word or null] }.
export function panelShapes(list) {
  const lr = list.map((q) => (q ? 2 * Math.log(Math.max(q.late, 1e-300) / Math.max(q.early, 1e-300)) : null));
  const ok = lr.filter((v) => v !== null).sort((a, b) => a - b);
  if (!ok.length) return { centre: null, relative: false, shapes: list.map(() => null) };
  const m = ok.length >> 1, c = ok.length % 2 ? ok[m] : (ok[m - 1] + ok[m]) / 2, cut = Math.log(GAP_SHAPE_RATIO);
  const relative = c >= cut - 1e-12;
  const shapes = list.map((q, i) => (q === null ? null : !relative ? q.shape : lr[i] - c >= cut ? 'grew' : c - lr[i] >= cut ? 'faded' : 'held'));
  return { centre: Math.exp(c), relative, shapes };
}

// The test. y: the treated series; donors: { name: series }; k: date index. Returns the fit, the gap after the date,
// each donor's placebo ratio, the rank-based p, and a fit warning when the treated series is matched worse before
// the date than most donors are (the placebo distribution then says little: Abadie et al. 2010, section 4.3).
// placeboPool 'without' (the pre-registered default): each placebo is fitted against the other donors, the treated
// unit left out, so it has one donor fewer than the treated fit. 'with': the treated unit is moved into each placebo's
// pool (Abadie et al. 2010: "shifting California to the donor pool"), so every unit is fitted against the same number
// of others and the ranks are exchangeable when nothing happened (README "A synthetic control", the diagnostic).
// predictors (optional, README "Matched on covariates"): { treated: [p numbers], donors: { name: [p numbers] } }, for
// example a covariate's before-date average and the outcome at a few before-date points. Each predictor is divided by
// its standard deviation over all units (treated and donors, one scale for every fit), and every fit, the treated
// one and each placebo's, chooses its own V as synthFitCovariates says. Without predictors, the fit matches every
// before-date outcome (the default).
export function synthControlTest(y, donors, k, { minBefore = 5, minAfter = 2, fitWarnQuantile = 0.8, placeboPool = 'without', statistic = 'floored', predictors = null, maxEval = 160, vSearch = 'single' } = {}) {
  const names = Object.keys(donors);
  const n = y.length;
  if (names.length < 4) throw new Error(`a synthetic control needs at least 4 donor series (got ${names.length})`);
  if (k < minBefore || n - k < minAfter) throw new Error(`the date leaves ${k} points before and ${n - k} after; a synthetic control needs at least ${minBefore} before and ${minAfter} after`);
  for (const s of names) if (donors[s].length !== n) throw new Error(`donor ${s} has ${donors[s].length} points, the treated series ${n}`);
  if ([y, ...names.map((s) => donors[s])].some((a) => a.some((v) => !Number.isFinite(v)))) throw new Error('a synthetic control needs every series complete (no blanks) over the window');
  const series = names.map((s) => donors[s]);
  let fitOne = (target, others) => synthFit(series[target] ?? y, others.map((i) => (i < 0 ? y : series[i])), k);
  if (predictors) {
    const px = [predictors.treated, ...names.map((s) => predictors.donors?.[s])];
    if (px.some((a) => !Array.isArray(a) || a.length !== px[0].length || a.some((v) => !Number.isFinite(v)))) throw new Error('predictors need the same count of finite numbers for the treated unit and every donor');
    const P = px[0].length;
    const sd = Array.from({ length: P }, (_, m) => { const col = px.map((a) => a[m]), mu = col.reduce((a, b) => a + b, 0) / col.length; return Math.sqrt(col.reduce((a, b) => a + (b - mu) ** 2, 0) / (col.length - 1)) || 1; });
    const scaled = px.map((a) => a.map((v, m) => v / sd[m])); // index 0 = treated, j + 1 = donor j
    fitOne = (target, others) => {
      const ti = target < 0 ? 0 : target + 1;
      const oi = others.map((i) => (i < 0 ? 0 : i + 1));
      const X0 = Array.from({ length: P }, (_, m) => oi.map((i) => scaled[i][m]));
      return synthFitCovariates(target < 0 ? y : series[target], others.map((i) => (i < 0 ? y : series[i])), k, scaled[ti], X0, { maxEval, vSearch });
    };
  }
  const all = names.map((_, i) => i);
  const fit = fitOne(-1, all);
  const placebos = names.map((s, j) => {
    const others = all.filter((i) => i !== j);
    if (placeboPool === 'with') others.push(-1);
    const f = fitOne(j, others);
    // donorWeights: the placebo's own synthetic control, by name ('(treated)' when the treated unit is in its pool),
    // so covariateBalance can put the treated fit's balance among the placebos' (README "Covariate balance").
    const donorWeights = Object.fromEntries(others.map((i, q) => [i < 0 ? '(treated)' : names[i], f.weights[q]]));
    return { name: s, preRmspe: f.preRmspe, postRmspe: f.postRmspe, ratio: f.ratio, donorWeights, gapShape: gapShape(f.gap.slice(k)) };
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
  // each gap's word against the panel's own trend (panelShapes), the treated unit's included in the centre
  const ownShape = gapShape(after);
  const rel = panelShapes([ownShape, ...placebos.map((q) => q.gapShape)]);
  placebos.forEach((q, i) => { if (q.gapShape) q.gapShape.relShape = rel.shapes[i + 1]; });
  if (ownShape) ownShape.relShape = rel.shapes[0];
  const weights = names.map((s, j) => ({ name: s, weight: fit.weights[j] })).filter((e) => e.weight >= 0.001).sort((a, b) => b.weight - a.weight);
  return {
    k, n, donors: names.length, weights, donorWeights: Object.fromEntries(names.map((s, j) => [s, fit.weights[j]])), synth: fit.synth, gap: fit.gap, v: fit.v ?? null, predictorRmse: fit.predictorRmse ?? null,
    preRmspe: fit.preRmspe, postRmspe: fit.postRmspe, ratio: fit.ratio,
    effectAverage: after.reduce((s, e) => s + e, 0) / after.length, effectAtEnd: after[after.length - 1],
    rank, p, statistic, tests, floor, minP: 1 / (names.length + 1), placebos,
    preFitShare: preRankShare, fitWarning: preRankShare >= fitWarnQuantile, gapShape: ownShape, shapeCentre: rel.centre, shapeRelative: rel.relative,
  };
}

// In-time placebo for the synthetic control: the same test with the date moved back into the before-period and the
// window cut at the real date, where the named event cannot act yet.
export function synthInTimePlacebo(y, donors, k, kFake, opts = {}) {
  const cut = (a) => a.slice(0, k);
  const d = Object.fromEntries(Object.entries(donors).map(([s, a]) => [s, cut(a)]));
  return synthControlTest(cut(y), d, kFake, opts);
}

// Covariate balance of a fitted synthetic control (Abadie 2021, section 7: report how the synthetic control compares
// with the treated unit on covariates it was not, or not only, matched on; Abadie et al. 2010, Table 1). r: a
// synthControlTest result; covariates: { treated: [c numbers], donors: { name: [c numbers] } }, for every donor in the
// fit; names (optional): a label per covariate. For each covariate: the treated value, the synthetic control's
// (the fit's donor weights applied to the donors' values), the plain donor average, and both gaps divided by the
// covariate's standard deviation over all units (a standardised difference). imbalanced is |standardised gap| above
// `threshold` (default 0.25, the usual matching rule of thumb, Stuart 2010). placeboShare: the share of placebo fits
// (each donor's own synthetic control, the same covariates) whose standardised gap is smaller in size than the
// treated fit's: near 1 says the treated unit is matched worse on this covariate than most donors are by theirs.
// placeboWarning: placeboShare >= placeboQuantile (default 0.8), the warning to read (eval/synth-bias-prereg-2026-11-17.md,
// README "Which imbalance biases the gap"): in a simulation where a covariate moved every unit after the date, the
// 0.25 flag fired on 84% of outcome-only fits even when the covariate did nothing, while this warning fired on 21%
// and held every false p <= 0.05 when the covariate mattered (13-21% of warned panels against 0-0.6% of the rest),
// with mean |gap bias| 2.0-2.6x the rest's. A diagnostic, not a test: it changes no p.
export function covariateBalance(r, covariates, { names = null, threshold = 0.25, placeboQuantile = 0.8 } = {}) {
  const donorNames = Object.keys(r.donorWeights ?? {});
  if (!donorNames.length) throw new Error('covariateBalance needs a synthControlTest result');
  const x1 = covariates?.treated;
  const C = Array.isArray(x1) ? x1.length : 0;
  const rows = [x1, ...donorNames.map((s) => covariates.donors?.[s])];
  if (!C || rows.some((a) => !Array.isArray(a) || a.length !== C || a.some((v) => !Number.isFinite(v)))) throw new Error('covariates need the same count of finite numbers for the treated unit and every donor in the fit');
  const valueOf = (unit) => (unit === '(treated)' ? x1 : covariates.donors[unit]);
  const synthOf = (w, m) => Object.entries(w).reduce((s, [u, q]) => s + q * valueOf(u)[m], 0);
  return Array.from({ length: C }, (_, m) => {
    const all = rows.map((a) => a[m]), mu = all.reduce((a, b) => a + b, 0) / all.length;
    const sd = Math.sqrt(all.reduce((a, b) => a + (b - mu) ** 2, 0) / (all.length - 1)) || 1;
    const synthetic = synthOf(r.donorWeights, m);
    const donorMean = donorNames.reduce((s, u) => s + covariates.donors[u][m], 0) / donorNames.length;
    const std = (x1[m] - synthetic) / sd;
    const placeboStd = r.placebos.map((q) => Math.abs((valueOf(q.name)[m] - synthOf(q.donorWeights, m)) / sd));
    return {
      name: names?.[m] ?? `covariate ${m + 1}`, treated: x1[m], synthetic, donorMean, sd,
      stdGap: std, stdGapDonorMean: (x1[m] - donorMean) / sd, imbalanced: Math.abs(std) > threshold,
      placeboShare: placeboStd.filter((v) => v < Math.abs(std)).length / placeboStd.length,
    };
  }).map((c) => ({ ...c, placeboWarning: c.placeboShare >= placeboQuantile - 1e-12 }));
}

// An uncertain lead (README "An uncertain lead"; eval/synth-lead-range-prereg-2026-11-18.md): when people may have
// reacted 0 to L points before the named date and the exact lead is unknown, fit at every backdate in `leads` and
// report every lead's p together, plus one p for the whole range that pays for looking at several. Trying leads and
// keeping the smallest p (naiveMinP) is not a test: its false-alarm rate grows with the number of leads tried. The
// range p is the permutation min-p adjustment (Westfall and Young 1993, ch. 2) applied to the placebo test: at each
// lead every unit (the treated one and each donor's placebo) gets its own placebo p, the share of all units whose
// floored statistic is at least its own; each unit keeps its smallest p over the leads; the range p is the share of
// units whose smallest p is at most the treated unit's. The same placebo reassignment is used at every lead, so when
// nothing happened the treated unit's smallest p is one draw from the units' smallest p's, and the range p keeps the
// single-date test's size. maxP is the largest p over the leads (every lead significant: conservative).
// gapFromDate at each lead is the mean gap from the named date k on, so leads are compared on the same window.
export function synthLeadRange(y, donors, k, leads, opts = {}) {
  const L = [...new Set((leads ?? []).map(Number))].sort((a, b) => a - b);
  if (!L.length || L.some((v) => !Number.isInteger(v) || v < 0)) throw new Error('leads: give whole numbers of points, 0 or more');
  const fits = L.map((lead) => ({ lead, r: synthControlTest(y, donors, k - lead, opts) }));
  const N = fits[0].r.donors + 1;
  const unitP = (r) => {
    const stats = [r.tests.floored.value, ...r.placebos.map((q) => q.floored)];
    return stats.map((s) => stats.filter((v) => v >= s - 1e-12 * Math.abs(s)).length / N);
  };
  const ps = fits.map((f) => unitP(f.r)); // ps[lead index][unit], unit 0 the treated one
  const minPerUnit = Array.from({ length: N }, (_, u) => Math.min(...ps.map((row) => row[u])));
  const own = minPerUnit[0];
  const pRange = minPerUnit.filter((m) => m <= own + 1e-12).length / N;
  // Two continuous range statistics (exploratory 2026-11-18: with 39 units the min-p above is coarse, since at
  // p <= 0.05 only rank 1 counts and some placebo is nearly always rank 1 at one of the leads). meanStat: each unit's
  // floored statistic averaged over the leads. maxScaled: each unit's largest statistic over the leads, each lead's
  // statistic divided by that lead's median over all units. Both are symmetric in the units, so ranking the treated
  // unit's value among every unit's is a placebo test of the same kind as the single-date one.
  const stats = fits.map((f) => [f.r.tests.floored.value, ...f.r.placebos.map((q) => q.floored)]);
  const median = (a) => { const b = [...a].sort((x, z) => x - z), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const meds = stats.map((row) => median(row) || 1e-12);
  const meanStat = Array.from({ length: N }, (_, u) => stats.reduce((a, row) => a + row[u], 0) / stats.length);
  const maxScaled = Array.from({ length: N }, (_, u) => Math.max(...stats.map((row, i) => row[u] / meds[i])));
  const rankP = (v) => v.filter((x) => x >= v[0] - 1e-12 * Math.abs(v[0])).length / N;
  const pMean = rankP(meanStat), pMaxScaled = rankP(maxScaled);
  const perLead = fits.map(({ lead, r }, i) => {
    const tail = r.gap.slice(k);
    return { lead, kFit: k - lead, p: ps[i][0], rank: Math.round(ps[i][0] * N), effectAverage: r.effectAverage, gapFromDate: tail.reduce((a, b) => a + b, 0) / tail.length, preRmspe: r.preRmspe, fitWarning: r.fitWarning };
  });
  const best = perLead.reduce((a, b) => (b.p < a.p ? b : a));
  return { leads: perLead, pRange, pMean, pMaxScaled, naiveMinP: own, bestLead: best.lead, maxP: Math.max(...perLead.map((e) => e.p)), units: N, minP: 1 / N, fits: fits.map((f) => f.r) };
}
