// Robust PCA by principal component pursuit: split a table M into a low-rank
// part L (the pattern every row shares) and a sparse part S (the few cells
// that break it), M = L + S, by solving
//   minimise ||L||_* + lambda ||S||_1   subject to  L + S = M  on the observed cells
// (Candes, Li, Ma & Wright 2011) with the inexact augmented Lagrange
// multiplier method (Lin, Chen & Ma 2010). Pure functions, no DOM, no network.

export const PAPERS = [
  {
    authors: "Emmanuel J. Candes, Xiaodong Li, Yi Ma, John Wright",
    title: "Robust Principal Component Analysis?",
    venue: "Journal of the ACM 58(3), article 11",
    year: 2011,
    url: "https://arxiv.org/abs/0912.3599",
    doi: "10.1145/1970392.1970395",
    implemented:
      "Principal component pursuit (PCP): minimise the nuclear norm of L plus lambda times the entrywise l1 norm of S subject to L + S = M, with the paper's universal lambda = 1/sqrt(max(n1, n2)). With missing cells, the constraint holds only on the observed cells (the paper's equation 1.4, PCP with missing entries), so L also fills the gaps. The exact-recovery experiment of Section 4.1 (random rank-r L0 and random-sign sparse S0) is reproduced in the tests.",
    deviations:
      "The default lambda is the paper's; the page's sensitivity setting multiplies it (a larger multiplier flags fewer cells). The solver is the inexact ALM of the paper below, not the fixed-mu ALM of the paper's Section 5; both solve the same convex problem. Real data are not exactly low-rank plus sparse, so small entries of S that are within the table's typical residual are reported as noise, not as anomalies (see flagThreshold); PCP itself has no such threshold.",
  },
  {
    authors: "Zhouchen Lin, Minming Chen, Yi Ma",
    title: "The Augmented Lagrange Multiplier Method for Exact Recovery of Corrupted Low-Rank Matrices",
    venue: "arXiv:1009.5055 (UIUC technical report UILU-ENG-09-2215)",
    year: 2010,
    url: "https://arxiv.org/abs/1009.5055",
    implemented:
      "Algorithm 5 (inexact ALM for RPCA): L = singular value thresholding of M - S + Y/mu at 1/mu, S = soft thresholding of M - L + Y/mu at lambda/mu, Y += mu (M - L - S), mu *= rho, with Y0 = M / max(||M||_2, ||M||_inf / lambda), mu0 = 1.25 / ||M||_2, mu capped at 1e7 mu0, stopping when ||M - L - S||_F <= tol ||M||_F (tol 1e-7).",
    deviations:
      "mu grows by rho = 1.05 per iteration, not the paper's 1.5. With 1.5 the residual test is met before the split settles: on the tests' 60 x 40 case the split then differs from TensorLy's by up to 0.04 (entries up to 1.5) against 1e-9 with 1.05, and on this tool's example the certified gap is 2.6% against 0.01%. Every result carries a duality certificate (the multiplier Y scaled to dual feasibility) so the gap is stated, not assumed. The singular value decomposition is a full one-sided Jacobi SVD (Hestenes 1958), warm-started from the previous iteration's right singular vectors, instead of PROPACK's partial SVD; it is exact to rounding and fast for tables up to a few hundred columns. On unobserved cells S is not shrunk, so the constraint is dropped there exactly.",
  },
  {
    authors: "Magnus R. Hestenes",
    title: "Inversion of Matrices by Biorthogonalization and Related Results",
    venue: "Journal of the Society for Industrial and Applied Mathematics 6(1), 51-90",
    year: 1958,
    url: "https://doi.org/10.1137/0106005",
    doi: "10.1137/0106005",
    implemented: "One-sided Jacobi rotations that orthogonalise the columns of A; the column norms are the singular values.",
    deviations: "Rotation angles follow the standard stable formula (as in Demmel & Veselic 1992); sweeps stop when every pair is orthogonal to 1e-15 relative.",
  },
];

export const DEFAULTS = {
  labelColumn: null, // the text column that names the rows; null = first non-numeric column, else row numbers
  columns: null, // numeric columns that form the table; null = every numeric column
  fold: null, // a whole number P: fold one numeric column into rows of P values (a day of 24 hours)
  scale: "none", // "none" or "robust": subtract each column's median and divide by its MAD first
  sensitivity: 1, // multiplies lambda = 1/sqrt(max(m, n)); larger flags fewer cells
  tol: 1e-7,
  maxIter: 1000,
  top: 25,
};

