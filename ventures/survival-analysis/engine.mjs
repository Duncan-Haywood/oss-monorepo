// Survival analysis on your own CSV: Kaplan-Meier curves with Greenwood
// confidence bands, median and restricted mean survival, the log-rank test and
// its weighted variants, and Cox proportional hazards regression with Efron or
// Breslow ties, a proportional-hazards check and Harrell's concordance.
// Pure functions, no DOM, no network, no randomness. Implemented from the
// papers' mathematics; no third-party code was ported. Cross-checked against
// lifelines 0.30.3 and statsmodels 0.15.0 (eval/reference.py, eval/reference.json).

export const PAPERS = [
  {
    authors: "E. L. Kaplan, Paul Meier",
    title: "Nonparametric Estimation from Incomplete Observations",
    venue: "Journal of the American Statistical Association 53(282), 457-481",
    year: 1958,
    url: "https://doi.org/10.1080/01621459.1958.10501452",
    doi: "10.1080/01621459.1958.10501452",
    implemented: "The product-limit estimator S(t) = prod over event times t_i <= t of (1 - d_i / n_i), with subjects censored at t_i counted at risk at t_i.",
    deviations: "None for the estimate. Confidence bands use Greenwood's variance on the log(-log S) scale (Kalbfleisch & Prentice), not the plain scale of the paper.",
  },
  {
    authors: "Major Greenwood",
    title: "The Natural Duration of Cancer",
    venue: "Reports on Public Health and Medical Subjects 33, His Majesty's Stationery Office, London",
    year: 1926,
    url: "https://scholar.google.com/scholar?q=Greenwood+1926+%22The+Natural+Duration+of+Cancer%22",
    implemented: "Greenwood's variance Var(S) = S^2 * sum d_i / (n_i (n_i - d_i)), used for the standard error and, through the delta method, for log(-log S) confidence bands.",
    deviations: "Bands are on the complementary log-log scale so they stay inside [0, 1].",
  },
  {
    authors: "Nathan Mantel",
    title: "Evaluation of Survival Data and Two New Rank Order Statistics Arising in Its Consideration",
    venue: "Cancer Chemotherapy Reports 50(3), 163-170",
    year: 1966,
    url: "https://scholar.google.com/scholar?q=Mantel+1966+%22Evaluation+of+survival+data+and+two+new+rank+order+statistics%22",
    implemented: "The log-rank test for two or more groups: observed minus expected events per group with the hypergeometric covariance, chi-square on (groups - 1) degrees of freedom.",
    deviations: "Also offered with Gehan-Breslow (weight n at risk) and Tarone-Ware (weight sqrt n) weights, which use the same statistic with weighted increments.",
  },
  {
    authors: "D. R. Cox",
    title: "Regression Models and Life-Tables",
    venue: "Journal of the Royal Statistical Society, Series B 34(2), 187-220",
    year: 1972,
    url: "https://doi.org/10.1111/j.2517-6161.1972.tb00899.x",
    doi: "10.1111/j.2517-6161.1972.tb00899.x",
    implemented: "Proportional hazards regression by maximising the partial likelihood with Newton-Raphson (step halving), with likelihood-ratio, Wald and score tests and hazard ratios with Wald intervals.",
    deviations: "Tied event times use Efron's (1977) approximation by default, Breslow's (1974) on request, not Cox's exact discrete likelihood.",
  },
  {
    authors: "Bradley Efron",
    title: "The Efficiency of Cox's Likelihood Function for Censored Data",
    venue: "Journal of the American Statistical Association 72(359), 557-565",
    year: 1977,
    url: "https://doi.org/10.1080/01621459.1977.10480613",
    doi: "10.1080/01621459.1977.10480613",
    implemented: "Efron's approximation for tied event times in the partial likelihood, its gradient and information matrix.",
    deviations: "None.",
  },
  {
    authors: "Patricia M. Grambsch, Terry M. Therneau",
    title: "Proportional Hazards Tests and Diagnostics Based on Weighted Residuals",
    venue: "Biometrika 81(3), 515-526",
    year: 1994,
    url: "https://doi.org/10.1093/biomet/81.3.515",
    doi: "10.1093/biomet/81.3.515",
    implemented: "The per-term test of proportional hazards from scaled Schoenfeld residuals against 1 - KM(t), in the approximate form (scaled residual = events x residual x variance matrix) that R's cox.zph used before 2019 and lifelines uses.",
    deviations: "Per-term tests only; no global test. R's survival 3.x computes an exact version that can differ slightly.",
  },
  {
    authors: "Frank E. Harrell Jr., Robert M. Califf, David B. Pryor, Kerry L. Lee, Robert A. Rosati",
    title: "Evaluating the Yield of Medical Tests",
    venue: "JAMA 247(18), 2543-2546",
    year: 1982,
    url: "https://doi.org/10.1001/jama.1982.03320430047030",
    doi: "10.1001/jama.1982.03320430047030",
    implemented: "Harrell's concordance index C: among pairs where the shorter time is an event, the share in which that subject had the higher risk score (ties in score count one half).",
    deviations: "Computed on the rows the model was fitted on, so it is optimistic; no cross-validation.",
  },
];

