/**
 * Conformal prediction intervals: split conformal (ridge), locally weighted
 * split conformal, and conformalized quantile regression (CQR), with an
 * honest held-out evaluation. Pure functions, no DOM, no network, seeded
 * randomness only. Same code runs in the page, the CLI and agent calls.
 */

export const PAPERS = [
  {
    authors: "Jing Lei, Max G'Sell, Alessandro Rinaldo, Ryan J. Tibshirani, Larry Wasserman",
    title: "Distribution-Free Predictive Inference for Regression",
    venue: "Journal of the American Statistical Association 113(523), 1094-1111",
    year: 2018,
    url: "https://arxiv.org/abs/1604.04173",
    doi: "10.1080/01621459.2017.1307116",
    implemented: "Split conformal prediction (Algorithm 2) and locally weighted split conformal (Section 5.2), with the finite-sample quantile index ceil((n+1)(1-alpha)).",
    deviations: "Base model is ridge regression with the penalty chosen by 5-fold cross-validation on the training part. The spread model for the locally weighted method is a second ridge regression of |residual| on the features, fitted to out-of-fold residuals and floored at 10% of their mean so it stays positive.",
  },
  {
    authors: "Yaniv Romano, Evan Patterson, Emmanuel J. Candes",
    title: "Conformalized Quantile Regression",
    venue: "Advances in Neural Information Processing Systems 32 (NeurIPS 2019)",
    year: 2019,
    url: "https://arxiv.org/abs/1905.03222",
    implemented: "CQR (Section 3, Theorem 1): conformity score max(q_lo(x) - y, y - q_hi(x)) on a calibration set, interval [q_lo - Q, q_hi + Q].",
    deviations: "Quantile models are linear quantile regressions at alpha/2 and 1-alpha/2, solved exactly as a linear program, not neural networks or forests. Where the two fitted quantiles cross for a row they are swapped (monotone rearrangement), which keeps the guarantee because it is a fixed function of x.",
  },
  {
    authors: "Vladimir Vovk, Alex Gammerman, Glenn Shafer",
    title: "Algorithmic Learning in a Random World",
    venue: "Springer",
    year: 2005,
    url: "https://doi.org/10.1007/b106715",
    doi: "10.1007/b106715",
    implemented: "The conformal framework and its finite-sample marginal validity under exchangeability (inductive / split conformal predictors).",
    deviations: "Only the split (inductive) form is implemented; full conformal prediction is not.",
  },
  {
    authors: "Roger Koenker, Gilbert Bassett Jr.",
    title: "Regression Quantiles",
    venue: "Econometrica 46(1), 33-50",
    year: 1978,
    url: "https://doi.org/10.2307/1913643",
    doi: "10.2307/1913643",
    implemented: "Linear quantile regression as the minimiser of the pinball (check) loss, solved through its dual linear program max y'a s.t. X'a = (1-tau)X'1, 0 <= a <= 1 with a bounded-variable simplex; the coefficients are the optimal simplex multipliers.",
    deviations: "None in the estimator. Training sets above 4,000 rows are subsampled (seeded) for the quantile fits to bound running time in the browser.",
  },
  {
    authors: "Arthur E. Hoerl, Robert W. Kennard",
    title: "Ridge Regression: Biased Estimation for Nonorthogonal Problems",
    venue: "Technometrics 12(1), 55-67",
    year: 1970,
    url: "https://doi.org/10.1080/00401706.1970.10488634",
    doi: "10.1080/00401706.1970.10488634",
    implemented: "Ridge regression on standardised features (unpenalised intercept), used as the point predictor.",
    deviations: "Penalty chosen by k-fold cross-validation rather than the ridge trace.",
  },
  {
    authors: "Bradley Efron, Trevor Hastie, Iain Johnstone, Robert Tibshirani",
    title: "Least Angle Regression",
    venue: "The Annals of Statistics 32(2), 407-499",
    year: 2004,
    url: "https://doi.org/10.1214/009053604000000067",
    doi: "10.1214/009053604000000067",
    implemented: "Source of the example dataset (442 diabetes patients, 10 baseline variables, disease progression after one year). No method from this paper is implemented.",
    deviations: "n/a (dataset only).",
  },
];