const MAX_CELLS = 250000;
const MAX_SMALL_SIDE = 400;

// ---------- linear algebra ----------

// Singular value decomposition of the m x n row-major matrix A, by one-sided
// Jacobi on its columns (on A transpose when m < n). Returns U (m x k), s (k),
// V (n x k) with k = min(m, n), all row-major, s descending. warmV (n x n,
// row-major) starts the rotations from a previous V: B = A V0 is almost
// orthogonal, so few sweeps are needed, and V = V0 VB is still exact.
export function svd(A, m, n, opts = {}) {
  if (m < n) {
    const At = transpose(A, m, n);
    const r = svd(At, n, m, opts.warmV ? { warmV: opts.warmV } : {});
    return { U: r.V, s: r.s, V: r.U, m, n, k: r.k, sweeps: r.sweeps, warm: r.warm };
  }
  // columns of W (n columns of length m), stored column-major
  const W = new Float64Array(m * n);
  let V = new Float64Array(n * n);
  const warm = opts.warmV && opts.warmV.length === n * n;
  if (warm) {
    V.set(opts.warmV);
    for (let i = 0; i < m; i++) {
      const row = i * n;
      for (let j = 0; j < n; j++) {
        let acc = 0;
        for (let l = 0; l < n; l++) acc += A[row + l] * V[l * n + j];
        W[j * m + i] = acc;
      }
    }
  } else {
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) W[j * m + i] = A[i * n + j];
    for (let j = 0; j < n; j++) V[j * n + j] = 1;
  }
  // V is row-major n x n: V[l*n + j] is row l, column j
  const norms = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let s2 = 0;
    for (let i = 0; i < m; i++) s2 += W[j * m + i] ** 2;
    norms[j] = s2;
  }
  const EPS = 1e-15;
  let sweeps = 0;
  for (; sweeps < 60; sweeps++) {
    let rotated = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const alpha = norms[p], beta = norms[q];
        if (alpha === 0 || beta === 0) continue;
        let gamma = 0;
        const op = p * m, oq = q * m;
        for (let i = 0; i < m; i++) gamma += W[op + i] * W[oq + i];
        if (Math.abs(gamma) <= EPS * Math.sqrt(alpha * beta)) continue;
        rotated++;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t), s = c * t;
        for (let i = 0; i < m; i++) {
          const wp = W[op + i], wq = W[oq + i];
          W[op + i] = c * wp - s * wq;
          W[oq + i] = s * wp + c * wq;
        }
        for (let l = 0; l < n; l++) {
          const vp = V[l * n + p], vq = V[l * n + q];
          V[l * n + p] = c * vp - s * vq;
          V[l * n + q] = s * vp + c * vq;
        }
        norms[p] = alpha - t * gamma;
        norms[q] = beta + t * gamma;
      }
    }
    // refresh the norms from the columns so rounding in the updates cannot build up
    for (let j = 0; j < n; j++) {
      let s2 = 0;
      for (let i = 0; i < m; i++) s2 += W[j * m + i] ** 2;
      norms[j] = s2;
    }
    if (!rotated) break;
  }
  const order = [...Array(n).keys()].sort((a, b) => norms[b] - norms[a]);
  const k = n;
  const U = new Float64Array(m * k), s = new Float64Array(k), Vo = new Float64Array(n * k);
  order.forEach((j, c) => {
    const sv = Math.sqrt(norms[j]);
    s[c] = sv;
    for (let i = 0; i < m; i++) U[i * k + c] = sv > 0 ? W[j * m + i] / sv : 0;
    for (let l = 0; l < n; l++) Vo[l * k + c] = V[l * n + j];
  });
  return { U, s, V: Vo, m, n, k, sweeps, warm };
}

export function transpose(A, m, n) {
  const T = new Float64Array(m * n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) T[j * m + i] = A[i * n + j];
  return T;
}

const frob = (A) => {
  let s = 0;
  for (let i = 0; i < A.length; i++) s += A[i] * A[i];
  return Math.sqrt(s);
};