export const DEFAULTS = {
  confidence: 0.95,
  ties: "efron",
  test: "logrank",
  maxIterations: 60,
};

const MISSING = new Set(["", "na", "nan", "n/a", "null", "none", ".", "?", "-", "#n/a"]);
const isMissing = (s) => MISSING.has(String(s).trim().toLowerCase());
const isNum = (s) => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(String(s).trim());

function splitLine(line, delim) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parse delimited text (comma, tab or semicolon, detected from the first
 * line). The first line is the header. Returns { columns, rows (raw strings),
 * lineNo, numeric (per-column flag) }.
 */
export function parseCsv(text) {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lines.length) return { error: "The data is empty. Paste a CSV with a header row: a time column, an event column, and optionally a group and covariates." };
  const first = lines[0];
  const delim = [",", "\t", ";"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cells = lines.map((l) => splitLine(l, delim));
  const columns = cells[0].map((c, i) => c || `c${i + 1}`);
  const seen = new Set();
  for (const c of columns) {
    if (seen.has(c)) return { error: `Column name "${c}" appears twice in the header. Rename one of them.` };
    seen.add(c);
  }
  if (columns.every((c) => isNum(c))) return { error: "The first line looks like data, not a header. Add a header row naming the columns (for example time,event,group)." };
  const rows = [];
  const lineNo = [];
  for (let i = 1; i < cells.length; i++) {
    if (cells[i].length !== columns.length) return { error: `Line ${i + 1} has ${cells[i].length} fields but the header has ${columns.length}. Check the delimiter and quoting.` };
    rows.push(cells[i]);
    lineNo.push(i + 1);
  }
  const numeric = columns.map((_, j) => rows.every((r) => isMissing(r[j]) || isNum(r[j])) && rows.some((r) => !isMissing(r[j])));
  return { columns, rows, lineNo, numeric, delimiter: delim };
}

const EVENT_WORDS = new Map([
  ["1", 1], ["0", 0], ["true", 1], ["false", 0], ["yes", 1], ["no", 0], ["y", 1], ["n", 0],
  ["event", 1], ["censored", 0], ["dead", 1], ["alive", 0], ["died", 1], ["death", 1],
  ["churned", 1], ["active", 0], ["failed", 1], ["failure", 1], ["relapse", 1], ["relapsed", 1],
]);

/** How the event column's values map to event (1) and censored (0). */
export function eventCoding(values, eventValue) {
  const distinct = [...new Set(values.map((v) => String(v).trim()))];
  if (eventValue !== undefined && eventValue !== null && String(eventValue).trim() !== "") {
    const ev = String(eventValue).trim();
    if (!distinct.includes(ev)) return { error: `The event value "${ev}" never appears in the event column (values: ${distinct.slice(0, 8).join(", ")}).` };
    return { map: (v) => (String(v).trim() === ev ? 1 : 0), note: `"${ev}" counted as the event; every other value as censored.` };
  }
  const lower = distinct.map((v) => v.toLowerCase());
  if (lower.every((v) => EVENT_WORDS.has(v))) return { map: (v) => EVENT_WORDS.get(String(v).trim().toLowerCase()), note: null };
  if (distinct.length <= 2 && distinct.every((v) => v === "1" || v === "2")) {
    return { map: (v) => (String(v).trim() === "2" ? 1 : 0), note: "Event column is coded 1/2: read as R does, 2 = event, 1 = censored." };
  }
  return { error: `The event column must say which rows had the event: 1/0, true/false, yes/no, or event/censored. Found: ${distinct.slice(0, 8).join(", ")}${distinct.length > 8 ? ", ..." : ""}. Or name the value that means "event".` };
}

// ---------- special functions (no tables: series and continued fraction) ----------

function lnGammaHalfInt(a) {
  // a is a positive multiple of 1/2 (degrees of freedom / 2).
  const twice = Math.round(2 * a);
  if (Math.abs(twice - 2 * a) > 1e-9 || twice < 1) throw new Error("lnGammaHalfInt needs a = k/2, k >= 1");
  let x = twice % 2 === 0 ? 1 : 0.5;
  let s = twice % 2 === 0 ? 0 : 0.5 * Math.log(Math.PI);
  while (x < a - 1e-9) { s += Math.log(x); x += 1; }
  return s;
}

