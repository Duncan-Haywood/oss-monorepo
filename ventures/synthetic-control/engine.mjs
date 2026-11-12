// Synthetic control: did an intervention change one unit's outcome?
// Build a weighted average of untreated units (a "synthetic" twin) that
// tracks the treated unit before the intervention, then read the effect as
// the gap after it. Weights live on the simplex (non-negative, summing to
// one), so the counterfactual never extrapolates beyond the donor pool.
// Inference is by placebo: rerun the method on every donor as if it were
// treated and see where the real unit's post/pre fit ratio ranks.
//
// Pure functions, no DOM, no network, no randomness. Implemented from the
// papers' definitions; no third-party code was ported. The outer
// Nelder-Mead uses the textbook coefficients and the initial simplex that
// SciPy's documented defaults use, so results line up with pysyncon and R's
// Synth (eval/reference.py, eval/reference.json).

export const PAPERS = [
  {
    authors: "Alberto Abadie, Javier Gardeazabal",
    title: "The Economic Costs of Conflict: A Case Study of the Basque Country",
    venue: "American Economic Review 93(1), 113-132",
    year: 2003,
    url: "https://doi.org/10.1257/000282803321455188",
    doi: "10.1257/000282803321455188",
    implemented: "The synthetic control estimator: donor weights W >= 0 with sum 1 minimising (X1 - X0 W)' V (X1 - X0 W) over pre-intervention predictors X, with the diagonal predictor-importance matrix V chosen to minimise the pre-intervention mean squared prediction error of the outcome.",
    deviations: "None in the estimator. The inner problem is solved exactly by a primal active-set method instead of a general-purpose QP solver.",
  },
  {
    authors: "Alberto Abadie, Alexis Diamond, Jens Hainmueller",
    title: "Synthetic Control Methods for Comparative Case Studies: Estimating the Effect of California's Tobacco Control Program",
    venue: "Journal of the American Statistical Association 105(490), 493-505",
    year: 2010,
    url: "https://doi.org/10.1198/jasa.2009.ap08746",
    doi: "10.1198/jasa.2009.ap08746",
    implemented: "Placebo-in-space inference: every donor is treated in turn, the ratio of post- to pre-intervention RMSPE is computed for each, and the treated unit's rank gives a permutation p-value (rank / (J + 1)). Placebos whose pre-period fit is much worse than the treated unit's can be screened out, as in the paper's 20x, 5x and 2x figures.",
    deviations: "None. The placebo runs repeat the whole fit, including the choice of V.",
  },
  {
    authors: "Alberto Abadie, Alexis Diamond, Jens Hainmueller",
    title: "Comparative Politics and the Synthetic Control Method",
    venue: "American Journal of Political Science 59(2), 495-510",
    year: 2015,
    url: "https://doi.org/10.1111/ajps.12116",
    doi: "10.1111/ajps.12116",
    implemented: "Cross-validated V: fit V on a training window (predictors measured early, outcome fit on a later pre-period stretch), then reuse that V with predictors from the later window. Leave-one-out robustness: drop each donor with positive weight and refit. The West German reunification panel is the example dataset.",
    deviations: "The automatic split puts the training/validation boundary at the middle of the pre-period; the example preset uses the paper's exact windows.",
  },
  {
    authors: "Alberto Abadie",
    title: "Using Synthetic Controls: Feasibility, Data Requirements, and Methodological Aspects",
    venue: "Journal of Economic Literature 59(2), 391-425",
    year: 2021,
    url: "https://doi.org/10.1257/jel.20191450",
    doi: "10.1257/jel.20191450",
    implemented: "The diagnostics this tool reports in words: pre-period fit, predictor balance against the donor average, weight sparsity, and the warning when the treated unit lies outside the donors' range (where no convex combination can fit it).",
    deviations: "Guidance only; no new estimator from this survey is implemented.",
  },
  {
    authors: "John A. Nelder, Roger Mead",
    title: "A Simplex Method for Function Minimization",
    venue: "The Computer Journal 7(4), 308-313",
    year: 1965,
    url: "https://doi.org/10.1093/comjnl/7.4.308",
    doi: "10.1093/comjnl/7.4.308",
    implemented: "The outer search over V (reflection 1, expansion 2, contraction 0.5, shrink 0.5), as in Synth and pysyncon.",
    deviations: "None.",
  },
];