// Largest singular value by power iteration on A^T A (for mu0 and Y0).
export function spectralNorm(A, m, n, iters = 200) {
  let v = new Float64Array(n).fill(1 / Math.sqrt(n));
  let sigma = 0;
  const u = new Float64Array(m);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < m; i++) {
      let acc = 0;
      for (let j = 0; j < n; j++) acc += A[i * n + j] * v[j];
      u[i] = acc;
    }
    const w = new Float64Array(n);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) w[j] += A[i * n + j] * u[i];
    const nw = Math.sqrt(w.reduce((a, b) => a + b * b, 0));
    if (nw === 0) return 0;
    const next = Math.sqrt(nw);
    for (let j = 0; j < n; j++) v[j] = w[j] / nw;
    if (Math.abs(next - sigma) <= 1e-12 * next) return next;
    sigma = next;
  }
  return sigma;
}

// ---------- principal component pursuit ----------

// M: row-major m x n Float64Array; observed: Uint8Array (1 = observed) or null.
export function pcp(M, m, n, opts = {}) {
  const lambda = opts.lambda ?? 1 / Math.sqrt(Math.max(m, n));
  const tol = opts.tol ?? 1e-7;
  const maxIter = opts.maxIter ?? 1000;
  const rho = opts.rho ?? 1.05;
  const obs = opts.observed || null;
  const D = new Float64Array(M);
  if (obs) for (let i = 0; i < D.length; i++) if (!obs[i]) D[i] = 0;
  const normD = frob(D);
  if (normD === 0) return { L: new Float64Array(m * n), S: new Float64Array(m * n), rank: 0, iterations: 0, converged: true, lambda, residual: 0, singularValues: [] };
  const norm2 = spectralNorm(D, m, n);
  let normInf = 0;
  for (let i = 0; i < D.length; i++) normInf = Math.max(normInf, Math.abs(D[i]));
  const J = Math.max(norm2, normInf / lambda);
  const Y = new Float64Array(m * n);
  for (let i = 0; i < D.length; i++) Y[i] = D[i] / J;
  let mu = 1.25 / norm2;
  const muBar = mu * 1e7;
  const L = new Float64Array(m * n), S = new Float64Array(m * n), T = new Float64Array(m * n);
  let warmV = null, rank = 0, iterations = 0, residual = Infinity, converged = false, sv = [];
  while (iterations < maxIter) {
    iterations++;
    const inv = 1 / mu;
    // L step: singular value thresholding of D - S + Y/mu at 1/mu
    for (let i = 0; i < T.length; i++) T[i] = D[i] - S[i] + Y[i] * inv;
    const r = svd(T, m, n, warmV ? { warmV } : {});
    warmV = r.n === n && m >= n ? squareV(r) : r.m < r.n ? squareU(r) : null;
    rank = 0;
    L.fill(0);
    for (let c = 0; c < r.k; c++) {
      const sh = r.s[c] - inv;
      if (sh <= 0) break;
      rank++;
      for (let i = 0; i < m; i++) {
        const ui = r.U[i * r.k + c] * sh;
        if (ui === 0) continue;
        for (let j = 0; j < n; j++) L[i * n + j] += ui * r.V[j * r.k + c];
      }
    }
    sv = Array.from(r.s.slice(0, rank), (x) => x - inv);
    // S step: soft thresholding at lambda/mu; unobserved cells take the whole gap
    const thr = lambda * inv;
    for (let i = 0; i < S.length; i++) {
      const g = D[i] - L[i] + Y[i] * inv;
      if (obs && !obs[i]) S[i] = g;
      else S[i] = g > thr ? g - thr : g < -thr ? g + thr : 0;
    }
    let rs = 0;
    for (let i = 0; i < Y.length; i++) {
      const z = D[i] - L[i] - S[i];
      Y[i] += mu * z;
      rs += z * z;
    }
    residual = Math.sqrt(rs) / normD;
    if (residual <= tol) {
      converged = true;
      break;
    }
    mu = Math.min(mu * rho, muBar);
  }
  if (obs) for (let i = 0; i < S.length; i++) if (!obs[i]) S[i] = 0;
  const cert = certificate(D, L, S, Y, m, n, lambda, obs);
  return { L, S, rank, iterations, converged, lambda, residual, singularValues: sv, ...cert };
}

