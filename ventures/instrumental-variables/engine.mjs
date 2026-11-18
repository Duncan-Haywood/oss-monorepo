// Instrumental variables regression: ordinary least squares for comparison,
// two-stage least squares, LIML and Fuller's modified LIML (all k-class
// estimators), with unadjusted, heteroskedasticity-robust and cluster-robust
// standard errors; first-stage strength (partial R-squared, Shea's partial
// R-squared, the first-stage F and the effective F), tests of the
// overidentifying restrictions (Sargan, Hansen's J), tests of exogeneity
// (Durbin, Wu-Hausman, the control-function regression test), and the
// Anderson-Rubin confidence set, which stays valid when instruments are weak.
// Pure functions, no DOM, no network. Implemented from the papers'
// definitions; no third-party code was ported. Covariance conventions
// (which matrices, which small-sample factors) follow linearmodels 7.1 so the
// numbers can be checked against it (eval/reference.py).

export const PAPERS = [
  {
    key: "theil1953repeated",
    authors: "Henri Theil",
    title: "Repeated Least Squares Applied to Complete Equation Systems",
    venue: "Central Planning Bureau, The Hague (mimeo)",
    year: 1953,
    url: "https://books.google.com/books?id=V7HZAAAAMAAJ",
    implemented: "Two-stage least squares: replace each endogenous regressor by its fitted value from a regression on every exogenous variable and instrument, then run least squares; beta = (X'P_Z X)^-1 X'P_Z y.",
    deviations: "Computed directly as the k-class estimator with k = 1 rather than as two literal regressions, so the standard errors use the structural residuals y - X beta, not the second-stage residuals.",
  },
  {
    key: "anderson1949estimation",
    authors: "T. W. Anderson, Herman Rubin",
    title: "Estimation of the Parameters of a Single Equation in a Complete System of Stochastic Equations",
    venue: "Annals of Mathematical Statistics 20(1), 46-63",
    year: 1949,
    url: "https://doi.org/10.1214/aoms/1177730090",
    doi: "10.1214/aoms/1177730090",
    implemented: "Limited information maximum likelihood (LIML) as the k-class estimator with k the smallest root of det(W'M_X1 W - k W'M_Z W) = 0, W = [y, endogenous], X1 the exogenous regressors; and the Anderson-Rubin test of a value of the coefficient: regress y - b x on the exogenous regressors and the instruments and test the instruments' coefficients, whose size does not depend on instrument strength.",
    deviations: "The Anderson-Rubin confidence set is offered for one endogenous regressor only. With unadjusted errors it is the closed-form F-test inversion (an interval, two rays, or the whole line); with robust or clustered errors the Wald version is inverted on a grid of 4,001 points over the 2SLS estimate plus or minus 40 standard errors, each crossing refined by bisection, and the set is reported as open-ended if it reaches the grid's edge.",
  },
  {
    key: "fuller1977some",
    authors: "Wayne A. Fuller",
    title: "Some Properties of a Modification of the Limited Information Estimator",
    venue: "Econometrica 45(4), 939-953",
    year: 1977,
    url: "https://doi.org/10.2307/1912683",
    doi: "10.2307/1912683",
    implemented: "Fuller's estimator: the k-class estimator with k = k_LIML - a / (n - L), L the number of exogenous variables and instruments; a = 1 (the default here) gives an estimator with finite moments that is nearly unbiased.",
    deviations: "None.",
  },
  {
    key: "white1980heteroskedasticity",
    authors: "Halbert White",
    title: "A Heteroskedasticity-Consistent Covariance Matrix Estimator and a Direct Test for Heteroskedasticity",
    venue: "Econometrica 48(4), 817-838",
    year: 1980,
    url: "https://doi.org/10.2307/1912934",
    doi: "10.2307/1912934",
    implemented: "Robust (sandwich) standard errors: A^-1 (sum of xhat_i xhat_i' e_i^2) A^-1, with A = (1 - k) X'X + k X'P_Z X and xhat = P_Z X; clustered errors sum xhat_i e_i within each cluster first (Liang & Zeger 1986).",
    deviations: "No small-sample factor by default (as in linearmodels). With --debiased the factor n / (n - K) is applied, times G / (G - 1) x (n - 1) / n when clustered, and tests use t and F distributions.",
  },
  {
    key: "staiger1997instrumental",
    authors: "Douglas Staiger, James H. Stock",
    title: "Instrumental Variables Regression with Weak Instruments",
    venue: "Econometrica 65(3), 557-586",
    year: 1997,
    url: "https://doi.org/10.2307/2171753",
    doi: "10.2307/2171753",
    implemented: "The first-stage F statistic on the excluded instruments, and the rule of thumb that an F below 10 signals instruments weak enough to bias 2SLS towards OLS and distort its tests.",
    deviations: "The page reports the F under the chosen standard errors (robust or clustered Wald divided by the number of instruments when errors are not unadjusted) and says the rule of thumb is a floor, not a guarantee (Lee, McCrary, Moreira & Porter 2022).",
  },
  {
    key: "olea2013robust",
    authors: "José Luis Montiel Olea, Carolin Pflueger",
    title: "A Robust Test for Weak Instruments",
    venue: "Journal of Business & Economic Statistics 31(3), 358-369",
    year: 2013,
    url: "https://doi.org/10.1080/00401706.2013.806694",
    doi: "10.1080/00401706.2013.806694",
    implemented: "The effective first-stage F: pi' (Z~'Z~) pi / trace(V_pi Z~'Z~), Z~ the instruments with the exogenous regressors partialled out and V_pi the robust or clustered covariance of the first-stage coefficients pi. It equals the usual F under unadjusted errors and the robust Wald statistic with one instrument.",
    deviations: "The paper's critical values (which depend on the data through a Nagar bias approximation) are not computed; the page shows F_eff against 10 and says so.",
  },
  {
    key: "lee2022valid",
    authors: "David S. Lee, Justin McCrary, Marcelo J. Moreira, Jack Porter",
    title: "Valid t-Ratio Inference for IV",
    venue: "American Economic Review 112(10), 3260-3290",
    year: 2022,
    url: "https://doi.org/10.1257/aer.20211063",
    doi: "10.1257/aer.20211063",
    implemented: "The warning, shown with one instrument and one endogenous regressor, that the usual 5% t-test from 2SLS has its stated size only when the first-stage F exceeds 104.7, so with a smaller F the Anderson-Rubin set is the interval to report.",
    deviations: "The tF adjusted critical values are not computed.",
  },
  {
    key: "shea1997instrument",
    authors: "John Shea",
    title: "Instrument Relevance in Multivariate Linear Models: A Simple Measure",
    venue: "Review of Economics and Statistics 79(2), 348-352",
    year: 1997,
    url: "https://doi.org/10.1162/rest.1997.79.2.348",
    doi: "10.1162/rest.1997.79.2.348",
    implemented: "Shea's partial R-squared for each endogenous regressor, computed as (SE_OLS / SE_2SLS)^2 x (1 - R2_2SLS) / (1 - R2_OLS) from unadjusted standard errors; with several endogenous regressors it catches instruments that predict them all in the same direction.",
    deviations: "None.",
  },
  {
    key: "sargan1958estimation",
    authors: "J. D. Sargan",
    title: "The Estimation of Economic Relationships using Instrumental Variables",
    venue: "Econometrica 26(3), 393-415",
    year: 1958,
    url: "https://doi.org/10.2307/1907619",
    doi: "10.2307/1907619",
    implemented: "Sargan's test of the overidentifying restrictions: n (1 - e'M_Z e / e'e) for the 2SLS residuals e, chi-square with (instruments - endogenous) degrees of freedom; it assumes homoskedastic, independent errors.",
    deviations: "None.",
  },
  {
    key: "hansen1982large",
    authors: "Lars Peter Hansen",
    title: "Large Sample Properties of Generalized Method of Moments Estimators",
    venue: "Econometrica 50(4), 1029-1054",
    year: 1982,
    url: "https://doi.org/10.2307/1912775",
    doi: "10.2307/1912775",
    implemented: "Hansen's J test of the overidentifying restrictions, robust to heteroskedasticity or to clustering: two-step efficient GMM with the weight matrix from the 2SLS residuals, J = n g' S^-1 g with g the mean moment at the GMM estimate.",
    deviations: "S is computed from the 2SLS residuals and not recentred (linearmodels' default); only the J statistic is reported, not the GMM coefficients.",
  },
  {
    key: "durbin1954errors",
    authors: "J. Durbin",
    title: "Errors in Variables",
    venue: "Revue de l'Institut International de Statistique 22(1/3), 23-32",
    year: 1954,
    url: "https://doi.org/10.2307/1401917",
    doi: "10.2307/1401917",
    implemented: "Durbin's test that the endogenous regressors are in fact exogenous: the drop in the projected sum of squares between OLS and 2SLS divided by the OLS residual variance, chi-square.",
    deviations: "None.",
  },
  {
    key: "hausman1978specification",
    authors: "Jerry A. Hausman",
    title: "Specification Tests in Econometrics",
    venue: "Econometrica 46(6), 1251-1271",
    year: 1978,
    url: "https://doi.org/10.2307/1913827",
    doi: "10.2307/1913827",
    implemented: "The Wu-Hausman F form of the exogeneity test (Wu 1973, Econometrica 41(4)), and the control-function regression test: add the first-stage residuals to the OLS regression and test their coefficients with the chosen standard errors, which makes it robust to heteroskedasticity or clustering.",
    deviations: "None.",
  },
];