export const DEFAULTS = {
  vMethod: "nested", // nested | cv | equal
  placebo: true,
  leaveOneOut: true,
  preFilter: 5, // drop placebos whose pre-MSPE exceeds this multiple of the treated unit's; 0 keeps all
  maxIter: null, // Nelder-Mead iterations; null = 200 per predictor
};

// ---------- CSV ----------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = "";
  let q = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  if (!rows.length) throw new Error("The CSV is empty.");
  const header = rows[0].map((h) => h.trim());
  return { header, records: rows.slice(1).map((r) => Object.fromEntries(header.map((h, j) => [h, (r[j] ?? "").trim()]))) };
}

const num = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const t = String(v).trim();
  if (t === "" || /^(na|nan|null|-)$/i.test(t)) return NaN;
  return Number(t.replace(/,/g, ""));
};

// Long panel -> { units, times, value(unit, variable, time) }.
export function buildPanel(records, { unit, time, variables }) {
  const units = [];
  const timeSet = new Set();
  const cells = new Map();
  for (const r of records) {
    // Unit ids are text: CSV cells already are, and records may carry numbers
    // (unit 1, 2, 3) that the treated/donor ids must still match.
    const u = r[unit] === undefined || r[unit] === null ? "" : String(r[unit]).trim();
    const t = num(r[time]);
    if (u === "" || !Number.isFinite(t)) continue;
    if (!cells.has(u)) { cells.set(u, new Map()); units.push(u); }
    timeSet.add(t);
    const m = cells.get(u);
    for (const v of variables) {
      const x = num(r[v]);
      if (Number.isFinite(x)) m.set(`${v}@${t}`, x);
    }
  }
  const times = [...timeSet].sort((a, b) => a - b);
  return { units, times, value: (u, v, t) => cells.get(u)?.get(`${v}@${t}`) ?? NaN };
}

// ---------- linear algebra (small dense) ----------

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / M[c][c];
      if (k === 0) continue;
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j];
    x[r] = s / M[r][r];
  }
  return x;
}