// Duality certificate. PCP's dual is: maximise <Y, M> over Y with ||Y||_2 <= 1
// and max|Y_ij| <= lambda (and Y = 0 on unobserved cells). The ALM multiplier Y,
// scaled down until it is feasible, gives a lower bound on the optimum; the
// objective of the feasible split (L, D - L) is an upper bound (the solver's S
// leaves a residual of tol ||M||_F, which is moved into S for this bound only).
// Their relative gap bounds how far the split is
// from optimal in objective (Candes et al. 2011, Section 2; Lin et al. 2010, eq. 9).
export function certificate(D, L, S, Y, m, n, lambda, obs = null) {
  const sL = svd(L, m, n).s;
  let nuclear = 0;
  for (const v of sL) nuclear += v;
  let l1 = 0,
    yInf = 0,
    misfit = 0;
  for (let i = 0; i < S.length; i++) {
    if (obs && !obs[i]) continue;
    l1 += Math.abs(D[i] - L[i]);
    yInf = Math.max(yInf, Math.abs(Y[i]));
    misfit += (D[i] - L[i] - S[i]) ** 2;
  }
  const Yo = obs ? Y.map((v, i) => (obs[i] ? v : 0)) : Y;
  const y2 = spectralNorm(Yo, m, n, 500);
  const scale = Math.max(y2, yInf / lambda, 1e-300);
  let inner = 0;
  for (let i = 0; i < D.length; i++) inner += Yo[i] * D[i];
  const lower = inner / scale;
  const upper = nuclear + lambda * l1;
  return { objective: upper, dualBound: lower, gap: upper > 0 ? Math.max(0, (upper - lower) / upper) : 0, misfit: Math.sqrt(misfit) };
}

// The warm start is the full square right factor of the matrix the Jacobi ran on.
function squareV(r) {
  return r.k === r.n ? r.V : null;
}
function squareU(r) {
  return r.k === r.m ? r.U : null;
}

// ---------- CSV ----------

