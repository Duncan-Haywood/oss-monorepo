// Matrix profile explorer: the exact matrix profile of a time series by STOMP,
// with the top motifs (most similar pairs of subsequences) and discords
// (subsequences farthest from their nearest neighbour). Pure functions: no DOM,
// no network, no randomness. Works in Node and in a browser or Web Worker.
import { EXAMPLE } from "./example-data.mjs";

/** Papers this tool implements, printed by `platform/agents/tools.mjs describe`. */
export const PAPERS = [
  {
    authors: "Chin-Chia Michael Yeh, Yan Zhu, Liudmila Ulanova, Nurjahan Begum, Yifei Ding, Hoang Anh Dau, Diego Furtado Silva, Abdullah Mueen, Eamonn Keogh",
    title: "Matrix Profile I: All Pairs Similarity Joins for Time Series: A Unifying View That Includes Motifs, Discords and Shapelets",
    venue: "IEEE 16th International Conference on Data Mining (ICDM)",
    year: 2016,
    pages: "1317-1322",
    url: "https://doi.org/10.1109/ICDM.2016.0179",
    doi: "10.1109/ICDM.2016.0179",
    implemented: "Definitions: z-normalized Euclidean distance between subsequences, the matrix profile P and matrix profile index I of a self-join, the trivial-match exclusion zone, motifs as the pair with the smallest P, discords as the subsequences with the largest P.",
    deviations: "Exclusion zone is ceil(m/4) (the value used in Matrix Profile II and common libraries) rather than m/2. The profile is computed by STOMP, not by the paper's STAMP/MASS anytime algorithm, so the result is exact rather than anytime.",
  },
  {
    authors: "Yan Zhu, Zachary Zimmerman, Nader Shakibay Senobari, Chin-Chia Michael Yeh, Gareth Funning, Abdullah Mueen, Philip Brisk, Eamonn Keogh",
    title: "Matrix Profile II: Exploiting a Novel Algorithm and GPUs to Break the One Hundred Million Barrier for Time Series Motifs and Joins",
    venue: "IEEE 16th International Conference on Data Mining (ICDM)",
    year: 2016,
    pages: "739-748",
    url: "https://doi.org/10.1109/ICDM.2016.0085",
    doi: "10.1109/ICDM.2016.0085",
    implemented: "STOMP: the first row of sliding dot products is computed directly, then each later row by the O(1) recurrence QT[i][j] = QT[i-1][j-1] - T[i-1]T[j-1] + T[i+m-1]T[j+m-1]; distances use the mean/standard-deviation identity, giving an exact O(n^2) self-join.",
    deviations: "First row by direct dot products (O(nm)) instead of FFT/MASS. Single-threaded CPU in JavaScript, no GPU. Only the upper triangle (j > i) is evaluated and both P[i] and P[j] are updated, which halves the work for a self-join. Constant subsequences follow a stated convention (see CONVENTIONS).",
  },
];

/** Default inputs, as the page uses them. With no series given, analyze() runs the bundled example. */
export const DEFAULTS = {
  csv: null,
  values: null,
  labels: null,
  column: null,
  window: null,
  top: 3,
  detrend: false,
  includeProfile: false,
};

/** Conventions the results depend on, stated once so page, CLI and README agree. */
export const CONVENTIONS = {
  distance: "z-normalized Euclidean distance between two length-m subsequences: each is shifted to mean 0 and scaled to standard deviation 1 (population), then compared. Range 0 (same shape) to 2*sqrt(m) (opposite shape).",
  correlation: "Pearson correlation r of two subsequences, equivalent to the distance by d = sqrt(2m(1 - r)).",
  exclusionZone: "A subsequence's neighbour must start more than ceil(m/4) positions away, so that a subsequence is not matched with a slightly shifted copy of itself (a trivial match).",
  constant: "A subsequence whose m values are all identical has no defined z-normalization; it is treated as all zeros. Two constant subsequences are at distance 0; a constant and a non-constant subsequence are at distance sqrt(m). No NaN is produced.",
  topK: "Motifs and discords are listed in order; a later one is skipped if it starts within m positions of a subsequence already listed, so the listed results do not overlap each other.",
  windowSuggestion: "When no window is given: remove the least-squares quadratic trend (level, slope and curvature), compute the autocorrelation for lags 3 to min(n/4, 1000), and take the lag of the first local maximum after the autocorrelation first drops below zero, provided that peak is at least 0.2 (one period of the strongest cycle). Otherwise fall back to round(n/50) clamped to 8..100. Capped at n/4.",
  column: "With no column named: the only column; else the first column after the first whose header does not name a time or index (year, month, date, time, ...) and whose cells are mostly numbers; else the second column.",
  missing: "Empty or non-numeric cells inside the chosen column are filled by linear interpolation between their neighbours; leading and trailing gaps are dropped. The count is reported.",
};

