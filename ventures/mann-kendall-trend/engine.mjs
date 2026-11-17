// Mann-Kendall trend test with Sen's slope: is this series going up or down,
// by how much per year, and is that more than noise, autocorrelation or the
// seasons would give?
//
// The Mann-Kendall statistic S counts, over every pair of measurements, +1
// when the later one is higher and -1 when it is lower (Mann 1945; Kendall
// 1975). Under no trend S has mean 0 and a known variance, so Z = (S -/+ 1) /
// sqrt(Var S) is close to standard normal. Sen's (1968) slope is the median of
// the pairwise slopes, with a distribution-free confidence interval from the
// same variance. Serial correlation inflates Var S: the Hamed & Rao (1998) and
// Yue & Wang (2004) corrections scale it, and trend-free pre-whitening (Yue et
// al. 2002) removes lag-1 correlation first. Seasonal data use the seasonal
// Kendall test (Hirsch, Slack & Smith 1982), with the covariance between
// seasons of Hirsch & Slack (1984) and the homogeneity test of van Belle &
// Hughes (1984). Pure functions, no DOM, no network.

export const PAPERS = [
  {
    authors: "Henry B. Mann",
    title: "Nonparametric tests against trend",
    venue: "Econometrica 13(3), 245-259",
    year: 1945,
    url: "https://doi.org/10.2307/1907187",
    doi: "10.2307/1907187",
    implemented: "The test statistic S = sum over pairs i < j of sign(x_j - x_i), the count of later-higher pairs minus later-lower pairs, as a test against a monotonic trend.",
    deviations: "Pairs are ordered by the time column, sign(t_j - t_i) sign(x_j - x_i), so unsorted rows and tied times are handled; a pair at the same time counts 0.",
  },
  {
    authors: "Maurice G. Kendall",
    title: "Rank Correlation Methods (4th edition)",
    venue: "Charles Griffin, London",
    year: 1975,
    url: "https://archive.org/details/rankcorrelationm0000kend",
    implemented: "The null variance of S with ties, Var S = [n(n-1)(2n+5) - sum_t t(t-1)(2t+5) - sum_u u(u-1)(2u+5)]/18 + [sum t(t-1)(t-2)][sum u(u-1)(u-2)]/[9n(n-1)(n-2)] + [sum t(t-1)][sum u(u-1)]/[2n(n-1)] over tied groups t of values and u of times; the continuity-corrected normal approximation; and the exact null distribution of S without ties (the count of permutations by inversions), used for the p-value when n <= 20.",
    deviations: "With no tied times the variance is the usual Mann-Kendall form [n(n-1)(2n+5) - sum t(t-1)(2t+5)]/18.",
  },
  {
    authors: "Pranab Kumar Sen",
    title: "Estimates of the regression coefficient based on Kendall's tau",
    venue: "Journal of the American Statistical Association 63(324), 1379-1389",
    year: 1968,
    url: "https://doi.org/10.1080/01621459.1968.10480934",
    doi: "10.1080/01621459.1968.10480934",
    implemented: "The slope estimate as the median of all pairwise slopes (x_j - x_i)/(t_j - t_i), t_j > t_i (Theil 1950), and its distribution-free confidence interval: with N slopes sorted and C = z_(1-a/2) sqrt(Var S), the limits are the slopes of rank round((N - C)/2) and round((N + C)/2) + 1.",
    deviations: "The interval uses the same Var S as the chosen test, so it widens with the autocorrelation correction; with no correction it equals scipy.stats.theilslopes. The intercept is median(x) - slope median(t) (Conover 1980), so the line passes through the median point.",
  },
  {
    authors: "Khaled H. Hamed, A. Ramachandra Rao",
    title: "A modified Mann-Kendall trend test for autocorrelated data",
    venue: "Journal of Hydrology 204(1-4), 182-196",
    year: 1998,
    url: "https://doi.org/10.1016/S0022-1694(97)00125-X",
    doi: "10.1016/S0022-1694(97)00125-X",
    implemented: "The variance correction for serial correlation: remove Sen's trend, rank the residuals, and multiply Var S by n/n* = 1 + 2/(n(n-1)(n-2)) sum_k (n-k)(n-k-1)(n-k-2) rho_k over the lags k whose rank autocorrelation rho_k lies outside +/- z_(1-a/2)/sqrt(n).",
    deviations: "Two variants: every lag 1 to n-1 screened (pymannkendall's default) or only the first three. In this tool's simulations on trend-free AR(1) noise both still reject too often when lag-1 correlation is strong (19% at phi = 0.6 and n = 100 for the all-lag screen, 11% for the first three lags, against a nominal 5%; eval/size-simulation.json), so it is not the default. Lags count rows, so the correction assumes roughly even spacing, and the tool warns when spacing is uneven.",
  },
  {
    authors: "Sheng Yue, ChunYuan Wang",
    title: "The Mann-Kendall test modified by effective sample size to detect trend in serially correlated hydrological series",
    venue: "Water Resources Management 18(3), 201-218",
    year: 2004,
    url: "https://doi.org/10.1023/B:WARM.0000043140.61082.60",
    doi: "10.1023/B:WARM.0000043140.61082.60",
    implemented: "The effective-sample-size correction: multiply Var S by n/n* = 1 + 2 sum_k (1 - k/n) rho_k, rho_k the autocorrelation of the Sen-detrended values (not their ranks), with the lag-1 (AR(1)) model rho_k = r1^k. This is the default.",
    deviations: "pymannkendall's default sums every sample autocorrelation instead; those sum to -1/2 for any centred series, which drags the factor towards zero or below, and in simulation it rejects 45-58% of trend-free series at alpha = 0.05, white noise included. The tool uses the AR(1) form (5-9% for phi up to 0.6 and 6-13% at 0.8 in eval/size-simulation.json) and keeps the all-lag sum only as a tested function (yueWangFactor(resid, \"all\")), not as an option.",
  },
  {
    authors: "Sheng Yue, Paul Pilon, Bob Phinney, George Cavadias",
    title: "The influence of autocorrelation on the ability to detect trend in hydrological series",
    venue: "Hydrological Processes 16(9), 1807-1829",
    year: 2002,
    url: "https://doi.org/10.1002/hyp.1095",
    doi: "10.1002/hyp.1095",
    implemented: "Trend-free pre-whitening: remove Sen's trend, take the lag-1 autocorrelation r1 of what is left, form y_i = e_i - r1 e_(i-1), add the trend back, and run the Mann-Kendall test on the n - 1 values.",
    deviations: "None beyond using the times as given; the lag is one row. Offered for comparison, not as the default: in eval/size-simulation.json it rejects 40% of trend-free series at phi = 0.6 and n = 100, more than no correction at all (30%).",
  },
  {
    authors: "Robert M. Hirsch, James R. Slack, Richard A. Smith",
    title: "Techniques of trend analysis for monthly water quality data",
    venue: "Water Resources Research 18(1), 107-121",
    year: 1982,
    url: "https://doi.org/10.1029/WR018i001p00107",
    doi: "10.1029/WR018i001p00107",
    implemented: "The seasonal Kendall test: S and Var S computed within each season (month or quarter) and summed, so the seasonal cycle cannot pose as a trend, and the seasonal Kendall slope, the median of all within-season pairwise slopes.",
    deviations: "Seasons may also come from a column (any labels); several values in one season of one year are allowed and compared by time.",
  },
  {
    authors: "Robert M. Hirsch, James R. Slack",
    title: "A nonparametric trend test for seasonal data with serial dependence",
    venue: "Water Resources Research 20(6), 727-732",
    year: 1984,
    url: "https://doi.org/10.1029/WR020i006p00727",
    doi: "10.1029/WR020i006p00727",
    implemented: "The covariance between seasons' statistics, sigma_gh = [K_gh + 4 sum_i R_ig R_ih - n(n_g + 1)(n_h + 1)]/3, with K_gh = sum_(i<j) sign((x_jg - x_ig)(x_jh - x_ih)) and R_ig = (n_g + 1 + sum_j sign(x_ig - x_jg))/2 over years i, j, a missing value counting 0 in the signs; Var S is the sum of the whole matrix.",
    deviations: "Applied by default when there are at least 10 years, the length the paper found the test holds its size at. Needs one value per season per year; with more, the tool falls back to independent seasons and says so.",
  },
  {
    authors: "Gerald van Belle, James P. Hughes",
    title: "Nonparametric tests for trend in water quality",
    venue: "Water Resources Research 20(1), 127-136",
    year: 1984,
    url: "https://doi.org/10.1029/WR020i001p00127",
    doi: "10.1029/WR020i001p00127",
    implemented: "The test that the seasons share one trend: with Z_g = S_g / sqrt(Var S_g), chi2_homog = sum Z_g^2 - M mean(Z)^2 on M - 1 degrees of freedom. A small p-value says the seasons trend differently, so one overall slope misleads.",
    deviations: "None; the page shows each season's own test and slope beside it.",
  },
];