// min 0.5 w'Pw - q'w  s.t. w >= 0, sum w = 1. Primal active-set method
// (Nocedal & Wright 2006, Algorithm 16.3) specialised to the simplex. A tiny
// ridge keeps the equality-constrained subproblems solvable when P is
// singular (more donors than predictors), which picks one optimum among ties.
export function simplexQP(P, q, start = null) {
  const n = q.length;
  if (n === 1) return [1];
  let tr = 0;
  for (let i = 0; i < n; i++) tr += P[i][i];
  const ridge = Math.max(1e-12, (tr / n) * 1e-10);
  let w = start && start.length === n ? start.slice() : new Array(n).fill(1 / n);
  let S = [];
  for (let i = 0; i < n; i++) if (w[i] > 0) S.push(i);
  if (!S.length) { w = new Array(n).fill(1 / n); S = [...Array(n).keys()]; }
  const grad = (x) => P.map((r, i) => r.reduce((s, v, j) => s + v * x[j], 0) - q[i]);
  for (let iter = 0; iter < 50 * n + 100; iter++) {
    const k = S.length;
    const A = [];
    const b = [];
    for (let a = 0; a < k; a++) {
      const row = S.map((j) => P[S[a]][j]);
      row[a] += ridge;
      row.push(1);
      A.push(row);
      b.push(q[S[a]]);
    }
    A.push([...new Array(k).fill(1), 0]);
    b.push(1);
    const sol = solveLinear(A, b);
    if (!sol) break;
    const target = new Array(n).fill(0);
    S.forEach((j, a) => { target[j] = sol[a]; });
    let alpha = 1;
    let block = -1;
    for (const j of S) {
      if (target[j] < w[j] && target[j] < 0) {
        const t = w[j] / (w[j] - target[j]);
        if (t < alpha) { alpha = t; block = j; }
      }
    }
    for (let i = 0; i < n; i++) w[i] += alpha * (target[i] - w[i]);
    if (block >= 0) {
      w[block] = 0;
      S = S.filter((j) => j !== block && w[j] > 0);
      if (!S.length) { S = [block]; w[block] = 1; }
      continue;
    }
    // At the subproblem optimum: check the multipliers of the inactive bounds.
    const g = grad(w);
    const mu = S.reduce((s, j) => s + g[j], 0) / S.length;
    let enter = -1;
    let worst = -1e-12 * (1 + Math.abs(mu));
    for (let i = 0; i < n; i++) {
      if (S.includes(i)) continue;
      const d = g[i] - mu;
      if (d < worst) { worst = d; enter = i; }
    }
    if (enter < 0) break;
    S.push(enter);
  }
  for (let i = 0; i < n; i++) if (w[i] < 0) w[i] = 0;
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

// ---------- Nelder-Mead (SciPy's default coefficients and stopping rule) ----------

export function nelderMead(f, x0, { maxIter = 200 * x0.length, maxFun = 200 * x0.length, xatol = 1e-4, fatol = 1e-4 } = {}) {
  const N = x0.length;
  const rho = 1, chi = 2, psi = 0.5, sigma = 0.5;
  let sim = [x0.slice()];
  for (let k = 0; k < N; k++) {
    const y = x0.slice();
    y[k] = y[k] !== 0 ? 1.05 * y[k] : 0.00025;
    sim.push(y);
  }
  let fs = sim.map(f);
  let fcalls = N + 1;
  const order = () => {
    const idx = fs.map((_, i) => i).sort((a, b) => fs[a] - fs[b] || a - b);
    sim = idx.map((i) => sim[i]);
    fs = idx.map((i) => fs[i]);
  };
  order();
  let iterations = 1;
  const comb = (a, xa, b, xb) => xa.map((v, i) => a * v + b * xb[i]);
  while (fcalls < maxFun && iterations < maxIter) {
    let xs = 0, fsd = 0;
    for (let j = 1; j <= N; j++) {
      fsd = Math.max(fsd, Math.abs(fs[0] - fs[j]));
      for (let i = 0; i < N; i++) xs = Math.max(xs, Math.abs(sim[j][i] - sim[0][i]));
    }
    if (xs <= xatol && fsd <= fatol) break;
    const xbar = new Array(N).fill(0);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) xbar[i] += sim[j][i] / N;
    const worst = sim[N];
    const xr = comb(1 + rho, xbar, -rho, worst);
    const fxr = f(xr); fcalls++;
    let shrink = false;
    if (fxr < fs[0]) {
      const xe = comb(1 + rho * chi, xbar, -rho * chi, worst);
      const fxe = f(xe); fcalls++;
      if (fxe < fxr) { sim[N] = xe; fs[N] = fxe; } else { sim[N] = xr; fs[N] = fxr; }
    } else if (fxr < fs[N - 1]) {
      sim[N] = xr; fs[N] = fxr;
    } else if (fxr < fs[N]) {
      const xc = comb(1 + psi * rho, xbar, -psi * rho, worst);
      const fxc = f(xc); fcalls++;
      if (fxc <= fxr) { sim[N] = xc; fs[N] = fxc; } else shrink = true;
    } else {
      const xcc = comb(1 - psi, xbar, psi, worst);
      const fxcc = f(xcc); fcalls++;
      if (fxcc < fs[N]) { sim[N] = xcc; fs[N] = fxcc; } else shrink = true;
    }
    if (shrink) {
      for (let j = 1; j <= N; j++) {
        sim[j] = comb(1 - sigma, sim[0], sigma, sim[j]);
        fs[j] = f(sim[j]); fcalls++;
      }
    }
    order();
    iterations++;
  }
  return { x: sim[0], fx: fs[0], iterations, fcalls };
}