export const LIMITS = { warnPoints: 20000, maxPoints: 200000, minWindow: 3 };

const isNum = (s) => /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s);
const MISSING = /^(|na|n\/a|nan|null|none|-|\?)$/i;

function splitLine(line, delim) {
  const out = [];
  let cur = "";
  let q = false;
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (q) {
      if (c === '"') {
        if (line[k + 1] === '"') { cur += '"'; k++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Parse CSV text into { columns, rows, header } where rows are arrays of
 * trimmed strings. Skips blank lines and lines starting with '#'. Detects a
 * comma, semicolon or tab delimiter, and a header row (first row with a
 * non-numeric, non-missing cell).
 */
export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const lines = src.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "" && !/^\s*#/.test(l));
  if (!lines.length) return { error: "No data found. Paste one number per line, or a CSV with a header row." };
  const first = lines[0];
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const d of Object.keys(counts)) counts[d] = splitLine(first, d).length - 1;
  let delim = ",";
  if (counts["\t"] > 0 && counts["\t"] >= counts[","]) delim = "\t";
  else if (counts[";"] > counts[","]) delim = ";";
  const table = lines.map((l) => splitLine(l, delim));
  const width = Math.max(...table.map((r) => r.length));
  const head = table[0];
  const header = head.some((c) => !isNum(c) && !MISSING.test(c));
  const columns = header ? Array.from({ length: width }, (_, k) => head[k] || `column ${k + 1}`) : Array.from({ length: width }, (_, k) => (width === 1 ? "value" : `column ${k + 1}`));
  return { columns, rows: header ? table.slice(1) : table, header, delimiter: delim };
}

const TIME_LIKE = /^(year|yr|month|mon|day|date|time|hour|minute|second|week|quarter|timestamp|datetime|period|t|index|idx|id|row|n|decimal[ _]?date)$/i;

/**
 * The column analysed when none is named: the only column; else the first
 * column after the first whose header does not name a time or index (year,
 * month, date, time, ...) and whose cells are mostly numbers; else column 2.
 */
export function defaultColumn(columns, rows = []) {
  if (columns.length < 2) return 0;
  const sample = rows.slice(0, 200);
  for (let k = 1; k < columns.length; k++) {
    if (TIME_LIKE.test(columns[k].trim())) continue;
    const numeric = sample.filter((r) => isNum((r[k] ?? "").trim())).length;
    if (sample.length === 0 || numeric >= 0.8 * sample.length) return k;
  }
  return 1;
}

/** Which column index a `column` option names: a header name (case-insensitive) or a 1-based number; none gives defaultColumn. */
export function pickColumn(columns, column, rows = []) {
  if (column === null || column === undefined || column === "") return defaultColumn(columns, rows);
  const s = String(column).trim();
  const byName = columns.findIndex((c) => c.toLowerCase() === s.toLowerCase());
  if (byName >= 0) return byName;
  if (/^\d+$/.test(s)) {
    const k = Number(s) - 1;
    if (k >= 0 && k < columns.length) return k;
  }
  return -1;
}

/**
 * Turn CSV text into a numeric series. Returns { values, labels, column,
 * columns, filled, dropped } or { error }. Labels are "year-month" when the
 * CSV has year and month columns, else the first column when another column
 * is analysed.
 */
export function seriesFromCsv(text, column = null) {
  const p = parseCsv(text);
  if (p.error) return p;
  const k = pickColumn(p.columns, column, p.rows);
  if (k < 0) return { error: `No column "${column}". Columns: ${p.columns.join(", ")}.`, columns: p.columns };
  const raw = p.rows.map((r) => {
    const s = (r[k] ?? "").replace(/^"|"$/g, "");
    if (isNum(s)) return Number(s);
    if (MISSING.test(s)) return NaN;
    return NaN;
  });
  // Labels: "year-month" when the CSV has year and month columns, else the first column.
  const yi = p.columns.findIndex((c) => c.toLowerCase() === "year");
  const mi = p.columns.findIndex((c) => c.toLowerCase() === "month");
  const labelsRaw = yi >= 0 && mi >= 0 && k !== yi && k !== mi
    ? p.rows.map((r) => `${r[yi] ?? ""}-${String(r[mi] ?? "").padStart(2, "0")}`)
    : k !== 0 && p.columns.length > 1 ? p.rows.map((r) => r[0] ?? "") : null;
  const badText = p.rows.filter((r) => { const s = (r[k] ?? "").trim(); return s !== "" && !isNum(s) && !MISSING.test(s); }).length;
  let lo = 0;
  let hi = raw.length - 1;
  while (lo <= hi && !Number.isFinite(raw[lo])) lo++;
  while (hi >= lo && !Number.isFinite(raw[hi])) hi--;
  if (lo > hi) return { error: `Column "${p.columns[k]}" has no numbers.`, columns: p.columns };
  const values = raw.slice(lo, hi + 1);
  let filled = 0;
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) continue;
    let j = i;
    while (!Number.isFinite(values[j])) j++;
    const a = values[i - 1];
    const b = values[j];
    for (let t = i; t < j; t++) { values[t] = a + ((b - a) * (t - i + 1)) / (j - i + 1); filled++; }
    i = j;
  }
  return {
    values,
    labels: labelsRaw ? labelsRaw.slice(lo, hi + 1) : null,
    column: p.columns[k],
    columns: p.columns,
    filled,
    dropped: lo + (raw.length - 1 - hi),
    nonNumericCells: badText,
  };
}