/** Regularised upper incomplete gamma Q(a, x) for a = k/2. */
export function gammaQ(a, x) {
  if (!(x > 0)) return 1;
  const lg = lnGammaHalfInt(a);
  if (x < a + 1) {
    let term = 1 / a, sum = term, ap = a;
    for (let n = 0; n < 10000; n++) {
      ap += 1; term *= x / ap; sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - lg));
  }
  // Modified Lentz continued fraction for Q.
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - lg) * h;
}

/** Upper tail of the chi-square distribution with df degrees of freedom. */
export const chiSquareP = (x, df) => gammaQ(df / 2, x / 2);
/** Two-sided normal p-value for a z statistic (= chi-square on 1 df of z^2). */
export const normalP = (z) => (Number.isFinite(z) ? gammaQ(0.5, (z * z) / 2) : 0);

/** Standard normal quantile, by Newton's method on the exact CDF. */
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new Error("normalQuantile needs 0 < p < 1");
  if (p < 0.5) return -normalQuantile(1 - p);
  if (p === 0.5) return 0;
  const cdf = (z) => 1 - 0.5 * gammaQ(0.5, (z * z) / 2);
  let z = Math.sqrt(-2 * Math.log(1 - p)); // rough start
  z = Math.max(0.1, z - (2.515517 + 0.802853 * z + 0.010328 * z * z) / (1 + 1.432788 * z + 0.189269 * z * z + 0.001308 * z * z * z));
  for (let i = 0; i < 60; i++) {
    const step = (cdf(z) - p) / (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI));
    z -= step;
    if (Math.abs(step) < 1e-14) break;
  }
  return z;
}

// ---------- small linear algebra ----------

/** Inverse of a symmetric positive-definite matrix (Gauss-Jordan, partial pivoting). Null if singular. */
export function invert(A) {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(1e-300, ...A.map((r, i) => Math.abs(r[i])));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12 * scale) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    const p = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === c || M[r][c] === 0) continue;
      const f = M[r][c];
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r) => r.slice(n));
}
const matVec = (A, v) => A.map((r) => r.reduce((s, a, j) => s + a * v[j], 0));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// ---------- Kaplan-Meier ----------

/**
 * Kaplan-Meier estimate for one sample. `time` and `event` are parallel arrays.
 * Returns rows at every distinct observed time with the number at risk,
 * events, censored, S(t), Greenwood standard error and log(-log) band.
 */
export function kaplanMeier(time, event, { confidence = DEFAULTS.confidence } = {}) {
  const z = normalQuantile(1 - (1 - confidence) / 2);
  const idx = time.map((_, i) => i).sort((a, b) => time[a] - time[b]);
  const rows = [];
  let atRisk = time.length, S = 1, gw = 0;
  for (let k = 0; k < idx.length;) {
    const t = time[idx[k]];
    let d = 0, c = 0;
    while (k < idx.length && time[idx[k]] === t) { if (event[idx[k]]) d++; else c++; k++; }
    if (d > 0) {
      S *= 1 - d / atRisk;
      gw = atRisk > d ? gw + d / (atRisk * (atRisk - d)) : Infinity;
    }
    let lo, hi, se;
    if (S <= 0) { lo = 0; hi = 0; se = 0; }
    else if (gw === 0) { lo = 1; hi = 1; se = 0; }
    else {
      se = S * Math.sqrt(gw);
      const seLL = Math.sqrt(gw) / Math.abs(Math.log(S));
      lo = Math.pow(S, Math.exp(z * seLL));
      hi = Math.pow(S, Math.exp(-z * seLL));
    }
    rows.push({ time: t, atRisk, events: d, censored: c, survival: S, se, lo, hi });
    atRisk -= d + c;
  }
  return rows;
}

/** First time the curve (or a band) is at or below q; Infinity if never ("not reached"). */
export function quantileTime(rows, q = 0.5, key = "survival") {
  for (const r of rows) if (r[key] <= q + 1e-12) return r.time;
  return Infinity;
}

/** Area under the Kaplan-Meier step curve from 0 to tau (restricted mean survival time). */
export function rmst(rows, tau) {
  let area = 0, prevT = 0, S = 1;
  for (const r of rows) {
    if (r.time >= tau) break;
    area += S * (r.time - prevT);
    prevT = r.time;
    S = r.survival;
  }
  return area + S * (tau - prevT);
}

// ---------- log-rank family ----------