// First 100 rows of the Efron et al. (2004) diabetes data (data/diabetes.csv),
// so that an agent call with no input runs on real data.
const SAMPLE_CSV = `AGE,SEX,BMI,BP,S1,S2,S3,S4,S5,S6,Y
59,2,32.1,101,157,93.2,38,4,4.8598,87,151
48,1,21.6,87,183,103.2,70,3,3.8918,69,75
72,2,30.5,93,156,93.6,41,4,4.6728,85,141
24,1,25.3,84,198,131.4,40,5,4.8903,89,206
50,1,23,101,192,125.4,52,4,4.2905,80,135
23,1,22.6,89,139,64.8,61,2,4.1897,68,97
36,2,22,90,160,99.6,50,3,3.9512,82,138
66,2,26.2,114,255,185,56,4.55,4.2485,92,63
60,2,32.1,83,179,119.4,42,4,4.4773,94,110
29,1,30,85,180,93.4,43,4,5.3845,88,310
22,1,18.6,97,114,57.6,46,2,3.9512,83,101
56,2,28,85,184,144.8,32,6,3.5835,77,69
53,1,23.7,92,186,109.2,62,3,4.3041,81,179
50,2,26.2,97,186,105.4,49,4,5.0626,88,185
61,1,24,91,202,115.4,72,3,4.2905,73,118
34,2,24.7,118,254,184.2,39,7,5.037,81,171
47,1,30.3,109,207,100.2,70,3,5.2149,98,166
68,2,27.5,111,214,147,39,5,4.9416,91,144
38,1,25.4,84,162,103,42,4,4.4427,87,97
41,1,24.7,83,187,108.2,60,3,4.5433,78,168
35,1,21.1,82,156,87.8,50,3,4.5109,95,68
25,2,24.3,95,162,98.6,54,3,3.8501,87,49
25,1,26,92,187,120.4,56,3,3.9703,88,68
61,2,32,103.67,210,85.2,35,6,6.107,124,245
31,1,29.7,88,167,103.4,48,4,4.3567,78,184
30,2,25.2,83,178,118.4,34,5,4.852,83,202
19,1,19.2,87,124,54,57,2,4.1744,90,137
42,1,31.9,83,158,87.6,53,3,4.4659,101,85
63,1,24.4,73,160,91.4,48,3,4.6347,78,131
67,2,25.8,113,158,54.2,64,2,5.2933,104,283
32,1,30.5,89,182,110.6,56,3,4.3438,89,129
42,1,20.3,71,161,81.2,66,2,4.2341,81,59
58,2,38,103,150,107.2,22,7,4.6444,98,341
57,1,21.7,94,157,58,82,2,4.4427,92,87
53,1,20.5,78,147,84.2,52,3,3.989,75,65
62,2,23.5,80.33,225,112.8,86,2.62,4.8752,96,102
52,1,28.5,110,195,97.2,60,3,5.2417,85,265
46,1,27.4,78,171,88,58,3,4.8283,90,276
48,2,33,123,253,163.6,44,6,5.425,97,252
48,2,27.7,73,191,119.4,46,4,4.852,92,90
50,2,25.6,101,229,162.2,43,5,4.7791,114,100
21,1,20.1,63,135,69,54,3,4.0943,89,55
32,2,25.4,90.33,153,100.4,34,4.5,4.5326,83,61
54,1,24.2,74,204,109,82,2,4.1744,109,92
61,2,32.7,97,177,118.4,29,6,4.9972,87,259
56,2,23.1,104,181,116.4,47,4,4.4773,79,53
33,1,25.3,85,155,85,51,3,4.5539,70,190
27,1,19.6,78,128,68,43,3,4.4427,71,142
67,2,22.5,98,191,119.2,61,3,3.989,86,75
37,2,27.7,93,180,119.4,30,6,5.0304,88,142
58,1,25.7,99,157,91.6,49,3,4.4067,93,155
65,2,27.9,103,159,96.8,42,4,4.6151,86,225
34,1,25.5,93,218,144,57,4,4.4427,88,59
46,1,24.9,115,198,129.6,54,4,4.2767,103,104
35,1,28.7,97,204,126.8,64,3,4.1897,93,182
37,1,21.8,84,184,101,73,3,3.912,93,128
37,1,30.2,87,166,96,40,4.15,5.0106,87,52
41,1,20.5,80,124,48.8,64,2,4.0254,75,37
60,1,20.4,105,198,78.4,99,2,4.6347,79,170
66,2,24,98,236,146.4,58,4,5.0626,96,170
29,1,26,83,141,65.2,64,2,4.0775,83,61
37,2,26.8,79,157,98,28,6,5.0434,96,144
41,2,25.7,83,181,106.6,66,3,3.7377,85,52
39,1,22.9,77,204,143.2,46,4,4.3041,74,128
67,2,24,83,143,77.2,49,3,4.4308,94,71
36,2,24.1,112,193,125,35,6,5.1059,95,163
46,2,24.7,85,174,123.2,30,6,4.6444,96,150
60,2,25,89.67,185,120.8,46,4.02,4.5109,92,97
59,2,23.6,83,165,100,47,4,4.4998,92,160
53,1,22.1,93,134,76.2,46,3,4.0775,96,178
48,1,19.9,91,189,109.6,69,3,3.9512,101,48
48,1,29.5,131,207,132.2,47,4,4.9345,106,270
66,2,26,91,264,146.6,65,4,5.5683,87,202
52,2,24.5,94,217,149.4,48,5,4.585,89,111
52,2,26.6,111,209,126.4,61,3,4.6821,109,85
46,2,23.5,87,181,114.8,44,4,4.7095,98,42
40,2,29,115,97,47.2,35,2.77,4.3041,95,170
22,1,23,73,161,97.8,54,3,3.8286,91,200
50,1,21,88,140,71.8,35,4,5.112,71,252
20,1,22.9,87,191,128.2,53,4,3.8918,85,113
68,1,27.5,107,241,149.6,64,4,4.92,90,143
52,2,24.3,86,197,133.6,44,5,4.5747,91,51
44,1,23.1,87,213,126.4,77,3,3.8712,72,52
38,1,27.3,81,146,81.6,47,3,4.4659,81,210
49,1,22.7,65.33,168,96.2,62,2.71,3.8918,60,65
61,1,33,95,182,114.8,54,3,4.1897,74,141
29,2,19.4,83,152,105.8,39,4,3.5835,83,55
61,1,25.8,98,235,125.8,76,3,5.112,82,134
34,2,22.6,75,166,91.8,60,3,4.2627,108,42
36,1,21.9,89,189,105.2,68,3,4.3694,96,111
52,1,24,83,167,86.6,71,2,3.8501,94,98
61,1,31.2,79,235,156.8,47,5,5.0499,96,164
43,1,26.8,123,193,102.2,67,3,4.7791,94,48
35,1,20.4,65,187,105.6,67,2.79,4.2767,78,96
27,1,24.8,91,189,106.8,69,3,4.1897,69,90
29,1,21,71,156,97,38,4,4.654,90,162
64,2,27.3,109,186,107.6,38,5,5.3083,99,150
41,1,34.6,87.33,205,142.6,41,5,4.6728,110,279
49,2,25.9,91,178,106.6,52,3,4.5747,75,92
48,1,20.4,98,209,139.4,46,5,4.7707,78,83
`;

