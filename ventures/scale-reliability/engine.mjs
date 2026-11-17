// Scale reliability: Cronbach's alpha, McDonald's omega, Guttman's lambdas and an item
// analysis for a multi-item questionnaire scale. Pure functions, no DOM, no network, seeded
// randomness only. Implemented from the papers' mathematics (PAPERS below); no third-party
// code was ported. pingouin and factor_analyzer were used only to produce eval/reference.json.

export const PAPERS = [
  { key: "cronbach1951coefficient", authors: "Cronbach, L. J.", title: "Coefficient alpha and the internal structure of tests", venue: "Psychometrika 16(3), 297-334", year: 1951, url: "https://doi.org/10.1007/BF02310555", doi: "10.1007/BF02310555", implemented: "Coefficient alpha from the item covariance matrix; alpha if an item is deleted; standardised alpha from the mean inter-item correlation.", deviations: "None." },
  { key: "guttman1945basis", authors: "Guttman, L.", title: "A basis for analyzing test-retest reliability", venue: "Psychometrika 10(4), 255-282", year: 1945, url: "https://doi.org/10.1007/BF02288892", doi: "10.1007/BF02288892", implemented: "Lower bounds lambda-2 (from the squared covariances) and lambda-6 (from each item's error variance given the others, 1/[C^-1]_ii).", deviations: "lambda-1, 3 (= alpha), 4 and 5 are not reported." },
  { key: "mcdonald1999test", authors: "McDonald, R. P.", title: "Test Theory: A Unified Treatment", venue: "Lawrence Erlbaum, Mahwah NJ", year: 1999, url: "https://doi.org/10.4324/9781410601087", doi: "10.4324/9781410601087", implemented: "Omega total for a one-factor (congeneric) model: (sum of loadings)^2 / ((sum of loadings)^2 + sum of unique variances).", deviations: "The one-factor model is fitted by unweighted least squares (minimum residual, iterated principal axes to convergence), not maximum likelihood." },
  { key: "feldt1987statistical", authors: "Feldt, L. S., Woodruff, D. J. & Salih, F. A.", title: "Statistical inference for coefficient alpha", venue: "Applied Psychological Measurement 11(1), 93-103", year: 1987, url: "https://doi.org/10.1177/014662168701100107", doi: "10.1177/014662168701100107", implemented: "The F-distribution confidence interval for alpha with n-1 and (n-1)(k-1) degrees of freedom.", deviations: "None." },
  { key: "kelley2016confidence", authors: "Kelley, K. & Pornprasertmanit, S.", title: "Confidence intervals for population reliability coefficients: Evaluation of methods, recommendations, and software for composite measures", venue: "Psychological Methods 21(1), 69-92", year: 2016, url: "https://doi.org/10.1037/a0040086", doi: "10.1037/a0040086", implemented: "Their recommendation of a bias-corrected and accelerated bootstrap interval for omega (and alpha), resampling respondents.", deviations: "The omega in each resample comes from the least-squares fit above, not their CFA maximum likelihood." },
  { key: "efron1987better", authors: "Efron, B.", title: "Better bootstrap confidence intervals", venue: "Journal of the American Statistical Association 82(397), 171-185", year: 1987, url: "https://doi.org/10.1080/01621459.1987.10478410", doi: "10.1080/01621459.1987.10478410", implemented: "The BCa interval: bias correction from the share of resamples below the estimate, acceleration from the jackknife.", deviations: "None." },
  { key: "sijtsma2009use", authors: "Sijtsma, K.", title: "On the use, the misuse, and the very limited usefulness of Cronbach's alpha", venue: "Psychometrika 74(1), 107-120", year: 2009, url: "https://doi.org/10.1007/s11336-008-9101-0", doi: "10.1007/s11336-008-9101-0", implemented: "The page's reading of alpha as a lower bound (alpha <= lambda-2 <= reliability under the classical model) and not a measure of unidimensionality.", deviations: "The greatest lower bound is not computed." },
  { key: "spearman1910correlation", authors: "Spearman, C.; Brown, W.", title: "Correlation calculated from faulty data; Some experimental results in the correlation of mental abilities", venue: "British Journal of Psychology 3(3), 271-295 and 296-322", year: 1910, url: "https://doi.org/10.1111/j.2044-8295.1910.tb00206.x", doi: "10.1111/j.2044-8295.1910.tb00206.x", implemented: "The prophecy formula: how many parallel items a target reliability needs.", deviations: "Assumes the added items behave like the current ones on average." },
];

