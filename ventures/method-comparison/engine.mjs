// Method comparison: do two measurement methods agree, and if not, by how much and where?
// Deming and weighted Deming regression with jackknife intervals, Passing-Bablok
// regression with its rank-based intervals and CUSUM linearity test, Bland-Altman
// limits of agreement, and the difference between the methods at decision levels.
// Zero dependencies; the page, the CLI and agents share this file.

export const PAPERS = [
  {
    authors: "P. J. Cornbleet and N. Gochman",
    title: "Incorrect least-squares regression coefficients in method-comparison analysis",
    venue: "Clinical Chemistry 25(3), 432-438",
    year: 1979,
    url: "https://doi.org/10.1093/clinchem/25.3.432",
    doi: "10.1093/clinchem/25.3.432",
    implemented: "Deming regression for two methods that both carry measurement error: slope b = [(Syy - lambda Sxx) + sqrt((Syy - lambda Sxx)^2 + 4 lambda Sxy^2)] / (2 Sxy), intercept from the means, with lambda the ratio of the y method's error variance to the x method's. Ordinary least squares is shown beside it to make the attenuation they describe visible.",
    deviations: "lambda is supplied (default 1) or computed from the two methods' repeatability SDs; it is not estimated from duplicates inside the tool.",
  },
  {
    authors: "K. Linnet",
    title: "Estimation of the linear relationship between the measurements of two methods with proportional errors",
    venue: "Statistics in Medicine 9(12), 1463-1473",
    year: 1990,
    url: "https://doi.org/10.1002/sim.4780091210",
    doi: "10.1002/sim.4780091210",
    implemented: "Weighted Deming regression for errors proportional to the level: weights 1 / ((x^ + y^)/2)^2 from the estimated true values, the Deming slope on weighted sums, the true values re-estimated as x^ = (lambda x + b (y - a)) / (lambda + b^2), and repeat until the slope settles. Jackknife standard errors for slope and intercept, and from the jackknife covariance the standard error of the bias a + (b - 1) Xc at any level Xc.",
    deviations: "Intervals use Student's t with n - 2 degrees of freedom on the jackknife standard error. Each leave-one-out fit restarts from the full fit's weights rather than from scratch.",
  },
  {
    authors: "K. Linnet",
    title: "Evaluation of regression procedures for methods comparison studies",
    venue: "Clinical Chemistry 39(3), 424-432",
    year: 1993,
    url: "https://doi.org/10.1093/clinchem/39.3.424",
    doi: "10.1093/clinchem/39.3.424",
    implemented: "The jackknife as the default way to get standard errors for Deming and weighted Deming, which this paper found to hold their level where the analytical formulas did not; and the choice between the two by whether the scatter is constant or proportional to the level.",
    deviations: "The tool suggests weighted Deming when the size of the differences grows with the level (Bland-Altman trend test on the absolute differences), but the choice stays with the user.",
  },
  {
    authors: "H. Passing and W. Bablok",
    title: "A new biometrical procedure for testing the equality of measurements from two different analytical methods",
    venue: "Journal of Clinical Chemistry and Clinical Biochemistry 21(11), 709-720",
    year: 1983,
    url: "https://doi.org/10.1515/cclm.1983.21.11.709",
    doi: "10.1515/cclm.1983.21.11.709",
    implemented: "Passing-Bablok regression: every pairwise slope except 0/0 and exactly -1, vertical pairs as infinite slopes, the median shifted by K (the number of slopes below -1), the rank-based confidence interval M1 = round((N - C)/2), M2 = N - M1 + 1 with C = z sqrt(n(n-1)(2n+5)/18), the intercept as the median of y - b x and its interval from the slope's limits, and the CUSUM test for linearity (residual signs scored sqrt(L/l) and -sqrt(l/L), ordered along the line, largest |cusum| / sqrt(l + L + 1) against the Kolmogorov distribution).",
    deviations: "The order statistics are found exactly (to floating-point precision) by counting slopes below a trial value with a merge-sort inversion count and bisecting, so it runs on thousands of pairs; below 600 pairs it sorts all the slopes, and tests check that both give the same answer. The CUSUM statistic is normalised by sqrt(number of points off the line + 1) and referred to the asymptotic Kolmogorov distribution; because the line is fitted to the same points the test is conservative (0% and 0.1% false alarms at the nominal 5% in eval/simulation.json, n = 60) but still detects curvature (88% power in the curved simulation). Intervals for the bias at a decision level are bootstrap percentiles (up to 500 pairs).",
  },
  {
    authors: "J. M. Bland and D. G. Altman",
    title: "Statistical methods for assessing agreement between two methods of clinical measurement",
    venue: "The Lancet 327(8476), 307-310",
    year: 1986,
    url: "https://doi.org/10.1016/S0140-6736(86)90837-8",
    doi: "10.1016/S0140-6736(86)90837-8",
    implemented: "The difference plot: each pair's difference against its mean, the mean difference (bias), the limits of agreement bias +/- 1.96 SD, and their approximate standard errors (s / sqrt(n) for the bias, sqrt(3 s^2 / n) for each limit) with Student's t on n - 1 degrees of freedom. Their peak-flow example is reproduced in the tests.",
    deviations: "Differences are new minus reference (y - x). The multiplier is 1.96 by default; the 1986 paper used 2.",
  },
  {
    authors: "J. M. Bland and D. G. Altman",
    title: "Measuring agreement in method comparison studies",
    venue: "Statistical Methods in Medical Research 8(2), 135-160",
    year: 1999,
    url: "https://doi.org/10.1177/096228029900800204",
    doi: "10.1177/096228029900800204",
    implemented: "Percentage differences (100 (y - x) / mean) for scatter that grows with the level, and the check for a trend in the differences: regression of the differences on the means, and of the absolute differences on the means.",
    deviations: "No log transformation or regression-based limits; the percentage option covers the proportional case. Replicate measurements per subject are not modelled: give one value per method per subject (for example the mean of the replicates).",
  },
  {
    authors: "W. R. Knight",
    title: "A computer method for calculating Kendall's tau with ungrouped data",
    venue: "Journal of the American Statistical Association 61(314), 436-439",
    year: 1966,
    url: "https://doi.org/10.1080/01621459.1966.10480879",
    doi: "10.1080/01621459.1966.10480879",
    implemented: "Kendall's tau-b in O(n log n) by sorting and counting exchanges, with the tie-corrected variance for its z test. Passing and Bablok's method assumes the two methods are positively correlated; the tool checks it.",
    deviations: "None.",
  },
  {
    authors: "P. K. Sen",
    title: "Estimates of the regression coefficient based on Kendall's tau",
    venue: "Journal of the American Statistical Association 63(324), 1379-1389",
    year: 1968,
    url: "https://doi.org/10.1080/01621459.1968.10480934",
    doi: "10.1080/01621459.1968.10480934",
    implemented: "The median of pairwise slopes, which Passing and Bablok shift by K to make the estimate symmetric in x and y.",
    deviations: "Only used through Passing-Bablok.",
  },
  {
    authors: "M. B. Dillencourt, D. M. Mount and N. S. Netanyahu",
    title: "A randomized algorithm for slope selection",
    venue: "International Journal of Computational Geometry & Applications 2(1), 1-27",
    year: 1992,
    url: "https://doi.org/10.1142/S0218195992000020",
    doi: "10.1142/S0218195992000020",
    implemented: "The idea that the number of pairwise slopes below a value t is the number of inversions between the order of x and the order of y - t x, so it can be counted in O(n log n) without listing the slopes.",
    deviations: "Bisection on t instead of their randomized interval contraction: simpler, and fast enough for the sizes a method comparison has (about 70 counts per order statistic).",
  },
];

