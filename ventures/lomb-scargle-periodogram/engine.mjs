// Lomb-Scargle periodogram for unevenly sampled series: which periods are in
// these measurements, how sure, and could a peak be an alias of the sampling?
//
// At each trial frequency f the model
//   y_i = a cos(2 pi f t_i) + b sin(2 pi f t_i) + c_g(i)
// is fitted by weighted least squares (weights 1/sigma_i^2 when errors are
// given), with one offset c_g per group (instrument, site, observer). The power
// is the fraction of chi-square the sinusoid removes beyond the offsets alone:
//   p(f) = (chi2_0 - chi2(f)) / chi2_0,
// the "generalised" Lomb-Scargle of Zechmeister & Kurster (2009), which with
// one group and equal weights is Lomb (1976) / Scargle (1982) with a floating
// mean. Significance is Baluev's (2008) analytic false alarm probability.
// Pure functions, no DOM, no network.

export const PAPERS = [
  {
    authors: "N. R. Lomb",
    title: "Least-squares frequency analysis of unequally spaced data",
    venue: "Astrophysics and Space Science 39, 447-462",
    year: 1976,
    url: "https://doi.org/10.1007/BF00648343",
    doi: "10.1007/BF00648343",
    implemented: "The periodogram as a least-squares fit of a sinusoid at each trial frequency to unevenly spaced samples, the power being the variance the fit explains.",
    deviations: "Fits a floating mean (and one offset per group) together with the sinusoid, as in Zechmeister & Kurster below, rather than subtracting the sample mean first.",
  },
  {
    authors: "Jeffrey D. Scargle",
    title: "Studies in astronomical time series analysis. II. Statistical aspects of spectral analysis of unevenly spaced data",
    venue: "The Astrophysical Journal 263, 835-853",
    year: 1982,
    url: "https://doi.org/10.1086/160554",
    doi: "10.1086/160554",
    implemented: "The time-shift-invariant form of the periodogram and its reading as a test against pure noise.",
    deviations: "Scargle's exponential false alarm law assumes known variance and independent frequencies; the tool uses Baluev's bound below instead, which needs neither.",
  },
  {
    authors: "M. Zechmeister, M. Kurster",
    title: "The generalised Lomb-Scargle periodogram. A new formalism for the floating-mean and Keplerian periodograms",
    venue: "Astronomy & Astrophysics 496, 577-584",
    year: 2009,
    url: "https://arxiv.org/abs/0901.2573",
    doi: "10.1051/0004-6361/200811296",
    implemented: "The generalised (floating-mean, error-weighted) periodogram: weights w_i = 1/sigma_i^2 normalised, the sums YY, YC, YS, CC, SS, CS of their equations 10-15, and power p = (SS YC^2 + CC YS^2 - 2 CS YC YS) / (YY D), D = CC SS - CS^2 (their equation 5 with 20).",
    deviations: "Generalised from one floating mean to one offset per group (instrument): the cosine, sine and data are centred within each group before the sums are formed, which is the same least-squares fit with G offsets profiled out. With one group it is their formula exactly. An optional jitter is added to every error in quadrature.",
  },
  {
    authors: "Roman V. Baluev",
    title: "Assessing the statistical significance of periodogram peaks",
    venue: "Monthly Notices of the Royal Astronomical Society 385(3), 1279-1285",
    year: 2008,
    url: "https://arxiv.org/abs/0711.0330",
    doi: "10.1111/j.1365-2966.2008.12689.x",
    implemented: "The false alarm probability of the highest peak up to a maximum frequency, FAP = 1 - (1 - P_single) exp(-tau), with P_single = (1 - z)^(N_K/2) and the Davies-bound term tau = gamma(N_H) W (1 - z)^((N_K - 1)/2) sqrt(N_H z / 2), W = f_max sqrt(4 pi Var(t)), for the standard (0 to 1) normalisation.",
    deviations: "Degrees of freedom count the group offsets: N_H = N - G and N_K = N - G - 2 (Baluev's single floating mean is G = 1). Var(t) is the error-weighted variance of the times. The bound is an upper estimate that is tight for small FAP; it assumes Gaussian white noise with the stated errors.",
  },
  {
    authors: "Jacob T. VanderPlas",
    title: "Understanding the Lomb-Scargle Periodogram",
    venue: "The Astrophysical Journal Supplement Series 236(1), 16",
    year: 2018,
    url: "https://arxiv.org/abs/1703.09824",
    doi: "10.3847/1538-4365/aab766",
    implemented: "The frequency grid (spacing 1/(n0 T) with n0 = 5 samples per peak width over the baseline T), the warning that there is no Nyquist limit for uneven sampling, and reading aliases from the spectral window: a true frequency f0 shows up again at f0 +/- f_w for every strong window peak f_w.",
    deviations: "The default shortest period is twice the median gap between samples, a convenience the paper warns is not a real limit; the page says so and lets the user lower it.",
  },
  {
    authors: "M. H. Montgomery, D. O'Donoghue",
    title: "A derivation of the errors for least squares fitting to time series data",
    venue: "Delta Scuti Star Newsletter 13, 28-32",
    year: 1999,
    url: "https://ui.adsabs.harvard.edu/abs/1999DSSN...13...28M",
    implemented: "The frequency uncertainty of a fitted sinusoid, sigma_f = sqrt(6 / N) sigma_res / (pi T A), converted to a period uncertainty sigma_P = sigma_f P^2.",
    deviations: "Assumes white residuals and samples spread across the baseline; with gaps or red noise it is optimistic, and the page says so.",
  },
];