export const DEFAULTS = {
  timeColumn: null, // null = the first column of dates or numbers
  valueColumn: null, // null = the first other numeric column
  seasons: "auto", // "auto" (monthly dates -> month), "none", "month", "quarter"
  seasonColumn: null, // a column whose values name the season; overrides `seasons`
  correction: "yue-wang", // "none", "yue-wang" (AR(1) form), "hamed-rao", "hamed-rao-3", "tfpw"; single series only
  covariance: "auto", // seasonal test: "auto" (on with >= 10 years), "on", "off"
  alpha: 0.05, // significance level of the test, also used for the lag screen
  confidence: 0.95, // of Sen's slope interval
};

export const CORRECTIONS = ["none", "yue-wang", "hamed-rao", "hamed-rao-3", "tfpw"];
const MAX_POINTS = 20000;
const MAX_PAIRS = 8e6; // pairwise slopes held in memory at once
const EXACT_MAX_N = 20;

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
    .replace(/^﻿/, "")
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

const DAYS_IN_MONTH = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12

// ISO dates (2024-03-05, 2024-03, 2024-03-05T14:30Z) to their calendar parts
// and a decimal year in which every month is 1/12 of a year, so the same day
// of the same month is a whole number of years apart in every year. A time
// with no zone is read as UTC, so the result never depends on the clock.
export function parseDate(s) {
  const t = String(s ?? "").trim();
  const m = t.match(/^(\d{4})-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = m[3] ? Number(m[3]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH(year, month)) return null;
  let minutes = Number(m[4] || 0) * 60 + Number(m[5] || 0) + Number(m[6] || 0) / 60;
  if (m[7] && m[7] !== "Z") {
    const z = m[7].replace(":", "");
    minutes -= (z[0] === "-" ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)));
  }
  const ms = Date.UTC(year, month - 1, day) + minutes * 60000;
  const d = new Date(ms);
  const Y = d.getUTCFullYear();
  const M = d.getUTCMonth() + 1;
  const dayFrac = (d.getUTCDate() - 1 + (d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60) / 1440) / DAYS_IN_MONTH(Y, M);
  return { year: Y, month: M, days: ms / 86400000, decimalYear: Y + (M - 1 + dayFrac) / 12 };
}