export const DEFAULTS = { confidence: 0.95, bootstrap: 1000, seed: 1, missing: [], reverse: [], items: null, scaleMin: null, scaleMax: null, targets: [0.7, 0.8, 0.9] };

const ID_NAME = /^(id|seqn|respondent(_?id)?|subject(_?id)?|participant(_?id)?|case(_?id)?|row|obs|record(_?id)?|timestamp|date|time|name|email)$/i;

// ---------- distributions ----------

export function lgamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularised incomplete beta I_x(a, b) by its continued fraction (modified Lentz).
export function betaInc(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  if (x > (a + 1) / (a + b + 2)) return 1 - betaInc(1 - x, b, a);
  const tiny = 1e-300;
  let f = 1, C = 1, D = 0;
  for (let m = 0; m <= 5000; m++) {
    for (const odd of [false, true]) {
      let num;
      if (m === 0 && !odd) num = 1;
      else if (!odd) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
      else num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
      D = 1 + num * D;
      if (Math.abs(D) < tiny) D = tiny;
      C = 1 + num / C;
      if (Math.abs(C) < tiny) C = tiny;
      D = 1 / D;
      const delta = C * D;
      f *= delta;
      if (m > 0 && Math.abs(delta - 1) < 1e-15) return (Math.exp(lbt) * (f - 1)) / a;
    }
  }
  return (Math.exp(lbt) * (f - 1)) / a;
}

export function betaQuantile(p, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (betaInc(mid, a, b) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-16) break;
  }
  return (lo + hi) / 2;
}

export function fQuantile(p, d1, d2) {
  const x = betaQuantile(p, d1 / 2, d2 / 2);
  return (d2 * x) / (d1 * (1 - x));
}

export const fCdf = (f, d1, d2) => (f <= 0 ? 0 : betaInc((d1 * f) / (d1 * f + d2), d1 / 2, d2 / 2));

export function normCdf(z) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  // P(|Z| < z) is the regularised incomplete gamma P(1/2, z^2/2).
  const p = gammaP(0.5, (z * z) / 2);
  return z >= 0 ? 0.5 + 0.5 * p : 0.5 - 0.5 * p;
}

export function gammaP(a, x) {
  if (x <= 0) return 0;
  const lg = lgamma(a);
  if (x < a + 1) {
    let sum = 1 / a, term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lg);
  }
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lg) * h;
}

export function normQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let lo = -40, hi = 40;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (normCdf(mid) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-14) break;
  }
  return (lo + hi) / 2;
}

// ---------- linear algebra ----------

// Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations. Returns values in
// descending order with matching column vectors.
export function symEigen(M) {
  const n = M.length;
  const A = M.map((r) => r.slice());
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = A.map((r, i) => i).sort((a, b) => A[b][b] - A[a][a]);
  return { values: order.map((i) => A[i][i]), vectors: order.map((i) => V.map((r) => r[i])) };
}

// Gauss-Jordan inverse with partial pivoting; null when singular.
export function invert(M) {
  const n = M.length;
  const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    const scale = Math.max(...M.map((r) => Math.abs(r[c]))) || 1;
    if (Math.abs(A[piv][c]) < 1e-12 * scale) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c];
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((r) => r.slice(n));
}

// ---------- reliability coefficients ----------

const sumAll = (C) => C.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);
const trace = (C) => C.reduce((s, r, i) => s + r[i], 0);

export function alphaFromCov(C) {
  const k = C.length;
  const vt = sumAll(C);
  return (k / (k - 1)) * (1 - trace(C) / vt);
}

export function corrFromCov(C) {
  return C.map((r, i) => r.map((v, j) => v / Math.sqrt(C[i][i] * C[j][j])));
}

export function standardizedAlpha(C) {
  const R = corrFromCov(C);
  const k = R.length;
  const rbar = (sumAll(R) - k) / (k * (k - 1));
  return { alpha: (k * rbar) / (1 + (k - 1) * rbar), meanR: rbar };
}