export const LIMITS = { pairs: 20000, bruteForcePB: 600, bootstrapPB: 500 };
export const DEFAULTS = { lambda: 1, alpha: 0.05, loaMultiplier: 1.959963984540054, bootstrap: 1000, seed: 1, baScale: "difference" };

export const fmt = (v, d = 2) => (Number.isFinite(v) ? (Math.round(v * 10 ** d) / 10 ** d).toString() : String(v));

// ---------------------------------------------------------------- distributions

function lgamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a, b, x) {
  const FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function ibeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Student's t: two-sided p-value for |t| on df degrees of freedom. */
export function tTwoSided(t, df) {
  if (!Number.isFinite(t)) return 0;
  return ibeta(df / (df + t * t), df / 2, 0.5);
}

/** Student's t quantile (upper tail probability p, e.g. 0.025). */
export function tQuantile(p, df) {
  if (df > 1e7) return normQuantile(1 - p);
  let lo = 0, hi = 1;
  while (tTwoSided(hi, df) / 2 > p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tTwoSided(mid, df) / 2 > p) lo = mid; else hi = mid;
    if (hi - lo < 1e-14 * hi) break;
  }
  return (lo + hi) / 2;
}

function erfc(x) {
  // Chebyshev fit (Numerical Recipes erfccheb), relative error below 1.2e-16 for x >= 0.
  const cof = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2, -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6, 1.30365583558e-6, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9, 5.059343495e-9, -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12, -6.886027e-12, 8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15, -1.523e-15, -9.4e-17, 1.21e-16, -2.8e-17];
  if (x < 0) return 2 - erfc(-x);
  const t = 2 / (2 + x), ty = 4 * t - 2;
  let d = 0, dd = 0;
  for (let j = cof.length - 1; j > 0; j--) { const tmp = d; d = ty * d - dd + cof[j]; dd = tmp; }
  return t * Math.exp(-x * x + 0.5 * (cof[0] + ty * d) - dd);
}

export function normCdf(z) {
  return 0.5 * erfc(-z / Math.SQRT2);
}

export function normQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Acklam's rational approximation, then two Newton steps on the accurate CDF.
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p > 1 - 0.02425) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    const q = p - 0.5, r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  for (let i = 0; i < 2; i++) {
    const e = normCdf(x) - p;
    x -= e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  }
  return x;
}

/** P(K > k) for the Kolmogorov distribution (limit of sqrt(n) D_n and of a Brownian bridge's max |B|). */
export function kolmogorovSurvival(k) {
  if (k <= 0) return 1;
  if (k < 0.2) return 1;
  let s = 0;
  for (let j = 1; j <= 100; j++) {
    const term = Math.exp(-2 * j * j * k * k);
    s += (j % 2 ? 1 : -1) * term;
    if (term < 1e-18) break;
  }
  return Math.min(1, Math.max(0, 2 * s));
}

// ---------------------------------------------------------------- input

