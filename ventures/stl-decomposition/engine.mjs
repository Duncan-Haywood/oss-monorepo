// STL: split a time series into trend, seasonal and remainder with loess
// (Cleveland, Cleveland, McRae & Terpenning 1990), plus the strength of
// trend and seasonality (Wang, Smith & Hyndman 2006), the seasonal profile,
// a seasonally adjusted series and the points the remainder flags as unusual.
// Pure functions, no DOM, no network, no randomness. Implemented from the
// paper's description of the inner and outer loops; no third-party code was
// ported. Cross-checked against statsmodels' STL (eval/reference.py,
// eval/reference.json).

export const PAPERS = [
  {
    authors: "Robert B. Cleveland, William S. Cleveland, Jean E. McRae, Irma Terpenning",
    title: "STL: A Seasonal-Trend Decomposition Procedure Based on Loess",
    venue: "Journal of Official Statistics 6(1), 3-73",
    year: 1990,
    url: "https://www.scb.se/contentassets/ca21efb41fee47d293bbee5bf7be7fb3/stl-a-seasonal-trend-decomposition-procedure-based-on-loess.pdf",
    implemented:
      "The inner loop (detrend; smooth each cycle-subseries with loess, extended one period at each end; low-pass filter the result with moving averages of length n_p, n_p and 3 followed by loess; seasonal = smoothed cycle-subseries minus low-pass; deseasonalise; trend = loess of the deseasonalised series) and the outer loop (bisquare robustness weights from the remainder, 6 x median |remainder|). Loess of degree 0 or 1 with tricube weights, evaluated every `jump` points and linearly interpolated between them.",
    deviations:
      "The optional post-smoothing of the seasonal component (the paper's n_(s) post-smoother) is not implemented, matching statsmodels. When the loess window q exceeds the number of points, the bandwidth is widened by (q - n) / 2 (integer division), the convention of the authors' Fortran and of statsmodels, rather than the paper's q / n scaling. Defaults (seasonal window 7, trend window the smallest odd integer > 1.5 n_p / (1 - 1.5 / n_s), low-pass window the smallest odd integer > n_p, 5 inner and 0 outer passes, or 2 and 15 when robust) follow statsmodels.",
  },
  {
    authors: "William S. Cleveland",
    title: "Robust Locally Weighted Regression and Smoothing Scatterplots",
    venue: "Journal of the American Statistical Association 74(368), 829-836",
    year: 1979,
    url: "https://doi.org/10.1080/01621459.1979.10481038",
    doi: "10.1080/01621459.1979.10481038",
    implemented: "Locally weighted linear regression with the tricube weight and robustness iterations with the bisquare weight, as used inside STL.",
    deviations: "Only the pieces STL uses: degree 0 or 1, one evaluation point per time index.",
  },
  {
    authors: "Xiaozhe Wang, Kate Smith, Rob Hyndman",
    title: "Characteristic-Based Clustering for Time Series Data",
    venue: "Data Mining and Knowledge Discovery 13(3), 335-364",
    year: 2006,
    url: "https://doi.org/10.1007/s10618-005-0039-x",
    doi: "10.1007/s10618-005-0039-x",
    implemented:
      "Strength of trend F_T = max(0, 1 - Var(R) / Var(T + R)) and strength of seasonality F_S = max(0, 1 - Var(R) / Var(S + R)) from the decomposition, in the form given by Hyndman & Athanasopoulos, Forecasting: Principles and Practice (3rd ed.), section 4.3.",
    deviations: "Computed on the STL components rather than on the paper's own decomposition.",
  },
];

export const DEFAULTS = {
  seasonal: 7,
  seasonalDeg: 1,
  trendDeg: 1,
  lowPassDeg: 1,
  robust: false,
  seasonalJump: 1,
  trendJump: 1,
  lowPassJump: 1,
  outlierZ: 3.5,
};

// ---------------------------------------------------------------- loess core
// Arrays are 0-based here; positions passed to `est` are 1-based time indices
// (1..n), as in the paper, so `xs` and the neighbourhood [nleft, nright] are
// in the same units.