export const DEFAULTS = { estimator: "2sls", se: "robust", alpha: 0.05, fuller: 1, debiased: false };

// ---------- CSV ----------

export function parseCsv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t" || c === ";") { row.push(f); f = ""; }
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

// ---------- linear algebra (columns are Float64Arrays of length n) ----------

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
/** A'B for column lists A (p columns) and B (q columns): p x q array. */
export const cross = (A, B) => A.map((a) => B.map((b) => dot(a, b)));
const matmul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
const matvec = (A, v) => A.map((r) => r.reduce((s, x, k) => s + x * v[k], 0));
const quad = (v, A) => v.reduce((s, vi, i) => s + vi * A[i].reduce((t, a, j) => t + a * v[j], 0), 0);
const sym = (A) => A.map((r, i) => r.map((v, j) => (v + A[j][i]) / 2));

/** Inverse by Gauss-Jordan with partial pivoting; throws on a singular matrix. */
export function invert(A, what = "design") {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(...A.map((r, i) => Math.abs(r[i]))) || 1;
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

/** Fitted values of each column of V on the columns of Z (least squares projection). */
function project(Z, V, ZZinv = invert(cross(Z, Z), "instrument")) {
  const coef = matmul(ZZinv, cross(Z, V)); // kz x m
  return V.map((_, j) => {
    const out = new Float64Array(Z[0].length);
    Z.forEach((z, k) => { const c = coef[k][j]; if (c) for (let i = 0; i < out.length; i++) out[i] += c * z[i]; });
    return out;
  });
}
const residualize = (Z, V, ZZinv) => project(Z, V, ZZinv).map((p, j) => V[j].map((v, i) => v - p[i]));

/** Eigenvalues of a small symmetric matrix by cyclic Jacobi rotations. */
export function symEigenvalues(S) {
  const n = S.length;
  const A = S.map((r) => [...r]);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k][p], akq = A[k][q];
        A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p][k], aqk = A[q][k];
        A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
      }
    }
  }
  return A.map((r, i) => r[i]).sort((a, b) => a - b);
}