export const TESTS = {
  logrank: { name: "Log-rank (Mantel 1966)", weight: () => 1 },
  wilcoxon: { name: "Gehan-Breslow generalised Wilcoxon", weight: (n) => n },
  "tarone-ware": { name: "Tarone-Ware", weight: (n) => Math.sqrt(n) },
};

/**
 * k-sample test of equal survival. `group` holds a group index 0..k-1 per row.
 * Returns observed and expected events per group, chi-square, df and p.
 */
export function logRank(time, event, group, k, { test = DEFAULTS.test } = {}) {
  const spec = TESTS[test];
  if (!spec) throw new Error(`unknown test ${test}`);
  const idx = time.map((_, i) => i).sort((a, b) => time[a] - time[b]);
  const nRisk = Array(k).fill(0);
  for (const g of group) nRisk[g]++;
  const O = Array(k).fill(0), E = Array(k).fill(0);
  const U = Array(k).fill(0);
  const V = Array.from({ length: k }, () => Array(k).fill(0));
  for (let p = 0; p < idx.length;) {
    const t = time[idx[p]];
    const d = Array(k).fill(0), leave = Array(k).fill(0);
    while (p < idx.length && time[idx[p]] === t) { const i = idx[p]; leave[group[i]]++; if (event[i]) d[group[i]]++; p++; }
    const D = d.reduce((a, b) => a + b, 0);
    const N = nRisk.reduce((a, b) => a + b, 0);
    if (D > 0) {
      const w = spec.weight(N);
      for (let j = 0; j < k; j++) {
        const e = (D * nRisk[j]) / N;
        O[j] += d[j];
        E[j] += e;
        U[j] += w * (d[j] - e);
      }
      if (N > 1) {
        const f = (w * w * D * (N - D)) / (N - 1);
        for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) V[j][l] += f * (nRisk[j] / N) * ((j === l ? 1 : 0) - nRisk[l] / N);
      }
    }
    for (let j = 0; j < k; j++) nRisk[j] -= leave[j];
  }
  const m = k - 1;
  const Vs = V.slice(0, m).map((r) => r.slice(0, m));
  const inv = m > 0 ? invert(Vs) : null;
  const chiSquare = inv ? dot(U.slice(0, m), matVec(inv, U.slice(0, m))) : NaN;
  return { test, name: spec.name, observed: O, expected: E, chiSquare, df: m, p: Number.isFinite(chiSquare) ? chiSquareP(chiSquare, m) : NaN };
}

// ---------- Cox proportional hazards ----------

/**
 * One pass over the data, from the latest time to the earliest, at
 * coefficients beta. Returns the partial log-likelihood, score vector,
 * information matrix and (optionally) Schoenfeld residuals per event.
 * `order` is the row order sorted by time ascending.
 */
function coxPass(X, time, event, order, beta, ties, wantResiduals = false) {
  const n = order.length, p = beta.length;
  const eta = X.map((x) => dot(x, beta));
  const shift = eta.reduce((m, v) => (v > m ? v : m), -Infinity); // no spread: a 150k-row column overflows the call stack
  const r = eta.map((e) => Math.exp(e - shift));
  let ll = 0;
  const U = Array(p).fill(0);
  const I = Array.from({ length: p }, () => Array(p).fill(0));
  let S0 = 0;
  const S1 = Array(p).fill(0), S2 = Array.from({ length: p }, () => Array(p).fill(0));
  const resid = [];
  for (let k = n - 1; k >= 0;) {
    const t = time[order[k]];
    let D0 = 0;
    const D1 = Array(p).fill(0), D2 = Array.from({ length: p }, () => Array(p).fill(0));
    const evs = [];
    while (k >= 0 && time[order[k]] === t) {
      const i = order[k], x = X[i], ri = r[i];
      S0 += ri;
      for (let a = 0; a < p; a++) { S1[a] += ri * x[a]; for (let b = 0; b <= a; b++) S2[a][b] += ri * x[a] * x[b]; }
      if (event[i]) {
        evs.push(i);
        D0 += ri;
        for (let a = 0; a < p; a++) { D1[a] += ri * x[a]; for (let b = 0; b <= a; b++) D2[a][b] += ri * x[a] * x[b]; }
      }
      k--;
    }
    const d = evs.length;
    if (!d) continue;
    const mean = Array(p).fill(0);
    for (const i of evs) { ll += eta[i] - shift; for (let a = 0; a < p; a++) U[a] += X[i][a]; }
    for (let l = 0; l < d; l++) {
      const f = ties === "efron" ? l / d : 0;
      const s0 = S0 - f * D0;
      ll -= Math.log(s0);
      for (let a = 0; a < p; a++) {
        const ma = (S1[a] - f * D1[a]) / s0;
        U[a] -= ma;
        mean[a] += ma / d;
        for (let b = 0; b <= a; b++) {
          const mb = (S1[b] - f * D1[b]) / s0;
          I[a][b] += (S2[a][b] - f * D2[a][b]) / s0 - ma * mb;
        }
      }
    }
    if (wantResiduals) for (const i of evs) resid.push({ row: i, time: t, r: X[i].map((x, a) => x - mean[a]) });
  }
  for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) I[a][b] = I[b][a];
  return { ll, U, I, resid };
}