export const DEFAULTS = {
  timeColumn: null, // null = the first column that reads as numbers or dates
  valueColumn: null, // null = the first other numeric column
  errorColumn: null, // null = a column named err, error, sigma, unc, dy (if any); "" = none
  groupColumn: null, // null = a text column other than the time (if any); "" = none
  minPeriod: null, // shortest trial period, in time units; null = twice the median gap
  maxPeriod: null, // longest trial period; null = the baseline
  oversample: 5, // grid points per peak width 1/T
  signals: 3, // how many periods to find, removing each before the next (pre-whitening)
  fapLevel: 0.01, // stop pre-whitening once the next peak's FAP is above this
  jitter: 0, // extra error added in quadrature (same units as the values)
  top: 10, // how many peaks to list from the first periodogram
};

const MAX_POINTS = 50000;
const MAX_WORK = 4e8; // points x frequencies per periodogram
const LN10 = Math.log(10);

// ---------- input ----------

function splitLine(line, delim) {
  if (delim === "ws") return line.trim().split(/\s+/);
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
    else if (ch === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseCsv(text) {
  const lines = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "" && !/^\s*#/.test(l));
  if (lines.length < 2) throw new Error("Paste a header row and at least a few rows of data.");
  const head = lines[0];
  const counts = { ",": (head.match(/,/g) || []).length, "\t": (head.match(/\t/g) || []).length, ";": (head.match(/;/g) || []).length };
  let delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  if (counts[delim] === 0) delim = "ws";
  const header = splitLine(head, delim).map((h, i) => h || `column ${i + 1}`);
  const rows = lines.slice(1).map((l) => splitLine(l, delim));
  return { header, rows };
}

// A plain number, allowing a thousands comma only in the 1,234.5 shape.
export function toNumber(s) {
  if (s == null) return NaN;
  const t = String(s).trim();
  if (t === "") return NaN;
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ""));
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
  return Number(t);
}

// ISO dates and date-times (2024-03-05, 2024-03-05T14:30, 2024-03-05 14:30:00Z)
// to days since 1970-01-01 UTC. A time with no zone is read as UTC so the
// result never depends on the visitor's clock.
export function toDays(s) {
  const t = String(s ?? "").trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  let ms = Date.UTC(y, mo - 1, d, Number(m[4] || 0), Number(m[5] || 0), 0) + Number(m[6] || 0) * 1000;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCDate() !== d) return NaN;
  if (m[7] && m[7] !== "Z") {
    const z = m[7].replace(":", "");
    const sign = z[0] === "-" ? -1 : 1;
    ms -= sign * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5))) * 60000;
  }
  return ms / 86400000;
}

const ERROR_NAMES = /^(err\w*|e_\w+|\w*_err\w*|sigma\w*|sig|unc|uncertainty|dy|stderr|std|se)$/i;

export function profileColumns(parsed) {
  return parsed.header.map((name, j) => {
    let nums = 0;
    let dates = 0;
    let filled = 0;
    for (const r of parsed.rows) {
      const v = r[j];
      if (v == null || v.trim() === "") continue;
      filled++;
      if (Number.isFinite(toNumber(v))) nums++;
      else if (Number.isFinite(toDays(v))) dates++;
    }
    const kind = filled === 0 ? "empty" : nums >= 0.9 * filled ? "number" : dates >= 0.9 * filled ? "date" : "text";
    return { name, index: j, kind };
  });
}

function pick(cols, want, label) {
  if (want == null) return null;
  const c = cols.find((c) => c.name === want) || cols.find((c) => c.name.toLowerCase() === String(want).toLowerCase());
  if (!c) throw new Error(`No column named "${want}" for ${label}. Columns: ${cols.map((c) => c.name).join(", ")}.`);
  return c;
}