// ---------- the estimator ----------

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function sd(a) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

// Predictor value: mean of `variable` over `times`, skipping missing cells.
function predictorValue(panel, unit, p) {
  const vals = p.times.map((t) => panel.value(unit, p.variable, t)).filter(Number.isFinite);
  return vals.length ? mean(vals) : NaN;
}

export function predictorLabel(p) {
  const ts = p.times;
  const span = ts.length === 1 ? `${ts[0]}` : ts.every((t, i) => i === 0 || t - ts[i - 1] === 1) ? `${ts[0]}-${ts[ts.length - 1]}` : ts.join(", ");
  return `${p.variable} (${span})`;
}

// Core fit on matrices. X rows = predictors, columns = units (treated last).
function fitMatrices({ X1, X0, Z1, Z0, vMethod, customV, maxIter, warm }) {
  const k = X1.length;
  const J = X0[0].length;
  // Scale each predictor by its standard deviation across all units.
  const scale = X1.map((x1, r) => {
    const s = sd([...X0[r], x1]);
    return s > 0 && Number.isFinite(s) ? s : 1;
  });
  const X1s = X1.map((x, r) => x / scale[r]);
  const X0s = X0.map((row, r) => row.map((x) => x / scale[r]));
  let lastW = warm ?? null;
  const solveW = (v) => {
    const P = Array.from({ length: J }, () => new Array(J).fill(0));
    const q = new Array(J).fill(0);
    for (let r = 0; r < k; r++) {
      if (v[r] === 0) continue;
      const row = X0s[r];
      for (let i = 0; i < J; i++) {
        q[i] += v[r] * X1s[r] * row[i];
        for (let j = i; j < J; j++) P[i][j] += v[r] * row[i] * row[j];
      }
    }
    for (let i = 0; i < J; i++) for (let j = 0; j < i; j++) P[i][j] = P[j][i];
    const w = simplexQP(P, q, lastW);
    lastW = w;
    return w;
  };
  const lossV = (w, z1 = Z1, z0 = Z0) => {
    let s = 0;
    for (let t = 0; t < z1.length; t++) {
      let y = 0;
      for (let j = 0; j < J; j++) y += z0[t][j] * w[j];
      s += (z1[t] - y) ** 2;
    }
    return s / z1.length;
  };
  const lossW = (w, v) => {
    let s = 0;
    for (let r = 0; r < k; r++) {
      let y = 0;
      for (let j = 0; j < J; j++) y += X0s[r][j] * w[j];
      s += v[r] * (X1s[r] - y) ** 2;
    }
    return s;
  };
  const norm = (x) => {
    const a = x.map(Math.abs);
    const s = a.reduce((p, c) => p + c, 0);
    return s > 0 ? a.map((v) => v / s) : new Array(k).fill(1 / k);
  };
  let V;
  let nm = null;
  if (customV) V = norm(customV);
  else if (vMethod === "equal" || k === 1) V = new Array(k).fill(1 / k);
  else {
    const x0 = new Array(k).fill(1 / k);
    nm = nelderMead((x) => lossV(solveW(norm(x))), x0, maxIter ? { maxIter, maxFun: maxIter } : {});
    V = norm(nm.x);
  }
  const W = solveW(V);
  return { W, V, lossV: lossV(W), lossW: lossW(W, V), scale, nm: nm && { iterations: nm.iterations, evaluations: nm.fcalls } };
}

function matrices(panel, treated, donors, predictors, optimizeTimes) {
  const X1 = predictors.map((p) => predictorValue(panel, treated, p));
  const X0 = predictors.map((p) => donors.map((d) => predictorValue(panel, d, p)));
  const Z1 = optimizeTimes.map((t) => panel.value(treated, panel.outcome, t));
  const Z0 = optimizeTimes.map((t) => donors.map((d) => panel.value(d, panel.outcome, t)));
  return { X1, X0, Z1, Z0 };
}