export function lambda2(C) {
  const k = C.length;
  const vt = sumAll(C);
  let off2 = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j) off2 += C[i][j] * C[i][j];
  return 1 - trace(C) / vt + Math.sqrt((k / (k - 1)) * off2) / vt;
}

export function lambda6(C) {
  const inv = invert(C);
  if (!inv) return null;
  const err = inv.reduce((s, r, i) => s + 1 / r[i], 0);
  return 1 - err / sumAll(C);
}

export function feldtInterval(alpha, n, k, confidence = 0.95) {
  const g = 1 - confidence;
  const d1 = n - 1, d2 = (n - 1) * (k - 1);
  return { lower: 1 - (1 - alpha) * fQuantile(1 - g / 2, d1, d2), upper: 1 - (1 - alpha) * fQuantile(g / 2, d1, d2), df1: d1, df2: d2 };
}

// One-factor model by unweighted least squares (minimum residual): the fixed point of
// iterated principal axes, starting from squared multiple correlations. Works on a
// covariance or a correlation matrix; loadings are in the matrix's units.
export function oneFactor(C, { maxIter = 5000, tol = 1e-12 } = {}) {
  const k = C.length;
  const inv = invert(C);
  let h = C.map((r, i) => (inv ? Math.max(r[i] - 1 / inv[i][i], 1e-6 * r[i]) : 0.5 * r[i]));
  let load = new Array(k).fill(0);
  let iter = 0, heywood = false;
  for (; iter < maxIter; iter++) {
    const A = C.map((r, i) => r.map((v, j) => (i === j ? h[i] : v)));
    const { values, vectors } = symEigen(A);
    const e = Math.max(values[0], 0);
    load = vectors[0].map((v) => v * Math.sqrt(e));
    let next = load.map((l) => l * l);
    heywood = false;
    next = next.map((v, i) => {
      if (v >= C[i][i]) { heywood = true; return C[i][i]; }
      return v;
    });
    const change = Math.max(...next.map((v, i) => Math.abs(v - h[i]) / C[i][i]));
    h = next;
    if (change < tol) { iter++; break; }
  }
  if (load.reduce((a, b) => a + b, 0) < 0) load = load.map((l) => -l);
  const uniq = C.map((r, i) => Math.max(r[i] - load[i] * load[i], 0));
  const sl = load.reduce((a, b) => a + b, 0);
  const omega = (sl * sl) / (sl * sl + uniq.reduce((a, b) => a + b, 0));
  // Off-diagonal residuals of the one-factor model.
  let ss = 0, cnt = 0, worst = { i: -1, j: -1, residual: 0 };
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    const res = C[i][j] - load[i] * load[j];
    ss += res * res;
    cnt++;
    if (Math.abs(res) > Math.abs(worst.residual)) worst = { i, j, residual: res };
  }
  return { loadings: load, uniquenesses: uniq, omega, omegaObserved: (sl * sl) / sumAll(C), rmsr: cnt ? Math.sqrt(ss / cnt) : 0, worst, iterations: iter, converged: iter < maxIter, heywood };
}

export function spearmanBrownItems(rel, k, target) {
  if (!(rel > 0 && rel < 1) || !(target > 0 && target < 1)) return null;
  const factor = (target * (1 - rel)) / (rel * (1 - target));
  return { factor, items: Math.ceil(k * factor - 1e-9) };
}

// ---------- data handling ----------

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const s = String(text).replace(/^﻿/, "");
  const delim = (() => {
    const first = s.split(/\r?\n/, 1)[0] || "";
    const counts = { ",": (first.match(/,/g) || []).length, ";": (first.match(/;/g) || []).length, "\t": (first.match(/\t/g) || []).length };
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ",";
  })();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const MISSING_TOKENS = new Set(["", "na", "n/a", "nan", "null", ".", "-", "missing", "none"]);