const CENSORED = /^\s*[<>]\s*\d/;

export function profileColumns(parsed) {
  return parsed.header.map((name, j) => {
    let nums = 0;
    let dates = 0;
    let filled = 0;
    for (const r of parsed.rows) {
      const v = r[j];
      if (v == null || v.trim() === "") continue;
      filled++;
      if (Number.isFinite(toNumber(v)) || CENSORED.test(v)) nums++;
      else if (parseDate(v)) dates++;
    }
    const kind = filled === 0 ? "empty" : nums >= 0.9 * filled ? "number" : dates >= 0.9 * filled ? "date" : "text";
    return { name, index: j, kind };
  });
}

function pick(cols, want, label) {
  if (want == null || want === "") return null;
  const c = cols.find((c) => c.name === want) || cols.find((c) => c.name.toLowerCase() === String(want).toLowerCase());
  if (!c) throw new Error(`No column named "${want}" for ${label}. Columns: ${cols.map((c) => c.name).join(", ")}.`);
  return c;
}

// Rows to { t, x, year, month, label }, sorted by time.
export function readSeries(parsed, opts = {}) {
  const cols = profileColumns(parsed);
  let tCol = pick(cols, opts.timeColumn, "the time");
  if (!tCol) tCol = cols.find((c) => c.kind === "date") || cols.find((c) => c.kind === "number");
  if (!tCol || (tCol.kind !== "number" && tCol.kind !== "date")) throw new Error("No time column: one column must hold dates (2024-03-05 or 2024-03) or numbers (years, days, sample order).");
  let xCol = pick(cols, opts.valueColumn, "the values");
  const sCol = pick(cols, opts.seasonColumn, "the seasons");
  if (!xCol) xCol = cols.find((c) => c.kind === "number" && c !== tCol && c !== sCol);
  if (!xCol) throw new Error("No value column: a second column must hold the measured numbers.");
  if (xCol === tCol) throw new Error("The time and value columns must differ.");
  if (xCol.kind !== "number") throw new Error(`Column "${xCol.name}" is not numeric.`);
  const rows = [];
  let skipped = 0;
  let censored = 0;
  for (const r of parsed.rows) {
    const raw = r[xCol.index];
    const x = toNumber(raw);
    let t;
    let d = null;
    if (tCol.kind === "date") {
      d = parseDate(r[tCol.index]);
      t = d ? d.decimalYear : NaN;
    } else t = toNumber(r[tCol.index]);
    if (!Number.isFinite(t) || !Number.isFinite(x)) {
      if (CENSORED.test(raw ?? "")) censored++;
      skipped++;
      continue;
    }
    const label = sCol ? String(r[sCol.index] ?? "").trim() || "(blank)" : null;
    rows.push({ t, x, year: d ? d.year : Math.floor(t), month: d ? d.month : null, label });
  }
  rows.sort((a, b) => a.t - b.t);
  return {
    rows,
    skipped,
    censored,
    columns: { time: tCol.name, timeKind: tCol.kind, value: xCol.name, season: sCol?.name ?? null },
  };
}

// ---------- special functions ----------

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularised incomplete gamma P(a, x) and Q(a, x) = 1 - P, each computed
// directly where it is small (series below a + 1, continued fraction above),
// so tail probabilities keep their relative precision.
function gser(a, x) {
  let sum = 1 / a;
  let del = sum;
  let ap = a;
  for (let n = 0; n < 1000; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-17) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
}
function gcf(a, x) {
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - gser(a, x) : gcf(a, x);
}

// Upper tail of the standard normal, P(Z > z), accurate in the far tail.
export function normSf(z) {
  if (z === 0) return 0.5;
  const q = 0.5 * gammaQ(0.5, (z * z) / 2); // erfc(|z|/sqrt 2)/2
  return z > 0 ? q : 1 - q;
}

// Normal quantile: Acklam's rational approximation, then one Halley step.
export function normPpf(p) {
  if (!(p > 0 && p < 1)) throw new Error("normPpf needs 0 < p < 1");
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - 0.02425) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = (x < 0 ? normSf(-x) : 1 - normSf(x)) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

export const chi2Sf = (x, df) => (x <= 0 ? 1 : gammaQ(df / 2, x / 2));

// ---------- the Mann-Kendall pieces ----------

const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

// S = sum_{i<j} sign(t_j - t_i) sign(x_j - x_i).
export function mkScore(t, x) {
  const n = x.length;
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    const ti = t[i];
    const xi = x[i];
    for (let j = i + 1; j < n; j++) s += sgn(t[j] - ti) * sgn(x[j] - xi);
  }
  return s;
}

function tieCounts(a) {
  const m = new Map();
  for (const v of a) m.set(v, (m.get(v) || 0) + 1);
  return [...m.values()].filter((k) => k > 1);
}

// Var S under no trend, with ties in the values and in the times (Kendall 1975, eq. 4.4).
export function varS(t, x) {
  const n = x.length;
  const tx = tieCounts(x);
  const tt = tieCounts(t);
  const f = (ks, g) => ks.reduce((s, k) => s + g(k), 0);
  let v = (n * (n - 1) * (2 * n + 5) - f(tx, (k) => k * (k - 1) * (2 * k + 5)) - f(tt, (k) => k * (k - 1) * (2 * k + 5))) / 18;
  if (tt.length && tx.length && n > 2) {
    v += (f(tx, (k) => k * (k - 1) * (k - 2)) * f(tt, (k) => k * (k - 1) * (k - 2))) / (9 * n * (n - 1) * (n - 2));
    v += (f(tx, (k) => k * (k - 1)) * f(tt, (k) => k * (k - 1))) / (2 * n * (n - 1));
  }
  return { v, tiedValues: tx.reduce((s, k) => s + k, 0), tiedTimes: tt.reduce((s, k) => s + k, 0) };
}