// One synthetic control fit for `treated` against `donors`.
export function fitSynth(panel, { treated, donors, predictors, optimizeTimes, vMethod = "nested", customV = null, train = null, maxIter = null }) {
  let V0 = customV;
  let trainFit = null;
  if (!V0 && vMethod === "cv" && train) {
    const m = matrices(panel, treated, donors, train.predictors, train.optimizeTimes);
    trainFit = fitMatrices({ ...m, vMethod: "nested", maxIter });
    V0 = trainFit.V;
  }
  const m = matrices(panel, treated, donors, predictors, optimizeTimes);
  const fit = fitMatrices({ ...m, vMethod, customV: V0, maxIter });
  const series = panel.times.map((t) => {
    const y = panel.value(treated, panel.outcome, t);
    let s = 0;
    let ok = true;
    donors.forEach((d, j) => {
      if (fit.W[j] === 0) return;
      const v = panel.value(d, panel.outcome, t);
      if (!Number.isFinite(v)) ok = false;
      s += fit.W[j] * v;
    });
    return { time: t, treated: y, synthetic: ok ? s : NaN, gap: ok ? y - s : NaN };
  });
  const balance = predictors.map((p, r) => ({
    predictor: predictorLabel(p),
    treated: m.X1[r],
    synthetic: m.X0[r].reduce((s, x, j) => s + x * fit.W[j], 0),
    donorMean: mean(m.X0[r]),
    v: fit.V[r],
  }));
  return { treated, donors, weights: fit.W, V: fit.V, lossV: fit.lossV, lossW: fit.lossW, nm: fit.nm, trainV: trainFit?.V ?? null, series, balance };
}

function rmspe(series, from, to) {
  const g = series.filter((s) => s.time >= from && s.time <= to && Number.isFinite(s.gap)).map((s) => s.gap * s.gap);
  return g.length ? Math.sqrt(mean(g)) : NaN;
}

const fmt = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d }) : "n/a");

// Build the predictor specs the user did not spell out.
export function defaultSpec({ outcome, covariates = [], preTimes, vMethod }) {
  const lagTimes = (ts) => {
    if (ts.length <= 3) return ts.map((t) => [t]);
    const mid = ts[Math.floor((ts.length - 1) / 2)];
    return [[ts[0]], [mid], [ts[ts.length - 1]]];
  };
  const build = (ts) => {
    if (!covariates.length) return ts.map((t) => ({ variable: outcome, times: [t] }));
    return [...covariates.map((c) => ({ variable: c, times: ts })), ...lagTimes(ts).map((t) => ({ variable: outcome, times: t }))];
  };
  if (vMethod === "cv" && preTimes.length >= 4) {
    const half = Math.floor(preTimes.length / 2);
    const early = preTimes.slice(0, half);
    const late = preTimes.slice(half);
    return { predictors: build(late), optimizeTimes: preTimes, train: { predictors: build(early), optimizeTimes: late } };
  }
  return { predictors: build(preTimes), optimizeTimes: preTimes, train: null };
}

/**
 * analyze(input)
 *  csv | records       long panel: one row per unit and time
 *  unit, time, outcome column names
 *  treated             the unit that received the intervention
 *  treatmentTime       first period affected
 *  donors              optional list (default: every other unit with complete outcome data)
 *  covariates          optional predictor columns, averaged over the pre-period
 *  predictors          optional full spec [{variable, times:[...]}] (overrides covariates)
 *  optimizeTimes       optional periods whose outcome MSPE chooses V (default: all pre-periods)
 *  train               optional {predictors, optimizeTimes} for cross-validated V
 *  vMethod             nested (default) | cv | equal
 *  customV             optional fixed V
 *  placebo, leaveOneOut, preFilter, maxIter
 */