function cholesky(A) {
  const n = A.length, L = A.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (!(s > 0)) throw new Error("A cross-product matrix is not positive definite: the columns are collinear."); L[i][i] = Math.sqrt(s); }
    else L[i][j] = s / L[j][j];
  }
  return L;
}

/** Smallest root k of det(B - k A) = 0 for symmetric positive definite A. */
export function minGeneralizedEigenvalue(B, A) {
  const Linv = invert(cholesky(A), "LIML");
  return symEigenvalues(sym(matmul(matmul(Linv, B), transpose(Linv))))[0];
}

// ---------- the design ----------

/**
 * Columns for y = X b + e with instruments Z. X = [const, exogenous..., endogenous...],
 * Z = [const, exogenous..., instruments...]. Text exogenous columns become indicators.
 */
export function buildDesign(records, { outcome, endogenous, instruments, exogenous = [], cluster = null, constant = true }) {
  const endog = list(endogenous), instr = list(instruments), exog = list(exogenous);
  const header = records.length ? Object.keys(records[0]) : [];
  for (const c of [outcome, ...endog, ...instr, ...exog, ...(cluster ? [cluster] : [])]) if (!header.includes(c)) throw new Error(`No column named "${c}". Columns: ${header.join(", ")}.`);
  if (!endog.length) throw new Error("Name at least one endogenous regressor (the variable whose effect you want, which is not randomly assigned).");
  if (!instr.length) throw new Error("Name at least one instrument (a variable that moves the endogenous regressor and affects the outcome only through it).");
  const used = [outcome, ...endog, ...instr, ...exog];
  const dup = used.find((c, i) => used.indexOf(c) !== i);
  if (dup) throw new Error(`"${dup}" is named twice: a column can be the outcome, an endogenous regressor, an instrument or an exogenous control, not more than one.`);
  if (cluster && used.includes(cluster) && !exog.includes(cluster)) throw new Error(`The cluster column "${cluster}" cannot also be the outcome, an endogenous regressor or an instrument.`);
  if (instr.length < endog.length) throw new Error(`The model is under-identified: ${endog.length} endogenous regressor${endog.length > 1 ? "s" : ""} need at least as many instruments, and ${instr.length} ${instr.length === 1 ? "was" : "were"} given.`);
  const notes = [];
  const kinds = exog.map((c) => {
    const vals = records.map((r) => r[c]).filter((v) => String(v ?? "").trim() !== "" && !/^(na|nan|null|\.)$/i.test(String(v).trim()));
    const numeric = vals.length > 0 && vals.filter((v) => Number.isFinite(num(v))).length >= 0.9 * vals.length;
    return { name: c, numeric, levels: numeric ? null : [...new Set(vals)].sort() };
  });
  const keep = [];
  for (const r of records) {
    const ok = [outcome, ...endog, ...instr].every((c) => Number.isFinite(num(r[c])))
      && kinds.every((k) => (k.numeric ? Number.isFinite(num(r[k.name])) : k.levels.includes(r[k.name])))
      && (!cluster || String(r[cluster] ?? "").trim() !== "");
    if (ok) keep.push(r);
  }
  const dropped = records.length - keep.length;
  if (dropped) notes.push(`${dropped} row${dropped === 1 ? "" : "s"} with a missing or unreadable value in a used column ${dropped === 1 ? "was" : "were"} left out.`);
  const n = keep.length;
  const col = (c) => Float64Array.from(keep, (r) => num(r[c]));
  const exCols = [], exNames = [];
  if (constant) { exCols.push(new Float64Array(n).fill(1)); exNames.push("const"); }
  for (const k of kinds) {
    if (k.numeric) { exCols.push(col(k.name)); exNames.push(k.name); }
    else {
      if (k.levels.length > 50) throw new Error(`Column "${k.name}" has ${k.levels.length} text values; give it as numbers or group it first.`);
      for (const lv of k.levels.slice(1)) { exCols.push(Float64Array.from(keep, (r) => (r[k.name] === lv ? 1 : 0))); exNames.push(`${k.name}=${lv}`); }
      notes.push(`"${k.name}" is text, so it enters as ${k.levels.length - 1} indicator${k.levels.length === 2 ? "" : "s"} (baseline "${k.levels[0]}").`);
    }
  }
  const y = col(outcome);
  const en = endog.map(col), iv = instr.map(col);
  const clusters = cluster ? keep.map((r) => String(r[cluster]).trim()) : null;
  const k = exCols.length + en.length, kz = exCols.length + iv.length;
  if (n <= kz + 1) throw new Error(`Only ${n} usable rows for ${kz} exogenous columns and instruments; IV needs many more rows than columns.`);
  return { n, y, exog: exCols, exogNames: exNames, endog: en, endogNames: endog, instr: iv, instrNames: instr, X: [...exCols, ...en], Z: [...exCols, ...iv], xNames: [...exNames, ...endog], clusters, k, kz, notes, rows: keep };
}

// ---------- estimation ----------

function clusterIndex(clusters) {
  const map = new Map();
  const idx = clusters.map((c) => { if (!map.has(c)) map.set(c, map.size); return map.get(c); });
  return { idx, G: map.size };
}

