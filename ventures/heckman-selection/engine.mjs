// Heckman sample-selection model: the outcome is seen only for units that were
// selected (a wage only for people in paid work, a loan's loss only for approved
// loans, a test score only for students who sat the test), and selection may
// share unobserved causes with the outcome. A probit for selection, ordinary
// least squares on the selected rows for comparison, Heckman's two-step
// estimator with the Heckman (1979) / Greene (1981) corrected covariance, and
// full maximum likelihood of the bivariate-normal model (Heckman 1974; "type 2
// tobit") with conventional, robust or cluster-robust standard errors; the
// correlation rho and its Wald and likelihood-ratio tests; and checks on the
// exclusion restriction and on collinearity between the inverse Mills ratio
// and the regressors (Puhani 2000). Pure functions, no DOM, no network.
// Implemented from the papers' definitions; no third-party code was ported.
// The CSV reader, distribution functions and matrix inverse are this
// repository's own, shared with ventures/instrumental-variables.

export const PAPERS = [
  {
    key: "heckman1979sample",
    authors: "James J. Heckman",
    title: "Sample Selection Bias as a Specification Error",
    venue: "Econometrica 47(1), 153-161",
    year: 1979,
    url: "https://doi.org/10.2307/1912352",
    doi: "10.2307/1912352",
    implemented: "The two-step estimator: a probit of selection on Z gives gamma; the inverse Mills ratio lambda_i = phi(z_i gamma) / Phi(z_i gamma) is added to the outcome regression on the selected rows, whose coefficient estimates rho sigma; sigma^2 = e'e / n1 + b_lambda^2 mean(delta_i), delta_i = lambda_i (lambda_i + z_i gamma), and rho = b_lambda / sigma. The t-test on lambda is a test of no selection bias.",
    deviations: "If the two-step rho falls outside [-1, 1] it is set to -1 or 1 and sigma to b_lambda / rho before the covariance is computed (the usual convention), and the page says so. The two-step covariance is the conventional one only; robust and clustered errors apply to OLS and maximum likelihood.",
  },
  {
    key: "greene1981sample",
    authors: "William H. Greene",
    title: "Sample Selection Bias as a Specification Error: A Comment",
    venue: "Econometrica 49(3), 795-798",
    year: 1981,
    url: "https://doi.org/10.2307/1911523",
    doi: "10.2307/1911523",
    implemented: "The corrected two-step covariance, which accounts for the heteroskedasticity the selection induces and for gamma being estimated: V = sigma^2 (X*'X*)^-1 [X*'(I - rho^2 D) X* + Q] (X*'X*)^-1 with X* = [X, lambda], D = diag(delta_i) and Q = rho^2 (X*'D Z) V_gamma (Z'D X*), V_gamma the probit covariance.",
    deviations: "None.",
  },
  {
    key: "heckman1974shadow",
    authors: "James J. Heckman",
    title: "Shadow Prices, Market Wages, and Labor Supply",
    venue: "Econometrica 42(4), 679-694",
    year: 1974,
    url: "https://doi.org/10.2307/1913937",
    doi: "10.2307/1913937",
    implemented: "Full maximum likelihood of the selection model with bivariate normal errors (var(u) = 1, var(e) = sigma^2, corr rho): log L = sum over unselected of log Phi(-z gamma) + sum over selected of [log Phi((z gamma + rho e_i / sigma) / sqrt(1 - rho^2)) - log sigma + log phi(e_i / sigma)], e_i = y_i - x_i beta. Parameterised by atanh(rho) and log(sigma), maximised by damped Newton steps from the two-step estimates and, separately, from rho = 0, keeping the higher likelihood.",
    deviations: "The gradient is analytic; the Hessian is the central difference of the analytic gradient (step 1e-5 times max(1, |theta_j|)), so standard errors carry a relative numerical error near 1e-8. The likelihood-ratio test of rho = 0 compares with the probit plus a normal regression on the selected rows fitted separately.",
  },
  {
    key: "white1982maximum",
    authors: "Halbert White",
    title: "Maximum Likelihood Estimation of Misspecified Models",
    venue: "Econometrica 50(1), 1-25",
    year: 1982,
    url: "https://doi.org/10.2307/1912526",
    doi: "10.2307/1912526",
    implemented: "Robust (sandwich) covariance of the maximum-likelihood estimates, H^-1 (sum of g_i g_i') H^-1, with g_i each row's analytic score; clustered errors sum the scores within each cluster first (Liang & Zeger 1986) and multiply by G / (G - 1).",
    deviations: "No small-sample factor for robust errors. OLS on the selected rows uses HC1 (n / (n - k)) for robust errors and G / (G - 1) x (n - 1) / (n - k) for clustered errors.",
  },
  {
    key: "liang1986longitudinal",
    authors: "Kung-Yee Liang, Scott L. Zeger",
    title: "Longitudinal Data Analysis Using Generalized Linear Models",
    venue: "Biometrika 73(1), 13-22",
    year: 1986,
    url: "https://doi.org/10.1093/biomet/73.1.13",
    doi: "10.1093/biomet/73.1.13",
    implemented: "Cluster-robust covariance: scores summed within each cluster before the outer product.",
    deviations: "Only one-way clustering.",
  },
  {
    key: "puhani2000heckman",
    authors: "Patrick A. Puhani",
    title: "The Heckman Correction for Sample Selection and Its Critique",
    venue: "Journal of Economic Surveys 14(1), 53-68",
    year: 2000,
    url: "https://doi.org/10.1111/1467-6419.00104",
    doi: "10.1111/1467-6419.00104",
    implemented: "The two checks the survey recommends before trusting a correction: whether any variable affects selection but not the outcome (an exclusion restriction), and how collinear the inverse Mills ratio is with the outcome regressors, reported as the R-squared of lambda on X in the selected rows (a high value makes the two-step estimates fragile and favours maximum likelihood or a better exclusion).",
    deviations: "The R-squared thresholds the page warns at (0.8 and 0.95) are this tool's choice, not the paper's.",
  },
];