export function analyze(input = {}) {
  const opts = { ...DEFAULTS, ...input };
  const { header, records } = opts.records ? { header: Object.keys(opts.records[0] ?? {}), records: opts.records } : parseCsv(opts.csv);
  const need = (name, label) => {
    if (!name) throw new Error(`Choose the ${label} column.`);
    if (!header.includes(name)) throw new Error(`No column named "${name}" (columns: ${header.join(", ")}).`);
  };
  need(opts.unit, "unit");
  need(opts.time, "time");
  need(opts.outcome, "outcome");
  const covariates = (opts.covariates ?? []).filter((c) => c && c !== opts.outcome);
  covariates.forEach((c) => need(c, "covariate"));
  const specVars = (opts.predictors ?? []).map((p) => p.variable).concat((opts.train?.predictors ?? []).map((p) => p.variable));
  specVars.forEach((c) => need(c, "predictor"));
  const variables = [...new Set([opts.outcome, ...covariates, ...specVars])];
  const panel = buildPanel(records, { unit: opts.unit, time: opts.time, variables });
  panel.outcome = opts.outcome;
  if (records.length && !panel.times.length) throw new Error(`The time column "${opts.time}" has no numeric values: use a number per period (a year, or a period index such as 1, 2, 3 for months).`);
  const T0 = num(opts.treatmentTime);
  if (!Number.isFinite(T0)) throw new Error("Give the first period the intervention affected (a number, such as a year).");
  const treated = String(opts.treated ?? "");
  if (!panel.units.includes(treated)) throw new Error(`Treated unit "${treated}" is not in the ${opts.unit} column.`);
  const preTimes = panel.times.filter((t) => t < T0);
  const postTimes = panel.times.filter((t) => t >= T0);
  if (preTimes.length < 2) throw new Error("Need at least two periods before the intervention.");
  if (!postTimes.length) throw new Error("No periods at or after the intervention time.");

  const notes = [];
  const missingFor = (u) => panel.times.filter((t) => !Number.isFinite(panel.value(u, opts.outcome, t)));
  if (preTimes.some((t) => !Number.isFinite(panel.value(treated, opts.outcome, t)))) throw new Error(`The treated unit has missing ${opts.outcome} values before the intervention.`);
  let donors = (opts.donors?.length ? opts.donors.map(String) : panel.units.filter((u) => u !== treated)).filter((u) => u !== treated);
  const unknown = donors.filter((d) => !panel.units.includes(d));
  if (unknown.length) throw new Error(`Donor${unknown.length > 1 ? "s" : ""} not found: ${unknown.join(", ")}.`);
  const dropped = donors.filter((d) => missingFor(d).length);
  if (dropped.length) {
    notes.push(`Left out of the donor pool for missing ${opts.outcome} values: ${dropped.join(", ")}.`);
    donors = donors.filter((d) => !dropped.includes(d));
  }
  if (donors.length < 2) throw new Error("Need at least two donor units with complete outcome data.");

  let spec;
  if (opts.predictors?.length) spec = { predictors: opts.predictors, optimizeTimes: opts.optimizeTimes ?? preTimes, train: opts.train ?? null };
  else spec = defaultSpec({ outcome: opts.outcome, covariates, preTimes, vMethod: opts.vMethod });
  if (opts.optimizeTimes?.length) spec.optimizeTimes = opts.optimizeTimes.map(num);
  if (spec.optimizeTimes.some((t) => t >= T0)) throw new Error("The V-fitting window must end before the intervention.");
  const vMethod = opts.vMethod === "cv" && !spec.train ? "nested" : opts.vMethod;
  if (opts.vMethod === "cv" && !spec.train) notes.push("Cross-validation needs at least four pre-periods (or an explicit training window); V was fitted on the whole pre-period instead.");

  // Predictors with no value for some unit cannot be balanced; drop them.
  const usable = (preds, units) => preds.filter((p) => units.every((u) => Number.isFinite(predictorValue(panel, u, p))));
  const all = [treated, ...donors];
  const keep = usable(spec.predictors, all);
  if (keep.length < spec.predictors.length) notes.push(`Dropped predictor${spec.predictors.length - keep.length > 1 ? "s" : ""} with no data for some unit: ${spec.predictors.filter((p) => !keep.includes(p)).map(predictorLabel).join("; ")}.`);
  if (!keep.length) throw new Error("No predictor has data for every unit.");
  spec.predictors = keep;
  if (spec.train) {
    spec.train = { ...spec.train, predictors: usable(spec.train.predictors, all) };
    if (!spec.train.predictors.length) spec.train = null;
  }

  const fitOpts = { predictors: spec.predictors, optimizeTimes: spec.optimizeTimes, vMethod: spec.train ? vMethod : vMethod === "cv" ? "nested" : vMethod, customV: opts.customV ?? null, train: spec.train, maxIter: opts.maxIter };
  const main = fitSynth(panel, { treated, donors, ...fitOpts });
  const firstT = panel.times[0];
  const lastPre = preTimes[preTimes.length - 1];
  const lastT = panel.times[panel.times.length - 1];
  const preR = rmspe(main.series, firstT, lastPre);
  const postR = rmspe(main.series, T0, lastT);
  const postGaps = main.series.filter((s) => s.time >= T0 && Number.isFinite(s.gap)).map((s) => s.gap);
  const att = mean(postGaps);
  const preMean = mean(main.series.filter((s) => s.time < T0).map((s) => s.treated));
  const postSynthMean = mean(main.series.filter((s) => s.time >= T0 && Number.isFinite(s.synthetic)).map((s) => s.synthetic));

  // Convex hull check, predictor by predictor and on the pre-period outcome.
  const outside = main.balance.filter((b) => {
    const r = spec.predictors[main.balance.indexOf(b)];
    const vals = donors.map((d) => predictorValue(panel, d, r));
    return b.treated > Math.max(...vals) || b.treated < Math.min(...vals);
  }).map((b) => b.predictor);
  if (outside.length) notes.push(`The treated unit lies outside the donors' range on ${outside.join("; ")}: no weighted average of donors can match it there (Abadie 2021, section 3).`);

  const result = {
    treated, treatmentTime: T0, outcome: opts.outcome, unitColumn: opts.unit, timeColumn: opts.time,
    vMethod: fitOpts.vMethod === "nested" && spec.train ? "cv" : fitOpts.vMethod,
    donors,
    weights: donors.map((d, j) => ({ unit: d, weight: main.weights[j] })).sort((a, b) => b.weight - a.weight),
    V: spec.predictors.map((p, r) => ({ predictor: predictorLabel(p), v: main.V[r] })),
    trainV: main.trainV,
    balance: main.balance,
    series: main.series,
    preRMSPE: preR, postRMSPE: postR, ratio: postR / preR,
    att, attPercent: Number.isFinite(postSynthMean) && postSynthMean !== 0 ? (100 * att) / postSynthMean : NaN,
    lossV: main.lossV, lossW: main.lossW,
    optimizer: main.nm,
    predictors: spec.predictors, optimizeTimes: spec.optimizeTimes, train: spec.train,
    notes,
  };

  if (opts.placebo) {
    const runs = [];
    for (const d of donors) {
      const pool = donors.filter((x) => x !== d);
      try {
        const f = fitSynth(panel, { treated: d, donors: pool, ...fitOpts });
        const pr = rmspe(f.series, firstT, lastPre);
        const po = rmspe(f.series, T0, lastT);
        runs.push({ unit: d, preRMSPE: pr, postRMSPE: po, ratio: po / pr, gaps: f.series.map((s) => s.gap) });
      } catch (e) {
        runs.push({ unit: d, error: String(e.message ?? e) });
      }
    }
    const ok = runs.filter((r) => Number.isFinite(r.ratio));
    const rankOf = (set) => 1 + set.filter((r) => r.ratio >= result.ratio).length;
    const pAll = rankOf(ok) / (ok.length + 1);
    const k = Number(opts.preFilter) || 0;
    const screened = k > 0 ? ok.filter((r) => r.preRMSPE ** 2 <= k * preR ** 2) : ok;
    result.placebo = {
      runs,
      rank: rankOf(ok), units: ok.length + 1, pValue: pAll,
      preFilter: k,
      screened: { rank: rankOf(screened), units: screened.length + 1, pValue: rankOf(screened) / (screened.length + 1), kept: screened.map((r) => r.unit) },
      minimumP: 1 / (ok.length + 1),
    };
  }

  if (opts.leaveOneOut) {
    result.leaveOneOut = result.weights.filter((w) => w.weight > 1e-6).map((w) => {
      const pool = donors.filter((d) => d !== w.unit);
      if (pool.length < 2) return { dropped: w.unit, error: "too few donors left" };
      const f = fitSynth(panel, { treated, donors: pool, ...fitOpts });
      const g = f.series.filter((s) => s.time >= T0 && Number.isFinite(s.gap)).map((s) => s.gap);
      return {
        dropped: w.unit,
        att: mean(g),
        preRMSPE: rmspe(f.series, firstT, lastPre),
        synthetic: f.series.map((s) => s.synthetic),
        weights: pool.map((d, j) => ({ unit: d, weight: f.weights[j] })).filter((x) => x.weight > 1e-6).sort((a, b) => b.weight - a.weight),
      };
    });
  }

  result.summary = summarize(result, preMean);
  return result;
}