/** Meat of a sandwich: sum over units (or cluster sums) of s_i s_i' for score columns S (each multiplied by e). */
function meat(S, e, clusters) {
  const p = S.length, n = e.length;
  if (!clusters) {
    const M = S.map(() => new Array(p).fill(0));
    for (let i = 0; i < n; i++) {
      const e2 = e[i] * e[i];
      for (let a = 0; a < p; a++) { const sa = S[a][i] * e2; for (let b = 0; b <= a; b++) M[a][b] += sa * S[b][i]; }
    }
    for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) M[b][a] = M[a][b];
    return M;
  }
  const { idx, G } = clusters;
  const sums = Array.from({ length: G }, () => new Float64Array(p));
  for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) sums[idx[i]][a] += S[a][i] * e[i];
  const M = S.map(() => new Array(p).fill(0));
  for (const s of sums) for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) M[a][b] += s[a] * s[b];
  return M;
}

function inference(beta, cov, { debiased, df, alpha }) {
  const se = cov.map((r, i) => Math.sqrt(Math.max(0, r[i])));
  const stat = beta.map((b, i) => b / se[i]);
  const p = stat.map((t) => 2 * (debiased ? tsf(Math.abs(t), df) : normsf(Math.abs(t))));
  const q = debiased ? tppf(1 - alpha / 2, df) : normppf(1 - alpha / 2);
  return { se, stat, p, ci: beta.map((b, i) => [b - q * se[i], b + q * se[i]]), dist: debiased ? `t(${df})` : "normal" };
}

/**
 * k-class estimate of y on X with instruments Z: beta = A^-1 b with
 * A = (1 - k) X'X + k X'P_Z X, b = (1 - k) X'y + k X'P_Z y. k = 0 is OLS, 1 is 2SLS.
 */
export function kClass({ y, X, Z, k = 1, se = "robust", clusters = null, debiased = false, alpha = 0.05, ZZinv }) {
  const n = y.length, p = X.length;
  const XX = cross(X, X), Xy = X.map((x) => dot(x, y));
  ZZinv = ZZinv || invert(cross(Z, Z), "instrument");
  const XZ = cross(X, Z), Zy = Z.map((z) => dot(z, y));
  const XPX = matmul(matmul(XZ, ZZinv), transpose(XZ));
  const XPy = matvec(matmul(XZ, ZZinv), Zy);
  const A = XX.map((r, i) => r.map((v, j) => (1 - k) * v + k * XPX[i][j]));
  const b = Xy.map((v, i) => (1 - k) * v + k * XPy[i]);
  const Ainv = invert(A, "regressor");
  const beta = matvec(Ainv, b);
  const e = Float64Array.from(y, (yi, i) => yi - X.reduce((s, x, j) => s + x[i] * beta[j], 0));
  const scale = debiased ? n / (n - p) : 1;
  let cov, G = null;
  if (se === "unadjusted") {
    const s2 = (dot(e, e) / n) * scale;
    cov = Ainv.map((r) => r.map((v) => v * s2));
  } else {
    const xhat = project(Z, X, ZZinv);
    const cl = se === "clustered" ? clusterIndex(clusters) : null;
    if (cl) G = cl.G;
    let f = scale;
    if (cl && debiased) f *= (cl.G / (cl.G - 1)) * ((n - 1) / n);
    const M = meat(xhat, e, cl);
    cov = sym(matmul(matmul(Ainv, M), Ainv)).map((r) => r.map((v) => v * f));
  }
  const ybar = y.reduce((s, v) => s + v, 0) / n;
  const tss = y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const rss = dot(e, e);
  return { beta, cov, e, k, rss, r2: 1 - rss / tss, n, G, ...inference(beta, cov, { debiased, df: n - p, alpha }) };
}

/** LIML's k: the smallest root of det(W'M_X1 W - k W'M_Z W) = 0, W = [y, endogenous]. */
export function limlKappa(d, ZZinv) {
  const W = [d.y, ...d.endog];
  const MzW = residualize(d.Z, W, ZZinv);
  const Mx1W = d.exog.length ? residualize(d.exog, W) : W;
  return minGeneralizedEigenvalue(cross(W, Mx1W), cross(W, MzW));
}

// ---------- diagnostics ----------

function wald(beta, cov, idx) {
  const b = idx.map((i) => beta[i]);
  const C = idx.map((i) => idx.map((j) => cov[i][j]));
  return quad(b, invert(C, "covariance"));
}

/** First stage of each endogenous regressor: coefficients on the instruments, R2, partial R2, F, effective F. */
export function firstStage(d, opts) {
  const { se, clusters, debiased, alpha } = opts;
  const q = d.instr.length, kz = d.kz, ex = d.exog.length;
  const instrIdx = Array.from({ length: q }, (_, j) => ex + j);
  const Zt = ex ? residualize(d.exog, d.instr) : d.instr;
  const ZtZt = cross(Zt, Zt);
  return d.endog.map((x, j) => {
    const fit = kClass({ y: x, X: d.Z, Z: d.Z, k: 0, se, clusters, debiased, alpha });
    const W = wald(fit.beta, fit.cov, instrIdx);
    const xt = ex ? residualize(d.exog, [x])[0] : x;
    const pr = project(Zt, [xt])[0];
    const partialR2 = dot(pr, pr) / dot(xt, xt);
    const pi = instrIdx.map((i) => fit.beta[i]);
    const Vpi = instrIdx.map((a) => instrIdx.map((b) => fit.cov[a][b]));
    const trace = matmul(Vpi, ZtZt).reduce((s, r, i) => s + r[i], 0);
    const effectiveF = quad(pi, ZtZt) / trace;
    const F = W / q; // with robust or clustered errors, the Wald statistic over q (as R ivreg reports it)
    const fDist = se === "unadjusted" ? { name: `F(${q},${d.n - kz})`, p: fsf(W / q, q, d.n - kz) } : { name: `chi2(${q})`, p: chi2sf(W, q) };
    return {
      variable: d.endogNames[j],
      instruments: d.instrNames.map((nm, a) => ({ name: nm, coef: fit.beta[ex + a], se: fit.se[ex + a], stat: fit.stat[ex + a], p: fit.p[ex + a] })),
      r2: fit.r2, partialR2, wald: W, F, fDist: fDist.name, fP: fDist.p, effectiveF,
    };
  });
}