function splitLine(line, delim) {
  const out = [];
  let cur = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseCsv(text) {
  const raw = String(text ?? "").replace(/^﻿/, "");
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lines.length) return { error: "The data is empty. Paste a CSV with a header row and numeric columns." };
  const delim = ["\t", ";", ","].map((dl) => [dl, splitLine(lines[0], dl).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cells = lines.map((l) => splitLine(l, delim));
  const columns = cells[0].map((c, i) => c || `c${i + 1}`);
  const seen = new Set();
  for (const c of columns) {
    if (seen.has(c)) return { error: `Column name "${c}" appears twice in the header. Rename one of them.` };
    seen.add(c);
  }
  const rows = [];
  for (let i = 1; i < cells.length; i++) {
    if (cells[i].length !== columns.length) return { error: `Line ${i + 1} has ${cells[i].length} fields but the header has ${columns.length}. Check the delimiter and quoting.` };
    rows.push(cells[i]);
  }
  if (!rows.length) return { error: "The CSV has a header but no data rows." };
  return { columns, rows, delimiter: delim };
}

const MISSING = new Set(["", "na", "n/a", "nan", "null", "none", "-", "?"]);
export function toNumber(s) {
  const t = String(s ?? "").trim();
  if (MISSING.has(t.toLowerCase())) return null;
  const c = t.replace(/^\$/, "").replace(/,(?=\d{3}(\D|$))/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(c)) return NaN;
  return Number(c);
}

export function profileColumns(parsed) {
  return parsed.columns.map((name, j) => {
    let numeric = 0,
      text = 0;
    for (const r of parsed.rows) {
      const v = toNumber(r[j]);
      if (v === null) continue;
      if (Number.isNaN(v)) text++;
      else numeric++;
    }
    return { name, numeric: numeric > 0 && text === 0, values: numeric, text };
  });
}

// ---------- the table ----------

export function buildMatrix(parsed, opts = {}) {
  const prof = profileColumns(parsed);
  const textCols = prof.filter((c) => !c.numeric).map((c) => c.name);
  let labelColumn = opts.labelColumn ?? null;
  if (labelColumn && !parsed.columns.includes(labelColumn)) return { error: `There is no column called "${labelColumn}".` };
  if (!labelColumn && textCols.length) labelColumn = textCols[0];
  let columns = opts.columns && opts.columns.length ? opts.columns : prof.filter((c) => c.numeric && c.name !== labelColumn).map((c) => c.name);
  for (const c of columns) {
    const p = prof.find((x) => x.name === c);
    if (!p) return { error: `There is no column called "${c}".` };
    if (!p.numeric) return { error: `Column "${c}" has text in it (for example "${parsed.rows.find((r) => Number.isNaN(toNumber(r[parsed.columns.indexOf(c)])))?.[parsed.columns.indexOf(c)]}"), so it cannot be part of the table.` };
  }
  if (!columns.length) return { error: "No numeric columns found. The table needs at least two numeric columns, or one column and a fold length." };
  const li = labelColumn ? parsed.columns.indexOf(labelColumn) : -1;
  const warnings = [];
  let m, n, values, rowLabels, colLabels;
  const fold = opts.fold == null || opts.fold === "" ? null : Number(opts.fold);
  if (fold !== null) {
    if (!Number.isInteger(fold) || fold < 2) return { error: "The fold length must be a whole number of at least 2, such as 24 for hours in a day." };
    if (columns.length !== 1) return { error: `Folding takes one numeric column; ${columns.length} are chosen. Pick the one series to fold.` };
    const j = parsed.columns.indexOf(columns[0]);
    const series = parsed.rows.map((r) => toNumber(r[j]));
    m = Math.floor(series.length / fold);
    n = fold;
    if (m < 2) return { error: `The column has ${series.length} values, fewer than two whole rows of ${fold}.` };
    if (series.length % fold) warnings.push(`The last ${series.length % fold} values do not fill a whole row of ${fold} and were left out.`);
    values = series.slice(0, m * n);
    rowLabels = Array.from({ length: m }, (_, i) => (li >= 0 ? parsed.rows[i * fold][li] : `row ${i + 1}`));
    colLabels = Array.from({ length: n }, (_, j2) => `${j2 + 1}`);
  } else {
    if (columns.length < 2) return { error: "The table needs at least two numeric columns. For one long series with a cycle, set a fold length (24 folds hourly data into days)." };
    m = parsed.rows.length;
    n = columns.length;
    const idx = columns.map((c) => parsed.columns.indexOf(c));
    values = [];
    for (const r of parsed.rows) for (const j of idx) values.push(toNumber(r[j]));
    rowLabels = parsed.rows.map((r, i) => (li >= 0 && r[li] !== "" ? r[li] : `row ${i + 1}`));
    colLabels = columns.slice();
  }
  if (m < 2 || n < 2) return { error: "The table needs at least two rows and two columns." };
  if (m * n > MAX_CELLS) return { error: `The table has ${(m * n).toLocaleString("en-US")} cells; this tool handles up to ${MAX_CELLS.toLocaleString("en-US")} in the browser. Aggregate or split it.` };
  if (Math.min(m, n) > MAX_SMALL_SIDE) return { error: `Both sides of the table are over ${MAX_SMALL_SIDE} (${m} rows by ${n} columns). Robust PCA here runs a full SVD each iteration, so keep one side to ${MAX_SMALL_SIDE} or fewer.` };
  const M = new Float64Array(m * n);
  const observed = new Uint8Array(m * n);
  let missing = 0;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) missing++;
    else {
      M[i] = v;
      observed[i] = 1;
    }
  });
  if (missing === m * n) return { error: "Every cell of the table is empty." };
  return { M, observed, m, n, rowLabels, colLabels, missing, labelColumn, columns, fold, warnings };
}

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

// ---------- formatting ----------

export const fmt = (v, digits = 3) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e9 || a < 1e-3)) return v.toExponential(2);
  if (Number.isInteger(v)) return v.toLocaleString("en-US");
  return Number(v.toPrecision(Math.max(digits, Math.ceil(Math.log10(a + 1)) + 1))).toLocaleString("en-US", { maximumFractionDigits: 6 });
};