function summarize(r, preMean) {
  const top = r.weights.filter((w) => w.weight >= 0.005).map((w) => `${w.unit} ${(100 * w.weight).toFixed(1)}%`);
  const lines = [];
  lines.push(`Synthetic ${r.treated} is ${top.join(", ")}${r.weights.filter((w) => w.weight > 0 && w.weight < 0.005).length ? " (plus traces)" : ""}.`);
  const fitPct = Number.isFinite(preMean) && preMean !== 0 ? ` (${fmt((100 * r.preRMSPE) / Math.abs(preMean), 1)}% of the pre-period mean)` : "";
  lines.push(`Before ${r.treatmentTime} it tracks ${r.treated} with a root mean squared error of ${fmt(r.preRMSPE)}${fitPct}.`);
  const dir = r.att < 0 ? "below" : "above";
  lines.push(`From ${r.treatmentTime} on, ${r.treated}'s ${r.outcome} averages ${fmt(Math.abs(r.att))} ${dir} its synthetic control${Number.isFinite(r.attPercent) ? ` (${fmt(r.attPercent, 1)}%)` : ""}; the post/pre RMSPE ratio is ${fmt(r.ratio)}.`);
  if (r.placebo) {
    const p = r.placebo;
    lines.push(`Placebo test: that ratio ranks ${p.rank} of ${p.units} when every donor is treated in turn, a permutation p-value of ${fmt(p.pValue, 3)} (the smallest possible with ${p.units} units is ${fmt(p.minimumP, 3)}).`);
    if (p.preFilter > 0 && p.screened.units !== p.units) lines.push(`Keeping only placebos whose pre-period fit is within ${p.preFilter}x the treated unit's MSPE: rank ${p.screened.rank} of ${p.screened.units}, p = ${fmt(p.screened.pValue, 3)}.`);
  }
  if (r.leaveOneOut?.length) {
    const runs = r.leaveOneOut.filter((l) => Number.isFinite(l.att));
    if (runs.length) {
      const atts = runs.map((l) => l.att);
      let s = `Dropping each contributing donor in turn moves the average gap between ${fmt(Math.min(...atts))} and ${fmt(Math.max(...atts))}.`;
      const flips = runs.filter((l) => Math.sign(l.att) !== Math.sign(r.att));
      for (const l of flips) {
        const poor = l.preRMSPE > 2 * r.preRMSPE;
        s += ` Without ${l.dropped} the sign flips, ${poor ? `but that refit tracks the pre-period far worse (RMSPE ${fmt(l.preRMSPE)} against ${fmt(r.preRMSPE)}), so it is a weak counterfactual rather than evidence against the effect.` : `with a comparable pre-period fit (RMSPE ${fmt(l.preRMSPE)}): the estimate leans on that donor.`}`;
      }
      lines.push(s);
    }
  }
  return lines.join(" ");
}