function est(y, n, len, ideg, xs, nleft, nright, w, userw, rw) {
  const range = n - 1;
  let h = Math.max(xs - nleft, nright - xs);
  if (len > n) h += Math.floor((len - n) / 2);
  const h9 = 0.999 * h;
  const h1 = 0.001 * h;
  let a = 0;
  for (let j = nleft; j <= nright; j++) {
    w[j - 1] = 0;
    const r = Math.abs(j - xs);
    if (r <= h9) {
      if (r <= h1) w[j - 1] = 1;
      else w[j - 1] = (1 - (r / h) ** 3) ** 3;
      if (userw) w[j - 1] *= rw[j - 1];
      a += w[j - 1];
    }
  }
  if (a <= 0) return null;
  for (let j = nleft; j <= nright; j++) w[j - 1] /= a;
  if (h > 0 && ideg > 0) {
    let mean = 0;
    for (let j = nleft; j <= nright; j++) mean += w[j - 1] * j;
    let b = xs - mean;
    let c = 0;
    for (let j = nleft; j <= nright; j++) c += w[j - 1] * (j - mean) * (j - mean);
    if (Math.sqrt(c) > 0.001 * range) {
      b /= c;
      for (let j = nleft; j <= nright; j++) w[j - 1] *= b * (j - mean) + 1;
    }
  }
  let ys = 0;
  for (let j = nleft; j <= nright; j++) ys += w[j - 1] * y[j - 1];
  return ys;
}

// Loess smooth of y[0..n-1] with window `len`, evaluated every `njump` points
// and linearly interpolated in between. Writes into ys.
function ess(y, n, len, ideg, njump, userw, rw, ys, work) {
  if (n < 2) {
    ys[0] = y[0];
    return;
  }
  const newnj = Math.min(njump, n - 1);
  let nleft = 1;
  let nright = n;
  const fit = (i) => {
    const v = est(y, n, len, ideg, i, nleft, nright, work, userw, rw);
    ys[i - 1] = v === null ? y[i - 1] : v;
  };
  if (len >= n) {
    nleft = 1;
    nright = n;
    for (let i = 1; i <= n; i += newnj) fit(i);
  } else if (newnj === 1) {
    const nsh = Math.floor((len + 1) / 2);
    nleft = 1;
    nright = len;
    for (let i = 1; i <= n; i++) {
      if (i > nsh && nright !== n) {
        nleft++;
        nright++;
      }
      fit(i);
    }
  } else {
    const nsh = Math.floor((len + 1) / 2);
    for (let i = 1; i <= n; i += newnj) {
      if (i < nsh) {
        nleft = 1;
        nright = len;
      } else if (i >= n - nsh + 1) {
        nleft = n - len + 1;
        nright = n;
      } else {
        nleft = i - nsh + 1;
        nright = len + i - nsh;
      }
      fit(i);
    }
  }
  if (newnj !== 1) {
    for (let i = 1; i <= n - newnj; i += newnj) {
      const delta = (ys[i + newnj - 1] - ys[i - 1]) / newnj;
      for (let j = i + 1; j <= i + newnj - 1; j++) ys[j - 1] = ys[i - 1] + delta * (j - i);
    }
    const k = Math.floor((n - 1) / newnj) * newnj + 1;
    if (k !== n) {
      fit(n);
      if (k !== n - 1) {
        const delta = (ys[n - 1] - ys[k - 1]) / (n - k);
        for (let j = k + 1; j <= n - 1; j++) ys[j - 1] = ys[k - 1] + delta * (j - k);
      }
    }
  }
}

// Moving average of length len over x[0..n-1]; n - len + 1 outputs.
function ma(x, n, len, ave) {
  const newn = n - len + 1;
  let v = 0;
  for (let i = 0; i < len; i++) v += x[i];
  ave[0] = v / len;
  for (let j = 1, k = len, m = 0; j < newn; j++, k++, m++) {
    v = v - x[m] + x[k];
    ave[j] = v / len;
  }
}

// Low-pass filter: moving averages of length np, np, 3 (x has n + 2 np points, out n).
function fts(x, n, np, out, work) {
  ma(x, n, np, out);
  ma(out, n - np + 1, np, work);
  ma(work, n - 2 * np + 2, 3, out);
}