export function csvCell(c) {
  let s = String(c ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- analysis ----------

// A cell of S is reported as an anomaly when |S| is larger than this many
// robust standard deviations of the residual table's nonzero noise floor.
// See flagThreshold.
export const FLAG_K = 3;

// Real tables are low rank plus sparse plus small dense noise, and PCP puts
// the noise in S as many tiny entries. The flag line is FLAG_K times the
// robust SD (1.4826 x MAD) of every observed cell's S, zeros included, so it
// reads "bigger than the table's ordinary wobble". It is 0 for an exactly
// sparse S (then every nonzero cell is flagged).
export function flagThreshold(S, observed) {
  const vals = [];
  for (let i = 0; i < S.length; i++) if (!observed || observed[i]) vals.push(Math.abs(S[i]));
  const med = median(vals);
  const mad = median(vals.map((v) => Math.abs(v - med)));
  return FLAG_K * 1.4826 * Math.max(mad, med);
}

export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  const parsed = input.parsed || parseCsv(o.csv);
  if (parsed.error) return { error: parsed.error };
  const t = buildMatrix(parsed, o);
  if (t.error) return { error: t.error };
  const { m, n, observed } = t;
  const warnings = t.warnings.slice();
  if (!["none", "robust"].includes(o.scale)) return { error: 'scale is "none" or "robust".' };
  const sensitivity = Number(o.sensitivity);
  if (!(sensitivity > 0)) return { error: "sensitivity must be a positive number (1 is the paper's lambda)." };
  // optional robust column scaling
  const centre = new Float64Array(n), spread = new Float64Array(n).fill(1);
  const X = new Float64Array(t.M);
  if (o.scale === "robust") {
    for (let j = 0; j < n; j++) {
      const col = [];
      for (let i = 0; i < m; i++) if (observed[i * n + j]) col.push(t.M[i * n + j]);
      const md = median(col);
      const mad = 1.4826 * median(col.map((v) => Math.abs(v - md)));
      centre[j] = md;
      spread[j] = mad > 0 ? mad : 1;
      for (let i = 0; i < m; i++) if (observed[i * n + j]) X[i * n + j] = (t.M[i * n + j] - md) / spread[j];
    }
  }
  const lambda = sensitivity / Math.sqrt(Math.max(m, n));
  const r = pcp(X, m, n, { lambda, tol: Number(o.tol) || 1e-7, maxIter: Number(o.maxIter) || 1000, observed: t.missing ? observed : null });
  if (!r.converged) warnings.push(`The solver stopped after ${r.iterations} iterations with relative residual ${fmt(r.residual)}, above the target ${o.tol}. The split is approximate.`);
  // back to the data's units
  const L = new Float64Array(m * n), S = new Float64Array(m * n);
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) {
      const k = i * n + j;
      L[k] = r.L[k] * spread[j] + centre[j];
      S[k] = r.S[k] * spread[j];
    }
  const thr = flagThreshold(S, observed);
  let nonzero = 0,
    flaggedCount = 0,
    normM2 = 0,
    normS2 = 0;
  const cells = [];
  const rowScore = new Float64Array(m), rowFlags = new Uint32Array(m), colScore = new Float64Array(n), colFlags = new Uint32Array(n);
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) {
      const k = i * n + j;
      if (!observed[k]) continue;
      const s = S[k];
      normM2 += t.M[k] ** 2;
      normS2 += s * s;
      if (s !== 0) nonzero++;
      rowScore[i] += Math.abs(s);
      colScore[j] += Math.abs(s);
      if (Math.abs(s) > thr && s !== 0) {
        flaggedCount++;
        rowFlags[i]++;
        colFlags[j]++;
        cells.push({ row: t.rowLabels[i], column: t.colLabels[j], i, j, observed: t.M[k], expected: L[k], sparse: s, share: s / (Math.abs(L[k]) || 1) });
      }
    }
  cells.sort((a, b) => Math.abs(b.sparse) - Math.abs(a.sparse));
  const observedCount = m * n - t.missing;
  const rows = [...Array(m).keys()]
    .filter((i) => rowFlags[i] > 0)
    .map((i) => {
      let net = 0;
      for (let j = 0; j < n; j++) if (Math.abs(S[i * n + j]) > thr) net += S[i * n + j];
      return { row: t.rowLabels[i], i, flagged: rowFlags[i], absSparse: rowScore[i], net };
    })
    .sort((a, b) => b.absSparse - a.absSparse);
  const cols = [...Array(n).keys()].map((j) => ({ column: t.colLabels[j], j, flagged: colFlags[j], absSparse: colScore[j] }));
  const filled = [];
  if (t.missing)
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (!observed[i * n + j]) filled.push({ row: t.rowLabels[i], column: t.colLabels[j], i, j, filled: L[i * n + j] });
  // the low-rank part's own singular values, in the data's units
  const sL = r.rank ? svd(L, m, n).s.slice(0, Math.min(r.rank + 3, Math.min(m, n))) : [];
  let e2 = 0;
  const lead = Array.from(sL);
  for (const v of lead) e2 += v * v;
  const energy = lead.slice(0, r.rank).map((v) => (e2 > 0 ? (v * v) / e2 : 0));
  // how many of the shared patterns it takes to hold 99% of the low-rank part
  let cum = 0,
    components99 = 0;
  for (const e of energy) {
    components99++;
    cum += e;
    if (cum >= 0.99) break;
  }
  const top = Math.max(1, Number(o.top) || 25);
  const result = {
    m,
    n,
    rowLabels: t.rowLabels,
    colLabels: t.colLabels,
    labelColumn: t.labelColumn,
    columns: t.columns,
    fold: t.fold,
    missing: t.missing,
    rank: r.rank,
    lambda: r.lambda,
    sensitivity,
    scale: o.scale,
    iterations: r.iterations,
    converged: r.converged,
    residual: r.residual,
    singularValues: lead.slice(0, r.rank),
    energy,
    components99,
    objective: r.objective,
    dualBound: r.dualBound,
    gap: r.gap,
    threshold: thr,
    nonzero,
    flaggedCount,
    flaggedShare: flaggedCount / observedCount,
    sparseShareOfNorm: normM2 > 0 ? Math.sqrt(normS2 / normM2) : 0,
    cells: cells.slice(0, top),
    rows: rows.slice(0, top),
    columnsFlagged: cols,
    filled: filled.slice(0, 200),
    L: Array.from(L),
    S: Array.from(S),
    M: Array.from(t.M),
    observed: Array.from(observed),
    warnings,
  };
  result.summary = summarise(result);
  return result;
}