export function readSeries(parsed, opts = {}) {
  const cols = profileColumns(parsed);
  let tCol = pick(cols, opts.timeColumn, "the time");
  if (!tCol) tCol = cols.find((c) => c.kind === "date") || cols.find((c) => c.kind === "number");
  if (!tCol || (tCol.kind !== "number" && tCol.kind !== "date")) throw new Error("No time column: one column must hold numbers (days, hours, JD) or ISO dates (2024-03-05).");
  let yCol = pick(cols, opts.valueColumn, "the values");
  let eCol = opts.errorColumn === "" ? null : pick(cols, opts.errorColumn, "the errors");
  const numeric = cols.filter((c) => c.kind === "number" && c !== tCol);
  if (!eCol && opts.errorColumn !== "") eCol = numeric.find((c) => ERROR_NAMES.test(c.name) && c !== yCol) || null;
  if (!yCol) yCol = numeric.find((c) => c !== eCol);
  if (!yCol) throw new Error("No value column: a second column must hold the measured numbers.");
  if (yCol.kind !== "number") throw new Error(`Column "${yCol.name}" is not numeric.`);
  if (eCol && eCol.kind !== "number") throw new Error(`Column "${eCol.name}" (errors) is not numeric.`);
  if (eCol === yCol) throw new Error("The value and error columns must differ.");
  let gCol = opts.groupColumn === "" ? null : pick(cols, opts.groupColumn, "the groups");
  if (!gCol && opts.groupColumn !== "") gCol = cols.find((c) => c.kind === "text" && c !== tCol) || null;

  const t = [];
  const y = [];
  const e = [];
  const g = [];
  let skipped = 0;
  for (const r of parsed.rows) {
    const tv = tCol.kind === "date" ? toDays(r[tCol.index]) : toNumber(r[tCol.index]);
    const yv = toNumber(r[yCol.index]);
    const ev = eCol ? toNumber(r[eCol.index]) : 1;
    if (!Number.isFinite(tv) || !Number.isFinite(yv) || !(ev > 0)) {
      skipped++;
      continue;
    }
    t.push(tv);
    y.push(yv);
    e.push(ev);
    g.push(gCol ? String(r[gCol.index] ?? "").trim() || "(blank)" : "all");
  }
  return {
    t,
    y,
    e,
    g,
    skipped,
    columns: { time: tCol.name, timeKind: tCol.kind, value: yCol.name, error: eCol?.name ?? null, group: gCol?.name ?? null },
  };
}

// ---------- maths helpers ----------

// log Gamma by the Lanczos approximation (g = 7, n = 9), good to ~1e-15
// relative for x > 0.5; only large arguments are needed here.
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const tt = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(tt) - tt + Math.log(a);
}

function weightedVar(t, w) {
  let sw = 0;
  let m = 0;
  for (let i = 0; i < t.length; i++) {
    sw += w[i];
    m += w[i] * t[i];
  }
  m /= sw;
  let v = 0;
  for (let i = 0; i < t.length; i++) v += w[i] * (t[i] - m) ** 2;
  return v / sw;
}

// Baluev (2008) false alarm probability of a peak of standard power z, the
// highest found up to fmax. Returned as { fap, log10 } so tiny values survive.
export function baluevFap(z, { n, groups = 1, fmax, varT }) {
  const NH = n - groups;
  const NK = n - groups - 2;
  if (!(z > 0) || NK < 1) return { fap: 1, log10: 0, single: 1 };
  if (z >= 1) return { fap: 0, log10: -Infinity, single: 0 };
  const lnOneMinus = Math.log1p(-z);
  const lnSingle = 0.5 * NK * lnOneMinus;
  const W = fmax * Math.sqrt(4 * Math.PI * varT);
  const lnGamma = 0.5 * Math.log(2 / NH) + lgamma(NH / 2) - lgamma((NH - 1) / 2);
  const lnTau = lnGamma + Math.log(W) + 0.5 * (NK - 1) * lnOneMinus + 0.5 * Math.log(0.5 * NH * z);
  const single = Math.exp(lnSingle);
  const tau = Math.exp(lnTau);
  // FAP = 1 - (1 - P_single) exp(-tau), computed without cancellation.
  const fap = -Math.expm1(Math.log1p(-Math.min(single, 1 - 1e-300)) - tau);
  // log10 for the tiny end: FAP ~ P_single + tau when both are small.
  let log10;
  if (fap > 1e-300) log10 = Math.log10(fap);
  else {
    const hi = Math.max(lnSingle, lnTau);
    log10 = (hi + Math.log(Math.exp(lnSingle - hi) + Math.exp(lnTau - hi))) / LN10;
  }
  return { fap: Math.min(1, Math.max(0, fap)), log10: Math.min(0, log10), single };
}

// ---------- the periodogram ----------

function groupIndex(g) {
  const names = [];
  const map = new Map();
  const idx = new Int32Array(g.length);
  for (let i = 0; i < g.length; i++) {
    let k = map.get(g[i]);
    if (k === undefined) {
      k = names.length;
      map.set(g[i], k);
      names.push(g[i]);
    }
    idx[i] = k;
  }
  return { names, idx };
}