export function zScore(s, v) {
  if (!(v > 0) || s === 0) return 0;
  return s > 0 ? (s - 1) / Math.sqrt(v) : (s + 1) / Math.sqrt(v);
}

// Exact two-sided p-value of S for n values with no ties: S = N - 2D, D the
// number of inversions, whose distribution is built one element at a time.
export function exactP(n, s) {
  const N = (n * (n - 1)) / 2;
  let dist = new Float64Array([1]);
  for (let k = 2; k <= n; k++) {
    const len = dist.length + k - 1;
    const next = new Float64Array(len);
    let run = 0;
    for (let j = 0; j < len; j++) {
      if (j < dist.length) run += dist[j];
      if (j - k >= 0) run -= dist[j - k];
      next[j] = run / k;
    }
    dist = next;
  }
  const dMax = Math.floor((N - Math.abs(s)) / 2); // S >= |s|  <=>  D <= (N - |s|)/2
  let tail = 0;
  for (let j = 0; j <= dMax; j++) tail += dist[j];
  return Math.min(1, 2 * tail);
}

const median = (a) => {
  const s = Float64Array.from(a).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
};

const roundHalfEven = (v) => {
  const r = Math.round(v);
  return Math.abs(v - Math.trunc(v)) === 0.5 && r % 2 !== 0 ? r - 1 : r;
};

// Pairwise slopes (x_j - x_i)/(t_j - t_i) for t_j > t_i within each group of indices.
function pairSlopes(t, x, groups) {
  let count = 0;
  for (const g of groups) count += (g.length * (g.length - 1)) / 2;
  if (count > MAX_PAIRS) throw new Error(`Too many pairs for Sen's slope (${count.toLocaleString("en-US")}; the limit is ${MAX_PAIRS.toLocaleString("en-US")}). Aggregate to fewer points, for example monthly means.`);
  const out = new Float64Array(count);
  let k = 0;
  for (const g of groups) {
    for (let a = 0; a < g.length - 1; a++) {
      const i = g[a];
      for (let b = a + 1; b < g.length; b++) {
        const j = g[b];
        const dt = t[j] - t[i];
        if (dt !== 0) out[k++] = (x[j] - x[i]) / dt;
      }
    }
  }
  return out.subarray(0, k).sort();
}

// Sen's slope, its interval (the scipy.stats.theilslopes rule) and the
// Conover intercept through the median point.
export function senSlope(t, x, { groups = null, variance, confidence = 0.95 } = {}) {
  const idx = groups || [Array.from(x, (_, i) => i)];
  const slopes = pairSlopes(t, x, idx);
  const N = slopes.length;
  if (N === 0) return { slope: NaN, lower: NaN, upper: NaN, intercept: NaN, pairs: 0 };
  const m = N >> 1;
  const slope = N % 2 ? slopes[m] : 0.5 * (slopes[m - 1] + slopes[m]);
  let lower = NaN;
  let upper = NaN;
  if (variance > 0) {
    const z = normPpf((1 - confidence) / 2); // negative
    const sd = Math.sqrt(variance);
    const ru = Math.min(roundHalfEven((N - z * sd) / 2), N - 1);
    const rl = Math.max(roundHalfEven((N + z * sd) / 2) - 1, 0);
    lower = slopes[rl];
    upper = slopes[ru];
  }
  return { slope, lower, upper, intercept: median(x) - slope * median(t), pairs: N };
}

// Autocorrelation at lags 0..nlags with the biased (divide by n) estimator.
export function acf(a, nlags) {
  const n = a.length;
  let mean = 0;
  for (const v of a) mean += v;
  mean /= n;
  const y = Float64Array.from(a, (v) => v - mean);
  const out = new Float64Array(nlags + 1);
  for (let k = 0; k <= nlags; k++) {
    let s = 0;
    for (let i = 0; i + k < n; i++) s += y[i] * y[i + k];
    out[k] = s;
  }
  const c0 = out[0];
  for (let k = 0; k <= nlags; k++) out[k] = c0 > 0 ? out[k] / c0 : 0;
  return out;
}