/** Shea's partial R2 per endogenous regressor from unadjusted OLS and 2SLS fits. */
function sheaR2(d, ols, tsls) {
  const ex = d.exog.length;
  return d.endogNames.map((_, j) => {
    const i = ex + j;
    return (ols.se[i] / tsls.se[i]) ** 2 * ((1 - tsls.r2) / (1 - ols.r2));
  });
}

export function sargan(d, e, ZZinv) {
  const q = d.instr.length - d.endog.length;
  if (q < 1) return null;
  const u = residualize(d.Z, [e], ZZinv)[0];
  const stat = d.n * (1 - dot(u, u) / dot(e, e));
  return { name: "Sargan", stat, df: q, dist: `chi2(${q})`, p: chi2sf(stat, q) };
}

/** Hansen's J from two-step GMM, weight from the 2SLS residuals (robust or clustered moment covariance). */
export function hansenJ(d, tsls, { se, clusters }) {
  const q = d.instr.length - d.endog.length;
  if (q < 1 || se === "unadjusted") return null;
  const n = d.n, Z = d.Z, X = d.X, y = d.y;
  const cl = se === "clustered" ? clusterIndex(clusters) : null;
  if (cl && cl.G <= Z.length) return { name: "Hansen J", stat: NaN, df: q, dist: `chi2(${q})`, p: NaN, error: `needs more clusters (${cl.G}) than exogenous columns plus instruments (${Z.length})` };
  const S = meat(Z, tsls.e, cl).map((r) => r.map((v) => v / n));
  const Winv = invert(S, "moment covariance");
  const XZ = cross(X, Z), Zy = Z.map((z) => dot(z, y));
  const XZW = matmul(XZ, Winv);
  const beta = matvec(invert(matmul(XZW, transpose(XZ)), "GMM"), matvec(XZW, Zy));
  const e = Float64Array.from(y, (yi, i) => yi - X.reduce((s, x, j) => s + x[i] * beta[j], 0));
  const g = Z.map((z) => dot(z, e) / n);
  const stat = n * quad(g, Winv);
  return { name: "Hansen J", stat, df: q, dist: `chi2(${q})`, p: chi2sf(stat, q), gmmBeta: beta };
}

/** Durbin (chi2) and Wu-Hausman (F) tests that the endogenous regressors are exogenous; homoskedastic. */
export function exogeneityTests(d, e2sls, ZZinv) {
  const p = d.endog.length, n = d.n, ex = d.exog.length;
  const e0 = kClass({ y: d.y, X: d.X, Z: d.X, k: 0, se: "unadjusted" }).e;
  const e1 = project([...d.Z, ...d.endog], [e0])[0];
  const e2 = project(d.Z, [e2sls], ZZinv)[0];
  const delta = dot(e1, e1) - dot(e2, e2);
  const rss0 = dot(e0, e0);
  const durbin = delta / (rss0 / n);
  const dfd = n - ex - p - p;
  const wh = (delta / p) / ((rss0 - delta) / dfd);
  return [
    { name: "Durbin", stat: durbin, df: p, dist: `chi2(${p})`, p: chi2sf(durbin, p) },
    { name: "Wu-Hausman", stat: wh, df: p, dfDenom: dfd, dist: `F(${p},${dfd})`, p: fsf(wh, p, dfd) },
  ];
}

/** Control-function (Wooldridge regression) test: OLS of y on [X, first-stage residuals], Wald on the residuals. */
export function controlFunctionTest(d, opts, ZZinv) {
  const r = residualize(d.Z, d.endog, ZZinv);
  const Xa = [...d.X, ...r];
  const fit = kClass({ y: d.y, X: Xa, Z: Xa, k: 0, ...opts });
  const idx = r.map((_, j) => d.X.length + j);
  const stat = wald(fit.beta, fit.cov, idx);
  return { name: "Control function (regression)", stat, df: r.length, dist: `chi2(${r.length})`, p: chi2sf(stat, r.length) };
}

// ---------- Anderson-Rubin ----------

/**
 * Anderson-Rubin statistic at b0 (one endogenous regressor): regress y - b0 x on [exogenous, instruments]
 * and test the instruments. Unadjusted: F(q, n - kz). Robust or clustered: Wald, chi2(q).
 */
export function andersonRubinStat(d, b0, { se, clusters, debiased }) {
  if (d.endog.length !== 1) throw new Error("The Anderson-Rubin test here is for one endogenous regressor.");
  const q = d.instr.length, n = d.n;
  const yb = Float64Array.from(d.y, (v, i) => v - b0 * d.endog[0][i]);
  const fit = kClass({ y: yb, X: d.Z, Z: d.Z, k: 0, se: se === "unadjusted" ? "unadjusted" : se, clusters, debiased: se === "unadjusted" ? true : debiased });
  const W = wald(fit.beta, fit.cov, Array.from({ length: q }, (_, j) => d.exog.length + j));
  return se === "unadjusted" ? { stat: W / q, dist: `F(${q},${n - d.kz})`, p: fsf(W / q, q, n - d.kz) } : { stat: W, dist: `chi2(${q})`, p: chi2sf(W, q) };
}