// Prepare the weighted, group-centred data once. t is shifted to its weighted
// mean so large epochs (JD 2.45 million) keep their precision in the phases.
export function prepare(t, y, opts = {}) {
  const n = t.length;
  const e = opts.e || new Array(n).fill(1);
  const jitter = opts.jitter || 0;
  const { names, idx } = groupIndex(opts.g || new Array(n).fill("all"));
  const G = names.length;
  const w = new Float64Array(n);
  let sw = 0;
  for (let i = 0; i < n; i++) {
    w[i] = 1 / (e[i] * e[i] + jitter * jitter);
    sw += w[i];
  }
  for (let i = 0; i < n; i++) w[i] /= sw;
  let tm = 0;
  for (let i = 0; i < n; i++) tm += w[i] * t[i];
  const tc = new Float64Array(n);
  for (let i = 0; i < n; i++) tc[i] = t[i] - tm;
  const Wg = new Float64Array(G);
  const Yg = new Float64Array(G);
  for (let i = 0; i < n; i++) {
    Wg[idx[i]] += w[i];
    Yg[idx[i]] += w[i] * y[i];
  }
  for (let k = 0; k < G; k++) Yg[k] /= Wg[k];
  const yr = new Float64Array(n);
  let YY = 0;
  for (let i = 0; i < n; i++) {
    yr[i] = y[i] - Yg[idx[i]];
    YY += w[i] * yr[i] * yr[i];
  }
  let tmin = Infinity;
  let tmax = -Infinity;
  for (const v of t) {
    if (v < tmin) tmin = v;
    if (v > tmax) tmax = v;
  }
  return { n, G, names, idx, w, tc, tm, y: Float64Array.from(y), yr, Wg, Yg, YY, baseline: tmax - tmin, tmin, tmax, varT: weightedVar(tc, w) };
}

// The generalised Lomb-Scargle power with group offsets on a uniform grid
// f = f0 + k df, k = 0..nf-1. Trigonometric values advance by rotation, and
// are recomputed exactly every RESEED steps to stop rounding from building up.
const RESEED = 256;
export function periodogram(P, f0, df, nf, yr = P.yr, YY = P.YY) {
  const { n, G, idx, w, tc } = P;
  const power = new Float64Array(nf);
  const c = new Float64Array(n);
  const s = new Float64Array(n);
  const cd = new Float64Array(n);
  const sd = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cd[i] = Math.cos(2 * Math.PI * df * tc[i]);
    sd[i] = Math.sin(2 * Math.PI * df * tc[i]);
  }
  const gc = new Float64Array(G);
  const gs = new Float64Array(G);
  const Wg = P.Wg;
  for (let k = 0; k < nf; k++) {
    if (k % RESEED === 0) {
      const om = 2 * Math.PI * (f0 + k * df);
      for (let i = 0; i < n; i++) {
        const ph = om * tc[i];
        c[i] = Math.cos(ph);
        s[i] = Math.sin(ph);
      }
    }
    gc.fill(0);
    gs.fill(0);
    let CCr = 0;
    let CSr = 0;
    let YC = 0;
    let YS = 0;
    for (let i = 0; i < n; i++) {
      const wi = w[i];
      const ci = c[i];
      const si = s[i];
      const wc = wi * ci;
      const ws = wi * si;
      const gi = idx[i];
      gc[gi] += wc;
      gs[gi] += ws;
      CCr += wc * ci;
      CSr += wc * si;
      YC += wc * yr[i];
      YS += ws * yr[i];
    }
    let CC = CCr;
    let SS = 1 - CCr;
    let CS = CSr;
    for (let g = 0; g < G; g++) {
      const W = Wg[g];
      CC -= (gc[g] * gc[g]) / W;
      SS -= (gs[g] * gs[g]) / W;
      CS -= (gc[g] * gs[g]) / W;
    }
    const D = CC * SS - CS * CS;
    power[k] = D > 1e-15 * Math.max(CC * SS, 1e-300) ? (SS * YC * YC + CC * YS * YS - 2 * CS * YC * YS) / (D * YY) : 0;
    // advance by one grid step
    for (let i = 0; i < n; i++) {
      const ci = c[i];
      c[i] = ci * cd[i] - s[i] * sd[i];
      s[i] = s[i] * cd[i] + ci * sd[i];
    }
  }
  return power;
}

// Power at one frequency, computed directly (for refinement and tests).
export function powerAt(P, f, yr = P.yr, YY = P.YY) {
  return periodogram(P, f, 0, 1, yr, YY)[0];
}