// Cycle-subseries smoothing: each of the np subseries is smoothed and
// extended one point at each end, giving n + 2 np values.
function ss(y, n, np, ns, isdeg, nsjump, userw, rw, season) {
  const kmax = Math.floor((n - 1) / np) + 1;
  const sub = new Float64Array(kmax);
  const subw = new Float64Array(kmax);
  const fit = new Float64Array(kmax + 2);
  const work = new Float64Array(kmax + 2);
  for (let j = 1; j <= np; j++) {
    const k = Math.floor((n - j) / np) + 1;
    for (let i = 1; i <= k; i++) sub[i - 1] = y[(i - 1) * np + j - 1];
    if (userw) for (let i = 1; i <= k; i++) subw[i - 1] = rw[(i - 1) * np + j - 1];
    const inner = fit.subarray(1, k + 1);
    ess(sub, k, ns, isdeg, nsjump, userw, subw, inner, work);
    const left = est(sub, k, ns, isdeg, 0, 1, Math.min(ns, k), work, userw, subw);
    fit[0] = left === null ? fit[1] : left;
    const right = est(sub, k, ns, isdeg, k + 1, Math.max(1, k - ns + 1), k, work, userw, subw);
    fit[k + 1] = right === null ? fit[k] : right;
    for (let m = 1; m <= k + 2; m++) season[(m - 1) * np + j - 1] = fit[m - 1];
  }
}

// Bisquare robustness weights from |y - fit|, scaled by 6 x median.
function robustnessWeights(y, fit) {
  const n = y.length;
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = Math.abs(y[i] - fit[i]);
  const sorted = Float64Array.from(r).sort();
  const mid1 = Math.floor(n / 2) + 1;
  const mid2 = n - mid1 + 1;
  const cmad = 3 * (sorted[mid1 - 1] + sorted[mid2 - 1]);
  const c9 = 0.999 * cmad;
  const c1 = 0.001 * cmad;
  const rw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (r[i] <= c1) rw[i] = 1;
    else if (r[i] <= c9) rw[i] = (1 - (r[i] / cmad) ** 2) ** 2;
    else rw[i] = 0;
  }
  return rw;
}

const oddAtLeast = (x) => (x % 2 === 0 ? x + 1 : x);

/** Default trend window: smallest odd integer >= 1.5 np / (1 - 1.5 / ns). */
export function defaultTrend(period, seasonal) {
  return oddAtLeast(Math.ceil((1.5 * period) / (1 - 1.5 / seasonal)));
}

/** Default low-pass window: smallest odd integer > period. */
export function defaultLowPass(period) {
  return oddAtLeast(period + 1);
}

/**
 * STL decomposition of an evenly spaced, gap-free series.
 * Returns { trend, seasonal, resid, weights, params }.
 */