/** Harrell's C for risk score eta (higher = earlier event expected). O(n log n). */
export function concordance(time, event, eta) {
  const n = time.length;
  const sorted = [...new Set(eta)].sort((a, b) => a - b);
  const rank = new Map(sorted.map((v, i) => [v, i + 1]));
  const m = sorted.length;
  const tree = Array(m + 1).fill(0);
  const add = (i) => { for (; i <= m; i += i & -i) tree[i]++; };
  const sum = (i) => { let s = 0; for (; i > 0; i -= i & -i) s += tree[i]; return s; };
  const order = time.map((_, i) => i).sort((a, b) => time[b] - time[a]);
  let inserted = 0, conc = 0, tied = 0, pairs = 0;
  for (let k = 0; k < n;) {
    const t = time[order[k]];
    const block = [];
    while (k < n && time[order[k]] === t) block.push(order[k++]);
    // Subjects censored at t are taken to outlive events at t.
    for (const i of block) if (!event[i]) { add(rank.get(eta[i])); inserted++; }
    for (const i of block) {
      if (!event[i]) continue;
      const rk = rank.get(eta[i]);
      const below = sum(rk - 1), eq = sum(rk) - below;
      conc += below; tied += eq; pairs += inserted;
    }
    for (const i of block) if (event[i]) { add(rank.get(eta[i])); inserted++; }
  }
  return { c: pairs ? (conc + 0.5 * tied) / pairs : NaN, pairs, concordant: conc, tiedRisk: tied };
}

/**
 * Fit a Cox model. X is rows of covariates (already coded), names their labels.
 * Returns coefficients with standard errors, hazard ratios and intervals, the
 * three global tests, concordance and the per-term proportional-hazards test.
 */