// Weighted least squares fit of a cos + b sin + offsets at frequency f.
// Returns the coefficients and the fitted values.
export function fitSinusoid(P, f, y) {
  const { n, G, idx, w, tc } = P;
  const om = 2 * Math.PI * f;
  const m = G + 2;
  const A = new Float64Array(m * m);
  const bvec = new Float64Array(m);
  const row = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    row.fill(0);
    row[0] = Math.cos(om * tc[i]);
    row[1] = Math.sin(om * tc[i]);
    row[2 + idx[i]] = 1;
    for (let a = 0; a < m; a++) {
      if (row[a] === 0) continue;
      bvec[a] += w[i] * row[a] * y[i];
      for (let b = 0; b < m; b++) A[a * m + b] += w[i] * row[a] * row[b];
    }
  }
  const x = solve(A, bvec, m);
  const model = new Float64Array(n);
  for (let i = 0; i < n; i++) model[i] = x[0] * Math.cos(om * tc[i]) + x[1] * Math.sin(om * tc[i]) + x[2 + idx[i]];
  return { a: x[0], b: x[1], offsets: Array.from(x.slice(2)), model };
}

// Gaussian elimination with partial pivoting (m is small: groups + 2).
export function solve(A0, b0, m) {
  const A = Float64Array.from(A0);
  const b = Float64Array.from(b0);
  for (let col = 0; col < m; col++) {
    let p = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r * m + col]) > Math.abs(A[p * m + col])) p = r;
    if (Math.abs(A[p * m + col]) < 1e-300) throw new Error("The fit is singular: too few points in a group, or every time is the same.");
    if (p !== col) {
      for (let k = 0; k < m; k++) [A[col * m + k], A[p * m + k]] = [A[p * m + k], A[col * m + k]];
      [b[col], b[p]] = [b[p], b[col]];
    }
    for (let r = col + 1; r < m; r++) {
      const f = A[r * m + col] / A[col * m + col];
      if (f === 0) continue;
      for (let k = col; k < m; k++) A[r * m + k] -= f * A[col * m + k];
      b[r] -= f * b[col];
    }
  }
  const x = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) {
    let v = b[r];
    for (let k = r + 1; k < m; k++) v -= A[r * m + k] * x[k];
    x[r] = v / A[r * m + r];
  }
  return x;
}

// The spectral window |sum w_i exp(2 pi i f t_i)|^2 (with sum w = 1): the
// periodogram the sampling alone would give. Peaks away from zero are the
// sampling's own rhythms (a day, a year, a lunar month).
export function spectralWindow(P, f0, df, nf) {
  const { n, w, tc } = P;
  const out = new Float64Array(nf);
  const c = new Float64Array(n);
  const s = new Float64Array(n);
  const cd = new Float64Array(n);
  const sd = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cd[i] = Math.cos(2 * Math.PI * df * tc[i]);
    sd[i] = Math.sin(2 * Math.PI * df * tc[i]);
  }
  for (let k = 0; k < nf; k++) {
    if (k % RESEED === 0) {
      const om = 2 * Math.PI * (f0 + k * df);
      for (let i = 0; i < n; i++) {
        c[i] = Math.cos(om * tc[i]);
        s[i] = Math.sin(om * tc[i]);
      }
    }
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      re += w[i] * c[i];
      im += w[i] * s[i];
      const ci = c[i];
      c[i] = ci * cd[i] - s[i] * sd[i];
      s[i] = s[i] * cd[i] + ci * sd[i];
    }
    out[k] = re * re + im * im;
  }
  return out;
}

// Local maxima of a grid, highest first, each at least `sep` grid steps from
// a higher one already kept.
export function findPeaks(power, count, sep = 1) {
  const cand = [];
  for (let k = 0; k < power.length; k++) {
    const l = k > 0 ? power[k - 1] : -Infinity;
    const r = k < power.length - 1 ? power[k + 1] : -Infinity;
    if (power[k] >= l && power[k] > r) cand.push(k);
  }
  cand.sort((a, b) => power[b] - power[a]);
  const kept = [];
  for (const k of cand) {
    if (kept.every((j) => Math.abs(j - k) >= sep)) kept.push(k);
    if (kept.length >= count) break;
  }
  return kept;
}

// Refine a grid peak: a finer grid across +/- one step, then a parabola
// through the best three points.
export function refinePeak(P, f, df, yr = P.yr, YY = P.YY) {
  const m = 41;
  const step = (2 * df) / (m - 1);
  const lo = Math.max(f - df, step);
  const pw = periodogram(P, lo, step, m, yr, YY);
  let k = 0;
  for (let j = 1; j < m; j++) if (pw[j] > pw[k]) k = j;
  let fBest = lo + k * step;
  let pBest = pw[k];
  if (k > 0 && k < m - 1) {
    const denom = pw[k - 1] - 2 * pw[k] + pw[k + 1];
    if (denom < 0) {
      const shift = (0.5 * (pw[k - 1] - pw[k + 1])) / denom;
      const fp = fBest + shift * step;
      const pp = powerAt(P, fp, yr, YY);
      if (pp > pBest) {
        fBest = fp;
        pBest = pp;
      }
    }
  }
  return { f: fBest, power: pBest };
}