const ID_NAME = /^(id|sample|seqn|subject|patient|specimen|no|n|#|index|row|name|label)$/i;

function splitLine(line, delim) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function toNumber(s, decimalComma = false) {
  if (s === undefined) return NaN;
  let t = String(s).trim();
  if (t === "") return NaN;
  // Semicolon-separated files (Excel's CSV across most of Europe) write 4,1 for 4.1.
  if (decimalComma && /^[+-]?\d*,\d+([eE][+-]?\d+)?$/.test(t)) t = t.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return NaN;
  return Number(t);
}

/**
 * Parse pasted CSV or tab-separated text into paired readings.
 * x is the comparison (reference, current) method, y the new (test) method.
 * Without a header the first two numeric columns are x and y.
 */
export function parsePairs(text, opts = {}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Paste paired readings: one row per sample, a column for each method.");
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() && !/^\s*#/.test(l));
  // A semicolon on every one of the first lines means a semicolon-separated file, whose
  // commas are decimal commas: splitting "4,1;4,3" on the comma would read 1;4 as a header.
  const head = lines.slice(0, 5);
  const delim = lines[0].includes("\t") ? "\t" : head.every((l) => l.includes(";")) ? ";" : lines[0].includes(",") ? "," : lines[0].includes(";") ? ";" : /\s/.test(lines[0].trim()) ? " " : ",";
  const dc = delim === ";";
  const num = (c) => toNumber(c, dc);
  const rows = lines.map((l) => (delim === " " ? l.trim().split(/\s+/) : splitLine(l, delim)));
  const first = rows[0];
  const header = first.some((c) => c !== "" && Number.isNaN(num(c)));
  const names = header ? first.map((c, i) => c || `column ${i + 1}`) : first.map((_, i) => `column ${i + 1}`);
  const body = header ? rows.slice(1) : rows;
  const pick = (want, label) => {
    if (want === undefined || want === null || want === "") return -1;
    const i = names.findIndex((n) => n.toLowerCase() === String(want).toLowerCase());
    if (i >= 0) return i;
    if (/^\d+$/.test(String(want)) && +want >= 1 && +want <= names.length) return +want - 1;
    throw new Error(`No column named "${want}" for ${label}. Columns: ${names.join(", ")}.`);
  };
  let xi = pick(opts.x, "the comparison method (x)");
  let yi = pick(opts.y, "the new method (y)");
  if (xi < 0 || yi < 0) {
    const numeric = names.map((n, i) => i).filter((i) => {
      if (header && ID_NAME.test(names[i].trim())) return false;
      let ok = 0, bad = 0;
      for (const r of body) {
        if (r[i] === undefined || r[i] === "") continue;
        if (Number.isNaN(num(r[i]))) bad++; else ok++;
      }
      return ok > 0 && bad <= ok / 4;
    });
    const rest = numeric.filter((i) => i !== xi && i !== yi);
    if (xi < 0) xi = rest.shift();
    if (yi < 0) yi = rest.find((i) => i !== xi);
  }
  if (xi === undefined || yi === undefined || xi < 0 || yi < 0) throw new Error("Need two numeric columns: one per method.");
  if (xi === yi) throw new Error("The two methods must be different columns.");
  const x = [], y = [];
  let skipped = 0;
  for (const r of body) {
    const a = num(r[xi]), b = num(r[yi]);
    if (Number.isFinite(a) && Number.isFinite(b)) { x.push(a); y.push(b); } else skipped++;
  }
  return { x, y, xName: names[xi], yName: names[yi], skipped, columns: names };
}

// ---------------------------------------------------------------- small helpers

function mean(a) {
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

function median(a) {
  const s = Float64Array.from(a).sort();
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Seeded uniform generator (mulberry32). */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted, p) {
  const n = sorted.length;
  if (!n) return NaN;
  const h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

// ---------------------------------------------------------------- ordinary least squares

export function ols(x, y) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const slope = sxy / sxx, intercept = my - slope * mx;
  const sse = Math.max(0, syy - slope * sxy);
  const s2 = sse / (n - 2);
  const seSlope = Math.sqrt(s2 / sxx), seIntercept = Math.sqrt(s2 * (1 / n + (mx * mx) / sxx));
  const r = sxy / Math.sqrt(sxx * syy);
  return { slope, intercept, seSlope, seIntercept, r, sy_x: Math.sqrt(s2), n, pSlope: tTwoSided(slope / seSlope, n - 2) };
}

// ---------------------------------------------------------------- Deming

function demingFromSums(sxx, syy, sxy, lambda) {
  // lambda = error variance of y / error variance of x.
  const u = syy - lambda * sxx;
  if (sxy === 0) return NaN;
  return (u + Math.sqrt(u * u + 4 * lambda * sxy * sxy)) / (2 * sxy);
}

/** Deming regression of y on x with error-variance ratio lambda (var of y errors / var of x errors). */
export function deming(x, y, lambda = 1) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const slope = demingFromSums(sxx, syy, sxy, lambda);
  return { slope, intercept: my - slope * mx, mx, my, sxx, syy, sxy };
}

function jackknifeSummary(as, bs, a, b, n, alpha, extra = {}) {
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += as[i]; mb += bs[i]; }
  ma /= n; mb /= n;
  let vaa = 0, vbb = 0, vab = 0;
  for (let i = 0; i < n; i++) { const da = as[i] - ma, db = bs[i] - mb; vaa += da * da; vbb += db * db; vab += da * db; }
  const f = (n - 1) / n;
  vaa *= f; vbb *= f; vab *= f;
  const t = tQuantile(alpha / 2, n - 2);
  const seA = Math.sqrt(vaa), seB = Math.sqrt(vbb);
  return {
    slope: b, intercept: a, seSlope: seB, seIntercept: seA, covAB: vab, t, df: n - 2,
    slopeCI: [b - t * seB, b + t * seB], interceptCI: [a - t * seA, a + t * seA],
    ...extra,
  };
}

/** Deming regression with jackknife standard errors (Linnet 1990, 1993). O(n) using leave-one-out sums. */
export function demingJackknife(x, y, lambda = 1, alpha = DEFAULTS.alpha) {
  const n = x.length;
  const full = deming(x, y, lambda);
  const as = new Float64Array(n), bs = new Float64Array(n);
  const k = n / (n - 1);
  for (let i = 0; i < n; i++) {
    const dx = x[i] - full.mx, dy = y[i] - full.my;
    const sxx = full.sxx - k * dx * dx, syy = full.syy - k * dy * dy, sxy = full.sxy - k * dx * dy;
    const b = demingFromSums(sxx, syy, sxy, lambda);
    const mx = (n * full.mx - x[i]) / (n - 1), my = (n * full.my - y[i]) / (n - 1);
    bs[i] = b; as[i] = my - b * mx;
  }
  return jackknifeSummary(as, bs, full.intercept, full.slope, n, alpha, { method: "deming", lambda });
}