/** Subtract the least-squares straight line from a series (returns a new Float64Array). */
export function detrendLinear(values) {
  const n = values.length;
  const out = new Float64Array(n);
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += values[i]; }
  const mx = sx / n, my = sy / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (i - mx) * (values[i] - my); sxx += (i - mx) * (i - mx); }
  const b = sxx > 0 ? sxy / sxx : 0;
  for (let i = 0; i < n; i++) out[i] = values[i] - my - b * (i - mx);
  return out;
}

/** Residuals from the least-squares quadratic a + b t + c t^2 (t scaled to [-1, 1]); used only to suggest a window. */
export function detrendQuadratic(values) {
  const n = values.length;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const y = [0, 0, 0];
  const tt = (i) => (n > 1 ? (2 * i) / (n - 1) - 1 : 0);
  for (let i = 0; i < n; i++) {
    const f = [1, tt(i), tt(i) * tt(i)];
    for (let a = 0; a < 3; a++) { y[a] += f[a] * values[i]; for (let b = 0; b < 3; b++) A[a][b] += f[a] * f[b]; }
  }
  // Gaussian elimination with partial pivoting on the 3x3 normal equations.
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [y[c], y[p]] = [y[p], y[c]];
    if (Math.abs(A[c][c]) < 1e-12) return detrendLinear(values);
    for (let r = c + 1; r < 3; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 3; k++) A[r][k] -= f * A[c][k];
      y[r] -= f * y[c];
    }
  }
  const coef = [0, 0, 0];
  for (let c = 2; c >= 0; c--) {
    let s = y[c];
    for (let k = c + 1; k < 3; k++) s -= A[c][k] * coef[k];
    coef[c] = s / A[c][c];
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = tt(i); out[i] = values[i] - coef[0] - coef[1] * t - coef[2] * t * t; }
  return out;
}

/** Suggest a window length from the data (see CONVENTIONS.windowSuggestion). Returns { window, lag, acf, reason }. */
export function suggestWindow(values) {
  const n = values.length;
  const cap = Math.max(LIMITS.minWindow, Math.floor(n / 4));
  const fallback = () => Math.min(cap, Math.max(8, Math.min(100, Math.round(n / 50))));
  if (n < 16) return { window: Math.min(cap, Math.max(LIMITS.minWindow, Math.floor(n / 4))), lag: null, acf: null, reason: "series too short for an autocorrelation estimate" };
  const x = detrendQuadratic(values);
  let c0 = 0;
  for (let i = 0; i < n; i++) c0 += x[i] * x[i];
  if (!(c0 > 0)) return { window: fallback(), lag: null, acf: null, reason: "series is a straight line or constant; default window" };
  const maxLag = Math.min(Math.floor(n / 4), 1000);
  const acf = new Float64Array(maxLag + 2);
  for (let L = 1; L <= maxLag + 1 && L < n; L++) {
    let s = 0;
    for (let i = 0; i + L < n; i++) s += x[i] * x[i + L];
    acf[L] = s / c0;
  }
  let crossed = false;
  for (let L = 1; L <= maxLag; L++) {
    if (!crossed) { if (acf[L] < 0) crossed = true; continue; }
    if (L >= 3 && acf[L] >= acf[L - 1] && acf[L] > acf[L + 1] && acf[L] >= 0.2) {
      return { window: Math.min(cap, L), lag: L, acf: acf[L], reason: `autocorrelation peaks at lag ${L} (r = ${acf[L].toFixed(2)}), one period of the strongest cycle` };
    }
  }
  return { window: fallback(), lag: null, acf: null, reason: "no clear cycle in the autocorrelation; default of n/50 clamped to 8..100" };
}