export function stl(values, opts = {}) {
  const y = Float64Array.from(values);
  const n = y.length;
  const period = Number(opts.period);
  if (!Number.isInteger(period) || period < 2) throw new Error("The period must be a whole number of at least 2 (12 for monthly data with a yearly cycle, 7 for daily data with a weekly one).");
  if (n < 2 * period) throw new Error(`STL needs at least two full cycles: ${2 * period} points for a period of ${period}, and the series has ${n}.`);
  for (let i = 0; i < n; i++) if (!Number.isFinite(y[i])) throw new Error(`Value ${i + 1} is not a finite number.`);
  const seasonal = opts.seasonal ?? DEFAULTS.seasonal;
  const robust = Boolean(opts.robust ?? DEFAULTS.robust);
  const trend = opts.trend ?? defaultTrend(period, seasonal);
  const lowPass = opts.lowPass ?? defaultLowPass(period);
  const params = {
    period,
    seasonal,
    trend,
    lowPass,
    seasonalDeg: opts.seasonalDeg ?? DEFAULTS.seasonalDeg,
    trendDeg: opts.trendDeg ?? DEFAULTS.trendDeg,
    lowPassDeg: opts.lowPassDeg ?? DEFAULTS.lowPassDeg,
    seasonalJump: opts.seasonalJump ?? DEFAULTS.seasonalJump,
    trendJump: opts.trendJump ?? DEFAULTS.trendJump,
    lowPassJump: opts.lowPassJump ?? DEFAULTS.lowPassJump,
    robust,
    innerIter: opts.innerIter ?? (robust ? 2 : 5),
    outerIter: opts.outerIter ?? (robust ? 15 : 0),
  };
  const odd = (name, v, min) => {
    if (!Number.isInteger(v) || v < min || v % 2 === 0) throw new Error(`The ${name} window must be an odd whole number of at least ${min} (got ${v}).`);
  };
  odd("seasonal", params.seasonal, 3);
  odd("trend", params.trend, 3);
  odd("low-pass", params.lowPass, 3);
  if (params.trend <= period) throw new Error(`The trend window (${params.trend}) must be longer than the period (${period}), or the trend absorbs the seasonal cycle.`);
  if (params.lowPass <= period) throw new Error(`The low-pass window (${params.lowPass}) must be longer than the period (${period}).`);
  for (const k of ["seasonalDeg", "trendDeg", "lowPassDeg"]) if (params[k] !== 0 && params[k] !== 1) throw new Error(`${k} must be 0 or 1.`);
  for (const k of ["seasonalJump", "trendJump", "lowPassJump", "innerIter"]) if (!Number.isInteger(params[k]) || params[k] < 1) throw new Error(`${k} must be a whole number of at least 1.`);
  if (!Number.isInteger(params.outerIter) || params.outerIter < 0) throw new Error("outerIter must be a whole number of at least 0.");

  const np = period;
  const trendOut = new Float64Array(n);
  const season = new Float64Array(n);
  let rw = new Float64Array(n).fill(1);
  const w1 = new Float64Array(n + 2 * np);
  const cyc = new Float64Array(n + 2 * np);
  const low = new Float64Array(n + 2 * np);
  const w4 = new Float64Array(n + 2 * np);
  let userw = false;
  const inner = () => {
    for (let pass = 0; pass < params.innerIter; pass++) {
      for (let i = 0; i < n; i++) w1[i] = y[i] - trendOut[i];
      ss(w1, n, np, params.seasonal, params.seasonalDeg, params.seasonalJump, userw, rw, cyc);
      fts(cyc, n + 2 * np, np, low, w1);
      ess(low, n, params.lowPass, params.lowPassDeg, params.lowPassJump, false, rw, w4, w1);
      for (let i = 0; i < n; i++) season[i] = cyc[np + i] - w4[i];
      for (let i = 0; i < n; i++) w1[i] = y[i] - season[i];
      ess(w1, n, params.trend, params.trendDeg, params.trendJump, userw, rw, trendOut, low);
    }
  };
  inner();
  for (let k = 0; k < params.outerIter; k++) {
    const fit = new Float64Array(n);
    for (let i = 0; i < n; i++) fit[i] = trendOut[i] + season[i];
    rw = robustnessWeights(y, fit);
    userw = true;
    inner();
  }
  // The weights returned are the ones the final pass used (as statsmodels does).
  const resid = new Float64Array(n);
  for (let i = 0; i < n; i++) resid[i] = y[i] - trendOut[i] - season[i];
  return { trend: Array.from(trendOut), seasonal: Array.from(season), resid: Array.from(resid), weights: Array.from(rw), params };
}