export const DEFAULTS = {
  csv: SAMPLE_CSV,
  target: "",
  features: [],
  coverage: 0.9,
  method: "all",
  seed: 1,
  testFraction: 0.25,
  calibrationFraction: 0.25,
  repeats: 20,
  folds: 5,
  newRows: null,
  maxRowsOut: 1000,
  sampleNote: "Default csv is the first 100 of 442 rows of the Efron, Hastie, Johnstone & Tibshirani (2004) diabetes data; Y is disease progression one year after baseline.",
};

export const METHODS = {
  split: "Split conformal (ridge)",
  normalized: "Locally weighted split conformal",
  cqr: "Conformalized quantile regression (CQR)",
};

const MISSING = new Set(["", "na", "nan", "n/a", "null", "none", ".", "?", "-", "#n/a"]);
const QR_MAX_ROWS = 4000;
const LAMBDA_GRID = [1e-6, 1e-5, 1e-4, 3e-4, 1e-3, 3e-3, 0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100];

// ---------------------------------------------------------------- randomness

/** Mulberry32 seeded PRNG returning floats in [0, 1). */
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw (Box-Muller) from a uniform generator. */
export function normal(rand) {
  let u = 0;
  while (u <= 1e-300) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Seeded Fisher-Yates permutation of 0..n-1. */
export function permutation(n, rand) {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

// ---------------------------------------------------------------- CSV

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

const isMissing = (s) => MISSING.has(String(s).trim().toLowerCase());
const isNum = (s) => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(String(s).trim());

/**
 * Parse delimited text (comma, tab or semicolon, detected) into named numeric
 * columns. A first row with any non-numeric cell is the header; otherwise
 * columns are named c1..cK. Returns { columns, rows (raw strings), numeric
 * (per-column flag), firstBad (per-column example of a non-numeric cell) }.
 */
export function parseCsv(text) {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lines.length) return { error: "The data is empty. Paste a CSV with a header row and numeric columns." };
  const first = lines[0];
  const delim = [",", "\t", ";"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cells = lines.map((l) => splitLine(l, delim));
  const hasHeader = cells[0].some((c) => !isNum(c) && !isMissing(c));
  const width = cells[0].length;
  const columns = hasHeader ? cells[0].map((c, i) => c || `c${i + 1}`) : Array.from({ length: width }, (_, i) => `c${i + 1}`);
  const seen = new Set();
  for (const c of columns) {
    if (seen.has(c)) return { error: `Column name "${c}" appears twice in the header. Rename one of them.` };
    seen.add(c);
  }
  const body = hasHeader ? cells.slice(1) : cells;
  const rows = [];
  const lineNo = [];
  for (let i = 0; i < body.length; i++) {
    const r = body[i];
    if (r.length !== width) return { error: `Line ${i + (hasHeader ? 2 : 1)} has ${r.length} fields but the header has ${width}. Check the delimiter and quoting.` };
    rows.push(r);
    lineNo.push(i + (hasHeader ? 2 : 1));
  }
  const numeric = columns.map(() => true);
  const firstBad = columns.map(() => null);
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < width; j++) {
      const v = rows[i][j];
      if (!isMissing(v) && !isNum(v) && numeric[j]) {
        numeric[j] = false;
        firstBad[j] = { value: v, line: lineNo[i] };
      }
    }
  }
  return { columns, rows, lineNo, numeric, firstBad, hasHeader, delimiter: delim };
}

/**
 * Select target and feature columns from parsed CSV. Rows with a missing
 * value in any selected column are dropped and counted. A selected column
 * with a non-numeric value is an error. With no features given, every other
 * numeric column is used and non-numeric ones are listed in `excluded`.
 */
export function prepareData(text, { target = "", features = [] } = {}) {
  const p = parseCsv(text);
  if (p.error) return p;
  const { columns, rows, numeric, firstBad } = p;
  if (columns.length < 2) return { error: "Need at least two columns: one target and one or more features." };
  const tgt = target && String(target).trim() ? String(target).trim() : columns[columns.length - 1];
  if (!columns.includes(tgt)) return { error: `Target column "${tgt}" is not in the header (${columns.join(", ")}).` };
  const nonNum = (c) => {
    const j = columns.indexOf(c);
    const b = firstBad[j];
    return `Column "${c}" is not numeric: line ${b.line} has "${b.value}". Conformal regression needs numbers; remove or recode that column.`;
  };
  if (!numeric[columns.indexOf(tgt)]) return { error: nonNum(tgt) };
  let feats = Array.isArray(features) ? features.map(String).filter(Boolean) : String(features || "").split(",").map((s) => s.trim()).filter(Boolean);
  const excluded = [];
  if (!feats.length) {
    for (const c of columns) {
      if (c === tgt) continue;
      if (numeric[columns.indexOf(c)]) feats.push(c);
      else excluded.push(c);
    }
  } else {
    for (const c of feats) {
      if (!columns.includes(c)) return { error: `Feature column "${c}" is not in the header (${columns.join(", ")}).` };
      if (c === tgt) return { error: `"${c}" is the target; it cannot also be a feature.` };
      if (!numeric[columns.indexOf(c)]) return { error: nonNum(c) };
    }
  }
  if (!feats.length) return { error: "No numeric feature columns to predict from." };
  const ti = columns.indexOf(tgt);
  const fi = feats.map((c) => columns.indexOf(c));
  const X = [];
  const y = [];
  const line = [];
  let dropped = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (isMissing(r[ti]) || fi.some((j) => isMissing(r[j]))) { dropped++; continue; }
    X.push(fi.map((j) => Number(r[j])));
    y.push(Number(r[ti]));
    line.push(p.lineNo[i]);
  }
  return { columns, target: tgt, features: feats, excluded, X, y, line, dropped, totalRows: rows.length };
}

// ---------------------------------------------------------------- linear algebra

/** Solve A x = b (A square) by Gaussian elimination with partial pivoting. Returns null if singular. */
export function solve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Inverse of a square matrix by Gauss-Jordan with partial pivoting; null if singular. */
export function invert(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f) for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row) => row.slice(n));
}