export function coxFit(time, event, X, names, { ties = DEFAULTS.ties, confidence = DEFAULTS.confidence, maxIterations = DEFAULTS.maxIterations } = {}) {
  const n = X.length, p = names.length;
  const z = normalQuantile(1 - (1 - confidence) / 2);
  const means = names.map((_, a) => X.reduce((s, x) => s + x[a], 0) / n);
  const sds = names.map((_, a) => Math.sqrt(X.reduce((s, x) => s + (x[a] - means[a]) ** 2, 0) / Math.max(1, n - 1)));
  const Xc = X.map((x) => x.map((v, a) => v - means[a]));
  const order = time.map((_, i) => i).sort((a, b) => time[a] - time[b]);
  let beta = Array(p).fill(0);
  let cur = coxPass(Xc, time, event, order, beta, ties);
  const ll0 = cur.ll;
  const I0inv = invert(cur.I);
  const scoreChi = I0inv ? dot(cur.U, matVec(I0inv, cur.U)) : NaN;
  let converged = false, iterations = 0;
  const warnings = [];
  for (; iterations < maxIterations; iterations++) {
    const Iinv = invert(cur.I);
    if (!Iinv) { warnings.push("The information matrix is singular: two covariates carry the same information, or one does not vary. Drop one and refit."); break; }
    const step = matVec(Iinv, cur.U);
    let s = 1, next, trial;
    for (let h = 0; h < 30; h++) {
      trial = beta.map((b, a) => b + s * step[a]);
      next = coxPass(Xc, time, event, order, trial, ties);
      if (Number.isFinite(next.ll) && next.ll >= cur.ll - 1e-12 * Math.abs(cur.ll)) break;
      s /= 2;
    }
    const gain = next.ll - cur.ll;
    beta = trial; cur = next;
    if (Math.abs(gain) <= 1e-10 * Math.max(1, Math.abs(cur.ll)) && Math.max(...step.map((v) => Math.abs(v * s))) < 1e-7) { converged = true; iterations++; break; }
  }
  const V = invert(cur.I);
  if (!converged && !warnings.length) warnings.push(`Newton-Raphson did not settle in ${maxIterations} steps; a coefficient may be infinite (a covariate perfectly separates who had the event first).`);
  const huge = names.filter((_, a) => Math.abs(beta[a]) * (sds[a] || 1) > 12);
  if (huge.length) warnings.push(`Very large coefficient for ${huge.join(", ")}: the likelihood may be monotone (that term separates the events), so its hazard ratio and interval are not reliable.`);
  const se = V ? names.map((_, a) => Math.sqrt(Math.max(0, V[a][a]))) : names.map(() => NaN);
  // Proportional-hazards check: scaled Schoenfeld residuals against 1 - KM(t).
  const km = kaplanMeier(time, event);
  const kmAt = new Map(km.map((r) => [r.time, r.survival]));
  const res = coxPass(Xc, time, event, order, beta, ties, true).resid;
  const dTot = res.length;
  let ph = names.map(() => null);
  if (V && dTot > 2) {
    const g = res.map((e) => 1 - kmAt.get(e.time));
    const gbar = g.reduce((a, b) => a + b, 0) / dTot;
    const gss = g.reduce((s, v) => s + (v - gbar) ** 2, 0);
    if (gss > 0) {
      const scaled = res.map((e) => matVec(V, e.r).map((v) => v * dTot));
      ph = names.map((_, a) => {
        const num = scaled.reduce((s, row, k) => s + (g[k] - gbar) * row[a], 0);
        const T = (num * num) / (dTot * se[a] * se[a] * gss);
        return { chiSquare: T, p: chiSquareP(T, 1) };
      });
    }
  }
  const eta = Xc.map((x) => dot(x, beta));
  const conc = concordance(time, event, eta);
  const terms = names.map((name, a) => {
    const zz = beta[a] / se[a];
    return {
      name, coef: beta[a], se: se[a], z: zz, p: normalP(zz),
      hr: Math.exp(beta[a]), hrLo: Math.exp(beta[a] - z * se[a]), hrHi: Math.exp(beta[a] + z * se[a]),
      ph: ph[a],
    };
  });
  const lr = 2 * (cur.ll - ll0);
  const wald = V ? dot(beta, matVec(cur.I, beta)) : NaN;
  return {
    ties, n, events: event.reduce((a, b) => a + b, 0), iterations, converged,
    terms, logLik: cur.ll, logLik0: ll0,
    lr: { chiSquare: lr, df: p, p: chiSquareP(Math.max(0, lr), p) },
    wald: { chiSquare: wald, df: p, p: Number.isFinite(wald) ? chiSquareP(Math.max(0, wald), p) : NaN },
    score: { chiSquare: scoreChi, df: p, p: Number.isFinite(scoreChi) ? chiSquareP(Math.max(0, scoreChi), p) : NaN },
    concordance: conc.c,
    variance: V,
    warnings,
  };
}

// ---------- top level ----------

const fmt = (v, d = 3) => {
  if (v === Infinity) return "not reached";
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(2);
  return a >= 100 ? v.toFixed(1) : Number(v.toPrecision(d)).toString();
};
export const formatP = (p) => (!Number.isFinite(p) ? "n/a" : p < 1e-4 ? p.toExponential(1) : p < 0.001 ? p.toFixed(4) : p.toFixed(3));