// ---------- the whole analysis ----------

function median(a) {
  const s = Float64Array.from(a).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

export const fmt = (v, digits = 4) => {
  if (v == null || !Number.isFinite(v)) return String(v);
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(Math.max(0, digits - 1));
  return Number(v.toPrecision(digits)).toLocaleString("en-US", { maximumFractionDigits: 10 });
};

export function fmtFap(f) {
  if (!f) return "n/a";
  if (f.log10 < -300 || f.fap === 0) return `< 1e-300`;
  if (f.fap < 1e-4) return `1e${Math.round(f.log10)}`;
  if (f.fap < 0.001) return `${(f.fap * 100).toPrecision(2)}%`;
  return `${(f.fap * 100).toPrecision(2)}%`;
}

export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  let series;
  if (Array.isArray(input.t) && Array.isArray(input.y)) {
    // Number(null) and Number("") are 0: a missing reading must fail the check below, not become a zero.
    const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
    series = { t: input.t.map(num), y: input.y.map(num), e: input.e ? input.e.map(num) : input.t.map(() => 1), g: input.g ? input.g.map(String) : input.t.map(() => "all"), skipped: 0, columns: { time: "t", timeKind: "number", value: "y", error: input.e ? "e" : null, group: input.g ? "g" : null } };
  } else {
    series = readSeries(parseCsv(input.csv), o);
  }
  const { t, y, e, g } = series;
  const n = t.length;
  if (n < 8) throw new Error(`Need at least 8 usable rows; found ${n}.`);
  if (n > MAX_POINTS) throw new Error(`At most ${MAX_POINTS.toLocaleString("en-US")} rows; found ${n.toLocaleString("en-US")}.`);
  for (let i = 0; i < n; i++) if (!Number.isFinite(t[i]) || !Number.isFinite(y[i]) || !(e[i] > 0)) throw new Error(`Row ${i + 1} has a missing or bad number.`);
  if (!(o.jitter >= 0)) throw new Error("Jitter must be zero or more.");
  const P = prepare(t, y, { e, g, jitter: Number(o.jitter) || 0 });
  if (!(P.baseline > 0)) throw new Error("Every time is the same; a periodogram needs a span of times.");
  const warnings = [];
  for (let k = 0; k < P.G; k++) {
    const cnt = P.idx.reduce((a, v) => a + (v === k), 0);
    if (cnt < 3) warnings.push(`Group "${P.names[k]}" has only ${cnt} point${cnt === 1 ? "" : "s"}; its offset absorbs ${cnt === 1 ? "it" : "them"} entirely.`);
  }
  if (P.n - P.G - 2 < 3) throw new Error("Too few points for the number of groups: each group costs one offset.");
  const sorted = Float64Array.from(t).sort();
  const gaps = [];
  for (let i = 1; i < n; i++) if (sorted[i] > sorted[i - 1]) gaps.push(sorted[i] - sorted[i - 1]);
  const medGap = gaps.length ? median(gaps) : P.baseline / n;
  const T = P.baseline;
  let maxPeriod = o.maxPeriod != null && o.maxPeriod !== "" ? Number(o.maxPeriod) : T;
  let minPeriod = o.minPeriod != null && o.minPeriod !== "" ? Number(o.minPeriod) : 2 * medGap;
  if (!(minPeriod > 0) || !(maxPeriod > minPeriod)) throw new Error("The shortest period must be above zero and below the longest.");
  let oversample = Number(o.oversample) || 5;
  if (!(oversample >= 1 && oversample <= 50)) throw new Error("Oversampling must be between 1 and 50.");
  const fmin = 1 / maxPeriod;
  let fmax = 1 / minPeriod;
  let df = 1 / (oversample * T);
  let nf = Math.floor((fmax - fmin) / df) + 1;
  if (n * nf > MAX_WORK) {
    const lowered = Math.max(2, Math.floor(MAX_WORK / (n * nf / oversample)));
    if (lowered < oversample) {
      warnings.push(`The grid would hold ${nf.toLocaleString("en-US")} frequencies; oversampling lowered from ${oversample} to ${lowered} to stay fast.`);
      oversample = lowered;
      df = 1 / (oversample * T);
      nf = Math.floor((fmax - fmin) / df) + 1;
    }
    if (n * nf > MAX_WORK) {
      nf = Math.floor(MAX_WORK / n);
      fmax = fmin + (nf - 1) * df;
      minPeriod = 1 / fmax;
      warnings.push(`Grid capped: the shortest period searched is ${fmt(minPeriod)} (raise it, or use fewer points, to search shorter).`);
    }
  }
  if (nf < 3) throw new Error("The period range is too narrow for this baseline; widen it.");
  if (o.minPeriod == null || o.minPeriod === "") warnings.push(`Shortest period searched: ${fmt(minPeriod)}, twice the median gap between samples. Uneven sampling has no true Nyquist limit, so shorter periods can be real; set a shorter period to search them.`);

  // first periodogram
  const power = periodogram(P, fmin, df, nf);
  const fapOf = (z) => baluevFap(z, { n: P.n, groups: P.G, fmax, varT: P.varT });
  const peakIdx = findPeaks(power, Math.max(1, Math.min(50, Number(o.top) || 10)), Math.max(1, Math.round(oversample / 2)));
  const peaks = peakIdx.map((k) => {
    const r = refinePeak(P, fmin + k * df, df);
    return { frequency: r.f, period: 1 / r.f, power: r.power, fap: fapOf(r.power) };
  });

  // spectral window, on frequencies from 0 to fmax, to read aliases
  const wnf = Math.min(nf + Math.floor(fmin / df), Math.floor(MAX_WORK / n));
  const win = spectralWindow(P, 0, df, wnf);
  const winPeaksIdx = findPeaks(win, 8, Math.max(1, Math.round(oversample))).filter((k) => k * df > 1.5 / T);
  const windowPeaks = winPeaksIdx.slice(0, 4).map((k) => ({ frequency: k * df, period: 1 / (k * df), power: win[k] }));

  // pre-whitening: find, fit, remove, repeat
  const signals = [];
  let resid = Float64Array.from(P.y);
  const maxSignals = Math.max(1, Math.min(10, Number(o.signals) || 1));
  const fapLevel = Number(o.fapLevel) || 0.01;
  let residPower = null;
  for (let s = 0; s < maxSignals; s++) {
    let yr = new Float64Array(P.n);
    const gm = new Float64Array(P.G);
    for (let i = 0; i < P.n; i++) gm[P.idx[i]] += P.w[i] * resid[i];
    for (let k = 0; k < P.G; k++) gm[k] /= P.Wg[k];
    let YY = 0;
    for (let i = 0; i < P.n; i++) {
      yr[i] = resid[i] - gm[P.idx[i]];
      YY += P.w[i] * yr[i] * yr[i];
    }
    if (!(YY > 0)) break;
    const pw = s === 0 ? power : periodogram(P, fmin, df, nf, yr, YY);
    if (s > 0) residPower = pw;
    let kb = 0;
    for (let k = 1; k < nf; k++) if (pw[k] > pw[kb]) kb = k;
    const r = refinePeak(P, fmin + kb * df, df, yr, YY);
    const fap = fapOf(r.power);
    if (s > 0 && fap.fap > fapLevel) {
      signals.push({ stopped: true, period: 1 / r.f, frequency: r.f, power: r.power, fap });
      break;
    }
    const fit = fitSinusoid(P, r.f, resid);
    const amplitude = Math.hypot(fit.a, fit.b);
    const before = resid;
    resid = new Float64Array(P.n);
    for (let i = 0; i < P.n; i++) resid[i] = before[i] - fit.model[i] + fit.offsets[P.idx[i]];
    // scatter of what is left after this signal and the offsets
    let rss = 0;
    let wsum = 0;
    const off = new Float64Array(P.G);
    for (let i = 0; i < P.n; i++) off[P.idx[i]] += P.w[i] * resid[i];
    for (let k = 0; k < P.G; k++) off[k] /= P.Wg[k];
    for (let i = 0; i < P.n; i++) {
      rss += (resid[i] - off[P.idx[i]]) ** 2;
      wsum++;
    }
    const sigmaRes = Math.sqrt(rss / Math.max(1, wsum - P.G - 2));
    const sigmaF = (Math.sqrt(6 / P.n) * sigmaRes) / (Math.PI * T * amplitude);
    // phase: time of maximum, as a date near the middle of the data
    const phi = Math.atan2(fit.b, fit.a); // a cos + b sin = A cos(om t - phi)
    const tMaxC = phi / (2 * Math.PI * r.f);
    // aliases of this signal through each strong window peak
    const aliases = [];
    for (const wp of windowPeaks) {
      if (wp.power < 0.1) continue;
      for (const fa of [r.f + wp.frequency, Math.abs(r.f - wp.frequency)]) {
        if (fa < fmin || fa > fmax) continue;
        const ap = powerAt(P, fa, yr, YY);
        const near = refinePeak(P, fa, df, yr, YY);
        aliases.push({ frequency: near.f, period: 1 / near.f, power: Math.max(ap, near.power), via: wp.period, ratio: Math.max(ap, near.power) / r.power });
      }
    }
    aliases.sort((a, b) => b.ratio - a.ratio);
    signals.push({
      period: 1 / r.f,
      frequency: r.f,
      power: r.power,
      fap,
      amplitude,
      a: fit.a,
      b: fit.b,
      offsets: Object.fromEntries(P.names.map((nm, k) => [nm, fit.offsets[k]])),
      timeOfMax: tMaxC + P.tm,
      periodError: sigmaF / (r.f * r.f),
      residualScatter: sigmaRes,
      aliases: aliases.slice(0, 4),
      ambiguous: aliases.some((a) => a.ratio > 0.8),
    });
  }

  const found = signals.filter((s) => !s.stopped);
  const summary = describe(found, signals.find((s) => s.stopped), series, P, { minPeriod, maxPeriod });
  return {
    n: P.n,
    skipped: series.skipped,
    groups: P.names.map((nm, k) => ({ name: nm, count: P.idx.reduce((a, v) => a + (v === k), 0), mean: P.Yg[k] })),
    columns: series.columns,
    baseline: T,
    medianGap: medGap,
    grid: { fmin, fmax, df, nf, oversample, minPeriod, maxPeriod },
    fapParams: { n: P.n, groups: P.G, fmax, varT: P.varT },
    frequency: Array.from(power),
    residualPower: residPower ? Array.from(residPower) : null,
    window: Array.from(win),
    windowPeaks,
    peaks,
    signals,
    found,
    warnings,
    summary,
    times: Array.from(t),
    values: Array.from(y),
    errors: Array.from(e),
    groupOf: Array.from(P.idx),
    tShift: P.tm,
  };
}