function describeSet(intervals) {
  if (!intervals.length) return "empty";
  if (intervals.length === 1 && intervals[0][0] === -Infinity && intervals[0][1] === Infinity) return "whole line";
  if (intervals.length === 1 && Number.isFinite(intervals[0][0]) && Number.isFinite(intervals[0][1])) return "interval";
  if (intervals.length === 2 && intervals[0][0] === -Infinity && intervals[1][1] === Infinity) return "two rays";
  return intervals.some((iv) => !Number.isFinite(iv[0]) || !Number.isFinite(iv[1])) ? "unbounded" : "union of intervals";
}

/** Closed-form AR set under unadjusted errors: {b : AR(b) <= F crit}, a quadratic inequality in b. */
function arSetHomoskedastic(d, alpha) {
  const q = d.instr.length, n = d.n;
  const W = [d.y, d.endog[0]];
  const MW = d.exog.length ? residualize(d.exog, W) : W;
  const Zt = d.exog.length ? residualize(d.exog, d.instr) : d.instr;
  const P = project(Zt, MW);
  const a = cross(MW, P); // e'P_Zt e pieces: [yy, yx; xy, xx]
  const t = cross(MW, MW);
  const c = t.map((r, i) => r.map((v, j) => v - a[i][j])); // e'M_[W,Z] e pieces
  const crit = fppf(1 - alpha, q, n - d.kz);
  const kappa = (q * crit) / (n - d.kz);
  // N(b) - kappa D(b) <= 0, N = a_yy - 2 b a_xy + b^2 a_xx
  const A2 = a[1][1] - kappa * c[1][1], B1 = -2 * (a[0][1] - kappa * c[0][1]), C0 = a[0][0] - kappa * c[0][0];
  const disc = B1 * B1 - 4 * A2 * C0;
  let intervals;
  if (Math.abs(A2) < 1e-14 * Math.max(Math.abs(a[1][1]), 1e-300)) {
    intervals = B1 > 0 ? [[-Infinity, -C0 / B1]] : B1 < 0 ? [[-C0 / B1, Infinity]] : C0 <= 0 ? [[-Infinity, Infinity]] : [];
  } else if (A2 > 0) {
    if (disc < 0) intervals = [];
    else { const s = Math.sqrt(disc); intervals = [[(-B1 - s) / (2 * A2), (-B1 + s) / (2 * A2)]]; }
  } else if (disc <= 0) intervals = [[-Infinity, Infinity]];
  else { const s = Math.sqrt(disc); const r1 = (-B1 + s) / (2 * A2), r2 = (-B1 - s) / (2 * A2); intervals = [[-Infinity, Math.min(r1, r2)], [Math.max(r1, r2), Infinity]]; }
  return { intervals, kind: describeSet(intervals), crit, critDist: `F(${q},${n - d.kz})`, method: "closed form" };
}

/** AR set by test inversion on a grid (robust or clustered), with bisection at each crossing. */
function arSetGrid(d, centre, width, opts, alpha, points = 4001) {
  const q = d.instr.length;
  const crit = chi2ppf(1 - alpha, q);
  // The Wald statistic at b is gamma(b)' Omega(b)^-1 gamma(b) with gamma and the meat linear/quadratic in b,
  // so precompute the pieces once and evaluate cheaply.
  const ex = d.exog.length, n = d.n;
  const Z = d.Z, ZZinv = invert(cross(Z, Z), "instrument");
  const gy = matvec(ZZinv, Z.map((z) => dot(z, d.y)));
  const gx = matvec(ZZinv, Z.map((z) => dot(z, d.endog[0])));
  const ey = Float64Array.from(d.y, (v, i) => v - Z.reduce((s, z, j) => s + z[i] * gy[j], 0));
  const exr = Float64Array.from(d.endog[0], (v, i) => v - Z.reduce((s, z, j) => s + z[i] * gx[j], 0));
  const cl = opts.se === "clustered" ? clusterIndex(opts.clusters) : null;
  const kz = Z.length;
  // scores s_i = z_i e_i(b) = z_i (ey_i - b exr_i): meat(b) = Myy - b (Myx + Mxy) + b^2 Mxx
  const sums = (w) => {
    if (!cl) return null;
    const out = Array.from({ length: cl.G }, () => new Float64Array(kz));
    for (let i = 0; i < n; i++) for (let a = 0; a < kz; a++) out[cl.idx[i]][a] += Z[a][i] * w[i];
    return out;
  };
  const Myy = Z.map(() => new Array(kz).fill(0)), Mxx = Z.map(() => new Array(kz).fill(0)), Mxy = Z.map(() => new Array(kz).fill(0));
  if (cl) {
    const sy = sums(ey), sx = sums(exr);
    for (let g = 0; g < cl.G; g++) for (let a = 0; a < kz; a++) for (let b = 0; b < kz; b++) {
      Myy[a][b] += sy[g][a] * sy[g][b]; Mxx[a][b] += sx[g][a] * sx[g][b]; Mxy[a][b] += sx[g][a] * sy[g][b];
    }
  } else {
    for (let i = 0; i < n; i++) for (let a = 0; a < kz; a++) for (let b = 0; b < kz; b++) {
      const zz = Z[a][i] * Z[b][i];
      Myy[a][b] += zz * ey[i] * ey[i]; Mxx[a][b] += zz * exr[i] * exr[i]; Mxy[a][b] += zz * exr[i] * ey[i];
    }
  }
  let f = opts.debiased ? n / (n - kz) : 1;
  if (cl && opts.debiased) f *= (cl.G / (cl.G - 1)) * ((n - 1) / n);
  const idx = Array.from({ length: q }, (_, j) => ex + j);
  const stat = (b) => {
    const M = Myy.map((r, i) => r.map((v, j) => v - b * (Mxy[i][j] + Mxy[j][i]) + b * b * Mxx[i][j]));
    const V = matmul(matmul(ZZinv, M), ZZinv);
    const g = idx.map((i) => gy[i] - b * gx[i]);
    const C = idx.map((i) => idx.map((j) => V[i][j] * f));
    return quad(g, invert(C, "covariance"));
  };
  const lo = centre - width, hi = centre + width, step = (hi - lo) / (points - 1);
  const grid = Array.from({ length: points }, (_, i) => lo + i * step);
  const inside = grid.map((b) => stat(b) <= crit);
  const refine = (a, b) => { // a inside-status differs from b
    const ia = stat(a) <= crit;
    for (let i = 0; i < 100; i++) { const m = (a + b) / 2; if ((stat(m) <= crit) === ia) a = m; else b = m; }
    return (a + b) / 2;
  };
  const intervals = [];
  let start = null;
  for (let i = 0; i < points; i++) {
    if (inside[i] && start === null) start = i === 0 ? -Infinity : refine(grid[i - 1], grid[i]);
    if (!inside[i] && start !== null) { intervals.push([start, refine(grid[i - 1], grid[i])]); start = null; }
  }
  if (start !== null) intervals.push([start, Infinity]);
  return { intervals, kind: describeSet(intervals), crit, critDist: `chi2(${q})`, method: `grid of ${points} points on [${lo.toPrecision(4)}, ${hi.toPrecision(4)}] with bisection`, stat };
}