function weightedDemingFit(x, y, lambda, start, maxIter = 200, tol = 1e-12, skip = -1) {
  const n = x.length;
  let a = start.a, b = start.b;
  const xh = Float64Array.from(start.xh);
  let iter = 0, converged = false;
  for (; iter < maxIter; iter++) {
    let sw = 0, swx = 0, swy = 0;
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (i === skip) continue;
      const m = (xh[i] + (a + b * xh[i])) / 2;
      w[i] = 1 / (m * m);
      sw += w[i]; swx += w[i] * x[i]; swy += w[i] * y[i];
    }
    const mx = swx / sw, my = swy / sw;
    let u = 0, q = 0, p = 0;
    for (let i = 0; i < n; i++) {
      if (i === skip) continue;
      const dx = x[i] - mx, dy = y[i] - my;
      u += w[i] * dx * dx; q += w[i] * dy * dy; p += w[i] * dx * dy;
    }
    const nb = demingFromSums(u, q, p, lambda), na = my - nb * mx;
    for (let i = 0; i < n; i++) xh[i] = (lambda * x[i] + nb * (y[i] - na)) / (lambda + nb * nb);
    const done = Math.abs(nb - b) <= tol * Math.max(1, Math.abs(nb)) && Math.abs(na - a) <= tol * Math.max(1, Math.abs(na));
    a = na; b = nb;
    if (done) { converged = true; iter++; break; }
  }
  return { a, b, xh, iter, converged };
}

/**
 * Weighted Deming regression for proportional error (Linnet 1990), with jackknife intervals.
 * Needs every reading positive (the weights are 1 / level^2).
 */
export function weightedDeming(x, y, lambda = 1, alpha = DEFAULTS.alpha, { jackknife = true } = {}) {
  const n = x.length;
  for (let i = 0; i < n; i++) if (!(x[i] > 0 && y[i] > 0)) throw new Error("Weighted Deming needs every reading above zero (its weights are 1 / level squared).");
  const d0 = deming(x, y, lambda);
  const xh0 = x.map((xi, i) => (lambda * xi + d0.slope * (y[i] - d0.intercept)) / (lambda + d0.slope * d0.slope));
  const full = weightedDemingFit(x, y, lambda, { a: d0.intercept, b: d0.slope, xh: xh0 });
  if (!full.converged) throw new Error("Weighted Deming did not converge in 200 iterations.");
  // Weights at convergence, for anyone checking with a fixed-weight orthogonal regression.
  const weights = Array.from(full.xh, (v) => { const m = (v + full.a + full.b * v) / 2; return 1 / (m * m); });
  if (!jackknife) return { slope: full.b, intercept: full.a, iterations: full.iter, weights, method: "weighted-deming", lambda };
  const as = new Float64Array(n), bs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = weightedDemingFit(x, y, lambda, { a: full.a, b: full.b, xh: full.xh }, 200, 1e-12, i);
    as[i] = r.a; bs[i] = r.b;
  }
  return jackknifeSummary(as, bs, full.a, full.b, n, alpha, { method: "weighted-deming", lambda, iterations: full.iter, weights });
}

// ---------------------------------------------------------------- Passing-Bablok

/** Scale to integers when every reading has a few decimals, so ties and slopes of exactly -1 are found exactly. */
export function exactScale(x, y) {
  const all = [...x, ...y];
  let maxAbs = 0;
  for (const v of all) maxAbs = Math.max(maxAbs, Math.abs(v));
  for (let d = 0; d <= 9; d++) {
    const s = 10 ** d;
    if (maxAbs * s > 2 ** 40) break;
    if (all.every((v) => Math.abs(v * s - Math.round(v * s)) < 1e-6)) {
      return { X: x.map((v) => Math.round(v * s)), Y: y.map((v) => Math.round(v * s)), scale: s, exact: true };
    }
  }
  return { X: x.slice(), Y: y.slice(), scale: 1, exact: false };
}

function pairCounts(X, Y) {
  const n = X.length;
  const byX = new Map(), byXY = new Map(), bySum = new Map();
  for (let i = 0; i < n; i++) {
    byX.set(X[i], (byX.get(X[i]) || 0) + 1);
    const k = X[i] + "|" + Y[i];
    byXY.set(k, (byXY.get(k) || 0) + 1);
    const s = X[i] + Y[i];
    bySum.set(s, (bySum.get(s) || 0) + 1);
  }
  const c2 = (g) => (g * (g - 1)) / 2;
  let sameX = 0, dup = 0, sameSum = 0;
  for (const g of byX.values()) sameX += c2(g);
  for (const g of byXY.values()) dup += c2(g);
  for (const g of bySum.values()) sameSum += c2(g);
  const total = c2(n);
  return {
    total,
    duplicates: dup, // 0/0 pairs, left out
    vertical: sameX - dup, // x tied, y not: infinite slopes
    minusOne: sameSum - dup, // slope exactly -1, left out
    finite: total - sameX,
  };
}