export const DEFAULTS = { estimator: "mle", se: "conventional", alpha: 0.05 };

// ---------- CSV ----------

export function parseCsv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  const s = String(text ?? "").replace(/^\uFEFF/, "");
  // One delimiter for the whole file, chosen from the header line: comma unless the
  // header has none and has tabs (or else semicolons). Mixing them would split text cells.
  const head = s.split(/\r?\n/, 1)[0];
  const delim = head.includes(",") ? "," : head.includes("\t") ? "\t" : head.includes(";") ? ";" : ",";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ""; }
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

export const num = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const t = String(v).trim();
  if (t === "" || /^(na|nan|null|\.|-)$/i.test(t)) return NaN;
  return Number(t);
};

export const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((s) => String(s).trim()).filter(Boolean);

// ---------- distributions ----------

function lgamma(x) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised upper incomplete gamma Q(a, x): series below a + 1, Lentz continued fraction above. */
function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (!Number.isFinite(x)) return 0;
  const lead = -x + a * Math.log(x) - lgamma(a);
  if (x < a + 1) {
    let sum = 1 / a, term = sum;
    for (let n = 1; n < 10000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-17) break;
    }
    return Math.max(0, 1 - sum * Math.exp(lead));
  }
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
  return Math.exp(lead) * h;
}

function betacf(a, b, x) {
  const T = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < T) d = T;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < T) d = T;
    c = 1 + aa / c; if (Math.abs(c) < T) c = T;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < T) d = T;
    c = 1 + aa / c; if (Math.abs(c) < T) c = T;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
function ibeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export const chi2sf = (x, df) => (x <= 0 ? 1 : gammaQ(df / 2, x / 2));
export const fsf = (x, d1, d2) => (x <= 0 ? 1 : ibeta(d2 / (d2 + d1 * x), d2 / 2, d1 / 2));
export const normsf = (z) => (z < 0 ? 1 - normsf(-z) : 0.5 * gammaQ(0.5, (z * z) / 2));
export const tsf = (t, df) => (t < 0 ? 1 - tsf(-t, df) : 0.5 * ibeta(df / (df + t * t), df / 2, 0.5));