/**
 * Plain ridge solution beta = (Z'Z + lambda I)^-1 Z'y, no intercept, no
 * scaling. The closed form the model fits are built on.
 */
export function ridgeSolve(Z, y, lambda) {
  const p = Z[0].length;
  const G = Array.from({ length: p }, () => new Array(p).fill(0));
  const r = new Array(p).fill(0);
  for (let i = 0; i < Z.length; i++) {
    const z = Z[i];
    for (let a = 0; a < p; a++) {
      r[a] += z[a] * y[i];
      for (let b = a; b < p; b++) G[a][b] += z[a] * z[b];
    }
  }
  for (let a = 0; a < p; a++) {
    G[a][a] += lambda;
    for (let b = 0; b < a; b++) G[a][b] = G[b][a];
  }
  return solve(G, r);
}

function scaler(X) {
  const n = X.length;
  const p = X[0].length;
  const mean = new Array(p).fill(0);
  const sd = new Array(p).fill(0);
  for (const x of X) for (let j = 0; j < p; j++) mean[j] += x[j] / n;
  for (const x of X) for (let j = 0; j < p; j++) sd[j] += (x[j] - mean[j]) ** 2 / n;
  for (let j = 0; j < p; j++) sd[j] = Math.sqrt(sd[j]);
  // A constant column becomes all zeros after centring; scale 1 leaves it inert.
  const active = sd.map((s, j) => s > 1e-12 * (1 + Math.abs(mean[j])));
  return { mean, sd: sd.map((s, j) => (active[j] ? s : 1)), active };
}
const standardize = (x, s) => x.map((v, j) => (s.active[j] ? (v - s.mean[j]) / s.sd[j] : 0));

/**
 * Ridge regression with standardised features and an unpenalised intercept:
 * minimises (1/n)||y - b0 - Z beta||^2 + lambda ||beta||^2, Z standardised.
 * Returns a model { predict(x), lambda, intercept, coef (original units) }.
 */
export function ridgeFit(X, y, lambda) {
  const n = X.length;
  const s = scaler(X);
  const Z = X.map((x) => standardize(x, s));
  const ym = y.reduce((a, b) => a + b, 0) / n;
  const beta = ridgeSolve(Z, y.map((v) => v - ym), lambda * n) ?? new Array(X[0].length).fill(0);
  const coef = beta.map((b, j) => (s.active[j] ? b / s.sd[j] : 0));
  const intercept = ym - coef.reduce((a, c, j) => a + c * s.mean[j], 0);
  return { lambda, intercept, coef, predict: (x) => intercept + x.reduce((a, v, j) => a + coef[j] * v, 0) };
}

function foldsOf(n, k, rand) {
  const perm = permutation(n, rand);
  const f = new Array(n);
  perm.forEach((idx, i) => (f[idx] = i % k));
  return f;
}

/**
 * Ridge with lambda chosen by k-fold cross-validation (mean squared error)
 * over a fixed grid. Also returns out-of-fold residuals at the chosen lambda.
 */
export function ridgeCV(X, y, { folds = 5, seed = 1 } = {}) {
  const n = X.length;
  const k = Math.max(2, Math.min(folds, n));
  const fold = foldsOf(n, k, rng(seed));
  let best = null;
  for (const lam of LAMBDA_GRID) {
    let sse = 0;
    const oof = new Array(n);
    for (let f = 0; f < k; f++) {
      const tr = [], te = [];
      for (let i = 0; i < n; i++) (fold[i] === f ? te : tr).push(i);
      if (!tr.length || !te.length) continue;
      const m = ridgeFit(tr.map((i) => X[i]), tr.map((i) => y[i]), lam);
      for (const i of te) {
        oof[i] = y[i] - m.predict(X[i]);
        sse += oof[i] ** 2;
      }
    }
    if (!best || sse < best.sse - 1e-12 * Math.abs(best.sse)) best = { lam, sse, oof };
  }
  const model = ridgeFit(X, y, best.lam);
  return { model, lambda: best.lam, cvMse: best.sse / n, oofResiduals: best.oof };
}

// ---------------------------------------------------------------- quantile regression

/** Pinball (check) loss of residual r at level tau. */
export const pinball = (r, tau) => (r >= 0 ? tau * r : (tau - 1) * r);

/**
 * Exact linear quantile regression (Koenker & Bassett 1978). Solves the dual
 * LP  max y'a  s.t.  D'a = (1-tau) D'1,  0 <= a <= 1  (D = [1, X]) with a
 * two-phase bounded-variable simplex; the coefficients are the optimal
 * simplex multipliers. Features and y are standardised internally (the
 * estimator is equivariant). Returns { intercept, coef, predict, iterations }.
 */
export function quantileRegression(X, y, tau) {
  if (!(tau > 0 && tau < 1)) throw new Error("tau must be in (0, 1)");
  const n = X.length;
  const s = scaler(X);
  const act = s.active.map((a, j) => (a ? j : -1)).filter((j) => j >= 0);
  const D = X.map((x) => [1, ...act.map((j) => (x[j] - s.mean[j]) / s.sd[j])]);
  const ym = y.reduce((a, b) => a + b, 0) / n;
  let ys = Math.sqrt(y.reduce((a, b) => a + (b - ym) ** 2, 0) / n);
  if (!(ys > 0)) ys = 1;
  const yz = y.map((v) => (v - ym) / ys);
  // Warm start: least-squares fit shifted to the tau-quantile of its residuals.
  const ls = ridgeSolve(D, yz, 1e-8) ?? new Array(D[0].length).fill(0);
  const r0 = D.map((d, i) => yz[i] - d.reduce((a, v, j) => a + v * ls[j], 0));
  const sorted = [...r0].sort((a, b) => a - b);
  const cut = sorted[Math.min(n - 1, Math.max(0, Math.floor(tau * n)))];
  const start = r0.map((r) => (r > cut ? 1 : 0));
  const { pi, iterations } = boundedSimplexQR(D, yz, tau, start);
  // Back to original units.
  const coefZ = pi.slice(1);
  const coef = new Array(X[0].length).fill(0);
  act.forEach((j, k) => (coef[j] = (ys * coefZ[k]) / s.sd[j]));
  const intercept = ym + ys * pi[0] - coef.reduce((a, c, j) => a + c * s.mean[j], 0);
  return { tau, intercept, coef, iterations, predict: (x) => intercept + x.reduce((a, v, j) => a + coef[j] * v, 0) };
}