/** Count pairs (i < j in x order) whose slope is strictly below t: inversions of y - t x. */
function makeCounter(X, Y) {
  const n = X.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => X[i] - X[j] || Y[i] - Y[j]);
  const xs = Float64Array.from(order, (i) => X[i]);
  const ys = Float64Array.from(order, (i) => Y[i]);
  const u = new Float64Array(n), tmp = new Float64Array(n);
  return function countBelow(t) {
    for (let i = 0; i < n; i++) u[i] = ys[i] - t * xs[i];
    // Within a run of equal x, y is ascending, so u is ascending too: no inversion is counted
    // inside it unless rounding breaks the order; restore the order explicitly to be safe.
    for (let i = 1; i < n; i++) if (xs[i] === xs[i - 1] && u[i] < u[i - 1]) u[i] = u[i - 1];
    let inv = 0;
    let src = u, dst = tmp;
    for (let width = 1; width < n; width *= 2) {
      for (let lo = 0; lo < n; lo += 2 * width) {
        const mid = Math.min(lo + width, n), hi = Math.min(lo + 2 * width, n);
        let i = lo, j = mid, k = lo;
        while (i < mid && j < hi) {
          if (src[j] < src[i]) { dst[k++] = src[j++]; inv += mid - i; } else dst[k++] = src[i++];
        }
        while (i < mid) dst[k++] = src[i++];
        while (j < hi) dst[k++] = src[j++];
      }
      const s = src; src = dst; dst = s;
    }
    return inv;
  };
}

function slopeBound(X, Y) {
  const xs = Float64Array.from(X).sort();
  let gap = Infinity;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1]) gap = Math.min(gap, xs[i] - xs[i - 1]);
  let ymin = Infinity, ymax = -Infinity;
  for (const v of Y) { ymin = Math.min(ymin, v); ymax = Math.max(ymax, v); }
  return Number.isFinite(gap) ? (ymax - ymin) / gap + 1 : 1;
}

/** Build an order-statistic oracle over Passing-Bablok's slope set without listing the slopes. */
function slopeSelector(X, Y, counts, brute) {
  if (brute) {
    const n = X.length;
    const s = new Float64Array(counts.finite - counts.minusOne + counts.vertical);
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = X[j] - X[i], dy = Y[j] - Y[i];
        if (dx === 0) { if (dy !== 0) s[k++] = Infinity; continue; }
        if (dy === -dx) continue;
        s[k++] = dy / dx;
      }
    }
    if (k !== s.length) throw new Error("internal: slope count mismatch");
    s.sort();
    let below = 0;
    while (below < s.length && s[below] < -1) below++;
    return { N: s.length, K: below, at: (r) => (r >= 1 && r <= s.length ? s[r - 1] : NaN) };
  }
  const countBelow = makeCounter(X, Y);
  const B = slopeBound(X, Y);
  const finiteKept = counts.finite - counts.minusOne;
  const below = (t) => countBelow(t) - (t > -1 ? counts.minusOne : 0);
  const K = countBelow(-1);
  const cache = new Map();
  const at = (r) => {
    if (cache.has(r)) return cache.get(r);
    let v;
    if (r < 1 || r > finiteKept + counts.vertical) v = NaN;
    else if (r > finiteKept) v = Infinity;
    else {
      let lo = -B, hi = B;
      for (let it = 0; it < 400; it++) {
        const mid = lo + (hi - lo) / 2;
        if (mid <= lo || mid >= hi) break;
        if (below(mid) >= r) hi = mid; else lo = mid;
      }
      v = lo;
    }
    cache.set(r, v);
    return v;
  };
  return { N: finiteKept + counts.vertical, K, at };
}

/** Passing-Bablok regression with its confidence intervals (Passing & Bablok 1983). */
export function passingBablok(x, y, alpha = DEFAULTS.alpha, { method } = {}) {
  const n = x.length;
  const { X, Y, exact } = exactScale(x, y);
  const counts = pairCounts(X, Y);
  const brute = method === "brute" || (method !== "fast" && n <= LIMITS.bruteForcePB);
  const sel = slopeSelector(X, Y, counts, brute);
  const { N, K } = sel;
  if (N < 1) throw new Error("Passing-Bablok needs readings that are not all identical.");
  let slope;
  if (N % 2) slope = sel.at((N + 1) / 2 + K);
  else slope = (sel.at(N / 2 + K) + sel.at(N / 2 + 1 + K)) / 2;
  const z = normQuantile(1 - alpha / 2);
  const C = z * Math.sqrt((n * (n - 1) * (2 * n + 5)) / 18);
  const M1 = Math.round((N - C) / 2), M2 = N - M1 + 1;
  const okCI = M1 >= 1 && M1 + K >= 1 && M2 + K <= N;
  const lo = okCI ? sel.at(M1 + K) : NaN, hi = okCI ? sel.at(M2 + K) : NaN;
  const icept = (b) => (Number.isFinite(b) ? median(x.map((xi, i) => y[i] - b * xi)) : NaN);
  const intercept = icept(slope);
  return {
    method: "passing-bablok", algorithm: brute ? "all slopes sorted" : "slope selection by inversion counting",
    exactArithmetic: exact,
    slope, intercept,
    slopeCI: [lo, hi],
    interceptCI: [icept(hi), icept(lo)],
    N, K, M1, M2, C,
    pairs: { total: counts.total, identical: counts.duplicates, vertical: counts.vertical, minusOne: counts.minusOne },
  };
}

/** Passing and Bablok's CUSUM test for linearity of the relationship. */
export function cusumLinearity(x, y, slope, intercept) {
  const n = x.length;
  const items = [];
  let l = 0, L = 0;
  for (let i = 0; i < n; i++) {
    const r = y[i] - (intercept + slope * x[i]);
    const s = Math.abs(r) <= 1e-9 * Math.max(1, Math.abs(y[i])) ? 0 : Math.sign(r);
    if (s > 0) l++; else if (s < 0) L++;
    // Position along the fitted line: projection of the point onto the line's direction.
    const d = (y[i] + x[i] / slope - intercept) / Math.sqrt(1 + 1 / (slope * slope));
    items.push({ s, d });
  }
  if (!l || !L) return { statistic: NaN, p: NaN, above: l, below: L, linear: null };
  items.sort((a, b) => a.d - b.d);
  const up = Math.sqrt(L / l), down = -Math.sqrt(l / L);
  let c = 0, max = 0, where = 0;
  items.forEach((it, i) => {
    c += it.s > 0 ? up : it.s < 0 ? down : 0;
    if (Math.abs(c) > max) { max = Math.abs(c); where = i; }
  });
  const statistic = max / Math.sqrt(l + L + 1);
  const p = kolmogorovSurvival(statistic);
  return { statistic, p, above: l, below: L, maxCusum: max, atRank: where + 1, critical05: 1.358, linear: p >= 0.05 };
}