/** Exclusion zone half-width for window m: ceil(m/4). Neighbours must satisfy |i - j| > zone. */
export const exclusionZone = (m) => Math.ceil(m / 4);

/**
 * Exact matrix profile of a self-join by STOMP. `values` is an array or
 * Float64Array, `m` the subsequence length. Returns { profile, index, mu,
 * sigma, constant, zone } with profile[i] the z-normalized Euclidean distance
 * from subsequence i to its nearest non-trivial neighbour index[i].
 */
export function matrixProfile(values, m) {
  const n = values.length;
  const l = n - m + 1;
  if (!(m >= LIMITS.minWindow) || l < 2) throw new Error(`window must be at least ${LIMITS.minWindow} and at most half the series length`);
  // Centre the series: z-normalized distances are unchanged, and dot products lose less precision.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += values[i];
  mean /= n;
  const T = new Float64Array(n);
  for (let i = 0; i < n; i++) T[i] = values[i] - mean;

  // Per-subsequence mean and population std, two-pass for accuracy; exact constancy by run length.
  const mu = new Float64Array(l);
  const sig = new Float64Array(l);
  const constant = new Uint8Array(l);
  const run = new Int32Array(n);
  run[n - 1] = 1;
  for (let i = n - 2; i >= 0; i--) run[i] = values[i] === values[i + 1] ? run[i + 1] + 1 : 1;
  for (let i = 0; i < l; i++) {
    let s = 0;
    for (let k = 0; k < m; k++) s += T[i + k];
    const u = s / m;
    let v = 0;
    for (let k = 0; k < m; k++) { const d = T[i + k] - u; v += d * d; }
    mu[i] = u;
    sig[i] = Math.sqrt(v / m);
    if (run[i] >= m || sig[i] === 0) { constant[i] = 1; sig[i] = 0; }
  }

  const zone = exclusionZone(m);
  const P = new Float64Array(l).fill(Infinity);
  const I = new Int32Array(l).fill(-1);
  const twoM = 2 * m;
  const sqrtM = Math.sqrt(m);

  // First row: QT[0][j] by direct dot products (equal to the first column by symmetry).
  const first = new Float64Array(l);
  for (let j = 0; j < l; j++) {
    let s = 0;
    for (let k = 0; k < m; k++) s += T[k] * T[j + k];
    first[j] = s;
  }
  const QT = new Float64Array(l);
  QT.set(first);

  for (let i = 0; i < l; i++) {
    if (i > 0) {
      // Row i from row i-1, right to left so QT[j-1] still holds row i-1.
      const a = T[i - 1];
      const b = T[i + m - 1];
      // QT[i] (the diagonal) is kept: row i+1 needs it for QT[i+1].
      for (let j = l - 1; j >= i; j--) QT[j] = QT[j - 1] - a * T[j - 1] + b * T[j + m - 1];
    }
    const ci = constant[i];
    const mi = mu[i];
    const si = sig[i];
    for (let j = i + zone + 1; j < l; j++) {
      let d;
      if (ci || constant[j]) d = ci && constant[j] ? 0 : sqrtM;
      else {
        let r = (QT[j] - m * mi * mu[j]) / (m * si * sig[j]);
        if (r > 1) r = 1; else if (r < -1) r = -1;
        d = Math.sqrt(twoM * (1 - r));
      }
      if (d < P[i]) { P[i] = d; I[i] = j; }
      if (d < P[j]) { P[j] = d; I[j] = i; }
    }
  }
  return { profile: P, index: I, mu, sigma: sig, constant, zone };
}