/** Total pinball loss of a linear rule (intercept, coef) on (X, y). */
export function pinballLoss(X, y, tau, intercept, coef) {
  let s = 0;
  for (let i = 0; i < X.length; i++) s += pinball(y[i] - intercept - X[i].reduce((a, v, j) => a + v * coef[j], 0), tau);
  return s;
}

function boundedSimplexQR(D, y, tau, start) {
  const n = D.length;
  const m = D[0].length;
  const N = n + m; // observations then artificials
  const sgn = new Array(m).fill(1);
  const col = (j) => (j < n ? D[j] : null);
  const colDot = (v, j) => (j < n ? D[j].reduce((a, d, k) => a + d * v[k], 0) : v[j - n] * sgn[j - n]);
  const colTimes = (Binv, j) => {
    const out = new Array(m).fill(0);
    if (j < n) {
      const c = col(j);
      for (let i = 0; i < m; i++) { let s = 0; for (let k = 0; k < m; k++) s += Binv[i][k] * c[k]; out[i] = s; }
    } else {
      const k = j - n;
      for (let i = 0; i < m; i++) out[i] = Binv[i][k] * sgn[k];
    }
    return out;
  };
  const b = new Array(m).fill(0);
  for (const d of D) for (let k = 0; k < m; k++) b[k] += (1 - tau) * d[k];
  const x = new Array(N).fill(0);
  for (let j = 0; j < n; j++) x[j] = start[j];
  const resid = [...b];
  for (let j = 0; j < n; j++) if (x[j]) for (let k = 0; k < m; k++) resid[k] -= D[j][k];
  for (let k = 0; k < m; k++) { sgn[k] = resid[k] >= 0 ? 1 : -1; x[n + k] = Math.abs(resid[k]); }
  const upper = new Array(N).fill(1);
  for (let k = 0; k < m; k++) upper[n + k] = Infinity;
  const basis = Array.from({ length: m }, (_, k) => n + k);
  const isBasic = new Array(N).fill(false);
  for (const j of basis) isBasic[j] = true;
  let Binv = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, k) => (i === k ? sgn[k] : 0)));
  let iterations = 0;
  const maxIter = 50 * (N + 10);

  const refactor = () => {
    const B = Array.from({ length: m }, (_, i) => basis.map((j) => (j < n ? D[j][i] : (j - n === i ? sgn[i] : 0))));
    const inv = invert(B);
    if (inv) Binv = inv;
    const rhs = [...b];
    for (let j = 0; j < N; j++) {
      if (isBasic[j] || !x[j]) continue;
      if (j < n) for (let k = 0; k < m; k++) rhs[k] -= D[j][k] * x[j];
      else rhs[j - n] -= sgn[j - n] * x[j];
    }
    for (let i = 0; i < m; i++) { let s = 0; for (let k = 0; k < m; k++) s += Binv[i][k] * rhs[k]; x[basis[i]] = s; }
  };

  const run = (cost) => {
    let degenerate = 0;
    let pivots = 0;
    for (;;) {
      if (++iterations > maxIter) throw new Error("quantile regression simplex did not converge");
      const cB = basis.map((j) => cost(j));
      const pi = new Array(m).fill(0);
      for (let k = 0; k < m; k++) { let s = 0; for (let i = 0; i < m; i++) s += cB[i] * Binv[i][k]; pi[k] = s; }
      const bland = degenerate > 50;
      let q = -1, bestScore = 0, dq = 0;
      for (let j = 0; j < N; j++) {
        if (isBasic[j] || upper[j] <= 0) continue;
        const d = cost(j) - colDot(pi, j);
        const atLower = x[j] <= 0.5 * upper[j] || upper[j] === Infinity && x[j] < 1e-12;
        const eligible = atLower ? d > 1e-9 : d < -1e-9;
        if (!eligible) continue;
        if (bland) { q = j; dq = d; break; }
        if (Math.abs(d) > bestScore) { bestScore = Math.abs(d); q = j; dq = d; }
      }
      if (q < 0) return pi;
      const dir = dq > 0 ? 1 : -1;
      const alpha = colTimes(Binv, q);
      let t = upper[q];
      let leave = -1, leaveTo = 0;
      for (let i = 0; i < m; i++) {
        const delta = -dir * alpha[i];
        const j = basis[i];
        let ti = Infinity, to = 0;
        if (delta < -1e-11) { ti = Math.max(0, x[j]) / -delta; to = 0; }
        else if (delta > 1e-11 && upper[j] < Infinity) { ti = Math.max(0, upper[j] - x[j]) / delta; to = upper[j]; }
        else continue;
        const better = ti < t - 1e-12 ||
          (Math.abs(ti - t) <= 1e-12 && leave >= 0 && (bland ? j < basis[leave] : Math.abs(alpha[i]) > Math.abs(alpha[leave])));
        if (better) { t = ti; leave = i; leaveTo = to; }
      }
      if (t === Infinity) throw new Error("quantile regression LP unbounded (should not happen)");
      for (let i = 0; i < m; i++) x[basis[i]] += -dir * alpha[i] * t;
      x[q] += dir * t;
      degenerate = t < 1e-12 ? degenerate + 1 : 0;
      if (leave < 0) { x[q] = dir > 0 ? upper[q] : 0; continue; }
      const out = basis[leave];
      x[out] = leaveTo;
      isBasic[out] = false;
      isBasic[q] = true;
      basis[leave] = q;
      const pv = alpha[leave];
      const rowL = Binv[leave].map((v) => v / pv);
      for (let i = 0; i < m; i++) {
        if (i === leave) continue;
        const f = alpha[i];
        if (f) for (let k = 0; k < m; k++) Binv[i][k] -= f * rowL[k];
      }
      Binv[leave] = rowL;
      if (++pivots % 64 === 0) refactor();
    }
  };

  run((j) => (j < n ? 0 : -1));
  const infeas = basis.reduce((a, j) => a + (j >= n ? Math.abs(x[j]) : 0), 0);
  if (infeas > 1e-6 * (1 + n)) throw new Error("quantile regression LP phase 1 failed");
  for (let k = 0; k < m; k++) {
    upper[n + k] = 0;
    if (!isBasic[n + k]) x[n + k] = 0;
  }
  refactor();
  const pi = run((j) => (j < n ? y[j] : 0));
  return { pi, iterations };
}