export function toNumber(s) {
  const t = String(s ?? "").trim();
  if (MISSING_TOKENS.has(t.toLowerCase())) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

const listOf = (v) => (v == null ? [] : Array.isArray(v) ? v : String(v).split(",")).map((x) => String(x).trim()).filter(Boolean);

export function prepare(input) {
  const opts = { ...DEFAULTS, ...input };
  const rows = parseCsv(opts.csv || "");
  if (rows.length < 2) throw new Error("the CSV needs a header row and at least one row of answers");
  const header = rows[0].map((h, i) => h.trim() || `column ${i + 1}`);
  const body = rows.slice(1);
  const missingCodes = new Set(listOf(opts.missing).map(Number).filter(Number.isFinite));
  const cols = header.map((name, j) => {
    const vals = body.map((r) => toNumber(r[j]));
    return { name, vals, numeric: vals.some((v) => v !== null) && vals.every((v) => v === null || Number.isFinite(v)) };
  });
  const find = (name) => {
    const j = header.findIndex((h) => h === name) >= 0 ? header.findIndex((h) => h === name) : header.findIndex((h) => h.toLowerCase() === String(name).toLowerCase());
    if (j < 0) throw new Error(`no column named "${name}"; the columns are ${header.join(", ")}`);
    return j;
  };
  let itemIdx, skipped = [];
  const requested = listOf(opts.items);
  if (requested.length) {
    itemIdx = requested.map(find);
    for (const j of itemIdx) if (!cols[j].numeric) throw new Error(`column "${header[j]}" has text in it; items must be numbers (blank or NA for missing)`);
  } else {
    itemIdx = [];
    cols.forEach((c, j) => {
      if (!c.numeric) skipped.push({ name: c.name, reason: "not numeric" });
      else if (ID_NAME.test(c.name)) skipped.push({ name: c.name, reason: "looks like an identifier" });
      else itemIdx.push(j);
    });
  }
  if (itemIdx.length < 2) throw new Error("need at least two numeric item columns (one column per question, one row per respondent)");
  const reverse = listOf(opts.reverse).map(find);
  for (const j of reverse) if (!itemIdx.includes(j)) throw new Error(`"${header[j]}" is listed to reverse but is not one of the items`);
  // Recode sentinel missing codes, then find the scale range for reversing.
  const raw = body.map((_, r) => itemIdx.map((j) => { const v = cols[j].vals[r]; return v === null || missingCodes.has(v) ? null : v; }));
  let lo = Infinity, hi = -Infinity;
  for (const r of raw) for (const v of r) if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const scaleMin = opts.scaleMin != null && opts.scaleMin !== "" ? Number(opts.scaleMin) : lo;
  const scaleMax = opts.scaleMax != null && opts.scaleMax !== "" ? Number(opts.scaleMax) : hi;
  if (reverse.length && !(scaleMax > scaleMin)) throw new Error("cannot reverse items without a scale range (set the scale minimum and maximum)");
  const revPos = new Set(reverse.map((j) => itemIdx.indexOf(j)));
  const complete = [];
  let dropped = 0;
  const missingByItem = new Array(itemIdx.length).fill(0);
  for (const r of raw) {
    r.forEach((v, i) => { if (v === null) missingByItem[i]++; });
    if (r.some((v) => v === null)) { dropped++; continue; }
    complete.push(r.map((v, i) => (revPos.has(i) ? scaleMin + scaleMax - v : v)));
  }
  return {
    items: itemIdx.map((j) => header[j]),
    reversed: reverse.map((j) => header[j]),
    skipped,
    X: complete,
    nRows: body.length,
    dropped,
    missingByItem,
    scale: { min: scaleMin, max: scaleMax },
    missingCodes: [...missingCodes],
  };
}

export function covariance(X) {
  const n = X.length, k = X[0].length;
  const m = new Array(k).fill(0);
  for (const r of X) for (let i = 0; i < k; i++) m[i] += r[i];
  for (let i = 0; i < k; i++) m[i] /= n;
  const C = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const r of X) for (let i = 0; i < k; i++) { const di = r[i] - m[i]; for (let j = i; j < k; j++) C[i][j] += di * (r[j] - m[j]); }
  for (let i = 0; i < k; i++) for (let j = i; j < k; j++) { C[i][j] /= n - 1; C[j][i] = C[i][j]; }
  return { mean: m, cov: C };
}