function describe(found, stopped, series, P, { minPeriod, maxPeriod }) {
  const unit = series.columns.timeKind === "date" ? " days" : "";
  const lines = [];
  if (!found.length) return "No period found.";
  const s0 = found[0];
  const sure = s0.fap.fap < 0.01 ? "very unlikely to be noise alone" : s0.fap.fap < 0.1 ? "possibly noise" : "consistent with noise";
  lines.push(`The strongest period is ${fmt(s0.period)}${unit} (amplitude ${fmt(s0.amplitude, 3)}, power ${s0.power.toFixed(3)}, false alarm probability ${fmtFap(s0.fap)}: ${sure}).`);
  for (let i = 1; i < found.length; i++) {
    const s = found[i];
    lines.push(`With ${i === 1 ? "it" : "those"} removed, the next is ${fmt(s.period)}${unit} (amplitude ${fmt(s.amplitude, 3)}, FAP ${fmtFap(s.fap)}).`);
  }
  if (stopped) lines.push(`After that the highest peak, ${fmt(stopped.period)}${unit}, has FAP ${fmtFap(stopped.fap)}, so the search stopped.`);
  const amb = found.filter((s) => s.ambiguous);
  if (amb.length) lines.push(`Check aliases: ${amb.map((s) => `${fmt(s.period)}${unit} has a sampling alias at ${fmt(s.aliases[0].period)}${unit} with ${(s.aliases[0].ratio * 100).toFixed(0)}% of its power`).join("; ")}.`);
  lines.push(`Searched periods ${fmt(minPeriod)} to ${fmt(maxPeriod)}${unit} over ${P.n} points${P.G > 1 ? ` in ${P.G} groups, each with its own offset` : ""}.`);
  return lines.join(" ");
}