// ---------------------------------------------------------------- conformal core

/**
 * Finite-sample conformal rank k = ceil((n+1)(1-alpha)). The calibrated
 * quantile is the k-th smallest of n scores; if k > n the interval is
 * infinite. Computed with an integer-safe guard against float round-up.
 */
export function quantileIndex(n, alpha) {
  const v = (n + 1) * (1 - alpha);
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-9 * (n + 1) ? r : Math.ceil(v);
}

/** The k-th smallest score (k = quantileIndex), or Infinity when k > n. */
export function conformalQuantile(scores, alpha) {
  const n = scores.length;
  const k = quantileIndex(n, alpha);
  if (k > n) return { k, n, q: Infinity, infinite: true };
  if (k < 1) return { k, n, q: -Infinity, infinite: false };
  const s = [...scores].sort((a, b) => a - b);
  return { k, n, q: s[k - 1], infinite: false };
}

/**
 * Fit one conformal predictor on (train, cal). Returns { interval(x) -> [lo, hi, pred],
 * quantile, k, nCal, infinite, details }.
 */
export function fitConformal(method, Xtr, ytr, Xcal, ycal, alpha, { folds = 5, seed = 1 } = {}) {
  if (method === "split") {
    const cv = ridgeCV(Xtr, ytr, { folds, seed });
    const mu = cv.model;
    const scores = Xcal.map((x, i) => Math.abs(ycal[i] - mu.predict(x)));
    const cq = conformalQuantile(scores, alpha);
    return {
      ...cq,
      interval: (x) => { const m = mu.predict(x); return [m - cq.q, m + cq.q, m]; },
      details: { lambda: cv.lambda, intercept: mu.intercept, coef: mu.coef },
    };
  }
  if (method === "normalized") {
    const cv = ridgeCV(Xtr, ytr, { folds, seed });
    const mu = cv.model;
    const absR = cv.oofResiduals.map(Math.abs);
    const floor = 0.1 * (absR.reduce((a, b) => a + b, 0) / absR.length) || 1e-12;
    const rhoCv = ridgeCV(Xtr, absR, { folds, seed: seed + 7919 });
    const sigma = (x) => Math.max(rhoCv.model.predict(x), floor);
    const scores = Xcal.map((x, i) => Math.abs(ycal[i] - mu.predict(x)) / sigma(x));
    const cq = conformalQuantile(scores, alpha);
    return {
      ...cq,
      interval: (x) => { const m = mu.predict(x); const w = cq.q * sigma(x); return [m - w, m + w, m]; },
      details: { lambda: cv.lambda, spreadLambda: rhoCv.lambda, spreadFloor: floor, intercept: mu.intercept, coef: mu.coef },
    };
  }
  if (method === "cqr") {
    let Xq = Xtr, yq = ytr, subsampled = false;
    if (Xtr.length > QR_MAX_ROWS) {
      const perm = permutation(Xtr.length, rng(seed + 31)).slice(0, QR_MAX_ROWS);
      Xq = perm.map((i) => Xtr[i]); yq = perm.map((i) => ytr[i]); subsampled = true;
    }
    const lo = quantileRegression(Xq, yq, alpha / 2);
    const hi = quantileRegression(Xq, yq, 1 - alpha / 2);
    const band = (x) => { const a = lo.predict(x), b = hi.predict(x); return a <= b ? [a, b] : [b, a]; };
    const scores = Xcal.map((x, i) => { const [a, b] = band(x); return Math.max(a - ycal[i], ycal[i] - b); });
    const cq = conformalQuantile(scores, alpha);
    return {
      ...cq,
      interval: (x) => { const [a, b] = band(x); return [a - cq.q, b + cq.q, (a + b) / 2]; },
      details: { tauLow: alpha / 2, tauHigh: 1 - alpha / 2, lower: { intercept: lo.intercept, coef: lo.coef }, upper: { intercept: hi.intercept, coef: hi.coef }, subsampled },
    };
  }
  throw new Error(`Unknown method "${method}". Use split, normalized, cqr or all.`);
}

/** Split row indices into { train, cal, test } with a seeded shuffle. */
export function splitIndices(n, { testFraction = 0.25, calibrationFraction = 0.25, seed = 1 } = {}) {
  const perm = permutation(n, rng(seed));
  const nTest = Math.round(n * testFraction);
  const nCal = Math.round(n * calibrationFraction);
  return { test: perm.slice(0, nTest), cal: perm.slice(nTest, nTest + nCal), train: perm.slice(nTest + nCal) };
}