// Covariance from running sums, so a resample or a jackknife leave-one-out costs O(k^2).
function covFromSums(n, S, P) {
  const k = S.length;
  return Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (P[i][j] - (S[i] * S[j]) / n) / (n - 1)));
}

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantileSorted(s, p) {
  if (!s.length) return NaN;
  const h = (s.length - 1) * p;
  const lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
}

// BCa bootstrap (Efron 1987) for alpha and omega, resampling respondents.
export function bootstrapIntervals(X, { reps = 1000, seed = 1, confidence = 0.95, alpha, omega } = {}) {
  const n = X.length, k = X[0].length;
  const rand = rng(seed);
  const stats = { alpha: [], omega: [] };
  for (let b = 0; b < reps; b++) {
    const S = new Array(k).fill(0);
    const P = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let t = 0; t < n; t++) {
      const r = X[Math.floor(rand() * n)];
      for (let i = 0; i < k; i++) { S[i] += r[i]; for (let j = i; j < k; j++) P[i][j] += r[i] * r[j]; }
    }
    for (let i = 0; i < k; i++) for (let j = 0; j < i; j++) P[i][j] = P[j][i];
    const C = covFromSums(n, S, P);
    if (C.some((r, i) => !(r[i] > 0))) continue;
    stats.alpha.push(alphaFromCov(C));
    stats.omega.push(oneFactor(C, { maxIter: 2000, tol: 1e-9 }).omega);
  }
  // Jackknife for the acceleration, by downdating the full-sample sums.
  const S = new Array(k).fill(0);
  const P = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const r of X) for (let i = 0; i < k; i++) { S[i] += r[i]; for (let j = 0; j < k; j++) P[i][j] += r[i] * r[j]; }
  const jack = { alpha: [], omega: [] };
  const seen = new Map();
  for (const r of X) {
    const key = r.join(",");
    if (seen.has(key)) { const v = seen.get(key); jack.alpha.push(v.a); jack.omega.push(v.o); continue; }
    const S2 = S.map((s, i) => s - r[i]);
    const P2 = P.map((row, i) => row.map((p, j) => p - r[i] * r[j]));
    const C = covFromSums(n - 1, S2, P2);
    const v = { a: alphaFromCov(C), o: oneFactor(C, { maxIter: 2000, tol: 1e-10 }).omega };
    seen.set(key, v);
    jack.alpha.push(v.a);
    jack.omega.push(v.o);
  }
  const z = normQuantile(1 - (1 - confidence) / 2);
  const bca = (boot, jk, est) => {
    const s = boot.filter(Number.isFinite).sort((a, b) => a - b);
    const below = s.filter((v) => v < est).length + 0.5 * s.filter((v) => v === est).length;
    const z0 = normQuantile(Math.min(Math.max(below / s.length, 1e-6), 1 - 1e-6));
    const jm = jk.reduce((a, b) => a + b, 0) / jk.length;
    let num = 0, den = 0;
    for (const v of jk) { const d = jm - v; num += d * d * d; den += d * d; }
    const acc = den > 0 ? num / (6 * Math.pow(den, 1.5)) : 0;
    const adj = (zz) => normCdf(z0 + (z0 + zz) / (1 - acc * (z0 + zz)));
    return { lower: quantileSorted(s, adj(-z)), upper: quantileSorted(s, adj(z)), percentileLower: quantileSorted(s, (1 - confidence) / 2), percentileUpper: quantileSorted(s, 1 - (1 - confidence) / 2), bias: z0, acceleration: acc, reps: s.length };
  };
  return { alpha: bca(stats.alpha, jack.alpha, alpha), omega: bca(stats.omega, jack.omega, omega), seed, requested: reps };
}

// ---------- formatting ----------

export function fmt(x, d = 3) {
  if (x === null || x === undefined || Number.isNaN(x)) return "-";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  return x.toFixed(d);
}

function band(rel) {
  if (rel >= 0.9) return "high";
  if (rel >= 0.8) return "good";
  if (rel >= 0.7) return "acceptable for research use";
  if (rel >= 0.6) return "low";
  return "poor";
}

// ---------- the analysis ----------