export function csvCell(c) {
  const s = String(c);
  const t = /^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

// The first periodogram (and the window) as CSV.
export function toCsv(r) {
  const out = ["frequency,period,power,window_power" + (r.residualPower ? ",power_after_first_signal" : "")];
  const { fmin, df, nf } = r.grid;
  const w0 = Math.round(fmin / df);
  for (let k = 0; k < nf; k++) {
    const f = fmin + k * df;
    const wv = r.window[w0 + k];
    out.push([f.toPrecision(10), (1 / f).toPrecision(10), r.frequency[k].toPrecision(8), wv == null ? "" : wv.toPrecision(8), ...(r.residualPower ? [r.residualPower[k].toPrecision(8)] : [])].join(","));
  }
  return out.join("\n") + "\n";
}

// The signals as a plain-text report.
export function report(r) {
  const lines = [r.summary, ""];
  r.found.forEach((s, i) => {
    lines.push(`Signal ${i + 1}: period ${fmt(s.period, 6)} +/- ${fmt(s.periodError, 2)}, amplitude ${fmt(s.amplitude, 4)}, power ${s.power.toFixed(4)}, FAP ${fmtFap(s.fap)}, time of maximum ${fmt(s.timeOfMax, 10)}`);
    for (const a of s.aliases) lines.push(`  alias via the ${fmt(a.via)} window peak: period ${fmt(a.period)} with ${(a.ratio * 100).toFixed(0)}% of the power`);
  });
  if (r.warnings.length) lines.push("", ...r.warnings.map((w) => `Note: ${w}`));
  return lines.join("\n");
}