const fmtPct = (g) => (g < 1e-4 ? "0.01%" : g < 0.001 ? `${(100 * g).toFixed(2)}%` : `${(100 * g).toFixed(1)}%`);

function summarise(r) {
  const shape = `${r.m.toLocaleString("en-US")} rows by ${r.n} columns`;
  const rk = r.rank === 1 ? "one shared pattern (rank 1)" : `a low-rank part of rank ${r.rank}${r.components99 < r.rank ? ` (${r.components99 === 1 ? "one pattern holds" : `${r.components99} patterns hold`} 99% of it)` : ""}`;
  let s = `The ${shape} split into ${rk} plus ${r.flaggedCount.toLocaleString("en-US")} cell${r.flaggedCount === 1 ? "" : "s"} that break${r.flaggedCount === 1 ? "s" : ""} it (${(100 * r.flaggedShare).toFixed(1)}% of the observed cells).`;
  if (r.rows.length) {
    const lead = r.rows.slice(0, 3).map((x) => `${x.row} (${x.flagged} cell${x.flagged === 1 ? "" : "s"}, ${x.net >= 0 ? "+" : ""}${fmt(x.net)} in total)`);
    s += ` The rows that break it most: ${lead.join("; ")}.`;
  } else s += " No cell stands out from the table's ordinary noise.";
  s += ` The split is certified within ${fmtPct(r.gap)} of the best possible.`;
  if (r.missing) s += ` ${r.missing} empty cell${r.missing === 1 ? " was" : "s were"} filled from the low-rank part.`;
  return s;
}

export function toCsv(r) {
  const head = ["row", "column", "observed", "low_rank", "sparse", "flagged"];
  const out = [head.join(",")];
  for (let i = 0; i < r.m; i++)
    for (let j = 0; j < r.n; j++) {
      const k = i * r.n + j;
      const obs = r.observed[k];
      out.push([csvCell(r.rowLabels[i]), csvCell(r.colLabels[j]), obs ? r.M[k] : "", +r.L[k].toPrecision(10), obs ? +r.S[k].toPrecision(10) : "", obs && Math.abs(r.S[k]) > r.threshold && r.S[k] !== 0 ? 1 : 0].join(","));
    }
  return out.join("\n") + "\n";
}