export function analyze(input) {
  const opts = { ...DEFAULTS, ...input };
  const confidence = Number(opts.confidence);
  if (!(confidence > 0.5 && confidence < 1)) throw new Error("confidence must be between 0.5 and 1, e.g. 0.95");
  const reps = Math.max(0, Math.floor(Number(opts.bootstrap) || 0));
  const d = prepare(opts);
  const n = d.X.length, k = d.items.length;
  if (n < 3) throw new Error(`only ${n} respondent${n === 1 ? "" : "s"} answered every item; need at least 3 (rows with a blank are left out)`);
  const { mean, cov: C } = covariance(d.X);
  const zeroVar = d.items.filter((_, i) => !(C[i][i] > 0));
  if (zeroVar.length) throw new Error(`every respondent gave the same answer to ${zeroVar.map((s) => `"${s}"`).join(", ")}; an item with no variation carries no information, so drop it`);
  const warnings = [];
  const alpha = alphaFromCov(C);
  const std = standardizedAlpha(C);
  const l2 = lambda2(C);
  const l6 = lambda6(C);
  const feldt = feldtInterval(alpha, n, k, confidence);
  const fit = oneFactor(C);
  const R = corrFromCov(C);
  const fitStd = oneFactor(R);
  const eig = symEigen(R).values;
  const total = d.X.map((r) => r.reduce((a, b) => a + b, 0));
  const vt = sumAll(C);
  const sdTotal = Math.sqrt(vt);

  const items = d.items.map((name, i) => {
    const others = d.items.map((_, j) => j).filter((j) => j !== i);
    const Ci = others.map((a) => others.map((b) => C[a][b]));
    const covWithRest = others.reduce((s, j) => s + C[i][j], 0);
    const restVar = sumAll(Ci);
    const fitWithout = k > 2 ? oneFactor(Ci) : null;
    return {
      name,
      reversed: d.reversed.includes(name),
      mean: mean[i],
      sd: Math.sqrt(C[i][i]),
      missing: d.missingByItem[i],
      itemRest: covWithRest / Math.sqrt(C[i][i] * restVar),
      itemTotal: (C[i][i] + covWithRest) / Math.sqrt(C[i][i] * vt),
      alphaIfDeleted: k > 2 ? alphaFromCov(Ci) : null,
      omegaIfDeleted: fitWithout ? fitWithout.omega : null,
      loading: fit.loadings[i],
      standardizedLoading: fitStd.loadings[i],
    };
  });

  let boot = null;
  if (reps > 0) boot = bootstrapIntervals(d.X, { reps, seed: Number(opts.seed) || 1, confidence, alpha, omega: fit.omega });

  // Warnings a careful analyst would raise.
  if (d.dropped) warnings.push(`${d.dropped} of ${d.nRows} rows had a blank or missing code and were left out (listwise deletion). If many are missing, the remaining respondents may not represent the rest.`);
  if (n < 30) warnings.push(`only ${n} complete respondents: every coefficient here is very uncertain; read the intervals, not the point estimates.`);
  const negatives = items.filter((it) => it.itemRest < 0);
  if (negatives.length) warnings.push(`${negatives.map((it) => `"${it.name}"`).join(", ")} correlate${negatives.length === 1 ? "s" : ""} negatively with the rest of the scale. If ${negatives.length === 1 ? "it is" : "they are"} worded in the opposite direction (reverse-keyed), list ${negatives.length === 1 ? "it" : "them"} under "reverse" and run again.`);
  if (alpha < 0) warnings.push("alpha is negative: the items covary negatively on average. This almost always means reverse-keyed items were not reversed, or the columns do not belong to one scale.");
  if (fit.heywood) warnings.push("the one-factor fit hit a boundary (an item's unique variance went to zero, a Heywood case); omega is less trustworthy than usual.");
  if (eig.length > 1 && eig[1] > 1 && eig[0] / eig[1] < 3) warnings.push(`the correlation matrix's second eigenvalue is ${fmt(eig[1], 2)} against a first of ${fmt(eig[0], 2)}: the items may measure more than one thing. Alpha and omega assume one; a high alpha does not show unidimensionality.`);
  if (fit.rmsr > 0 && fitStd.rmsr > 0.08) warnings.push(`the one-factor model leaves sizable correlations unexplained (root mean square residual ${fmt(fitStd.rmsr, 3)}); the largest is between "${d.items[fitStd.worst.i]}" and "${d.items[fitStd.worst.j]}", which may share wording or content beyond the common factor.`);
  if (l6 === null) warnings.push("the item covariance matrix is singular (an item is a combination of others), so lambda-6 is not defined.");

  const targets = opts.targets.map((t) => ({ target: t, ...(spearmanBrownItems(alpha, k, t) || { factor: null, items: null }) }));
  const cl = `${Math.round(confidence * 100)}%`;
  const bestDrop = k > 2 ? items.reduce((b, it) => (it.alphaIfDeleted > b.alphaIfDeleted ? it : b), items[0]) : null;
  const weakest = items.reduce((b, it) => (it.itemRest < b.itemRest ? it : b), items[0]);
  const summary = [
    `Cronbach's alpha: ${fmt(alpha)} (${cl} CI ${fmt(feldt.lower)} to ${fmt(feldt.upper)}, Feldt), ${band(alpha)}, for ${k} items and ${n} respondents.`,
    `McDonald's omega (one-factor model): ${fmt(fit.omega)}${boot ? ` (${cl} BCa bootstrap CI ${fmt(boot.omega.lower)} to ${fmt(boot.omega.upper)})` : ""}. Guttman's lambda-2 ${fmt(l2)}${l6 !== null ? `, lambda-6 ${fmt(l6)}` : ""}.`,
    `Standard error of measurement: ${fmt(sdTotal * Math.sqrt(Math.max(1 - alpha, 0)), 2)} points on a total score with SD ${fmt(sdTotal, 2)}; a respondent's observed total is within about ${fmt(1.96 * sdTotal * Math.sqrt(Math.max(1 - alpha, 0)), 1)} points of their true score 95% of the time, if alpha is the reliability.`,
  ];
  if (bestDrop && bestDrop.alphaIfDeleted > alpha + 0.005) summary.push(`Dropping "${bestDrop.name}" would raise alpha to ${fmt(bestDrop.alphaIfDeleted)}; check its wording before cutting it, since a higher alpha is not the only goal.`);
  else if (bestDrop) summary.push(`No single item's removal would raise alpha by more than 0.005.`);
  summary.push(`Weakest item: "${weakest.name}" (corrected item-total correlation ${fmt(weakest.itemRest, 2)}).`);
  if (alpha > 0 && alpha < 0.9) {
    const t = targets.find((x) => x.target > alpha);
    if (t && t.items) summary.push(`By the Spearman-Brown formula, reaching ${t.target} would take about ${t.items} items like these (${t.items - k} more).`);
  }

  return {
    input: { confidence, bootstrap: reps, seed: Number(opts.seed) || 1, items: d.items, reversed: d.reversed, skipped: d.skipped, missingCodes: d.missingCodes, scale: d.scale },
    n, k, rows: d.nRows, dropped: d.dropped,
    alpha: { value: alpha, lower: feldt.lower, upper: feldt.upper, method: "Feldt", df1: feldt.df1, df2: feldt.df2, bootstrap: boot ? boot.alpha : null },
    standardizedAlpha: std.alpha,
    meanInterItemCorrelation: std.meanR,
    omega: { value: fit.omega, observedDenominator: fit.omegaObserved, standardized: fitStd.omega, bootstrap: boot ? boot.omega : null, iterations: fit.iterations, converged: fit.converged, heywood: fit.heywood, rmsr: fit.rmsr, standardizedRmsr: fitStd.rmsr, largestResidual: { a: d.items[fitStd.worst.i], b: d.items[fitStd.worst.j], residual: fitStd.worst.residual } },
    lambda2: l2,
    lambda6: l6,
    eigenvalues: eig,
    totalScore: { mean: total.reduce((a, b) => a + b, 0) / n, sd: sdTotal, min: Math.min(...total), max: Math.max(...total), sem: sdTotal * Math.sqrt(Math.max(1 - alpha, 0)) },
    items,
    spearmanBrown: targets,
    warnings,
    summary,
    papers: PAPERS.map((p) => p.key),
  };
}