/** Top-k motifs from a profile: [{ a, b, distance }], non-overlapping (see CONVENTIONS.topK). */
export function topMotifs(profile, index, m, k = 3) {
  const order = Array.from(profile.keys()).filter((i) => Number.isFinite(profile[i])).sort((x, y) => profile[x] - profile[y] || x - y);
  const taken = [];
  const clash = (p) => taken.some((t) => Math.abs(t - p) < m);
  const out = [];
  for (const i of order) {
    if (out.length >= k) break;
    const j = index[i];
    if (j < 0 || clash(i) || clash(j)) continue;
    const [a, b] = i < j ? [i, j] : [j, i];
    out.push({ a, b, distance: profile[i] });
    taken.push(a, b);
  }
  return out;
}

/** Top-k discords from a profile: [{ index, distance, nearest }], non-overlapping. */
export function topDiscords(profile, index, m, k = 3) {
  const order = Array.from(profile.keys()).filter((i) => Number.isFinite(profile[i])).sort((x, y) => profile[y] - profile[x] || x - y);
  const out = [];
  for (const i of order) {
    if (out.length >= k) break;
    if (out.some((d) => Math.abs(d.index - i) < m)) continue;
    out.push({ index: i, distance: profile[i], nearest: index[i] });
  }
  return out;
}

const round = (x, d = 4) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const corr = (d, m) => 1 - (d * d) / (2 * m);

/** The bundled example (NOAA Mauna Loa monthly mean CO2), as { values, labels, column, source }. */
export function exampleSeries() {
  return { values: EXAMPLE.values.slice(), labels: EXAMPLE.labels.slice(), column: EXAMPLE.column, source: EXAMPLE.source };
}

/** The bundled example as CSV text (label,value), for the page's textarea. */
export function exampleCsv() {
  return `month,${EXAMPLE.column}\n` + EXAMPLE.values.map((v, i) => `${EXAMPLE.labels[i]},${v}`).join("\n");
}

/**
 * Analyse a series. `input` is { csv?, values?, labels?, column?, window?,
 * top?, detrend?, includeProfile? }, or CSV text (from --stdin) with options as
 * the second argument. With no series, the bundled NOAA CO2 example is used.
 * Returns a JSON-serialisable result with a plain-language `summary`.
 */