function evaluate(fit, X, y) {
  let cov = 0, width = 0;
  const widths = [];
  const rows = X.map((x, i) => {
    const [lo, hi, pred] = fit.interval(x);
    const covered = y[i] >= lo && y[i] <= hi;
    const w = Math.max(0, hi - lo);
    cov += covered ? 1 : 0;
    width += w;
    widths.push(w);
    return { y: y[i], pred, lo, hi, covered };
  });
  widths.sort((a, b) => a - b);
  const median = widths.length ? (widths.length % 2 ? widths[(widths.length - 1) / 2] : (widths[widths.length / 2 - 1] + widths[widths.length / 2]) / 2) : NaN;
  return { coverage: cov / X.length, meanWidth: width / X.length, medianWidth: median, rows };
}

const round = (v, d = 6) => (Number.isFinite(v) ? Number(v.toFixed(d)) : v === Infinity ? "Infinity" : v === -Infinity ? "-Infinity" : null);
const pct = (v, d = 1) => `${(100 * v).toFixed(d)}%`;
const ordinal = (k) => `${k}${k % 100 >= 11 && k % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][k % 10] || "th"}`;
const fmt = (v) => (!Number.isFinite(v) ? "infinite" : Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));

function parseNewRows(newRows, features) {
  if (newRows == null || newRows === "") return { rows: [] };
  let list = newRows;
  if (typeof newRows === "string") {
    const p = parseCsv(newRows);
    if (p.error) return { error: `New rows: ${p.error}` };
    if (!p.hasHeader) list = p.rows;
    else {
      for (const f of features) if (!p.columns.includes(f)) return { error: `New rows are missing feature column "${f}".` };
      list = p.rows.map((r) => Object.fromEntries(p.columns.map((c, j) => [c, r[j]])));
    }
  }
  if (!Array.isArray(list)) return { error: "newRows must be an array of objects, an array of arrays, or CSV text." };
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const vals = Array.isArray(r) ? r : features.map((f) => (r && typeof r === "object" ? r[f] : undefined));
    if (vals.length !== features.length) return { error: `New row ${i + 1} has ${vals.length} values; expected ${features.length} (${features.join(", ")}).` };
    const nums = vals.map(Number);
    if (vals.some((v) => v === undefined || v === null || isMissing(v)) || nums.some((v) => !Number.isFinite(v))) {
      return { error: `New row ${i + 1} has a missing or non-numeric value; every feature (${features.join(", ")}) is needed.` };
    }
    out.push(nums);
  }
  return { rows: out };
}

/**
 * Run conformal prediction on a CSV. Input: { csv, target, features, coverage,
 * method ("split" | "normalized" | "cqr" | "all"), seed, testFraction,
 * calibrationFraction, repeats, folds, newRows }. A string first argument is
 * taken as the CSV. Returns per-method held-out coverage and width, the
 * calibration quantile, an interval for every test row and for each new row,
 * the average over `repeats` random splits, and a plain-language `summary`.
 */