export function andersonRubinSet(d, tsls, opts, alpha) {
  if (d.endog.length !== 1) return null;
  if (opts.se === "unadjusted") return arSetHomoskedastic(d, alpha);
  const j = d.exog.length;
  const width = 40 * Math.max(tsls.se[j], 1e-12 * Math.max(1, Math.abs(tsls.beta[j])));
  return arSetGrid(d, tsls.beta[j], width, opts, alpha);
}

// ---------- the full analysis ----------

const fmt = (v, dp = 3) => (Number.isFinite(v) ? Number(v).toFixed(dp) : v === Infinity ? "+inf" : v === -Infinity ? "-inf" : "n/a");
const fmtSet = (ivs, dp = 3) => (ivs.length ? ivs.map(([a, b]) => `[${fmt(a, dp)}, ${fmt(b, dp)}]`).join(" U ") : "empty");

/**
 * Full analysis from a CSV: OLS, 2SLS, LIML and Fuller side by side, first-stage diagnostics,
 * overidentification and exogeneity tests, the Anderson-Rubin set, and a reading in words.
 */
export function analyze(input = {}) {
  const records = input.records || parseCsv(input.csv).records;
  if (!records.length) throw new Error("The CSV has a header but no rows.");
  const se = String(input.se ?? DEFAULTS.se).toLowerCase();
  if (!["unadjusted", "robust", "clustered"].includes(se)) throw new Error("se must be unadjusted, robust or clustered.");
  const estimator = String(input.estimator ?? DEFAULTS.estimator).toLowerCase();
  if (!["2sls", "liml", "fuller"].includes(estimator)) throw new Error("estimator must be 2sls, liml or fuller.");
  const alpha = input.alpha === undefined || input.alpha === "" ? DEFAULTS.alpha : Number(input.alpha);
  if (!(alpha > 0 && alpha < 0.5)) throw new Error("alpha must be between 0 and 0.5.");
  const fullerA = input.fuller === undefined || input.fuller === "" ? DEFAULTS.fuller : Number(input.fuller);
  if (!(fullerA >= 0)) throw new Error("The Fuller constant must be zero or positive.");
  const debiased = Boolean(input.debiased);
  if (se === "clustered" && !input.cluster) throw new Error("Clustered standard errors need a cluster column (for example a school, county or firm id).");
  const d = buildDesign(records, { outcome: input.outcome, endogenous: input.endogenous, instruments: input.instruments, exogenous: input.exogenous, cluster: se === "clustered" ? input.cluster : null, constant: input.constant !== false });
  const opts = { se, clusters: d.clusters, debiased, alpha };
  if (se === "clustered") {
    const G = new Set(d.clusters).size;
    if (G < 2) throw new Error("Clustered standard errors need at least two clusters.");
    if (G < 30) d.notes.push(`Only ${G} clusters: cluster-robust standard errors can be too small with fewer than about 30 to 50 clusters (Cameron & Miller 2015).`);
  }
  const ZZinv = invert(cross(d.Z, d.Z), "instrument");
  const ols = kClass({ y: d.y, X: d.X, Z: d.X, k: 0, ...opts });
  const tsls = kClass({ y: d.y, X: d.X, Z: d.Z, k: 1, ZZinv, ...opts });
  const kL = limlKappa(d, ZZinv);
  const liml = kClass({ y: d.y, X: d.X, Z: d.Z, k: kL, ZZinv, ...opts });
  const kF = kL - fullerA / (d.n - d.kz);
  const fuller = kClass({ y: d.y, X: d.X, Z: d.Z, k: kF, ZZinv, ...opts });
  const olsU = se === "unadjusted" ? ols : kClass({ y: d.y, X: d.X, Z: d.X, k: 0, se: "unadjusted" });
  const tslsU = se === "unadjusted" ? tsls : kClass({ y: d.y, X: d.X, Z: d.Z, k: 1, se: "unadjusted", ZZinv });
  const fs = firstStage(d, opts);
  const shea = sheaR2(d, olsU, tslsU);
  fs.forEach((f, j) => { f.sheaR2 = shea[j]; });
  const overid = [sargan(d, tsls.e, ZZinv), hansenJ(d, tsls, opts)].filter(Boolean);
  const exogeneity = [...exogeneityTests(d, tsls.e, ZZinv), controlFunctionTest(d, opts, ZZinv)];
  const ar = andersonRubinSet(d, tsls, opts, alpha);
  const arZero = d.endog.length === 1 ? andersonRubinStat(d, 0, opts) : null;
  // The AR statistic over the 2SLS estimate +/- 6 SE, for the page's chart.
  const arCurve = ar ? (() => {
    const c = tsls.beta[d.exog.length], w = 6 * tsls.se[d.exog.length];
    const f = ar.stat || ((b) => andersonRubinStat(d, b, opts).stat);
    return Array.from({ length: 121 }, (_, i) => { const b = c - w + (2 * w * i) / 120; return [b, f(b)]; });
  })() : null;

  const pack = (name, fit) => ({ name, k: fit.k, terms: d.xNames.map((t, i) => ({ name: t, coef: fit.beta[i], se: fit.se[i], stat: fit.stat[i], p: fit.p[i], ci: fit.ci[i] })), r2: fit.r2, dist: fit.dist });
  const models = { ols: pack("OLS", ols), "2sls": pack("2SLS", tsls), liml: pack("LIML", liml), fuller: pack(`Fuller (a = ${fullerA})`, fuller) };
  const lead = models[estimator];
  const j = d.exog.length;
  const nE = d.endog.length, q = d.instr.length;
  const notes = [...d.notes];
  const minF = Math.min(...fs.map((f) => (nE === 1 && se !== "unadjusted" ? f.effectiveF : f.F)));
  const weak = minF < 10;
  if (weak) notes.push(`The first stage is weak (F ${fmt(minF, 1)} < 10): 2SLS is biased towards OLS and its standard errors understate the uncertainty. Report the Anderson-Rubin set${nE === 1 ? "" : " (one endogenous regressor only)"} and compare LIML or Fuller.`);
  if (nE === 1 && q === 1 && !weak && fs[0].F < 104.7) notes.push(`With one instrument the usual 5% t-test keeps its 5% size only when the first-stage F exceeds 104.7 (Lee, McCrary, Moreira & Porter 2022); this F is ${fmt(fs[0].F, 1)}, so the Anderson-Rubin set is the safer interval.`);
  if (se === "unadjusted") notes.push("Unadjusted standard errors assume every error has the same variance and errors are independent; robust (the default) or clustered is safer.");

  const sentences = [];
  for (let e = 0; e < nE; e++) {
    const t = lead.terms[j + e], o = models.ols.terms[j + e];
    const lvl = Math.round((1 - alpha) * 100);
    sentences.push(`${lead.name} estimate for ${t.name}: ${fmt(t.coef, 4)} (SE ${fmt(t.se, 4)}, ${lvl}% CI ${fmt(t.ci[0], 4)} to ${fmt(t.ci[1], 4)}), against ${fmt(o.coef, 4)} from OLS.`);
  }
  if (ar) sentences.push(`Anderson-Rubin ${Math.round((1 - alpha) * 100)}% set, valid however weak the instruments: ${fmtSet(ar.intervals, 4)}${ar.kind === "interval" ? "" : ` (${ar.kind})`}.`);
  sentences.push(`First-stage F${nE > 1 ? " (smallest)" : ""}: ${fmt(Math.min(...fs.map((f) => f.F)), 1)}${nE === 1 && se !== "unadjusted" ? `, effective F ${fmt(fs[0].effectiveF, 1)}` : ""}.`);
  const exo = exogeneity[se === "unadjusted" ? 1 : 2];
  sentences.push(`${exo.name} test of exogeneity: p = ${fmt(exo.p, 4)}${exo.p < alpha ? ", so OLS and IV differ by more than chance" : ", so the data do not reject that OLS is consistent"}.`);
  const oid = overid.find((t) => t.name === (se === "unadjusted" ? "Sargan" : "Hansen J")) || overid[0];
  if (oid) sentences.push(`${oid.name} test of the overidentifying restrictions: p = ${fmt(oid.p, 4)}${oid.p < alpha ? ": the instruments disagree with each other, so at least one is likely invalid (or the effect differs by instrument)" : ": the instruments agree (this cannot show that all of them are valid)"}.`);
  else sentences.push("Exactly identified (as many instruments as endogenous regressors), so instrument validity cannot be tested from the data.");

  return {
    summary: sentences.join(" "),
    n: d.n, clusters: se === "clustered" ? new Set(d.clusters).size : null,
    spec: { outcome: input.outcome, endogenous: d.endogNames, instruments: d.instrNames, exogenous: d.exogNames, cluster: se === "clustered" ? input.cluster : null },
    options: { estimator, se, alpha, fuller: fullerA, debiased },
    kappa: { liml: kL, fuller: kF },
    models, lead: estimator,
    firstStage: fs,
    overid, exogeneity,
    andersonRubin: ar ? { intervals: ar.intervals, kind: ar.kind, crit: ar.crit, critDist: ar.critDist, method: ar.method, atZero: arZero, curve: arCurve } : null,
    notes,
  };
}