// ---------------------------------------------------------------- Kendall's tau-b (Knight 1966)

export function kendallTau(x, y) {
  const n = x.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => x[i] - x[j] || y[i] - y[j]);
  const ys = Float64Array.from(idx, (i) => y[i]);
  const tieStats = (vals) => {
    const s = Float64Array.from(vals).sort();
    let c2 = 0, v = 0, w = 0, run = 1;
    for (let i = 1; i <= s.length; i++) {
      if (i < s.length && s[i] === s[i - 1]) run++;
      else { if (run > 1) { c2 += (run * (run - 1)) / 2; v += run * (run - 1) * (2 * run + 5); w += run * (run - 1) * (run - 2); } run = 1; }
    }
    return { c2, v, w, t2: 2 * c2 };
  };
  const tx = tieStats(x), ty = tieStats(y);
  let joint = 0;
  { let run = 1; for (let i = 1; i <= n; i++) { if (i < n && x[idx[i]] === x[idx[i - 1]] && y[idx[i]] === y[idx[i - 1]]) run++; else { joint += (run * (run - 1)) / 2; run = 1; } } }
  // Count exchanges (strict inversions) of ys by merge sort.
  let swaps = 0;
  let src = Float64Array.from(ys), dst = new Float64Array(n);
  for (let width = 1; width < n; width *= 2) {
    for (let lo = 0; lo < n; lo += 2 * width) {
      const mid = Math.min(lo + width, n), hi = Math.min(lo + 2 * width, n);
      let i = lo, j = mid, k = lo;
      while (i < mid && j < hi) { if (src[j] < src[i]) { dst[k++] = src[j++]; swaps += mid - i; } else dst[k++] = src[i++]; }
      while (i < mid) dst[k++] = src[i++];
      while (j < hi) dst[k++] = src[j++];
    }
    const t = src; src = dst; dst = t;
  }
  const n0 = (n * (n - 1)) / 2;
  const S = n0 - tx.c2 - ty.c2 + joint - 2 * swaps;
  const tau = S / Math.sqrt((n0 - tx.c2) * (n0 - ty.c2));
  const varS = (n * (n - 1) * (2 * n + 5) - tx.v - ty.v) / 18
    + (tx.t2 * ty.t2) / (2 * n * (n - 1))
    + (n > 2 ? (tx.w * ty.w) / (9 * n * (n - 1) * (n - 2)) : 0);
  const z = S / Math.sqrt(varS);
  return { tau, S, z, p: 2 * normCdf(-Math.abs(z)), n };
}

// ---------------------------------------------------------------- Bland-Altman

/** Bland-Altman agreement: bias, limits of agreement and their intervals; differences are y - x. */
export function blandAltman(x, y, { scale = "difference", multiplier = DEFAULTS.loaMultiplier, alpha = DEFAULTS.alpha } = {}) {
  const n = x.length;
  const m = x.map((v, i) => (v + y[i]) / 2);
  let d;
  if (scale === "percent") {
    if (m.some((v) => !(v > 0))) throw new Error("Percentage differences need every pair's mean above zero.");
    d = x.map((v, i) => (100 * (y[i] - v)) / m[i]);
  } else d = x.map((v, i) => y[i] - v);
  const bias = mean(d);
  let ss = 0;
  for (const v of d) ss += (v - bias) ** 2;
  const sd = Math.sqrt(ss / (n - 1));
  const t = tQuantile(alpha / 2, n - 1);
  const seBias = sd / Math.sqrt(n), seLoa = Math.sqrt((3 * sd * sd) / n);
  const lower = bias - multiplier * sd, upper = bias + multiplier * sd;
  const outside = d.filter((v) => v < lower || v > upper).length;
  const trend = ols(m, d);
  const absTrend = ols(m, d.map((v) => Math.abs(v - bias)));
  return {
    scale, n, bias, sd, multiplier,
    biasCI: [bias - t * seBias, bias + t * seBias],
    lower, upper,
    lowerCI: [lower - t * seLoa, lower + t * seLoa],
    upperCI: [upper - t * seLoa, upper + t * seLoa],
    pBias: tTwoSided(bias / seBias, n - 1),
    outside,
    trend: { slope: trend.slope, intercept: trend.intercept, p: trend.pSlope },
    spreadTrend: { slope: absTrend.slope, p: absTrend.pSlope },
    means: m, diffs: d,
  };
}

// ---------------------------------------------------------------- decision levels

function demingBiasAt(fit, xc, alpha, n) {
  const est = fit.intercept + (fit.slope - 1) * xc;
  const se = Math.sqrt(Math.max(0, fit.seIntercept ** 2 + xc * xc * fit.seSlope ** 2 + 2 * xc * fit.covAB));
  const t = tQuantile(alpha / 2, n - 2);
  return { bias: est, se, ci: [est - t * se, est + t * se], yAt: fit.intercept + fit.slope * xc };
}