// ---------------------------------------------------------------- input
const MISSING = new Set(["", "na", "nan", "null", "none", "-", "?", "n/a", "#n/a"]);
const isMissing = (s) => MISSING.has(String(s ?? "").trim().toLowerCase());
const numText = (s) => String(s ?? "").trim().replace(/^\$|%$/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
const isNum = (s) => numText(s) !== "" && Number.isFinite(Number(numText(s)));

function splitLine(line, delim) {
  const out = [];
  let cur = "";
  let quoted = false;
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

/** Parse a CSV with a header row, or a bare list of numbers. */
export function parseCsv(text) {
  const raw = String(text ?? "").replace(/^﻿/, "");
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lines.length) return { error: "The data is empty. Paste a CSV with a date column and a value column, or a list of numbers." };
  if (lines.every((l) => l.split(/[\s;,\t]+/).filter(Boolean).every((t) => isNum(t) || isMissing(t))) && !lines[0].includes(",")) {
    const tokens = raw.split(/[\s;]+/).filter(Boolean);
    return { columns: ["value"], rows: tokens.map((t) => [t]), list: true };
  }
  const delim = [",", "\t", ";"].map((d) => [d, lines[0].split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cells = lines.map((l) => splitLine(l, delim));
  if (cells[0].every((c) => isNum(c))) {
    if (cells.every((r) => r.length === 1)) return { columns: ["value"], rows: cells, list: true };
    return { error: "The first line looks like data, not a header. Add a header row (for example month,sales)." };
  }
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
  return { columns, rows, list: false };
}

const DAY = 86400000;

/** Parse a date cell to a UTC timestamp, or null. Accepts ISO dates and times, YYYY-MM, YYYY Qn, YYYY-Www, M/D/YYYY. */
export function parseDate(s) {
  const t = String(s ?? "").trim();
  let m;
  if ((m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t))) {
    const v = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? v : null;
  }
  if ((m = /^(\d{4})[-/.](\d{1,2})$/.exec(t))) return +m[2] >= 1 && +m[2] <= 12 ? Date.UTC(+m[1], +m[2] - 1, 1) : null;
  if ((m = /^(\d{4})\s*-?\s*Q([1-4])$/i.exec(t))) return Date.UTC(+m[1], (+m[2] - 1) * 3, 1);
  if ((m = /^(\d{4})-?W(\d{1,2})$/i.exec(t))) {
    const jan4 = Date.UTC(+m[1], 0, 4);
    const dow = (new Date(jan4).getUTCDay() + 6) % 7;
    return jan4 - dow * DAY + (+m[2] - 1) * 7 * DAY;
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) return Date.UTC(+m[3], +m[1] - 1, +m[2]);
  return null;
}

/** Guess the sampling interval and seasonal period from timestamps. */
export function inferPeriod(times) {
  const steps = [];
  for (let i = 1; i < times.length; i++) steps.push((times[i] - times[i - 1]) / DAY);
  if (!steps.length) return null;
  const sorted = [...steps].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const tol = (lo, hi) => med >= lo && med <= hi;
  let res = null;
  if (tol(0.04, 0.045)) res = { interval: "hourly", period: 24, cycle: "day", alternatives: [{ period: 168, cycle: "week" }] };
  else if (tol(0.95, 1.05)) res = { interval: "daily", period: 7, cycle: "week", alternatives: [{ period: 365, cycle: "year" }] };
  else if (tol(6.5, 7.5)) res = { interval: "weekly", period: 52, cycle: "year", alternatives: [] };
  else if (tol(27, 32)) res = { interval: "monthly", period: 12, cycle: "year", alternatives: [] };
  else if (tol(88, 93)) res = { interval: "quarterly", period: 4, cycle: "year", alternatives: [] };
  else if (tol(0.0098, 0.0110)) res = { interval: "quarter-hourly", period: 96, cycle: "day", alternatives: [] };
  else if (tol(0.0200, 0.0220)) res = { interval: "half-hourly", period: 48, cycle: "day", alternatives: [] };
  if (!res) return { interval: null, period: null, medianStepDays: med };
  const irregular = steps.filter((s) => Math.abs(s - med) > 0.5 * med).length;
  return { ...res, medianStepDays: med, irregular, backwards: steps.filter((s) => s <= 0).length };
}

const NAME_HINTS = /^(value|values|y|sales|revenue|count|total|amount|qty|quantity|orders|visits|demand|load|kwh|usage|price|co2|average)$/i;
const DATE_HINTS = /^(date|day|month|week|time|timestamp|period|ds|datetime|quarter|year_month)$/i;

function chooseColumns(parsed, input) {
  const { columns, rows } = parsed;
  const numericCols = columns.filter((c, j) => rows.some((r) => !isMissing(r[j])) && rows.every((r) => isMissing(r[j]) || isNum(r[j])));
  const dateCols = columns.filter((c, j) => rows.filter((r) => !isMissing(r[j])).every((r) => parseDate(r[j]) !== null) && rows.some((r) => parseDate(r[j]) !== null));
  let column = input.column;
  if (column !== undefined && !columns.includes(column)) return { error: `There is no column named "${column}". Columns: ${columns.join(", ")}.` };
  if (column === undefined) column = numericCols.find((c) => NAME_HINTS.test(c) && !dateCols.includes(c)) ?? numericCols.find((c) => !dateCols.includes(c));
  if (column === undefined) return { error: "No numeric column found. The value column must hold numbers." };
  let dateColumn = input.dateColumn;
  if (dateColumn !== undefined && dateColumn !== "" && !columns.includes(dateColumn)) return { error: `There is no date column named "${dateColumn}".` };
  if (dateColumn === undefined) dateColumn = dateCols.find((c) => DATE_HINTS.test(c)) ?? dateCols.find((c) => c !== column) ?? "";
  return { column, dateColumn, numericCols, dateCols };
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const variance = (a) => {
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1);
};
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/** Strength of trend and seasonality, each in [0, 1]. */
export function strengths(trend, seasonal, resid) {
  const vr = variance(resid);
  const vtr = variance(trend.map((t, i) => t + resid[i]));
  const vsr = variance(seasonal.map((s, i) => s + resid[i]));
  return {
    trend: vtr > 0 ? Math.max(0, 1 - vr / vtr) : 0,
    seasonal: vsr > 0 ? Math.max(0, 1 - vr / vsr) : 0,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function positionLabel(time, interval, fallback) {
  if (time === null || time === undefined) return `position ${fallback + 1}`;
  const d = new Date(time);
  if (interval === "monthly") return MONTHS[d.getUTCMonth()];
  if (interval === "quarterly") return `Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  if (interval === "daily") return WEEKDAYS[d.getUTCDay()];
  if (interval === "hourly") return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
  if (interval === "half-hourly" || interval === "quarter-hourly") return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return `position ${fallback + 1}`;
}

export const fmt = (v, digits = 3) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(2);
  return Number(v.toPrecision(Math.max(digits, Math.ceil(Math.log10(a + 1)) + 1))).toLocaleString("en-US", { maximumFractionDigits: 6 });
};

const toInt = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));

/**
 * Decompose a series. Input: { csv | values, column?, dateColumn?, period?,
 * seasonal?, trend?, lowPass?, robust?, seasonalDeg?, trendDeg?, lowPassDeg?,
 * seasonalJump?, trendJump?, lowPassJump?, innerIter?, outerIter?, outlierZ? }.
 * Returns the components, strengths, seasonal profile, unusual points and a
 * plain-language summary; { error } when the input cannot be decomposed.
 */
export function analyze(input = {}) {
  const warnings = [];
  let labels = [];
  let times = [];
  let raw = [];
  let column = "value";
  let dateColumn = "";
  if (Array.isArray(input.values)) {
    raw = input.values.map((v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? NaN : Number(v)));
    labels = Array.isArray(input.dates) ? input.dates.map(String) : raw.map((_, i) => String(i + 1));
    times = Array.isArray(input.dates) ? input.dates.map(parseDate) : raw.map(() => null);
    if (Array.isArray(input.dates) && input.dates.length !== raw.length) return { error: "dates and values must have the same length." };
  } else {
    const parsed = parseCsv(input.csv);
    if (parsed.error) return { error: parsed.error };
    if (parsed.list) {
      raw = parsed.rows.map((r) => (isMissing(r[0]) ? NaN : Number(numText(r[0]))));
      labels = raw.map((_, i) => String(i + 1));
      times = raw.map(() => null);
    } else {
      const pick = chooseColumns(parsed, input);
      if (pick.error) return { error: pick.error };
      ({ column, dateColumn } = pick);
      const j = parsed.columns.indexOf(column);
      const dj = dateColumn ? parsed.columns.indexOf(dateColumn) : -1;
      let rows = parsed.rows;
      if (dj >= 0) {
        const bad = rows.filter((r) => parseDate(r[dj]) === null).length;
        if (bad) warnings.push(`${bad} row${bad === 1 ? "" : "s"} with an unreadable date in "${dateColumn}" were left out.`);
        rows = rows.filter((r) => parseDate(r[dj]) !== null);
        const order = rows.map((r, i) => [parseDate(r[dj]), i]);
        const sortedOrder = [...order].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        if (sortedOrder.some((p, i) => p[1] !== order[i][1])) {
          warnings.push("The rows were not in date order; they were sorted by date.");
          rows = sortedOrder.map((p) => rows[p[1]]);
        }
        const dup = rows.filter((r, i) => i > 0 && parseDate(r[dj]) === parseDate(rows[i - 1][dj])).length;
        if (dup) return { error: `${dup} date${dup === 1 ? " appears" : "s appear"} more than once in "${dateColumn}". STL needs one value per time step: total or average the duplicates first.` };
      }
      raw = rows.map((r) => (isMissing(r[j]) || !isNum(r[j]) ? NaN : Number(numText(r[j]))));
      labels = rows.map((r, i) => (dj >= 0 ? r[dj] : String(i + 1)));
      times = rows.map((r) => (dj >= 0 ? parseDate(r[dj]) : null));
    }
  }
  // Trim leading and trailing gaps; fill interior gaps linearly.
  let first = raw.findIndex((v) => Number.isFinite(v));
  if (first < 0) return { error: "The value column has no numbers in it." };
  let last = raw.length - 1;
  while (!Number.isFinite(raw[last])) last--;
  const dropped = first + (raw.length - 1 - last);
  if (dropped) warnings.push(`${dropped} empty value${dropped === 1 ? "" : "s"} at the start or end were left out.`);
  raw = raw.slice(first, last + 1);
  labels = labels.slice(first, last + 1);
  times = times.slice(first, last + 1);
  const filled = [];
  for (let i = 0; i < raw.length; i++) {
    if (Number.isFinite(raw[i])) continue;
    let k = i;
    while (!Number.isFinite(raw[k])) k++;
    for (let t = i; t < k; t++) {
      raw[t] = raw[i - 1] + ((raw[k] - raw[i - 1]) * (t - i + 1)) / (k - i + 1);
      filled.push(t);
    }
    i = k;
  }
  if (filled.length) warnings.push(`${filled.length} missing value${filled.length === 1 ? " was" : "s were"} filled by straight-line interpolation between neighbours (STL needs a value at every step); they are marked in the table.`);

  // Period: given, or inferred from the dates.
  const hasDates = times.length > 0 && times.every((t) => t !== null);
  const guess = hasDates ? inferPeriod(times) : null;
  let period = toInt(input.period);
  let periodSource = "given";
  if (period === undefined) {
    if (guess?.period) {
      period = guess.period;
      periodSource = `inferred: ${guess.interval} data, one ${guess.cycle} = ${guess.period} steps`;
      if (raw.length < 2 * period && guess.alternatives?.length === 0 && guess.interval === "weekly") {
        return { error: `Weekly data with a yearly cycle needs at least 104 weeks; the series has ${raw.length}. Give a shorter period if there is a shorter cycle.` };
      }
    } else if (hasDates) {
      return { error: `Could not tell the seasonal period from the dates (median step ${fmt(guess?.medianStepDays ?? NaN)} days). Enter the period: the number of steps in one cycle.` };
    } else {
      return { error: "No date column was found, so the period cannot be inferred. Enter the period: the number of steps in one cycle (12 for monthly data with a yearly cycle, 7 for daily data with a weekly one)." };
    }
  }
  if (guess?.irregular) warnings.push(`${guess.irregular} step${guess.irregular === 1 ? " is" : "s are"} much longer or shorter than the usual ${guess.interval ?? ""} step: missing dates are not filled in, so the rows are treated as evenly spaced. Add the missing dates with empty values to have them interpolated.`);
  if (guess?.interval === "weekly" && period === 52) warnings.push("A year is 52.18 weeks, so a period of 52 lets the weekly calendar drift by about one week every five or six years; STL needs a whole-number period.");

  const opts = { period };
  for (const k of ["seasonal", "trend", "lowPass", "seasonalDeg", "trendDeg", "lowPassDeg", "seasonalJump", "trendJump", "lowPassJump", "innerIter", "outerIter"]) {
    const v = toInt(input[k]);
    if (v !== undefined) opts[k] = v;
  }
  opts.robust = input.robust === true || input.robust === "true" || input.robust === 1 || input.robust === "1";
  let fit;
  try {
    fit = stl(raw, opts);
  } catch (e) {
    return { error: e.message };
  }
  const { trend, seasonal, resid, weights, params } = fit;
  const n = raw.length;
  const st = strengths(trend, seasonal, resid);
  const adjusted = raw.map((v, i) => v - seasonal[i]);

  // Seasonal profile: the latest full cycle, and the average over all cycles, by position.
  const profile = [];
  const lastStart = n - period;
  for (let p = 0; p < period; p++) {
    const idx = lastStart + p;
    const pos = idx % period;
    const all = [];
    for (let i = pos; i < n; i += period) all.push(seasonal[i]);
    profile.push({ position: pos + 1, label: positionLabel(times[idx], guess?.interval, pos), latest: seasonal[idx], average: mean(all), latestDate: labels[idx] });
  }
  const peak = profile.reduce((a, b) => (b.latest > a.latest ? b : a));
  const trough = profile.reduce((a, b) => (b.latest < a.latest ? b : a));
  const amplitude = peak.latest - trough.latest;
  const firstCycle = seasonal.slice(0, period);
  const firstAmp = Math.max(...firstCycle) - Math.min(...firstCycle);

  // Unusual points: robust z-score of the remainder (median / 1.4826 MAD).
  const zLimit = Number(input.outlierZ ?? DEFAULTS.outlierZ);
  const med = median(resid);
  const mad = median(resid.map((r) => Math.abs(r - med))) * 1.4826;
  const unusual = [];
  for (let i = 0; i < n; i++) {
    const z = mad > 0 ? (resid[i] - med) / mad : 0;
    if (Math.abs(z) >= zLimit) unusual.push({ index: i, date: labels[i], value: raw[i], expected: trend[i] + seasonal[i], resid: resid[i], z, weight: weights[i] });
  }
  unusual.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  // Trend movement over the last cycle and overall.
  const trendChangeLastCycle = trend[n - 1] - trend[n - 1 - period];
  const trendChangeTotal = trend[n - 1] - trend[0];
  const level = mean(raw.map(Math.abs));
  const ampShare = level > 0 ? amplitude / level : null;

  const strengthWord = (s) => (s >= 0.9 ? "very strong" : s >= 0.64 ? "strong" : s >= 0.4 ? "moderate" : s >= 0.2 ? "weak" : "little or no");
  const cycleWord = guess?.cycle && period === guess.period ? guess.cycle : `${period}-step cycle`;
  const summary = [
    `Over ${n} points, the series has ${strengthWord(st.seasonal)} seasonality (strength ${st.seasonal.toFixed(2)} of 1) and ${strengthWord(st.trend)} trend (strength ${st.trend.toFixed(2)}).`,
    `In the latest ${cycleWord}, the seasonal swing from the low (${trough.label}, ${fmt(trough.latest)}) to the high (${peak.label}, +${fmt(peak.latest)}) is ${fmt(amplitude)}${ampShare !== null ? `, about ${(ampShare * 100).toFixed(ampShare < 0.1 ? 1 : 0)}% of the average level` : ""}${firstAmp > 0 ? `; it was ${fmt(firstAmp)} in the first cycle` : ""}.`,
    `The trend moved ${trendChangeLastCycle >= 0 ? "up" : "down"} ${fmt(Math.abs(trendChangeLastCycle))} over the last ${cycleWord} and ${trendChangeTotal >= 0 ? "up" : "down"} ${fmt(Math.abs(trendChangeTotal))} over the whole series.`,
    unusual.length
      ? `${unusual.length} point${unusual.length === 1 ? " stands" : "s stand"} out from trend and season (remainder at least ${zLimit} robust standard deviations), the largest at ${unusual[0].date} (${unusual[0].resid >= 0 ? "+" : ""}${fmt(unusual[0].resid)}).`
      : `No point stands out from trend and season by ${zLimit} robust standard deviations or more.`,
  ].join(" ");
  if (!params.robust && unusual.length) warnings.push("Some points stand out. Robust mode down-weights them so they do not bend the trend and seasonal estimates; try it and compare.");

  return {
    n,
    column,
    dateColumn: dateColumn || null,
    interval: guess?.interval ?? null,
    period,
    periodSource,
    params,
    dates: labels,
    observed: raw,
    trend,
    seasonal,
    resid,
    weights,
    adjusted,
    filled,
    strength: st,
    profile,
    peak: { label: peak.label, value: peak.latest },
    trough: { label: trough.label, value: trough.latest },
    amplitude,
    firstCycleAmplitude: firstAmp,
    trendChangeLastCycle,
    trendChangeTotal,
    residualScale: mad,
    outlierZ: zLimit,
    unusual,
    warnings,
    summary,
  };
}