export function analyze(input = {}, extra = undefined) {
  let opts = typeof input === "string" ? { ...DEFAULTS, ...(extra || {}), csv: input } : { ...DEFAULTS, ...(input || {}) };
  const warnings = [];
  let values, labels = null, column = null, columns = null, filled = 0, dropped = 0, source = null;
  if (typeof opts.csv === "string" && opts.csv.trim() !== "") {
    const s = seriesFromCsv(opts.csv, opts.column);
    if (s.error) return { error: s.error, columns: s.columns ?? null };
    ({ values, labels, column, columns, filled, dropped } = s);
    if (filled) warnings.push(`${filled} missing or non-numeric value${filled === 1 ? " was" : "s were"} filled by linear interpolation.`);
    if (dropped) warnings.push(`${dropped} leading or trailing row${dropped === 1 ? "" : "s"} without a number ${dropped === 1 ? "was" : "were"} dropped.`);
  } else if (opts.values && opts.values.length) {
    values = Array.from(opts.values, Number);
    if (values.some((v) => !Number.isFinite(v))) return { error: "values must all be finite numbers." };
    labels = Array.isArray(opts.labels) && opts.labels.length === values.length ? opts.labels.map(String) : null;
    column = "value";
  } else {
    const ex = exampleSeries();
    ({ values, labels, column, source } = ex);
    warnings.push("No series given: analysed the bundled example, NOAA Mauna Loa monthly mean CO2.");
  }
  const n = values.length;
  if (n > LIMITS.maxPoints) return { error: `${n.toLocaleString("en-US")} points is more than this tool handles (${LIMITS.maxPoints.toLocaleString("en-US")}); the exact matrix profile is O(n^2). Downsample or analyse a shorter stretch.` };
  if (n > LIMITS.warnPoints) warnings.push(`${n.toLocaleString("en-US")} points: the exact matrix profile takes time proportional to n squared, so this may take a while.`);
  if (n < 2 * LIMITS.minWindow) return { error: `Need at least ${2 * LIMITS.minWindow} values; got ${n}.` };

  let series = opts.detrend ? Array.from(detrendLinear(values)) : values;
  let m;
  let windowSource;
  let windowReason;
  if (opts.window === null || opts.window === undefined || opts.window === "" || opts.window === "auto") {
    const s = suggestWindow(series);
    m = s.window;
    windowSource = "suggested";
    windowReason = s.reason;
  } else {
    m = Math.round(Number(opts.window));
    windowSource = "given";
    windowReason = "set by you";
    if (!Number.isFinite(m) || m < LIMITS.minWindow) return { error: `Window must be a whole number of at least ${LIMITS.minWindow}.` };
    if (m > Math.floor(n / 2)) return { error: `Window ${m} is too long for ${n} values; use at most ${Math.floor(n / 2)} (half the series).` };
  }
  const k = Math.max(1, Math.min(20, Math.round(Number(opts.top) || 3)));
  const mp = matrixProfile(series, m);
  const { profile, index, zone } = mp;
  const l = profile.length;
  const constantCount = mp.constant.reduce((s, c) => s + c, 0);
  if (constantCount) warnings.push(`${constantCount} window${constantCount === 1 ? " is" : "s are"} perfectly flat; flat windows match each other at distance 0 and anything else at sqrt(m) = ${Math.sqrt(m).toFixed(3)}.`);

  const lab = (i) => (labels ? labels[i] : null);
  const motifs = topMotifs(profile, index, m, k).map((x, r) => ({
    rank: r + 1, a: x.a, b: x.b, aLabel: lab(x.a), bLabel: lab(x.b), distance: round(x.distance, 6), correlation: round(corr(x.distance, m), 6),
  }));
  const discords = topDiscords(profile, index, m, k).map((x, r) => ({
    rank: r + 1, index: x.index, label: lab(x.index), distance: round(x.distance, 6), correlation: round(corr(x.distance, m), 6), nearest: x.nearest, nearestLabel: lab(x.nearest),
  }));
  let sum = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < l; i++) { sum += profile[i]; if (profile[i] < lo) lo = profile[i]; if (profile[i] > hi) hi = profile[i]; }

  const where = (i) => (labels && labels[i] !== String(i) ? `position ${i} (${labels[i]})` : `position ${i}`);
  const parts = [];
  parts.push(`Analysed ${n.toLocaleString("en-US")} values of "${column}" with a window of ${m} points (${windowSource === "given" ? "your choice" : `suggested: ${windowReason}`}), comparing all ${l.toLocaleString("en-US")} windows by shape after z-normalization.`);
  if (motifs[0]) {
    const t = motifs[0];
    parts.push(`The closest repeated pattern (top motif) is the ${m}-point stretch at ${where(t.a)} and the one at ${where(t.b)}: distance ${t.distance.toFixed(3)}, correlation ${t.correlation.toFixed(3)}${t.distance < 1e-9 ? ", exactly the same shape" : t.correlation > 0.95 ? ", almost the same shape" : t.correlation > 0.8 ? ", a close match" : ", a loose match"}.`);
  }
  if (discords[0]) {
    const t = discords[0];
    parts.push(`The most unusual stretch (top discord) starts at ${where(t.index)}: even its best match elsewhere, at ${where(t.nearest)}, is at distance ${t.distance.toFixed(3)} (correlation ${t.correlation.toFixed(3)}), the largest nearest-neighbour distance in the series.`);
  }
  parts.push(`Distances run from 0 (identical shape) to ${(2 * Math.sqrt(m)).toFixed(2)} (opposite shape); half of all windows have a near neighbour within ${round(median(profile), 3)}.`);
  const result = {
    n,
    column,
    columns,
    window: m,
    windowSource,
    windowReason,
    exclusionZone: zone,
    detrended: Boolean(opts.detrend),
    subsequences: l,
    motifs,
    discords,
    profileStats: { min: round(lo, 6), max: round(hi, 6), mean: round(sum / l, 6), median: round(median(profile), 6), maxPossible: round(2 * Math.sqrt(m), 6) },
    constantWindows: constantCount,
    filledValues: filled,
    warnings,
    summary: parts.join(" "),
    method: `Exact matrix profile (Yeh et al. 2016) by STOMP (Zhu et al. 2016); z-normalized Euclidean distance; exclusion zone ceil(m/4) = ${zone}.`,
  };
  if (source) result.source = source;
  if (opts.includeProfile) {
    result.values = Array.from(series);
    result.labels = labels;
    result.profile = Array.from(profile, (d) => round(d, 6));
    result.profileIndex = Array.from(index);
  }
  return result;
}

function median(a) {
  const s = Float64Array.from(a).sort();
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}