export function analyze(input = {}, extra = {}) {
  const opts = typeof input === "string" ? { ...DEFAULTS, ...extra, csv: input } : { ...DEFAULTS, ...(input || {}) };
  const coverage = Number(opts.coverage);
  if (!(coverage > 0 && coverage < 1)) return { error: "Coverage must be between 0 and 1, for example 0.9 for 90%." };
  const alpha = 1 - coverage;
  const methodIds = opts.method === "all" || !opts.method ? Object.keys(METHODS) : String(opts.method).split(",").map((s) => s.trim());
  for (const m of methodIds) if (!METHODS[m]) return { error: `Unknown method "${m}". Use split, normalized, cqr or all.` };
  const tf = Number(opts.testFraction), cf = Number(opts.calibrationFraction);
  if (!(tf >= 0 && cf > 0 && tf + cf < 1)) return { error: "Test and calibration fractions must be non-negative, calibration above 0, and sum to less than 1." };
  const seed = Math.floor(Number(opts.seed)) || 1;
  const repeats = Math.max(0, Math.min(200, Math.floor(Number(opts.repeats) || 0)));
  const folds = Math.max(2, Math.floor(Number(opts.folds) || 5));

  const data = prepareData(opts.csv, { target: opts.target, features: opts.features });
  if (data.error) return { error: data.error };
  const { X, y, features, target } = data;
  const n = X.length;
  const split = splitIndices(n, { testFraction: tf, calibrationFraction: cf, seed });
  const minTrain = features.length + 3;
  if (split.train.length < minTrain) return { error: `Only ${split.train.length} training rows for ${features.length} features after the split; need at least ${minTrain}. Add rows, use fewer features, or lower the test and calibration fractions.` };
  if (split.cal.length < 1) return { error: "The calibration split is empty; raise the calibration fraction or add rows." };
  const newParsed = parseNewRows(opts.newRows, features);
  if (newParsed.error) return { error: newParsed.error };

  const pick = (idx) => [idx.map((i) => X[i]), idx.map((i) => y[i])];
  const [Xtr, ytr] = pick(split.train);
  const [Xcal, ycal] = pick(split.cal);
  const [Xte, yte] = pick(split.test);
  const nCal = split.cal.length;
  const k = quantileIndex(nCal, alpha);
  let minCal = 1;
  while (quantileIndex(minCal, alpha) > minCal) minCal++;
  const warnings = [];
  if (data.dropped) warnings.push(`${data.dropped} row${data.dropped === 1 ? "" : "s"} with a missing value in a used column ${data.dropped === 1 ? "was" : "were"} dropped.`);
  if (data.excluded.length) warnings.push(`Non-numeric column${data.excluded.length === 1 ? "" : "s"} left out of the features: ${data.excluded.join(", ")}.`);
  if (k > nCal) warnings.push(`With ${nCal} calibration rows, ${pct(coverage)} coverage needs rank ${k} of ${nCal} scores, so every interval is infinite. You need at least ${minCal} calibration rows for a finite interval at this level.`);
  if (!split.test.length) warnings.push("Test fraction is 0, so nothing is held out for evaluation; coverage below is not measured.");

  const methods = [];
  for (const id of methodIds) {
    let fit;
    try { fit = fitConformal(id, Xtr, ytr, Xcal, ycal, alpha, { folds, seed }); }
    catch (e) { return { error: `${METHODS[id]} failed: ${e.message}` }; }
    const ev = split.test.length ? evaluate(fit, Xte, yte) : { coverage: NaN, meanWidth: NaN, medianWidth: NaN, rows: [] };
    let rep = null;
    if (repeats > 0) {
      const covs = [], wids = [];
      for (let r = 0; r < repeats; r++) {
        const sp = splitIndices(n, { testFraction: tf, calibrationFraction: cf, seed: seed + 1000003 * (r + 1) });
        if (!sp.test.length) break;
        const [a, b] = pick(sp.train), [c, d] = pick(sp.cal), [e, f] = pick(sp.test);
        try {
          const ft = fitConformal(id, a, b, c, d, alpha, { folds, seed: seed + r + 1 });
          const evr = evaluate(ft, e, f);
          covs.push(evr.coverage); wids.push(evr.meanWidth);
        } catch { /* a failed repeat is skipped and counted below */ }
      }
      if (covs.length) {
        const mc = covs.reduce((s, v) => s + v, 0) / covs.length;
        const sd = Math.sqrt(covs.reduce((s, v) => s + (v - mc) ** 2, 0) / Math.max(1, covs.length - 1));
        rep = { splits: covs.length, meanCoverage: round(mc), sdCoverage: round(sd), minCoverage: round(Math.min(...covs)), maxCoverage: round(Math.max(...covs)), meanWidth: round(wids.reduce((s, v) => s + v, 0) / wids.length) };
      }
    }
    const lineOf = (i) => data.line[i];
    methods.push({
      id,
      name: METHODS[id],
      empiricalCoverage: round(ev.coverage),
      covered: ev.rows.filter((r) => r.covered).length,
      testRows: ev.rows.length,
      meanWidth: round(ev.meanWidth),
      medianWidth: round(ev.medianWidth),
      quantile: round(fit.q),
      quantileIndex: fit.k,
      infinite: fit.infinite,
      model: JSON.parse(JSON.stringify(fit.details, (key, v) => (typeof v === "number" ? round(v, 8) : v))),
      repeated: rep,
      test: ev.rows.slice(0, opts.maxRowsOut).map((r, i) => ({ line: lineOf(split.test[i]), y: round(r.y), pred: round(r.pred), lo: round(r.lo), hi: round(r.hi), covered: r.covered })),
      newRows: newParsed.rows.map((x) => { const [lo, hi, pred] = fit.interval(x); return { x, pred: round(pred), lo: round(lo), hi: round(hi) }; }),
    });
  }

  const upperGuarantee = coverage + 1 / (nCal + 1);
  const lines = [];
  lines.push(`Predicting ${target} from ${features.length} feature${features.length === 1 ? "" : "s"} (${features.join(", ")}) on ${n} rows${data.dropped ? ` (${data.dropped} dropped for missing values)` : ""}. Seed ${seed} split them into ${split.train.length} training, ${nCal} calibration and ${split.test.length} test rows.`);
  if (k > nCal) lines.push(`Too few calibration rows: rank ${k} is needed but only ${nCal} scores exist, so the honest interval at ${pct(coverage)} is the whole real line.`);
  else lines.push(`Target coverage is ${pct(coverage)}. The calibrated quantile is the ${ordinal(k)} smallest of ${nCal} conformity scores (k = ceil((n+1)(1-alpha))), which guarantees that, averaged over random splits, a new row falls inside its interval between ${pct(coverage)} and ${pct(Math.min(1, upperGuarantee))} of the time (the upper bound assumes no tied scores).`);
  if (split.test.length) {
    const widthOf = (m) => (m.repeated ? m.repeated.meanWidth : m.meanWidth);
    const best = [...methods].filter((m) => !m.infinite).sort((a, b) => widthOf(a) - widthOf(b))[0];
    for (const m of methods) {
      lines.push(`${m.name}: ${m.covered} of ${m.testRows} held-out rows covered (${pct(m.empiricalCoverage)}), mean width ${fmt(m.meanWidth)}${m.repeated ? `; over ${m.repeated.splits} more random splits, average coverage ${pct(m.repeated.meanCoverage)} (give or take ${pct(2 * m.repeated.sdCoverage / Math.sqrt(m.repeated.splits))} from split-to-split noise) and width ${fmt(m.repeated.meanWidth)}` : ""}.`);
    }
    if (best && methods.length > 1) lines.push(`Narrowest on average here: ${best.name}. All methods carry the same coverage guarantee, so prefer the narrower one, and the locally weighted or CQR intervals when the error size varies with the features.`);
    const sdOne = Math.sqrt(coverage * (1 - coverage) / split.test.length);
    lines.push(`One test split of ${split.test.length} rows moves by roughly +/-${pct(2 * sdOne)} from chance alone, so read single-split coverage loosely${repeats > 0 ? "; the repeated-split average is the steadier check" : ""}.`);
  }
  lines.push("The guarantee is marginal (on average over rows), assumes rows are exchangeable (no time order or drift), and does not promise coverage for any particular subgroup.");
  if (newParsed.rows.length) lines.push(`Intervals were also computed for ${newParsed.rows.length} new row${newParsed.rows.length === 1 ? "" : "s"}.`);

  return {
    summary: lines.join(" "),
    target,
    features,
    coverage,
    alpha: round(alpha, 10),
    rows: { total: data.totalRows, used: n, dropped: data.dropped, excludedColumns: data.excluded },
    split: { seed, train: split.train.length, calibration: nCal, test: split.test.length, testFraction: tf, calibrationFraction: cf },
    quantileIndex: k,
    finite: k <= nCal,
    minCalibrationForFinite: minCal,
    guarantee: { lower: coverage, upper: round(Math.min(1, upperGuarantee)) },
    methods,
    warnings,
    papers: PAPERS.map((p) => `${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""}`),
  };
}