// Average ranks, 1-based.
export function rankAverage(a) {
  const order = Array.from(a, (_, i) => i).sort((i, j) => a[i] - a[j]);
  const r = new Float64Array(a.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && a[order[j + 1]] === a[order[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[order[k]] = avg;
    i = j + 1;
  }
  return r;
}

// Yue & Wang's variance factor 1 + 2 sum_k (1 - k/n) rho_k of the detrended
// series. "ar1" sets rho_k = r1^k from the lag-1 value; "all" sums every
// sample autocorrelation, as pymannkendall's default does. The sample
// autocorrelations of a centred series sum to -1/2 over all lags, so "all"
// drags the factor towards zero (or below) whatever the data: on simulated
// white noise it rejects 45-48% of the time at alpha = 0.05. It is kept
// for comparison only.
export function yueWangFactor(resid, mode = "ar1") {
  const n = resid.length;
  if (n < 3) return 1;
  let sum = 0;
  if (mode === "all") {
    const rho = acf(resid, n - 1);
    for (let k = 1; k < n; k++) sum += (1 - k / n) * rho[k];
  } else {
    const r1 = acf(resid, 1)[1];
    let rk = 1;
    for (let k = 1; k < n; k++) {
      rk *= r1;
      if (Math.abs(rk) < 1e-17) break;
      sum += (1 - k / n) * rk;
    }
  }
  return 1 + 2 * sum;
}

function pValue(z) {
  return Math.min(1, 2 * normSf(Math.abs(z)));
}

function verdict(z, p, alpha) {
  if (p < alpha && z > 0) return "increasing";
  if (p < alpha && z < 0) return "decreasing";
  return "no trend";
}

// One series, with every correction computed so the page can compare them.
export function mannKendall(t, x, { alpha = 0.05, slope } = {}) {
  const n = x.length;
  const s = mkScore(t, x);
  const { v, tiedValues, tiedTimes } = varS(t, x);
  const pairs = (n * (n - 1)) / 2;
  const tests = {};
  const z0 = zScore(s, v);
  const p0 = pValue(z0);
  const exact = tiedValues === 0 && tiedTimes === 0 && n <= EXACT_MAX_N && n >= 3 ? exactP(n, s) : null;
  tests.none = { name: "Mann-Kendall", s, variance: v, factor: 1, z: z0, p: exact ?? p0, normalP: p0, exactP: exact };

  const resid = Float64Array.from(x, (xi, i) => xi - slope * t[i]);
  // Hamed & Rao (1998): significant lags of the ranks of the detrended series,
  // screened over every lag (pymannkendall's default) or the first three.
  const ranks = rankAverage(resid);
  const rho = acf(ranks, n - 1);
  const bound = normPpf(1 - alpha / 2) / Math.sqrt(n);
  for (const [key, maxLag, name] of [["hamed-rao", n - 1, "Hamed-Rao corrected"], ["hamed-rao-3", Math.min(3, n - 1), "Hamed-Rao, first 3 lags"]]) {
    let sni = 0;
    const significantLags = [];
    for (let k = 1; k <= maxLag; k++) {
      if (rho[k] > bound || rho[k] < -bound) {
        sni += (n - k) * (n - k - 1) * (n - k - 2) * rho[k];
        significantLags.push(k);
      }
    }
    const f = n > 2 ? 1 + (2 / (n * (n - 1) * (n - 2))) * sni : 1;
    const vv = v * f;
    const z = zScore(s, vv);
    const p = significantLags.length === 0 && exact != null ? exact : pValue(z);
    tests[key] = { name, s, variance: vv, factor: f, z, p, significantLags: significantLags.slice(0, 50), significantLagCount: significantLags.length };
  }

  // Yue & Wang (2004): effective sample size, with the AR(1) form rho_k = r1^k.
  const rhoX = acf(resid, Math.min(1, n - 1));
  const r1 = rhoX[1] ?? 0;
  const fYW = yueWangFactor(resid, "ar1");
  const vYW = v * fYW;
  const zYW = zScore(s, vYW);
  tests["yue-wang"] = { name: "Yue-Wang corrected (AR(1))", s, variance: vYW, factor: fYW, z: zYW, p: pValue(zYW), lag1: r1 };

  // Trend-free pre-whitening (Yue et al. 2002).
  if (n >= 4) {
    const tw = Float64Array.from({ length: n - 1 }, (_, i) => t[i + 1]);
    const xw = Float64Array.from({ length: n - 1 }, (_, i) => resid[i + 1] - r1 * resid[i] + slope * t[i + 1]);
    const sw2 = mkScore(tw, xw);
    const vw = varS(tw, xw).v;
    const zw = zScore(sw2, vw);
    tests.tfpw = { name: "Trend-free pre-whitened", s: sw2, variance: vw, factor: null, z: zw, p: pValue(zw), lag1: r1, n: n - 1 };
  }
  for (const k of Object.keys(tests)) tests[k].trend = verdict(tests[k].z, tests[k].p, alpha);
  return { n, s, tau: s / pairs, varianceNoCorrection: v, tiedValues, tiedTimes, lag1: r1, lag1Ranks: rho[1] ?? 0, lagBound: bound, tests };
}

// Seasonal Kendall: one test per season, summed; covariance across seasons
// from Hirsch & Slack (1984) when there is one value per season per year.
export function seasonalKendall(t, x, season, cycle, { alpha = 0.05, covariance = "auto" } = {}) {
  const labels = [...new Set(season)];
  const groups = labels.map((l) => season.flatMap((s, i) => (s === l ? [i] : [])));
  const per = groups.map((g, k) => {
    const tg = g.map((i) => t[i]);
    const xg = g.map((i) => x[i]);
    const s = mkScore(tg, xg);
    const v = g.length > 1 ? varS(tg, xg).v : 0;
    const z = zScore(s, v);
    return { season: labels[k], n: g.length, s, variance: v, z, zRaw: v > 0 ? s / Math.sqrt(v) : 0, p: v > 0 ? pValue(z) : 1 };
  });
  const S = per.reduce((a, b) => a + b.s, 0);
  const vInd = per.reduce((a, b) => a + b.variance, 0);
  const denom = per.reduce((a, b) => a + (b.n * (b.n - 1)) / 2, 0);

  // Homogeneity of trend across seasons (van Belle & Hughes 1984).
  const used = per.filter((p) => p.variance > 0);
  const M = used.length;
  const chiTotal = used.reduce((a, b) => a + b.zRaw * b.zRaw, 0);
  const zBar = M ? used.reduce((a, b) => a + b.zRaw, 0) / M : 0;
  const chiTrend = M * zBar * zBar;
  const chiHomog = chiTotal - chiTrend;
  const homogeneity = M > 1 ? { chi2: chiHomog, df: M - 1, p: chi2Sf(chiHomog, M - 1) } : null;

  // Hirsch-Slack covariance needs a years x seasons table with at most one value per cell.
  const years = [...new Set(cycle)].sort((a, b) => a - b);
  const yi = new Map(years.map((y, i) => [y, i]));
  let oneEach = true;
  const table = labels.map(() => new Array(years.length).fill(NaN));
  for (let i = 0; i < x.length; i++) {
    const g = labels.indexOf(season[i]);
    const r = yi.get(cycle[i]);
    if (!Number.isNaN(table[g][r])) oneEach = false;
    table[g][r] = x[i];
  }
  const wantCov = covariance === "on" || (covariance === "auto" && years.length >= 10);
  let vCov = null;
  let covNote = null;
  if (wantCov && !oneEach) covNote = "More than one value falls in some season of some year, so the seasons are treated as independent (the Hirsch-Slack covariance needs one value per season per year; aggregate first, for example to monthly means).";
  else if (wantCov) {
    const n = years.length;
    const R = table.map((col) => {
      const ng = col.filter((v) => !Number.isNaN(v)).length;
      return col.map((v) => {
        if (Number.isNaN(v)) return (ng + 1) / 2;
        let s = 0;
        for (const w of col) if (!Number.isNaN(w)) s += sgn(v - w);
        return (ng + 1 + s) / 2;
      });
    });
    const ngs = table.map((col) => col.filter((v) => !Number.isNaN(v)).length);
    let total = 0;
    for (let g = 0; g < labels.length; g++) {
      for (let h = g; h < labels.length; h++) {
        const a = table[g];
        const b = table[h];
        let K = 0;
        for (let i = 0; i < n - 1; i++) {
          if (Number.isNaN(a[i]) || Number.isNaN(b[i])) continue;
          for (let j = i + 1; j < n; j++) {
            if (Number.isNaN(a[j]) || Number.isNaN(b[j])) continue;
            K += sgn((a[j] - a[i]) * (b[j] - b[i]));
          }
        }
        let rr = 0;
        for (let i = 0; i < n; i++) rr += R[g][i] * R[h][i];
        const cov = (K + 4 * rr - n * (ngs[g] + 1) * (ngs[h] + 1)) / 3;
        total += g === h ? cov : 2 * cov;
      }
    }
    if (total > 0) vCov = total;
    else covNote = "The between-season covariance came out non-positive, so the seasons are treated as independent.";
  } else if (covariance === "auto") covNote = `Only ${years.length} year${years.length === 1 ? "" : "s"}: the seasons are treated as independent (Hirsch and Slack found their covariance correction holds its size from about 10 years).`;

  const tests = {};
  const zI = zScore(S, vInd);
  tests.independent = { name: "Seasonal Kendall", s: S, variance: vInd, factor: 1, z: zI, p: pValue(zI) };
  if (vCov != null) {
    const zC = zScore(S, vCov);
    tests.covariance = { name: "Seasonal Kendall, Hirsch-Slack covariance", s: S, variance: vCov, factor: vCov / vInd, z: zC, p: pValue(zC) };
  }
  for (const k of Object.keys(tests)) tests[k].trend = verdict(tests[k].z, tests[k].p, alpha);
  for (const p of per) p.trend = verdict(p.z, p.p, alpha);
  return { labels, groups, per, s: S, tau: denom ? S / denom : 0, homogeneity, tests, years: years.length, covarianceNote: covNote };
}

// ---------- formatting ----------

export const fmt = (v, digits = 4) => {
  if (v == null || !Number.isFinite(v)) return String(v);
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e9 || a < 1e-4) return v.toExponential(Math.max(0, digits - 1));
  return Number(v.toPrecision(digits)).toLocaleString("en-US", { maximumFractionDigits: 10 });
};
export const fmtSigned = (v, digits = 3) => (Number.isFinite(v) && v > 0 ? "+" : "") + fmt(v, digits);
export function fmtP(p) {
  if (p == null || !Number.isFinite(p)) return "n/a";
  if (p < 1e-300) return "< 1e-300";
  if (p < 1e-4) return p.toExponential(1);
  if (p < 0.001) return p.toFixed(5).replace(/0+$/, "");
  return p < 0.01 ? p.toFixed(4) : p.toFixed(3);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function median1(a) {
  return a.length ? median(a) : NaN;
}

// ---------- top level ----------

export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  if (!CORRECTIONS.includes(o.correction)) throw new Error(`Unknown correction "${o.correction}": use ${CORRECTIONS.join(", ")}.`);
  if (!["auto", "none", "month", "quarter"].includes(o.seasons)) throw new Error(`Unknown seasons "${o.seasons}": use auto, none, month or quarter.`);
  if (!["auto", "on", "off"].includes(o.covariance)) throw new Error(`Unknown covariance "${o.covariance}": use auto, on or off.`);
  if (!(o.alpha > 0 && o.alpha < 0.5)) throw new Error("alpha must be between 0 and 0.5, for example 0.05.");
  if (!(o.confidence > 0.5 && o.confidence < 1)) throw new Error("confidence must be between 0.5 and 1, for example 0.95.");

  let series;
  if (o.csv != null) series = readSeries(parseCsv(o.csv), o);
  else {
    const t = o.t ?? o.time;
    const x = o.x ?? o.y ?? o.values;
    if (!Array.isArray(x)) throw new Error('Give {"csv": "..."} or arrays {"t": [...], "x": [...]} (t optional, x the values).');
    const tt = Array.isArray(t) ? t : x.map((_, i) => i + 1);
    if (tt.length !== x.length) throw new Error("t and x must have the same length.");
    const season = Array.isArray(o.season) ? o.season : null;
    if (season && season.length !== x.length) throw new Error("season must have the same length as x.");
    const rows = [];
    let skipped = 0;
    for (let i = 0; i < x.length; i++) {
      const ti = Number(tt[i]);
      const xi = x[i] === null || x[i] === "" ? NaN : Number(x[i]);
      if (!Number.isFinite(ti) || !Number.isFinite(xi)) {
        skipped++;
        continue;
      }
      rows.push({ t: ti, x: xi, year: Math.floor(ti), month: null, label: season ? String(season[i]) : null });
    }
    rows.sort((a, b) => a.t - b.t);
    series = { rows, skipped, censored: 0, columns: { time: "t", timeKind: "number", value: "x", season: season ? "season" : null } };
  }
  const { rows, columns } = series;
  const n = rows.length;
  if (n < 4) throw new Error(`Need at least 4 readings with a time and a value; found ${n}.`);
  if (n > MAX_POINTS) throw new Error(`Up to ${MAX_POINTS.toLocaleString("en-US")} readings; found ${n.toLocaleString("en-US")}. Aggregate first, for example to monthly means.`);
  const t = rows.map((r) => r.t);
  const x = rows.map((r) => r.x);
  const warnings = [];
  if (series.censored) warnings.push(`${series.censored} value${series.censored === 1 ? "" : "s"} like "<5" (below a detection limit) ${series.censored === 1 ? "was" : "were"} skipped. Dropping non-detects biases the trend; this tool does not model censored data.`);

  // Gaps: median spacing, and whether it is even enough for lag-based corrections.
  const gaps = [];
  for (let i = 1; i < n; i++) if (t[i] > t[i - 1]) gaps.push(t[i] - t[i - 1]);
  const medGap = median1(gaps);
  const uneven = gaps.length ? gaps.filter((g) => g > 1.5 * medGap || g < 0.5 * medGap).length / gaps.length : 0;

  // Seasons.
  let seasonMode = "none";
  if (columns.season) seasonMode = "column";
  else if (o.seasons === "month" || o.seasons === "quarter") seasonMode = o.seasons;
  else if (o.seasons === "auto" && columns.timeKind === "date" && medGap > 25 / 365.25 && medGap < 35 / 365.25) seasonMode = "month";
  if ((seasonMode === "month" || seasonMode === "quarter") && columns.timeKind !== "date") throw new Error(`Seasons by ${seasonMode} need a date column (2024-03-05 or 2024-03); give a season column instead.`);
  const season = seasonMode === "none" ? null : rows.map((r) => (seasonMode === "column" ? r.label : seasonMode === "month" ? MONTHS[r.month - 1] : `Q${Math.ceil(r.month / 3)}`));
  const unit = columns.timeKind === "date" ? "year" : "time unit";
  const span = t[n - 1] - t[0];
  if (!(span > 0)) throw new Error("Every reading has the same time; a trend needs readings at different times.");

  let result;
  if (!season) {
    const sen0 = senSlope(t, x, { confidence: o.confidence });
    const mk = mannKendall(t, x, { alpha: o.alpha, slope: sen0.slope });
    const chosen = mk.tests[o.correction] ?? mk.tests.none;
    const sen = senSlope(t, x, { confidence: o.confidence, variance: o.correction === "tfpw" ? mk.varianceNoCorrection : chosen.variance });
    if (o.correction !== "none" && uneven > 0.2) warnings.push(`The spacing between readings is uneven (${Math.round(uneven * 100)}% of gaps are far from the median gap). The autocorrelation corrections count lags in rows, so treat their p-values as rough.`);
    if (o.correction === "none" && Math.abs(mk.lag1Ranks) > mk.lagBound) warnings.push(`Neighbouring readings are correlated (lag-1 autocorrelation ${fmt(mk.lag1Ranks, 2)} after removing the trend), which makes the uncorrected p-value too small. Choose a correction.`);
    if (mk.tiedValues > n / 2) warnings.push(`${mk.tiedValues} of ${n} values are tied with another; the variance accounts for ties, but heavy rounding weakens the test.`);
    result = { mode: "single", ...mk, test: { key: o.correction, ...chosen }, sen };
  } else {
    const cycle = rows.map((r) => r.year);
    const sk = seasonalKendall(t, x, season, cycle, { alpha: o.alpha, covariance: o.covariance });
    if (sk.labels.length < 2) throw new Error("Only one season found; use seasons \"none\" for a single series.");
    const testKey = sk.tests.covariance ? "covariance" : "independent";
    const chosen = sk.tests[testKey];
    const sen = senSlope(t, x, { groups: sk.groups, confidence: o.confidence, variance: chosen.variance });
    for (let k = 0; k < sk.per.length; k++) {
      const g = sk.groups[k];
      const ps = senSlope(g.map((i) => t[i]), g.map((i) => x[i]), { confidence: o.confidence });
      sk.per[k].slope = ps.slope;
      sk.per[k].median = median1(g.map((i) => x[i]));
    }
    if (sk.covarianceNote) warnings.push(sk.covarianceNote);
    if (sk.homogeneity && sk.homogeneity.p < o.alpha) warnings.push(`The seasons do not share one trend (homogeneity chi-square ${fmt(sk.homogeneity.chi2, 3)} on ${sk.homogeneity.df} df, p = ${fmtP(sk.homogeneity.p)}). Read the per-season table: one overall slope hides seasons moving differently.`);
    if (o.correction !== DEFAULTS.correction && o.correction !== "none") warnings.push("The serial-correlation corrections apply to a single series; with seasons the Hirsch-Slack covariance plays that role.");
    result = { mode: "seasonal", seasonMode, n, s: sk.s, tau: sk.tau, seasonal: { per: sk.per, homogeneity: sk.homogeneity, years: sk.years }, tests: sk.tests, test: { key: testKey, ...chosen }, sen };
    delete result.seasonal.groups;
  }

  const med = median1(x);
  const relative = med !== 0 ? (100 * result.sen.slope) / Math.abs(med) : null;
  const change = result.sen.slope * span;
  const out = {
    ...result,
    n,
    skipped: series.skipped,
    columns,
    unit,
    span,
    start: t[0],
    end: t[n - 1],
    median: med,
    percentPerUnit: relative,
    change,
    alpha: o.alpha,
    confidence: o.confidence,
    correction: o.correction,
    warnings,
    times: t,
    values: x,
    seasonOf: season,
  };
  out.summary = describe(out);
  return out;
}

function describe(r) {
  const u = r.unit;
  const p = r.test.p;
  const sen = r.sen;
  const how = r.mode === "seasonal" ? `${r.test.name} test across ${r.seasonal.per.length} seasons${r.seasonMode === "month" ? " (months)" : ""}` : r.test.key === "none" ? (r.test.exactP != null ? "Mann-Kendall test, exact p-value" : "Mann-Kendall test") : `Mann-Kendall test, ${r.test.name}`;
  const dir = r.test.trend;
  const slope = `Sen's slope ${fmtSigned(sen.slope)} ${r.columns.value} per ${u}${Number.isFinite(sen.lower) ? ` (${Math.round(r.confidence * 100)}% interval ${fmtSigned(sen.lower)} to ${fmtSigned(sen.upper)})` : ""}`;
  const rel = r.percentPerUnit != null && Number.isFinite(r.percentPerUnit) ? `, ${fmtSigned(r.percentPerUnit, 2)}% of the median per ${u}` : "";
  const lines = [];
  if (dir === "no trend") lines.push(`No significant trend at the ${fmt(r.alpha * 100, 3)}% level: p = ${fmtP(p)} (${how}, ${r.n} readings). ${slope}${rel}; the data cannot rule out zero.`);
  else lines.push(`${dir === "increasing" ? "Increasing" : "Decreasing"} trend: p = ${fmtP(p)} (${how}, ${r.n} readings). ${slope}${rel}. Over the ${fmt(r.span, 3)}-${u} record that is ${fmtSigned(r.change)} ${r.columns.value}.`);
  const others = Object.entries(r.tests).filter(([k]) => k !== r.test.key);
  const disagree = others.filter(([, v]) => (v.trend === "no trend") !== (dir === "no trend"));
  if (disagree.length) lines.push(`${disagree.map(([, v]) => v.name).join(" and ")} ${disagree.length === 1 ? "reaches" : "reach"} the opposite verdict (p = ${disagree.map(([, v]) => fmtP(v.p)).join(", ")}), so the answer depends on how the serial correlation is handled.`);
  if (r.mode === "single" && r.test.key.startsWith("hamed-rao") && r.test.significantLagCount === 0) lines.push("No significant autocorrelation was found, so the correction leaves the variance unchanged.");
  if (r.mode === "single" && r.test.factor != null && r.test.factor > 1.05) lines.push(`Serial correlation inflates the variance of S by ${fmt(r.test.factor, 3)} times.`);
  if (r.mode === "seasonal" && r.test.key === "covariance") lines.push(`Correlation between seasons multiplies the variance by ${fmt(r.test.factor, 3)}.`);
  return lines.join(" ");
}

export function csvCell(c) {
  const s = String(c);
  const t = /^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

// The readings with Sen's line and the residual, as CSV.
export function toCsv(r) {
  const head = ["time", r.seasonOf ? "season" : null, "value", "sen_line", "residual"].filter(Boolean);
  const out = [head.join(",")];
  for (let i = 0; i < r.n; i++) {
    const line = r.sen.intercept + r.sen.slope * r.times[i];
    out.push([r.times[i].toPrecision(10), ...(r.seasonOf ? [csvCell(r.seasonOf[i])] : []), r.values[i], line.toPrecision(10), (r.values[i] - line).toPrecision(10)].join(","));
  }
  return out.join("\n") + "\n";
}

export function report(r) {
  const lines = [r.summary, ""];
  lines.push(`S = ${r.s}, Kendall's tau = ${fmt(r.tau, 4)}, n = ${r.n}`);
  lines.push(`Sen's slope ${fmt(r.sen.slope, 6)} per ${r.unit} [${fmt(r.sen.lower, 6)}, ${fmt(r.sen.upper, 6)}] at ${Math.round(r.confidence * 100)}%, intercept ${fmt(r.sen.intercept, 6)}`);
  lines.push("", "Tests:");
  for (const [k, v] of Object.entries(r.tests)) lines.push(`  ${k === r.test.key ? "*" : " "} ${v.name.padEnd(42)} Z = ${v.z.toFixed(3).padStart(8)}  p = ${fmtP(v.p).padStart(9)}  ${v.factor == null ? "pre-whitened" : `variance x${fmt(v.factor, 3)}`}  ${v.trend}`);
  if (r.mode === "seasonal") {
    lines.push("", "Seasons:");
    for (const s of r.seasonal.per) lines.push(`  ${String(s.season).padEnd(8)} n = ${String(s.n).padStart(4)}  S = ${String(s.s).padStart(6)}  p = ${fmtP(s.p).padStart(9)}  slope ${fmtSigned(s.slope, 4)}  ${s.trend}`);
    if (r.seasonal.homogeneity) lines.push(`  homogeneity: chi-square ${fmt(r.seasonal.homogeneity.chi2, 4)} on ${r.seasonal.homogeneity.df} df, p = ${fmtP(r.seasonal.homogeneity.p)}`);
  }
  if (r.warnings.length) lines.push("", ...r.warnings.map((w) => `Note: ${w}`));
  return lines.join("\n");
}