function quantileFromSf(sf, p, start = 1) {
  // smallest x with sf(x) <= p, by bracketing then bisection
  let lo = 0, hi = start;
  while (sf(hi) > p) { lo = hi; hi *= 2; if (hi > 1e12) break; }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (sf(mid) > p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
export const chi2ppf = (p, df) => quantileFromSf((x) => chi2sf(x, df), 1 - p, df + 1);
export const fppf = (p, d1, d2) => quantileFromSf((x) => fsf(x, d1, d2), 1 - p, 2);
export const normppf = (p) => (p < 0.5 ? -normppf(1 - p) : quantileFromSf((x) => normsf(x), 1 - p, 2));
export const tppf = (p, df) => (p < 0.5 ? -tppf(1 - p, df) : quantileFromSf((x) => tsf(x, df), 1 - p, 2));

const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);
const LGAMMA_HALF = 0.5 * Math.log(Math.PI);

/** log of the upper normal tail P(Z > z), accurate far into the tail (no underflow). */
export function logNormSf(z) {
  if (z < 2) return Math.log(normsf(z));
  // Q(1/2, x) with x = z^2 / 2 by the Lentz continued fraction, kept in logs
  const a = 0.5, x = (z * z) / 2, tiny = 1e-300;
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
  return Math.log(0.5) + (-x + a * Math.log(x) - LGAMMA_HALF) + Math.log(h);
}
/** log Phi(t). */
export const logNormCdf = (t) => (t > 0 ? Math.log1p(-normsf(t)) : logNormSf(-t));
/** phi(t) / Phi(t), the inverse Mills ratio. */
export const mills = (t) => Math.exp(-0.5 * t * t - LOG_SQRT_2PI - logNormCdf(t));

// ---------- linear algebra (rows are arrays of length k) ----------

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const matmul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
const matvec = (A, v) => A.map((r) => dot(r, v));
const sym = (A) => A.map((r, i) => r.map((v, j) => (v + A[j][i]) / 2));
const zeros = (p, q) => Array.from({ length: p }, () => new Array(q).fill(0));
/** sum_i w_i r_i r_i' over rows R. */
function gram(R, w = null) {
  const k = R[0].length, M = zeros(k, k);
  for (let i = 0; i < R.length; i++) {
    const r = R[i], wi = w ? w[i] : 1;
    for (let a = 0; a < k; a++) { const ra = r[a] * wi; if (ra === 0) continue; for (let b = 0; b <= a; b++) M[a][b] += ra * r[b]; }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) M[b][a] = M[a][b];
  return M;
}
/** sum_i w_i a_i b_i' for rows A (k) and B (m). */
function crossRows(A, B, w = null) {
  const k = A[0].length, m = B[0].length, M = zeros(k, m);
  for (let i = 0; i < A.length; i++) { const wi = w ? w[i] : 1; for (let a = 0; a < k; a++) { const v = A[i][a] * wi; if (v === 0) continue; for (let b = 0; b < m; b++) M[a][b] += v * B[i][b]; } }
  return M;
}
const xty = (R, y) => { const k = R[0].length, v = new Array(k).fill(0); for (let i = 0; i < R.length; i++) for (let a = 0; a < k; a++) v[a] += R[i][a] * y[i]; return v; };

/** Inverse by Gauss-Jordan with partial pivoting; throws on a singular matrix. */
/** Inverse by Gauss-Jordan with partial pivoting; throws on a singular matrix. */
export function invert(A, what = "design") {
  const n = A.length;
  // Scale to unit diagonal first so the singularity test does not depend on the units of
  // the columns (D^-1/2 A D^-1/2), then undo the scaling on the inverse.
  const D = A.map((r, i) => Math.sqrt(Math.abs(r[i])));
  if (D.some((v) => !(v > 0))) throw new Error(`The ${what} matrix is singular: a column is all zeros. Drop it and run again.`);
  const S = A.map((r, i) => r.map((v, j) => v / (D[i] * D[j])));
  return invertScaled(S, what).map((r, i) => r.map((v, j) => v / (D[i] * D[j])));
}

function invertScaled(A, what) {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = 1;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (!(Math.abs(M[piv][c]) > 1e-12 * scale)) throw new Error(`The ${what} matrix is singular: a column is constant, duplicated, or a combination of others. Drop it and run again.`);
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


// ---------- design ----------

const MISSING = /^(na|nan|null|\.|-)?$/i;
const blank = (v) => MISSING.test(String(v ?? "").trim());

/**
 * Rows to model: every row with a readable selection indicator and selection variables;
 * the outcome and its regressors are needed only for selected rows.
 */
export function buildDesign(records, { outcome, regressors = [], selection = [], selected = null, cluster = null, union = true, constant = true }) {
  const xv = list(regressors), extra = list(selection);
  const header = records.length ? Object.keys(records[0]) : [];
  if (!outcome) throw new Error("Name the outcome column (the value seen only for selected rows, such as a wage).");
  for (const c of [outcome, ...xv, ...extra, ...(selected ? [selected] : []), ...(cluster ? [cluster] : [])]) if (!header.includes(c)) throw new Error(`No column named "${c}". Columns: ${header.join(", ")}.`);
  if (xv.includes(outcome) || extra.includes(outcome)) throw new Error(`The outcome "${outcome}" cannot also be a regressor.`);
  if (selected && (selected === outcome || xv.includes(selected) || extra.includes(selected))) throw new Error(`The selection indicator "${selected}" cannot also be the outcome or a regressor.`);
  const dupX = xv.find((c, i) => xv.indexOf(c) !== i);
  if (dupX) throw new Error(`"${dupX}" is named twice among the outcome regressors.`);
  const zv = union ? [...xv, ...extra.filter((c) => !xv.includes(c))] : [...new Set(extra)];
  if (!zv.length && !constant) throw new Error("The selection equation needs at least one variable.");
  const notes = [];
  const kind = (c) => {
    const vals = records.map((r) => r[c]).filter((v) => !blank(v));
    return { name: c, numeric: vals.length > 0 && vals.filter((v) => Number.isFinite(num(v))).length >= 0.9 * vals.length };
  };
  const kinds = new Map([...new Set([...xv, ...zv])].map((c) => [c, kind(c)]));
  const ok = (r, c) => (kinds.get(c).numeric ? Number.isFinite(num(r[c])) : !blank(r[c]));
  const keep = [], sel = [];
  let droppedSel = 0, droppedOut = 0, badFlag = null;
  for (const r of records) {
    let s;
    if (selected) {
      const v = String(r[selected] ?? "").trim();
      if (blank(v)) { droppedSel++; continue; }
      if (!/^(0|1|0\.0|1\.0)$/.test(v)) { badFlag = badFlag ?? v; continue; }
      s = Number(v);
    } else {
      const v = r[outcome];
      if (blank(v)) s = 0;
      else if (Number.isFinite(num(v))) s = 1;
      else throw new Error(`The outcome "${outcome}" has the value "${String(v).trim()}", which is not a number. Leave it blank (or NA) for unselected rows.`);
    }
    if (!zv.every((c) => ok(r, c)) || (cluster && blank(r[cluster]))) { droppedSel++; continue; }
    if (s === 1 && !(Number.isFinite(num(r[outcome])) && xv.every((c) => ok(r, c)))) { droppedOut++; continue; }
    keep.push(r); sel.push(s);
  }
  if (badFlag !== null) throw new Error(`The selection indicator "${selected}" must be 0 or 1; it has the value "${badFlag}".`);
  if (droppedSel) notes.push(`${droppedSel} row${droppedSel === 1 ? "" : "s"} with a missing or unreadable selection indicator, selection variable or cluster ${droppedSel === 1 ? "was" : "were"} left out.`);
  if (droppedOut) notes.push(`${droppedOut} selected row${droppedOut === 1 ? "" : "s"} with a missing outcome or regressor ${droppedOut === 1 ? "was" : "were"} left out of both equations. If missing outcomes mean "not selected", leave the selection indicator out and the tool will treat blank outcomes as unselected.`);
  const n = keep.length, n1 = sel.reduce((a, b) => a + b, 0), n0 = n - n1;
  if (!n) throw new Error("No usable rows: check the column names and missing values.");
  if (n1 === 0) throw new Error(`No row has an observed outcome${selected ? ` (${selected} = 1)` : ""}, so there is nothing to estimate.`);
  if (n0 === 0) throw new Error(`Every row has an observed outcome${selected ? ` (${selected} = 1)` : ""}: there is no selection to correct for, so ordinary regression applies.`);
  // Text levels come from the rows used, so no indicator is all zeros.
  for (const k of kinds.values()) if (!k.numeric) {
    k.levels = [...new Set(keep.map((r) => String(r[k.name]).trim()))].sort();
    if (k.levels.length > 50) throw new Error(`Column "${k.name}" has ${k.levels.length} text values; give it as numbers or group it first.`);
  }
  const expand = (vars, rowsFilter) => {
    const names = constant ? ["const"] : [];
    let baselineFree = !constant;
    const parts = [];
    for (const c of vars) {
      const k = kinds.get(c);
      if (k.numeric) { names.push(c); parts.push((r) => [num(r[c])]); continue; }
      const lv = baselineFree ? k.levels : k.levels.slice(1);
      baselineFree = false;
      for (const l of lv) names.push(`${c}=${l}`);
      parts.push((r) => lv.map((l) => (String(r[c]).trim() === l ? 1 : 0)));
    }
    const rows = rowsFilter.map((r) => [...(constant ? [1] : []), ...parts.flatMap((p) => p(r))]);
    return { names, rows };
  };
  for (const k of kinds.values()) if (!k.numeric) notes.push(`"${k.name}" is text, so it enters as ${k.levels.length - 1} indicator${k.levels.length === 2 ? "" : "s"} (baseline "${k.levels[0]}").`);
  const selRows = keep.filter((_, i) => sel[i] === 1);
  const Zd = expand(zv, keep), Xd = expand(xv, selRows);
  const y = selRows.map((r) => num(r[outcome]));
  const kx = Xd.names.length, kz = Zd.names.length;
  if (n1 <= kx + 2) throw new Error(`Only ${n1} selected rows for ${kx} outcome-equation columns; the outcome regression needs many more rows than columns.`);
  if (n <= kz + 1) throw new Error(`Only ${n} rows for ${kz} selection-equation columns.`);
  const clusters = cluster ? keep.map((r) => String(r[cluster]).trim()) : null;
  const exclusions = Zd.names.filter((nm) => nm !== "const" && !Xd.names.includes(nm));
  return { n, n1, n0, s: sel, Z: Zd.rows, zNames: Zd.names, X: Xd.rows, xNames: Xd.names, y, selIdx: sel.flatMap((s, i) => (s ? [i] : [])), clusters, exclusions, notes, regressors: xv, selectionVars: zv };
}

function clusterIndex(clusters) {
  const map = new Map();
  const idx = clusters.map((c) => { if (!map.has(c)) map.set(c, map.size); return map.get(c); });
  return { idx, G: map.size };
}

/** Outer-product meat from per-row scores G (n x p), optionally summed within clusters. */
function scoreMeat(G, clusters) {
  if (!clusters) return gram(G);
  const { idx, G: g } = clusterIndex(clusters);
  const p = G[0].length, sums = Array.from({ length: g }, () => new Array(p).fill(0));
  G.forEach((row, i) => { const s = sums[idx[i]]; for (let a = 0; a < p; a++) s[a] += row[a]; });
  return gram(sums);
}

function inference(beta, cov, alpha) {
  const se = cov.map((r, i) => Math.sqrt(Math.max(0, r[i])));
  const q = normppf(1 - alpha / 2);
  return beta.map((b, i) => ({ coef: b, se: se[i], z: b / se[i], p: 2 * normsf(Math.abs(b / se[i])), ci: [b - q * se[i], b + q * se[i]] }));
}

// ---------- probit ----------

/** Probit of s on Z by Newton-Raphson with the observed Hessian. */
export function probit(Z, s, { maxIter = 100 } = {}) {
  const n = Z.length, k = Z[0].length;
  const pbar = s.reduce((a, b) => a + b, 0) / n;
  const evalAt = (g) => {
    let ll = 0;
    const grad = new Array(k).fill(0), w = new Array(n);
    for (let i = 0; i < n; i++) {
      const q = 2 * s[i] - 1, t = q * dot(Z[i], g);
      ll += logNormCdf(t);
      const lam = mills(t);
      w[i] = lam * (lam + t);
      for (let a = 0; a < k; a++) grad[a] += q * lam * Z[i][a];
    }
    return { ll, grad, info: gram(Z, w) };
  };
  let g = new Array(k).fill(0);
  const ci = Z[0].findIndex((_, j) => Z.every((r) => r[j] === 1));
  if (ci >= 0) g[ci] = -normppf(1 - pbar);
  let cur = evalAt(g), converged = false, iter = 0;
  for (; iter < maxIter; iter++) {
    const step = matvec(invert(cur.info, "selection (probit)"), cur.grad);
    let t = 1, next;
    for (let h = 0; h < 50; h++) {
      const cand = g.map((v, j) => v + t * step[j]);
      next = evalAt(cand);
      if (next.ll >= cur.ll - 1e-10 * Math.abs(cur.ll)) { g = cand; break; }
      t /= 2;
    }
    const dec = dot(step, cur.grad);
    cur = next;
    if (dec < 1e-20 * Math.max(1, Math.abs(cur.ll)) || Math.max(...step.map(Math.abs)) * t < 1e-13) { converged = true; break; }
  }
  // one more evaluation so the covariance is at the final estimate
  cur = evalAt(g);
  const fitted = Z.map((r) => dot(r, g));
  const maxAbs = Math.max(...fitted.map(Math.abs));
  // complete separation: every row on the right side of zero, and the likelihood climbing to 0
  const separated = fitted.every((c, i) => (2 * s[i] - 1) * c > 0);
  if (!converged || maxAbs > 37 || separated) throw new Error("The selection probit did not converge: some variable (or combination) predicts selection perfectly. Drop it or merge sparse categories and run again.");
  const ll0 = n * (pbar * Math.log(pbar) + (1 - pbar) * Math.log(1 - pbar));
  const extreme = fitted.filter((c) => Math.abs(c) > 8.5).length;
  return { gamma: g, cov: invert(cur.info, "selection (probit)"), ll: cur.ll, ll0, iterations: iter + 1, fitted, extreme };
}

// ---------- OLS on the selected rows ----------

export function olsSelected(d, { se = "conventional" } = {}) {
  const { X, y } = d, n = X.length, k = X[0].length;
  const XXi = invert(gram(X), "outcome");
  const beta = matvec(XXi, xty(X, y));
  const e = y.map((v, i) => v - dot(X[i], beta));
  const ssr = e.reduce((a, v) => a + v * v, 0);
  let cov;
  if (se === "conventional") cov = XXi.map((r) => r.map((v) => (v * ssr) / (n - k)));
  else {
    const G = X.map((r, i) => r.map((v) => v * e[i]));
    const cl = se === "clustered" ? d.clusters.filter((_, i) => d.s[i] === 1) : null;
    const M = scoreMeat(G, cl);
    let f = n / (n - k);
    if (cl) { const g = new Set(cl).size; f = (g / (g - 1)) * ((n - 1) / (n - k)); }
    cov = matmul(matmul(XXi, M), XXi).map((r) => r.map((v) => v * f));
  }
  const ybar = y.reduce((a, b) => a + b, 0) / n;
  const tss = y.reduce((a, v) => a + (v - ybar) ** 2, 0);
  return { beta, cov: sym(cov), e, ssr, r2: 1 - ssr / tss, sigmaML: Math.sqrt(ssr / n) };
}

// ---------- Heckman two-step ----------

export function twoStep(d, pr) {
  const sel = d.selIdx;
  const c = sel.map((i) => pr.fitted[i]);
  const lam = c.map(mills);
  const delta = lam.map((l, i) => l * (l + c[i]));
  const Xs = d.X.map((r, i) => [...r, lam[i]]);
  const n1 = Xs.length, k = Xs[0].length;
  const XXi = invert(gram(Xs), "two-step outcome (the inverse Mills ratio may be a combination of the regressors)");
  const beta = matvec(XXi, xty(Xs, d.y));
  const e = d.y.map((v, i) => v - dot(Xs[i], beta));
  const bl = beta[k - 1];
  const sigma2 = e.reduce((a, v) => a + v * v, 0) / n1 + (bl * bl * delta.reduce((a, b) => a + b, 0)) / n1;
  let sigma = Math.sqrt(sigma2), rho = bl / sigma, truncated = false;
  if (Math.abs(rho) > 1) { truncated = true; rho = Math.sign(rho); sigma = bl / rho; }
  const Zs = sel.map((i) => d.Z[i]);
  const W = delta.map((dl) => 1 - rho * rho * dl);
  const F = crossRows(Xs, Zs, delta); // X*' D Z
  const Q = matmul(matmul(F, pr.cov), transpose(F)).map((r) => r.map((v) => v * rho * rho));
  const mid = gram(Xs, W).map((r, a) => r.map((v, b) => v + Q[a][b]));
  const cov = sym(matmul(matmul(XXi, mid), XXi).map((r) => r.map((v) => v * sigma * sigma)));
  // the usual OLS t-test on lambda: valid under rho = 0, where no correction is needed
  const s2 = e.reduce((a, v) => a + v * v, 0) / (n1 - k);
  const lamTest = { stat: bl / Math.sqrt(s2 * XXi[k - 1][k - 1]) };
  lamTest.p = 2 * normsf(Math.abs(lamTest.stat));
  // Puhani's collinearity check: R^2 of lambda on X in the selected rows
  const XXinv = invert(gram(d.X), "outcome");
  const bLam = matvec(XXinv, xty(d.X, lam));
  const lbar = lam.reduce((a, b) => a + b, 0) / n1;
  const res = lam.map((l, i) => l - dot(d.X[i], bLam));
  const lamR2 = 1 - res.reduce((a, v) => a + v * v, 0) / lam.reduce((a, v) => a + (v - lbar) ** 2, 0);
  return { beta, cov, sigma, rho, truncated, lambda: lam, lamTest, lamR2, meanLambda: lbar };
}

// ---------- full maximum likelihood ----------

/** Log-likelihood, total gradient and (optionally) per-row scores at theta = [beta, gamma, atanh rho, log sigma]. */
export function heckmanLogLik(d, theta, { scores = false } = {}) {
  const kx = d.X[0].length, kz = d.Z[0].length, p = kx + kz + 2;
  const beta = theta.slice(0, kx), gamma = theta.slice(kx, kx + kz);
  const a = theta[kx + kz], l = theta[kx + kz + 1];
  const rho = Math.tanh(a), sigma = Math.exp(l), r = Math.sqrt(1 - rho * rho);
  let ll = 0;
  const g = new Array(p).fill(0);
  const G = scores ? [] : null;
  let j = 0;
  for (let i = 0; i < d.n; i++) {
    const z = d.Z[i], c = dot(z, gamma);
    const gi = scores ? new Array(p).fill(0) : g;
    if (d.s[i] === 0) {
      ll += logNormCdf(-c);
      const m = mills(-c);
      for (let q = 0; q < kz; q++) gi[kx + q] += -m * z[q];
    } else {
      const x = d.X[j], e = (d.y[j] - dot(x, beta)) / sigma;
      j++;
      const A = (c + rho * e) / r;
      ll += logNormCdf(A) - l - 0.5 * e * e - LOG_SQRT_2PI;
      const m = mills(A);
      const fb = (-rho * m) / (sigma * r) + e / sigma;
      for (let q = 0; q < kx; q++) gi[q] += fb * x[q];
      for (let q = 0; q < kz; q++) gi[kx + q] += (m / r) * z[q];
      gi[kx + kz] += (m * (e + rho * c)) / r;
      gi[kx + kz + 1] += (-rho * e * m) / r - 1 + e * e;
    }
    if (scores) { G.push(gi); for (let q = 0; q < p; q++) g[q] += gi[q]; }
  }
  return { ll, grad: g, scores: G };
}

/** Hessian by central differences of the analytic gradient. */
export function numericHessian(d, theta) {
  const p = theta.length, H = zeros(p, p);
  for (let q = 0; q < p; q++) {
    const h = 1e-5 * Math.max(1, Math.abs(theta[q]));
    const up = theta.slice(), dn = theta.slice();
    up[q] += h; dn[q] -= h;
    const gu = heckmanLogLik(d, up).grad, gd = heckmanLogLik(d, dn).grad;
    for (let b = 0; b < p; b++) H[b][q] = (gu[b] - gd[b]) / (2 * h);
  }
  return sym(H);
}

function maximise(d, start, maxIter = 300) {
  let th = start.slice(), cur = heckmanLogLik(d, th), mu = 0, converged = false, iter = 0;
  const p = th.length;
  for (; iter < maxIter; iter++) {
    const H = numericHessian(d, th);
    let step = null, next = null, cand = null;
    for (let tries = 0; tries < 60; tries++) {
      const A = H.map((r, a) => r.map((v, b) => -v + (a === b ? mu * Math.max(1, Math.abs(H[a][a])) : 0)));
      try { step = matvec(invert(A, "likelihood"), cur.grad); } catch { step = null; }
      if (step && step.every(Number.isFinite)) {
        cand = th.map((v, q) => v + step[q]);
        next = heckmanLogLik(d, cand);
        if (Number.isFinite(next.ll) && next.ll >= cur.ll - 1e-12 * Math.abs(cur.ll)) break;
      }
      mu = mu ? mu * 10 : 1e-4;
      next = null;
    }
    if (!next) break;
    const gain = next.ll - cur.ll;
    th = cand; cur = next; mu = mu / 10 < 1e-8 ? 0 : mu / 10;
    const dec = Math.abs(dot(step, cur.grad));
    if ((Math.abs(gain) < 1e-11 * Math.max(1, Math.abs(cur.ll)) && Math.max(...cur.grad.map(Math.abs)) < 1e-6 * Math.max(1, Math.sqrt(d.n))) || dec < 1e-18) { converged = true; break; }
    if (Math.abs(th[p - 2]) > 18) break; // |rho| -> 1
  }
  return { theta: th, ll: cur.ll, converged, iterations: iter + 1 };
}

export function heckmanMLE(d, { pr, two, ols, se = "conventional" }) {
  const kx = d.X[0].length, kz = d.Z[0].length;
  const clip = (v) => Math.max(-0.9, Math.min(0.9, v));
  const starts = [
    [...two.beta.slice(0, kx), ...pr.gamma, Math.atanh(clip(two.rho)), Math.log(Math.abs(two.sigma))],
    [...ols.beta, ...pr.gamma, 0, Math.log(ols.sigmaML)],
  ];
  const fits = starts.map((s) => maximise(d, s));
  const best = fits[0].ll >= fits[1].ll ? fits[0] : fits[1];
  const other = best === fits[0] ? fits[1] : fits[0];
  const th = best.theta;
  const H = numericHessian(d, th);
  const Hinv = invert(H.map((r) => r.map((v) => -v)), "likelihood information");
  let cov = Hinv;
  if (se !== "conventional") {
    const { scores } = heckmanLogLik(d, th, { scores: true });
    const M = scoreMeat(scores, se === "clustered" ? d.clusters : null);
    cov = matmul(matmul(Hinv, M), Hinv);
    if (se === "clustered") { const g = new Set(d.clusters).size; cov = cov.map((r) => r.map((v) => (v * g) / (g - 1))); }
  }
  cov = sym(cov);
  const a = th[kx + kz], l = th[kx + kz + 1];
  const rho = Math.tanh(a), sigma = Math.exp(l);
  const va = cov[kx + kz][kx + kz], vl = cov[kx + kz + 1][kx + kz + 1], cal = cov[kx + kz][kx + kz + 1];
  const dr = 1 - rho * rho;
  const lamSe = Math.sqrt(Math.max(0, (dr * sigma) ** 2 * va + (rho * sigma) ** 2 * vl + 2 * dr * sigma * rho * sigma * cal));
  const llIndep = pr.ll + (-d.n1 / 2) * (Math.log(2 * Math.PI) + 2 * Math.log(ols.sigmaML) + 1);
  const lr = 2 * (best.ll - llIndep);
  const wald = (a * a) / va;
  return {
    theta: th, cov, ll: best.ll, llIndep, converged: best.converged, iterations: best.iterations,
    otherStart: { ll: other.ll, rho: Math.tanh(other.theta[kx + kz]) },
    beta: th.slice(0, kx), gamma: th.slice(kx, kx + kz),
    atanhRho: { coef: a, se: Math.sqrt(va) }, logSigma: { coef: l, se: Math.sqrt(vl) },
    rho: { coef: rho, se: dr * Math.sqrt(va) }, sigma: { coef: sigma, se: sigma * Math.sqrt(vl) }, lambda: { coef: rho * sigma, se: lamSe },
    tests: { lr: { stat: Math.max(0, lr), df: 1, p: chi2sf(Math.max(0, lr), 1) }, wald: { stat: wald, df: 1, p: chi2sf(wald, 1) } },
  };
}

// ---------- the full analysis ----------

const fmt = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : "n/a");
const pct = (x) => `${(100 * x).toFixed(1)}%`;

/**
 * Full analysis from a CSV: the selection probit, OLS on the selected rows, Heckman's
 * two-step and maximum likelihood side by side, rho and its tests, the identification
 * checks, and a reading in words.
 */
export function analyze(input = {}) {
  const records = input.records || parseCsv(input.csv).records;
  if (!records.length) throw new Error("The CSV has a header but no rows.");
  const se = String(input.se ?? DEFAULTS.se).toLowerCase();
  if (!["conventional", "robust", "clustered"].includes(se)) throw new Error("se must be conventional, robust or clustered.");
  const estimator = String(input.estimator ?? DEFAULTS.estimator).toLowerCase();
  if (!["mle", "twostep"].includes(estimator)) throw new Error("estimator must be mle or twostep.");
  const alpha = input.alpha === undefined || input.alpha === "" ? DEFAULTS.alpha : Number(input.alpha);
  if (!(alpha > 0 && alpha < 0.5)) throw new Error("alpha must be between 0 and 0.5.");
  if (se === "clustered" && !input.cluster) throw new Error("Clustered standard errors need a cluster column (for example a county, school or firm id).");
  const d = buildDesign(records, { outcome: input.outcome, regressors: input.regressors, selection: input.selection, selected: input.selected || null, cluster: se === "clustered" ? input.cluster : null, union: input.union !== false });
  const notes = [...d.notes];
  if (se === "clustered") {
    const G = new Set(d.clusters).size;
    if (G < 2) throw new Error("Clustered standard errors need at least two clusters.");
    if (G < 30) notes.push(`Only ${G} clusters: cluster-robust standard errors can be too small with fewer than about 30 to 50 clusters.`);
  }
  const pr = probit(d.Z, d.s);
  const ols = olsSelected(d, { se });
  const two = twoStep(d, pr);
  const mle = heckmanMLE(d, { pr, two, ols, se });

  const kx = d.xNames.length, kz = d.zNames.length;
  const terms = (names, est, cov) => { const inf = inference(est, cov, alpha); return names.map((nm, i) => ({ name: nm, ...inf[i] })); };
  const sub = (cov, from, k) => cov.slice(from, from + k).map((r) => r.slice(from, from + k));
  const models = {
    ols: { name: "OLS, selected rows only", terms: terms(d.xNames, ols.beta, ols.cov), r2: ols.r2, se },
    twostep: {
      name: "Heckman two-step", terms: terms([...d.xNames, "lambda (inverse Mills ratio)"], two.beta, two.cov), se: "conventional",
      rho: two.rho, sigma: two.sigma, truncated: two.truncated, lambdaTest: two.lamTest,
      selection: terms(d.zNames, pr.gamma, pr.cov),
    },
    mle: {
      name: "Maximum likelihood", terms: terms(d.xNames, mle.beta, sub(mle.cov, 0, kx)), se,
      selection: terms(d.zNames, mle.gamma, sub(mle.cov, kx, kz)),
      rho: { ...mle.rho, ci: [Math.tanh(mle.atanhRho.coef - normppf(1 - alpha / 2) * mle.atanhRho.se), Math.tanh(mle.atanhRho.coef + normppf(1 - alpha / 2) * mle.atanhRho.se)] },
      sigma: { ...mle.sigma, ci: [Math.exp(mle.logSigma.coef - normppf(1 - alpha / 2) * mle.logSigma.se), Math.exp(mle.logSigma.coef + normppf(1 - alpha / 2) * mle.logSigma.se)] },
      lambda: mle.lambda, atanhRho: mle.atanhRho, logSigma: mle.logSigma,
      ll: mle.ll, llIndep: mle.llIndep, tests: mle.tests, converged: mle.converged, iterations: mle.iterations, otherStart: mle.otherStart,
    },
  };
  const probitOut = { terms: terms(d.zNames, pr.gamma, pr.cov), ll: pr.ll, ll0: pr.ll0, lr: 2 * (pr.ll - pr.ll0), pseudoR2: 1 - pr.ll / pr.ll0, iterations: pr.iterations };
  probitOut.lrP = chi2sf(probitOut.lr, kz - 1);
  // fitted selection probabilities in 20 bins, selected and unselected rows apart (the page's chart)
  probitOut.histogram = { bins: 20, selected: new Array(20).fill(0), unselected: new Array(20).fill(0) };
  pr.fitted.forEach((c, i) => { probitOut.histogram[d.s[i] ? "selected" : "unselected"][Math.min(19, Math.floor((1 - normsf(c)) * 20))]++; });

  // identification and fragility checks
  if (!d.exclusions.length) notes.push("No variable enters selection without also entering the outcome equation, so the correction is identified only by the normal distribution's shape (the non-linearity of the inverse Mills ratio). Estimates can swing with small changes; add a variable that affects selection but not the outcome if one can be defended.");
  if (two.lamR2 > 0.95) notes.push(`The inverse Mills ratio is almost a linear combination of the outcome regressors (R² ${fmt(two.lamR2, 3)} in the selected rows; Puhani 2000), so the two-step estimates are fragile. Prefer maximum likelihood and a stronger exclusion restriction.`);
  else if (two.lamR2 > 0.8) notes.push(`The inverse Mills ratio is highly collinear with the outcome regressors (R² ${fmt(two.lamR2, 3)} in the selected rows; Puhani 2000): expect wide two-step intervals.`);
  if (two.truncated) notes.push(`The two-step estimate of rho fell outside [-1, 1] and was set to ${two.rho}; this usually means the model is poorly identified or misspecified.`);
  if (!mle.converged) notes.push("Maximum likelihood did not meet the convergence test (often because rho is heading to -1 or 1); treat its results with care and compare the two-step estimates.");
  if (Math.abs(mle.otherStart.ll - mle.ll) > 1e-6 * Math.max(1, Math.abs(mle.ll)) && Math.abs(mle.otherStart.rho - mle.rho.coef) > 0.01) notes.push(`Started from rho = 0 instead of the two-step estimate, maximum likelihood stopped at a lower maximum (rho ${fmt(mle.otherStart.rho, 3)}, log L ${fmt(mle.otherStart.ll, 3)}): the likelihood has more than one peak, so the reported (higher) one should be checked.`);
  if (Math.abs(mle.rho.coef) > 0.99) notes.push("Maximum-likelihood rho is at the edge of its range (|rho| > 0.99): the likelihood is flat in that direction and the standard errors are unreliable.");
  if (pr.extreme) notes.push(`${pr.extreme} row${pr.extreme === 1 ? " has" : "s have"} a fitted selection index beyond 8.5 in absolute value (a selection probability of 0 or 1 to machine precision): some variable nearly predicts selection perfectly, which can make the estimates unstable.`);
  if (d.n1 / d.n > 0.97) notes.push(`${pct(d.n1 / d.n)} of rows are selected, so there is little selection to model and the correction is weakly identified.`);
  if (se !== "conventional") notes.push(`The two-step standard errors are the conventional Heckman-Greene ones; the ${se} option applies to OLS and maximum likelihood.`);

  // reading in words
  const lead = models[estimator];
  const lvl = Math.round((1 - alpha) * 100);
  const sentences = [`${d.n1} of ${d.n} rows (${pct(d.n1 / d.n)}) have an observed ${input.outcome}.`];
  const shifts = d.xNames.map((nm, i) => ({ nm, i, z: Math.abs(lead.terms[i].coef - models.ols.terms[i].coef) / (lead.terms[i].se || 1) })).filter((t) => t.nm !== "const").sort((a, b) => b.z - a.z).slice(0, 3);
  for (const t of shifts) {
    const L = lead.terms[t.i], O = models.ols.terms[t.i];
    sentences.push(`${t.nm}: ${fmt(L.coef)} (${lead.name.toLowerCase()}, SE ${fmt(L.se)}, ${lvl}% CI ${fmt(L.ci[0])} to ${fmt(L.ci[1])}) against ${fmt(O.coef)} from OLS on the selected rows.`);
  }
  const rhoT = estimator === "mle" ? models.mle.rho : null;
  const testP = estimator === "mle" ? (se === "conventional" ? mle.tests.lr.p : mle.tests.wald.p) : two.lamTest.p;
  const testName = estimator === "mle" ? (se === "conventional" ? "likelihood-ratio" : "Wald") : "two-step t-test on lambda";
  const rhoVal = estimator === "mle" ? rhoT.coef : two.rho;
  sentences.push(`rho = ${fmt(rhoVal, 3)}${rhoT ? ` (${lvl}% CI ${fmt(rhoT.ci[0], 3)} to ${fmt(rhoT.ci[1], 3)})` : ""}; ${testName} test of rho = 0: p ${testP < 1e-4 ? "< 0.0001" : `= ${fmt(testP)}`}.`);
  if (testP < alpha) sentences.push(rhoVal > 0
    ? `The unobserved factors that make a row selected also ${input.outcome ? `raise ${input.outcome}` : "raise the outcome"}, so OLS on the selected rows describes a favourably selected group, not the whole population.`
    : `The unobserved factors that make a row selected go with a lower ${input.outcome || "outcome"}, so the selected rows are an unfavourably selected group.`);
  else sentences.push("The data do not reject rho = 0: OLS on the selected rows is then consistent for these coefficients, though a failure to reject is not proof of no selection.");
  sentences.push(d.exclusions.length ? `Identification rests on ${d.exclusions.join(", ")}, which enter selection but not ${input.outcome}: that they have no direct effect on it is an assumption the data cannot test.` : "There is no exclusion restriction (see the note).");

  const shift = (estimator === "mle" ? mle.lambda.coef : two.beta[kx]) * two.meanLambda;
  return {
    summary: sentences.join(" "),
    n: d.n, n1: d.n1, n0: d.n0, clusters: se === "clustered" ? new Set(d.clusters).size : null,
    spec: { outcome: input.outcome, regressors: d.regressors, selection: d.selectionVars, selected: input.selected || null, cluster: se === "clustered" ? input.cluster : null, xNames: d.xNames, zNames: d.zNames, exclusions: d.exclusions },
    options: { estimator, se, alpha },
    probit: probitOut,
    models, lead: estimator,
    diagnostics: { selectionRate: d.n1 / d.n, lambdaR2: two.lamR2, meanLambda: two.meanLambda, meanSelectionShift: shift },
    notes,
  };
}