function pbBootstrap(x, y, levels, { B, seed, alpha }) {
  const n = x.length;
  const draw = rng(seed);
  const slopes = [], icepts = [];
  const xs = new Array(n), ys = new Array(n);
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) { const k = Math.floor(draw() * n); xs[i] = x[k]; ys[i] = y[k]; }
    try {
      const f = passingBablok(xs, ys, alpha, { method: "brute" });
      if (Number.isFinite(f.slope) && Number.isFinite(f.intercept)) { slopes.push(f.slope); icepts.push(f.intercept); }
    } catch { /* a degenerate resample (all x tied) is skipped */ }
  }
  return levels.map((xc) => {
    const v = Float64Array.from(slopes.map((s, i) => icepts[i] + (s - 1) * xc)).sort();
    return { ci: [percentile(v, alpha / 2), percentile(v, 1 - alpha / 2)], resamples: v.length };
  });
}

// ---------------------------------------------------------------- the whole analysis

export const SAMPLE_TEXT = `sample,old_method,new_method
1,4.1,4.3
2,5.0,5.4
3,5.6,5.8
4,6.3,6.9
5,7.1,7.4
6,7.9,8.6
7,8.4,8.7
8,9.2,10.1
9,10.0,10.6
10,10.9,11.3
11,11.6,12.6
12,12.8,13.3
13,13.5,14.6
14,14.9,15.6
15,15.6,16.9
16,16.8,17.4
17,18.1,19.6
18,19.4,20.1
19,20.7,22.3
20,22.0,23.0
`;

function describeCI(ci, d = 3) {
  return `${fmt(ci[0], d)} to ${fmt(ci[1], d)}`;
}

function sig(v) {
  if (!Number.isFinite(v)) return 3;
  const a = Math.abs(v);
  return a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 2 : 3;
}

/**
 * Compare two methods measured on the same samples.
 * input: {text} (CSV) or {x, y} arrays; options lambda, sdX/sdY (repeatability SDs), alpha,
 * decisionLevels, baScale ("difference" | "percent"), weighted (bool), bootstrap, seed, loaMultiplier.
 */