function asList(v) {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  return String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Run the whole analysis on a CSV.
 * input: { csv, time, event, eventValue?, group?, covariates?, reference?,
 *          confidence?, ties?, test?, tau? }
 */
export function analyze(input = {}) {
  const confidence = input.confidence === undefined ? DEFAULTS.confidence : Number(input.confidence);
  if (!(confidence > 0.5 && confidence < 1)) return { error: "Confidence must be between 0.5 and 1, for example 0.95." };
  const ties = String(input.ties || DEFAULTS.ties).toLowerCase();
  if (!["efron", "breslow"].includes(ties)) return { error: `Ties must be "efron" or "breslow", not "${input.ties}".` };
  const test = String(input.test || DEFAULTS.test).toLowerCase();
  if (!TESTS[test]) return { error: `Test must be one of ${Object.keys(TESTS).join(", ")}, not "${input.test}".` };
  const p = parseCsv(input.csv);
  if (p.error) return p;
  const { columns, rows, numeric } = p;
  const pick = (want, guesses) => {
    if (want !== undefined && want !== null && String(want).trim() !== "") return String(want).trim();
    return columns.find((c) => guesses.test(c)) ?? null;
  };
  const timeCol = pick(input.time, /^(time|times|duration|durations|t|weeks|days|months|years|tenure|futime|stop|survival_time|time_to_event)$/i);
  const eventCol = pick(input.event, /^(event|events|status|e|dead|death|died|churned|churn|fstat|cens|observed|relapsed|failure|failed)$/i);
  if (!timeCol) return { error: `Choose the time column: none of ${columns.join(", ")} is named like one (time, duration, days, ...).` };
  if (!eventCol) return { error: `Choose the event column: none of ${columns.join(", ")} is named like one (event, status, churned, ...).` };
  for (const c of [timeCol, eventCol]) if (!columns.includes(c)) return { error: `Column "${c}" is not in the header (${columns.join(", ")}).` };
  if (timeCol === eventCol) return { error: "The time and event columns must be different." };
  if (!numeric[columns.indexOf(timeCol)]) return { error: `The time column "${timeCol}" must hold numbers (durations in any unit).` };
  const groupCol = input.group === undefined || input.group === null || String(input.group).trim() === "" ? null : String(input.group).trim();
  if (groupCol && !columns.includes(groupCol)) return { error: `Group column "${groupCol}" is not in the header (${columns.join(", ")}).` };
  if (groupCol && (groupCol === timeCol || groupCol === eventCol)) return { error: "The group column must differ from the time and event columns." };
  const covs = asList(input.covariates).filter((c) => c !== groupCol);
  for (const c of covs) {
    if (!columns.includes(c)) return { error: `Covariate "${c}" is not in the header (${columns.join(", ")}).` };
    if (c === timeCol || c === eventCol) return { error: `"${c}" is the time or event column and cannot also be a covariate.` };
  }
  const used = [timeCol, eventCol, ...(groupCol ? [groupCol] : []), ...covs].map((c) => columns.indexOf(c));
  const keep = rows.filter((r) => used.every((j) => !isMissing(r[j])));
  const dropped = rows.length - keep.length;
  if (keep.length < 2) return { error: "Fewer than two rows have every chosen column filled in." };
  const ti = columns.indexOf(timeCol);
  const time = keep.map((r) => Number(r[ti]));
  if (time.some((t) => t < 0)) return { error: `The time column "${timeCol}" has a negative value. Times are durations from each subject's start, so they must be 0 or more.` };
  const coding = eventCoding(keep.map((r) => r[columns.indexOf(eventCol)]), input.eventValue);
  if (coding.error) return { error: coding.error };
  const event = keep.map((r) => coding.map(r[columns.indexOf(eventCol)]));
  const nEvents = event.reduce((a, b) => a + b, 0);
  if (nEvents === 0) return { error: "No row has the event, so there is nothing to estimate: every subject is censored." };
  const warnings = [];
  if (coding.note) warnings.push(coding.note);
  if (dropped) warnings.push(`${dropped} row${dropped === 1 ? "" : "s"} with a missing value in a chosen column ${dropped === 1 ? "was" : "were"} left out.`);

  // Groups, in order of first appearance unless a reference is named.
  let levels = ["All"], gIdx = keep.map(() => 0);
  if (groupCol) {
    const gj = columns.indexOf(groupCol);
    levels = [...new Set(keep.map((r) => r[gj]))];
    if (input.reference !== undefined && String(input.reference).trim() !== "") {
      const ref = String(input.reference).trim();
      if (!levels.includes(ref)) return { error: `Reference group "${ref}" is not a value of ${groupCol} (${levels.slice(0, 10).join(", ")}).` };
      levels = [ref, ...levels.filter((l) => l !== ref)];
    }
    if (levels.length > 20) return { error: `The group column "${groupCol}" has ${levels.length} distinct values. Pick a column with at most 20 groups, or add it as a numeric covariate instead.` };
    if (levels.length < 2) warnings.push(`The group column "${groupCol}" has a single value, so there is nothing to compare.`);
    const li = new Map(levels.map((l, i) => [l, i]));
    gIdx = keep.map((r) => li.get(r[gj]));
  }
  const groups = levels.map((name, g) => {
    const tg = [], eg = [];
    gIdx.forEach((x, i) => { if (x === g) { tg.push(time[i]); eg.push(event[i]); } });
    const km = kaplanMeier(tg, eg, { confidence });
    return {
      name, n: tg.length, events: eg.reduce((a, b) => a + b, 0), censored: eg.filter((e) => !e).length,
      maxTime: tg.reduce((m, v) => (v > m ? v : m), -Infinity),
      median: quantileTime(km, 0.5), medianLo: quantileTime(km, 0.5, "lo"), medianHi: quantileTime(km, 0.5, "hi"),
      km,
    };
  });
  const tauDefault = Math.min(...groups.map((g) => g.maxTime));
  const tau = input.tau !== undefined && input.tau !== null && String(input.tau).trim() !== "" ? Number(input.tau) : tauDefault;
  if (!(tau > 0)) return { error: "The horizon for restricted mean survival must be a positive time." };
  if (tau > tauDefault) warnings.push(`The restricted-mean horizon ${fmt(tau)} is past the last follow-up of at least one group (${fmt(tauDefault)}); the curve is carried flat beyond it, which can overstate survival there.`);
  for (const g of groups) g.rmst = rmst(g.km, tau);

  let testResult = null;
  if (levels.length >= 2) {
    testResult = logRank(time, event, gIdx, levels.length, { test });
    if (levels.length > 2) testResult.note = "The test asks whether any group differs; it does not say which.";
  }

  // Cox design: group dummies against the reference, then covariates.
  const names = [], cols = [];
  if (levels.length >= 2) for (let g = 1; g < levels.length; g++) { names.push(`${groupCol}=${levels[g]} vs ${levels[0]}`); cols.push((i) => (gIdx[i] === g ? 1 : 0)); }
  for (const c of covs) {
    const j = columns.indexOf(c);
    if (keep.every((r) => isNum(r[j]))) { names.push(c); cols.push((i) => Number(keep[i][j])); }
    else {
      const lv = [...new Set(keep.map((r) => r[j]))];
      if (lv.length > 20) return { error: `Covariate "${c}" is text with ${lv.length} distinct values; recode it as a number or fewer categories.` };
      for (const l of lv.slice(1)) { names.push(`${c}=${l} vs ${lv[0]}`); cols.push((i) => (keep[i][j] === l ? 1 : 0)); }
    }
  }
  let cox = null;
  if (names.length) {
    if (nEvents <= names.length) warnings.push(`Only ${nEvents} events for ${names.length} Cox terms: too few to fit. A common rule of thumb asks for about 10 events per term.`);
    else {
      const X = keep.map((_, i) => cols.map((f) => f(i)));
      const constant = names.filter((_, a) => X.every((x) => x[a] === X[0][a]));
      if (constant.length) return { error: `Cox term ${constant.join(", ")} has the same value on every row; drop it.` };
      cox = coxFit(time, event, X, names, { ties, confidence });
      warnings.push(...cox.warnings);
      if (nEvents < 10 * names.length) warnings.push(`${nEvents} events for ${names.length} Cox term${names.length === 1 ? "" : "s"}: fewer than the usual 10 per term, so estimates may be unstable.`);
      const bad = cox.terms.filter((t) => t.ph && t.ph.p < 0.05).map((t) => t.name);
      if (bad.length) warnings.push(`The proportional-hazards check flags ${bad.join(", ")} (p < 0.05): that term's effect seems to change over time, so a single hazard ratio averages over it.`);
    }
  }

  const summary = summarize({ groups, testResult, cox, confidence, timeCol, tau, groupCol });
  return {
    summary, warnings,
    rows: { total: rows.length, used: keep.length, dropped, events: nEvents },
    columns: { time: timeCol, event: eventCol, group: groupCol, covariates: covs },
    confidence, ties, test, tau,
    groups, logrank: testResult, cox,
  };
}

function summarize({ groups, testResult, cox, confidence, timeCol, tau, groupCol }) {
  const cl = `${Math.round(confidence * 100)}%`;
  const parts = [];
  const med = (g) => (g.median === Infinity ? `fewer than half had the event by the last time observed (${fmt(g.maxTime)})` : `half had the event by ${fmt(g.median)} (${cl} CI ${fmt(g.medianLo)} to ${fmt(g.medianHi)})`);
  if (groups.length === 1) parts.push(`${groups[0].n} subjects, ${groups[0].events} events: ${med(groups[0])}. Mean time to event up to ${fmt(tau)} (${timeCol} units): ${fmt(groups[0].rmst)}.`);
  else {
    parts.push(groups.map((g) => `${g.name} (${g.n} subjects, ${g.events} events): ${med(g)}`).join("; ") + ".");
    parts.push(`Mean time to event up to ${fmt(tau)}: ${groups.map((g) => `${g.name} ${fmt(g.rmst)}`).join(", ")}.`);
  }
  if (testResult) {
    const sig = testResult.p < 0.05;
    parts.push(`${testResult.name} test: chi-square ${fmt(testResult.chiSquare, 4)} on ${testResult.df} df, p = ${formatP(testResult.p)}, so the ${groupCol} groups ${sig ? "differ" : "do not differ detectably"} at the 5% level.`);
  }
  if (cox) {
    const t = cox.terms.map((x) => `${x.name}: hazard ratio ${fmt(x.hr)} (${cl} CI ${fmt(x.hrLo)} to ${fmt(x.hrHi)}, p = ${formatP(x.p)})`);
    parts.push(`Cox model (${cox.ties} ties): ${t.join("; ")}. Concordance ${fmt(cox.concordance)}.`);
  }
  return parts.join(" ");
}