export function analyze(input = {}) {
  let { x, y } = input;
  let xName = input.xName || "x", yName = input.yName || "y", skipped = 0;
  if (input.text !== undefined) {
    const p = parsePairs(input.text, { x: input.xColumn, y: input.yColumn });
    ({ x, y, xName, yName, skipped } = p);
  }
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) throw new Error("Give x and y as two arrays of the same length.");
  // Number(null), Number("") and Number(false) are all 0: a missing reading must not become a zero.
  const reading = (v) => (typeof v === "number" ? v : typeof v === "string" ? toNumber(v) : NaN);
  x = x.map(reading); y = y.map(reading);
  if (x.some((v) => !Number.isFinite(v)) || y.some((v) => !Number.isFinite(v))) throw new Error("Every reading must be a number (a missing reading is not a zero: leave that pair out).");
  const n = x.length;
  if (n < 5) throw new Error("Need at least 5 paired readings.");
  if (n > LIMITS.pairs) throw new Error(`Up to ${LIMITS.pairs.toLocaleString("en-US")} pairs.`);
  const alpha = input.alpha ?? DEFAULTS.alpha;
  if (!(alpha > 0 && alpha < 0.5)) throw new Error("alpha must be between 0 and 0.5.");
  let lambda = input.lambda ?? DEFAULTS.lambda;
  let lambdaFrom = input.lambda !== undefined ? "given" : "default (equal error variances)";
  if (input.sdX !== undefined || input.sdY !== undefined) {
    if (!(input.sdX > 0 && input.sdY > 0)) throw new Error("Give both repeatability SDs, each above zero.");
    lambda = (input.sdY / input.sdX) ** 2;
    lambdaFrom = `from repeatability SDs ${input.sdY} (new) and ${input.sdX} (comparison)`;
  }
  if (!(lambda > 0 && Number.isFinite(lambda))) throw new Error("The error-variance ratio must be above zero.");
  const rawLevels = input.decisionLevels ?? [];
  const levels = (Array.isArray(rawLevels) ? rawLevels : String(rawLevels).split(/[,;\s]+/))
    .map((v) => (typeof v === "number" ? v : typeof v === "string" ? toNumber(v) : NaN)).filter(Number.isFinite);
  const warnings = [];
  if (skipped) warnings.push(`${skipped} row(s) without two numbers were skipped.`);
  if (n < 30) warnings.push(`Only ${n} pairs: the intervals will be wide. More samples, spread over the whole measuring range, narrow them.`);

  const o = ols(x, y);
  const dem = demingJackknife(x, y, lambda, alpha);
  const positive = x.every((v) => v > 0) && y.every((v) => v > 0);
  let wdem = null;
  if (input.weighted !== false && positive) {
    try { wdem = weightedDeming(x, y, lambda, alpha); } catch (e) { warnings.push(e.message); }
  }
  const pb = passingBablok(x, y, alpha);
  const cusum = Number.isFinite(pb.slope) && pb.slope !== 0 ? cusumLinearity(x, y, pb.slope, pb.intercept) : null;
  const tau = kendallTau(x, y);
  if (!(tau.tau > 0 && tau.p < 0.05)) warnings.push("The two methods are not significantly positively correlated (Kendall's tau): Passing-Bablok regression assumes they are.");
  const ba = blandAltman(x, y, { scale: input.baScale || DEFAULTS.baScale, multiplier: input.loaMultiplier ?? DEFAULTS.loaMultiplier, alpha });
  const baAbs = ba.scale === "difference" ? ba : blandAltman(x, y, { scale: "difference", alpha });

  const proportional = baAbs.spreadTrend.p < 0.05 && baAbs.spreadTrend.slope > 0;
  if (proportional) warnings.push("The size of the differences grows with the level: weighted Deming and percentage Bland-Altman differences describe this better than the unweighted versions.");

  const B = input.bootstrap ?? DEFAULTS.bootstrap;
  let pbLevels = null;
  if (levels.length && n <= LIMITS.bootstrapPB && B >= 100) pbLevels = pbBootstrap(x, y, levels, { B, seed: input.seed ?? DEFAULTS.seed, alpha });
  const decision = levels.map((xc, k) => ({
    level: xc,
    deming: demingBiasAt(dem, xc, alpha, n),
    weightedDeming: wdem ? demingBiasAt(wdem, xc, alpha, n) : null,
    passingBablok: { bias: pb.intercept + (pb.slope - 1) * xc, yAt: pb.intercept + pb.slope * xc, ci: pbLevels ? pbLevels[k].ci : null, resamples: pbLevels ? pbLevels[k].resamples : 0 },
    ols: { bias: o.intercept + (o.slope - 1) * xc },
  }));
  if (levels.length && !pbLevels) warnings.push(`Passing-Bablok intervals at decision levels are bootstrapped only up to ${LIMITS.bootstrapPB} pairs; use the Deming interval here.`);

  const verdict = (fit) => {
    const s1 = fit.slopeCI[0] <= 1 && 1 <= fit.slopeCI[1];
    const i0 = fit.interceptCI[0] <= 0 && 0 <= fit.interceptCI[1];
    return { slopeIncludes1: s1, interceptIncludes0: i0, proportionalDifference: !s1, constantDifference: !i0 };
  };
  const pbV = verdict(pb), demV = verdict(dem);
  let xmin = Infinity, xmax = -Infinity;
  for (const v of x) { xmin = Math.min(xmin, v); xmax = Math.max(xmax, v); }

  const lines = [];
  const unit = ba.scale === "percent" ? "%" : "";
  const dB = sig(ba.bias);
  lines.push(`${yName} reads ${ba.bias >= 0 ? "higher" : "lower"} than ${xName} by ${fmt(Math.abs(ba.bias), dB)}${unit} on average (95% CI ${fmt(ba.biasCI[0], dB)} to ${fmt(ba.biasCI[1], dB)}${unit}); 95% of differences should fall between ${fmt(ba.lower, dB)} and ${fmt(ba.upper, dB)}${unit} (Bland-Altman, n = ${n}).`);
  if (!Number.isFinite(pb.slope)) lines.push("Passing-Bablok: no finite slope here; the method needs two methods that rise together (positive correlation).");
  else lines.push(`Passing-Bablok: ${yName} = ${fmt(pb.intercept, 3)} + ${fmt(pb.slope, 4)} × ${xName}; slope 95% CI ${describeCI(pb.slopeCI, 4)}, intercept ${describeCI(pb.interceptCI, 3)}. ${pbV.proportionalDifference ? "The slope interval excludes 1: a proportional difference." : "The slope interval includes 1: no proportional difference detected."} ${pbV.constantDifference ? "The intercept interval excludes 0: a constant difference." : "The intercept interval includes 0: no constant difference detected."}`);
  lines.push(`Deming (λ = ${fmt(lambda, 3)}): ${yName} = ${fmt(dem.intercept, 3)} + ${fmt(dem.slope, 4)} × ${xName}; slope 95% CI ${describeCI(dem.slopeCI, 4)}, intercept ${describeCI(dem.interceptCI, 3)}.`);
  if (cusum && Number.isFinite(cusum.p)) lines.push(cusum.linear ? `CUSUM linearity test: no evidence of a curved relationship (p = ${fmt(cusum.p, 3)}).` : `CUSUM linearity test: the relationship is not linear (p = ${fmt(cusum.p, 3)}); straight-line fits mislead here.`);
  for (const dl of decision) {
    const dd = sig(dl.deming.bias) + 1;
    lines.push(`At ${fmt(dl.level, 3)}: ${yName} differs by ${fmt(dl.deming.bias, dd)} (Deming, 95% CI ${fmt(dl.deming.ci[0], dd)} to ${fmt(dl.deming.ci[1], dd)})${dl.passingBablok.ci ? `; Passing-Bablok ${fmt(dl.passingBablok.bias, dd)} (${fmt(dl.passingBablok.ci[0], dd)} to ${fmt(dl.passingBablok.ci[1], dd)})` : `; Passing-Bablok ${fmt(dl.passingBablok.bias, dd)}`}.`);
  }

  return {
    n, xName, yName, lambda, lambdaFrom, alpha, range: [xmin, xmax],
    ols: o, deming: dem, weightedDeming: wdem, passingBablok: pb, cusum, kendall: tau,
    blandAltman: ba, blandAltmanAbsolute: baAbs,
    verdict: { passingBablok: pbV, deming: demV },
    decision, warnings, summary: lines,
    x, y,
  };
}

export function csvCell(c) {
  let s = c == null ? "" : String(c);
  // CSV formula injection: column names are typed by the visitor, so a leading
  // = + - @ (or tab/CR) would run as a formula in a spreadsheet. Plain numbers stay numbers.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per pair: both readings, mean, difference, and each fit's prediction and residual. */
export function toCsv(r) {
  const head = [r.xName, r.yName, "mean", r.blandAltman.scale === "percent" ? "percent_difference" : "difference", "passing_bablok_fit", "deming_fit"];
  const rows = [head.map(csvCell).join(",")];
  for (let i = 0; i < r.n; i++) {
    rows.push([r.x[i], r.y[i], fmt(r.blandAltman.means[i], 6), fmt(r.blandAltman.diffs[i], 6), fmt(r.passingBablok.intercept + r.passingBablok.slope * r.x[i], 6), fmt(r.deming.intercept + r.deming.slope * r.x[i], 6)].map(csvCell).join(","));
  }
  return rows.join("\n") + "\n";
}
