// Probability calibration check: are these forecast probabilities honest?
//
// Pure functions, no DOM, no network, seeded randomness only. Implemented from
// the papers' mathematics (PAPERS below); no third-party code was ported.
// scikit-learn, scipy and numpy were used only to produce eval/reference.json.
//
// The core is the CORP approach of Dimitriadis, Gneiting & Jordan (2021):
// recalibrate the forecasts by isotonic regression (the pool-adjacent-
// violators algorithm, Ayer et al. 1955), draw that step function as the
// reliability diagram, and split any proper score exactly into
//   score = MCB - DSC + UNC
// (miscalibration, discrimination, uncertainty). Around it: the binned Murphy
// (1973) decomposition and expected calibration error for comparison with the
// usual charts, Spiegelhalter's (1986) z test, Cox's (1958) calibration slope
// and intercept, the AUC, and a resampling test and consistency band under
// the hypothesis that the forecasts are calibrated.

export const PAPERS = [
  {
    authors: "Timo Dimitriadis, Tilmann Gneiting and Alexander I. Jordan",
    title: "Stable reliability diagrams for probabilistic classifiers",
    venue: "Proceedings of the National Academy of Sciences 118(8), e2016191118",
    year: 2021,
    url: "https://doi.org/10.1073/pnas.2016191118",
    doi: "10.1073/pnas.2016191118",
    implemented: "The CORP reliability diagram (the PAV-recalibrated forecast plotted against the forecast), the exact decomposition S(x) = MCB - DSC + UNC of the Brier and log scores with MCB = S(x) - S(PAV), DSC = S(climatology) - S(PAV), UNC = S(climatology), and consistency bands from resampling outcomes as Bernoulli(forecast).",
    deviations: "Bands are always by resampling (the paper also gives asymptotic bands for large samples), evaluated at up to 400 forecast values. The Monte Carlo p-value that uses MCB as its statistic is this tool's addition, built from the same resampling.",
  },
  {
    authors: "Miriam Ayer, H. D. Brunk, G. M. Ewing, W. T. Reid and Edward Silverman",
    title: "An empirical distribution function for sampling with incomplete information",
    venue: "Annals of Mathematical Statistics 26(4), 641-647",
    year: 1955,
    url: "https://doi.org/10.1214/aoms/1177728423",
    doi: "10.1214/aoms/1177728423",
    implemented: "The pool-adjacent-violators algorithm for the isotonic (non-decreasing) least-squares fit of outcomes on forecasts.",
    deviations: "Equal forecast values are pooled into one block before the algorithm runs, as CORP requires, so the fit is a function of the forecast.",
  },
  {
    authors: "Glenn W. Brier",
    title: "Verification of forecasts expressed in terms of probability",
    venue: "Monthly Weather Review 78(1), 1-3",
    year: 1950,
    url: "https://doi.org/10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2",
    doi: "10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2",
    implemented: "The Brier score, the mean of (forecast - outcome)^2 for a yes/no event.",
    deviations: "The one-event form (half of Brier's two-category sum).",
  },
  {
    authors: "Allan H. Murphy",
    title: "A new vector partition of the probability score",
    venue: "Journal of Applied Meteorology 12(4), 595-600",
    year: 1973,
    url: "https://doi.org/10.1175/1520-0450(1973)012<0595:ANVPOT>2.0.CO;2",
    doi: "10.1175/1520-0450(1973)012<0595:ANVPOT>2.0.CO;2",
    implemented: "The binned decomposition Brier = reliability - resolution + uncertainty, over equal-width or equal-count bins.",
    deviations: "With forecasts that vary inside a bin the identity is not exact; the remainder is reported as the within-bin term, which is why the binned figures move with the bin count and CORP's do not.",
  },
  {
    authors: "David J. Spiegelhalter",
    title: "Probabilistic prediction in patient management and clinical trials",
    venue: "Statistics in Medicine 5(5), 421-433",
    year: 1986,
    url: "https://doi.org/10.1002/sim.4780050506",
    doi: "10.1002/sim.4780050506",
    implemented: "The z test of calibration, Z = sum (y - p)(1 - 2p) / sqrt(sum (1 - 2p)^2 p (1 - p)), standard normal when the forecasts are calibrated.",
    deviations: null,
  },
  {
    authors: "David R. Cox",
    title: "Two further applications of a model for binary regression",
    venue: "Biometrika 45(3/4), 562-565",
    year: 1958,
    url: "https://doi.org/10.2307/2333203",
    doi: "10.2307/2333203",
    implemented: "Calibration intercept and slope: the logistic regression of the outcome on logit(forecast). Slope 1 and intercept 0 for calibrated forecasts; a slope below 1 means the forecasts are too extreme.",
    deviations: "Fitted by Newton-Raphson maximum likelihood with forecasts clipped to [1e-6, 1 - 1e-6] before the logit; standard errors from the inverse information. This same fit is Platt (1999) scaling when used to recalibrate.",
  },
  {
    authors: "Mahdi Pakdaman Naeini, Gregory F. Cooper and Milos Hauskrecht",
    title: "Obtaining well calibrated probabilities using Bayesian binning",
    venue: "Proceedings of the AAAI Conference on Artificial Intelligence 29, 2901-2907",
    year: 2015,
    url: "https://doi.org/10.1609/aaai.v29i1.9602",
    doi: "10.1609/aaai.v29i1.9602",
    implemented: "Expected calibration error, sum over bins of (n_b / N) |mean outcome - mean forecast|, and the maximum calibration error.",
    deviations: "Ten equal-width bins by default, as is common in machine learning (Guo et al. 2017); equal-count bins on request. The Bayesian binning method itself is not implemented.",
  },
  {
    authors: "James A. Hanley and Barbara J. McNeil",
    title: "The meaning and use of the area under a receiver operating characteristic (ROC) curve",
    venue: "Radiology 143(1), 29-36",
    year: 1982,
    url: "https://doi.org/10.1148/radiology.143.1.7063747",
    doi: "10.1148/radiology.143.1.7063747",
    implemented: "The AUC as the Mann-Whitney probability that a random event got a higher forecast than a random non-event, ties counted one half.",
    deviations: null,
  },
];

export const DEFAULTS = { bins: 10, binning: "width", resamples: 500, level: 0.9, alpha: 0.05, seed: 1 };
const MAX_ROWS = 200000;
const BAND_POINTS = 400;

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

// A plain number; a trailing % divides by 100.
export function toNumber(s) {
  if (s == null) return NaN;
  let t = String(s).trim();
  let scale = 1;
  if (t.endsWith("%")) {
    t = t.slice(0, -1).trim();
    scale = 100;
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
  return Number(t) / scale;
}

const YES = new Set(["1", "1.0", "true", "yes", "y", "t", "won", "win", "w", "event", "positive", "pos"]);
const NO = new Set(["0", "0.0", "false", "no", "n", "f", "lost", "loss", "l", "none", "negative", "neg"]);

export function toOutcome(s, positive = null) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t === "") return null;
  if (positive != null && String(positive).trim() !== "") return t === String(positive).trim().toLowerCase() ? 1 : 0;
  if (YES.has(t)) return 1;
  if (NO.has(t)) return 0;
  return null;
}

// Each column's kind: "prob" (numbers, all within 0-1 or 0-100%), "binary"
// (two values readable as yes/no), "number", "text" or "empty".
export function profileColumns(parsed) {
  return parsed.header.map((name, j) => {
    let filled = 0;
    let nums = 0;
    let inUnit = 0;
    let inPct = 0;
    let bin = 0;
    const distinct = new Set();
    for (const r of parsed.rows) {
      const v = r[j];
      if (v == null || v.trim() === "") continue;
      filled++;
      if (distinct.size < 3) distinct.add(v.trim().toLowerCase());
      const x = toNumber(v);
      if (Number.isFinite(x)) {
        nums++;
        if (x >= 0 && x <= 1) inUnit++;
        if (x >= 0 && x <= 100) inPct++;
      }
      if (toOutcome(v) != null) bin++;
    }
    let kind = "text";
    if (filled === 0) kind = "empty";
    else if (bin === filled && distinct.size <= 2) kind = "binary";
    else if (nums >= 0.95 * filled && (inUnit >= 0.95 * filled || inPct >= 0.95 * filled)) kind = "prob";
    else if (nums >= 0.95 * filled) kind = "number";
    return { name, index: j, kind, twoValued: distinct.size <= 2, unit: filled > 0 && inUnit >= 0.95 * filled };
  });
}

const FORECAST_NAME = /(^p$|prob|chance|forecast|pred|score|^pop$|confidence|likelihood|risk|percent|pct)/i;
// Names that say "this is what happened"; otherwise the last yes/no column.
const OUTCOME_NAME = /(^y$|won|win|outcome|result|actual|event|label|target|happened|occurred|observed|truth|default|churn|converted)/i;

function pick(cols, want, label) {
  if (want == null || want === "") return null;
  const c = cols.find((c) => c.name === want) || cols.find((c) => c.name.toLowerCase() === String(want).toLowerCase());
  if (!c) throw new Error(`No column named "${want}" for ${label}. Columns: ${cols.map((c) => c.name).join(", ")}.`);
  return c;
}

// Rows to forecasts p in [0, 1] and outcomes y in {0, 1}.
export function readForecasts(parsed, opts = {}) {
  const cols = profileColumns(parsed);
  const probs = cols.filter((c) => c.kind === "prob");
  const pc =
    pick(cols, opts.forecastColumn, "the forecast") ||
    probs.find((c) => FORECAST_NAME.test(c.name)) ||
    probs.find((c) => c.unit) ||
    probs[0];
  if (!pc) throw new Error("No column of probabilities found: it needs numbers between 0 and 1 (or 0 to 100 as percentages).");
  const binary = cols.filter((c) => c.kind === "binary" && c !== pc);
  const oc =
    pick(cols, opts.outcomeColumn, "the outcome") ||
    binary.find((c) => OUTCOME_NAME.test(c.name)) ||
    binary[binary.length - 1] ||
    cols.find((c) => c.twoValued && c !== pc && OUTCOME_NAME.test(c.name));
  if (!oc) throw new Error("No outcome column found: it needs two values per row, such as 1/0, yes/no or true/false.");
  if (oc === pc) throw new Error("The forecast and outcome columns must be different.");
  const raw = [];
  let skipped = 0;
  for (const r of parsed.rows) {
    const x = toNumber(r[pc.index]);
    const y = toOutcome(r[oc.index], opts.positive);
    if (!Number.isFinite(x) || y == null) skipped++;
    else raw.push([x, y]);
  }
  const warnings = [];
  const max = raw.reduce((m, [x]) => Math.max(m, x), -Infinity);
  const min = raw.reduce((m, [x]) => Math.min(m, x), Infinity);
  let scale = 1;
  if (opts.percent === true || (opts.percent !== false && max > 1 && max <= 100)) {
    scale = 100;
    warnings.push(`Forecasts in "${pc.name}" go above 1, so they were read as percentages (divided by 100).`);
  }
  const p = [];
  const y = [];
  let out = 0;
  for (const [x, o] of raw) {
    const v = x / scale;
    if (!(v >= 0 && v <= 1)) {
      out++;
      continue;
    }
    p.push(v);
    y.push(o);
  }
  if (out) warnings.push(`${out} forecast${out === 1 ? " was" : "s were"} outside 0-1 after scaling and skipped.`);
  if (min < 0) warnings.push("Negative forecasts are not probabilities; they were skipped.");
  if (p.length > MAX_ROWS) throw new Error(`Up to ${MAX_ROWS.toLocaleString("en-US")} forecasts; this table has ${p.length.toLocaleString("en-US")}.`);
  if (p.length < 10) throw new Error(`Need at least 10 forecasts with an outcome; found ${p.length}.`);
  const events = y.reduce((s, v) => s + v, 0);
  if (events === 0 || events === y.length) throw new Error("Every outcome is the same, so calibration cannot be judged: the table needs both events and non-events.");
  return { p, y, skipped: skipped + out, warnings, columns: { forecast: pc.name, outcome: oc.name, positive: opts.positive || null } };
}

// ---------- special functions ----------

// erfc by the Chebyshev fit in Numerical Recipes (fractional error < 1.2e-7);
// enough for p-values.
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export const normSf = (z) => 0.5 * erfc(z / Math.SQRT2);

// ---------- scores ----------

export function brier(p, y) {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += (p[i] - y[i]) ** 2;
  return s / p.length;
}
// Mean negative log likelihood (natural log). Infinite when an event got 0
// or a non-event got 1.
export function logScore(p, y) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = y[i] ? p[i] : 1 - p[i];
    if (q <= 0) return Infinity;
    s -= Math.log(q);
  }
  return s / p.length;
}
const SCORES = { brier, log: logScore };

// ---------- isotonic regression (PAV) ----------

// Non-decreasing least-squares fit of y on x. Equal x values form one block
// first. Returns per-row fitted values and the blocks (x range, fitted value,
// count), in increasing x.
export function pav(x, y, w = null) {
  const n = x.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]);
  // blocks as parallel arrays used as a stack
  const lo = [];
  const hi = [];
  const sw = [];
  const sy = [];
  const start = [];
  let k = 0;
  while (k < n) {
    let j = k;
    let W = 0;
    let Y = 0;
    while (j < n && x[order[j]] === x[order[k]]) {
      const wi = w ? w[order[j]] : 1;
      W += wi;
      Y += wi * y[order[j]];
      j++;
    }
    lo.push(x[order[k]]);
    hi.push(x[order[k]]);
    sw.push(W);
    sy.push(Y);
    start.push(k);
    while (sw.length > 1) {
      const m = sw.length - 1;
      // previous mean >= current mean: pool (equal means pool too, so each
      // block has its own value; the fit is the same either way)
      if (sy[m - 1] * sw[m] >= sy[m] * sw[m - 1]) {
        sw[m - 1] += sw[m];
        sy[m - 1] += sy[m];
        hi[m - 1] = hi[m];
        lo.pop();
        hi.pop();
        sw.pop();
        sy.pop();
        start.pop();
      } else break;
    }
    k = j;
  }
  const fit = new Float64Array(n);
  const blocks = [];
  for (let b = 0; b < sw.length; b++) {
    const v = sy[b] / sw[b];
    const end = b + 1 < sw.length ? start[b + 1] : n;
    for (let i = start[b]; i < end; i++) fit[order[i]] = v;
    blocks.push({ lo: lo[b], hi: hi[b], value: v, n: sw[b] });
  }
  return { fit, blocks };
}

// The isotonic map as a function of a new forecast: linear between the
// blocks' end points, constant beyond the ends (as scikit-learn's
// IsotonicRegression(out_of_bounds="clip") predicts).
export function isotonicMap(blocks) {
  const xs = [];
  const vs = [];
  for (const b of blocks) {
    xs.push(b.lo);
    vs.push(b.value);
    if (b.hi > b.lo) {
      xs.push(b.hi);
      vs.push(b.value);
    }
  }
  return (q) => {
    if (q <= xs[0]) return vs[0];
    if (q >= xs[xs.length - 1]) return vs[vs.length - 1];
    let a = 0;
    let b = xs.length - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (xs[m] <= q) a = m;
      else b = m;
    }
    return xs[b] === xs[a] ? vs[b] : vs[a] + ((vs[b] - vs[a]) * (q - xs[a])) / (xs[b] - xs[a]);
  };
}

// ---------- CORP decomposition ----------

export function corp(p, y, score = "brier") {
  const S = SCORES[score];
  if (!S) throw new Error(`Unknown score "${score}"`);
  const { fit, blocks } = pav(p, y);
  const base = y.reduce((s, v) => s + v, 0) / y.length;
  const clim = new Float64Array(p.length).fill(base);
  const sx = S(p, y);
  const sc = S(fit, y);
  const sr = S(clim, y);
  return { score: sx, mcb: sx - sc, dsc: sr - sc, unc: sr, recalibrated: sc, fit, blocks, baseRate: base };
}

// ---------- binned diagnostics ----------

export function binEdges(p, bins, binning) {
  if (binning === "count") {
    const s = [...p].sort((a, b) => a - b);
    const e = [0];
    for (let b = 1; b < bins; b++) e.push(s[Math.floor((b * s.length) / bins)]);
    e.push(1);
    return [...new Set(e)];
  }
  return Array.from({ length: bins + 1 }, (_, i) => i / bins);
}

// Bin b holds edges[b] <= p < edges[b+1]; the last bin also takes p = 1.
export function binned(p, y, { bins = 10, binning = "width" } = {}) {
  const edges = binEdges(p, bins, binning);
  const B = edges.length - 1;
  const rows = Array.from({ length: B }, (_, b) => ({ lo: edges[b], hi: edges[b + 1], n: 0, sumP: 0, sumY: 0 }));
  for (let i = 0; i < p.length; i++) {
    let b = 0;
    let e = B;
    while (e - b > 1) {
      const m = (b + e) >> 1;
      if (p[i] >= edges[m]) b = m;
      else e = m;
    }
    rows[b].n++;
    rows[b].sumP += p[i];
    rows[b].sumY += y[i];
  }
  const N = p.length;
  const base = y.reduce((s, v) => s + v, 0) / N;
  let ece = 0;
  let mce = 0;
  let rel = 0;
  let res = 0;
  const out = [];
  for (const r of rows) {
    if (!r.n) continue;
    const mp = r.sumP / r.n;
    const my = r.sumY / r.n;
    ece += (r.n / N) * Math.abs(my - mp);
    mce = Math.max(mce, Math.abs(my - mp));
    rel += (r.n / N) * (mp - my) ** 2;
    res += (r.n / N) * (my - base) ** 2;
    out.push({ lo: r.lo, hi: r.hi, n: r.n, meanForecast: mp, observed: my, gap: my - mp });
  }
  const unc = base * (1 - base);
  const bs = brier(p, y);
  return { bins: out, binning, ece, mce, reliability: rel, resolution: res, uncertainty: unc, withinBin: bs - (rel - res + unc) };
}

// ---------- tests and regression ----------

// Calibration in the large: observed minus expected events, over the
// standard deviation of the event count if the forecasts were calibrated
// (a sum of independent Bernoulli(p_i)).
export function observedExpected(p, y) {
  let o = 0;
  let e = 0;
  let v = 0;
  for (let i = 0; i < p.length; i++) {
    o += y[i];
    e += p[i];
    v += p[i] * (1 - p[i]);
  }
  const z = v > 0 ? (o - e) / Math.sqrt(v) : NaN;
  return { observed: o, expected: e, ratio: e > 0 ? o / e : NaN, z, p: Number.isFinite(z) ? 2 * normSf(Math.abs(z)) : NaN };
}

export function spiegelhalter(p, y) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < p.length; i++) {
    num += (y[i] - p[i]) * (1 - 2 * p[i]);
    den += (1 - 2 * p[i]) ** 2 * p[i] * (1 - p[i]);
  }
  if (!(den > 0)) return { z: NaN, p: NaN };
  const z = num / Math.sqrt(den);
  return { z, p: 2 * normSf(Math.abs(z)) };
}

// Logistic regression of y on logit(p), by Newton-Raphson.
export function calibrationSlope(p, y) {
  const n = p.length;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const q = Math.min(1 - 1e-6, Math.max(1e-6, p[i]));
    x[i] = Math.log(q / (1 - q));
  }
  let a = 0;
  let b = 1;
  let info = null;
  for (let it = 0; it < 100; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < n; i++) {
      const eta = a + b * x[i];
      const m = eta >= 0 ? 1 / (1 + Math.exp(-eta)) : Math.exp(eta) / (1 + Math.exp(eta));
      const r = y[i] - m;
      const v = m * (1 - m);
      g0 += r;
      g1 += r * x[i];
      h00 += v;
      h01 += v * x[i];
      h11 += v * x[i] * x[i];
    }
    const det = h00 * h11 - h01 * h01;
    if (!(det > 0)) break;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;
    a += da;
    b += db;
    info = { h00, h01, h11, det };
    if (Math.abs(da) + Math.abs(db) < 1e-12) break;
  }
  const se = info ? { intercept: Math.sqrt(info.h11 / info.det), slope: Math.sqrt(info.h00 / info.det) } : { intercept: NaN, slope: NaN };
  return { intercept: a, slope: b, se };
}
export function plattMap(fit) {
  return (q) => {
    const c = Math.min(1 - 1e-6, Math.max(1e-6, q));
    const eta = fit.intercept + fit.slope * Math.log(c / (1 - c));
    return 1 / (1 + Math.exp(-eta));
  };
}

// AUC with ties counted one half (midranks).
export function auc(p, y) {
  const n = p.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => p[a] - p[b]);
  let rankSum = 0;
  let pos = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && p[order[j + 1]] === p[order[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (y[order[k]]) {
      rankSum += r;
      pos++;
    }
    i = j + 1;
  }
  const neg = n - pos;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

// ---------- resampling under calibration ----------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted, q) {
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  return sorted[lo] + (h - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)] ?? sorted[lo]) - sorted[lo]);
}

// Draw outcomes y* ~ Bernoulli(p) (the forecasts taken as true), refit PAV,
// and collect (a) the band of refits at grid points and (b) MCB* for a
// Monte Carlo p-value of the observed MCB.
export function consistency(p, y, { resamples = 500, level = 0.9, seed = 1, score = "brier", grid = null } = {}) {
  const rng = mulberry32(seed);
  const uniq = [...new Set(p)].sort((a, b) => a - b);
  let g = grid;
  if (!g) {
    if (uniq.length <= BAND_POINTS) g = uniq;
    else {
      const s = [...p].sort((a, b) => a - b);
      g = [...new Set(Array.from({ length: BAND_POINTS }, (_, k) => s[Math.round((k * (s.length - 1)) / (BAND_POINTS - 1))]))];
    }
  }
  const obs = corp(p, y, score).mcb;
  const fits = g.map(() => new Float64Array(resamples));
  let atLeast = 0;
  const ys = new Array(p.length);
  for (let r = 0; r < resamples; r++) {
    for (let i = 0; i < p.length; i++) ys[i] = rng() < p[i] ? 1 : 0;
    const c = corp(p, ys, score);
    const f = isotonicMap(c.blocks);
    if (c.mcb >= obs - 1e-15) atLeast++;
    for (let k = 0; k < g.length; k++) fits[k][r] = f(g[k]);
  }
  const lowQ = (1 - level) / 2;
  const band = g.map((x, k) => {
    const s = Array.from(fits[k]).sort((a, b) => a - b);
    return { x, lower: quantile(s, lowQ), upper: quantile(s, 1 - lowQ) };
  });
  return { band, level, resamples, seed, mcbObserved: obs, pValue: (atLeast + 1) / (resamples + 1) };
}

// ---------- formatting ----------

export const fmt = (v, digits = 4) => {
  if (v == null || !Number.isFinite(v)) return String(v);
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e9 || a < 1e-4) return v.toExponential(Math.max(0, digits - 1));
  return Number(v.toPrecision(digits)).toLocaleString("en-US", { maximumFractionDigits: 10 });
};
export const pct = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "n/a");
export function fmtP(p) {
  if (p == null || !Number.isFinite(p)) return "n/a";
  if (p < 1e-4) return p.toExponential(1);
  if (p < 0.001) return p.toFixed(5).replace(/0+$/, "");
  return p < 0.01 ? p.toFixed(4) : p.toFixed(3);
}

// ---------- top level ----------

export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v != null && v !== "")) };
  let p;
  let y;
  let meta;
  if (Array.isArray(input.p) && Array.isArray(input.y)) {
    if (input.p.length !== input.y.length) throw new Error("p and y must be the same length.");
    // Number(null) is 0 and anything but true/1/"1" used to count as a non-event: a missing
    // forecast or an outcome written "yes" must not silently become a 0.
    p = input.p.map((v) => (typeof v === "number" ? v : typeof v === "string" && !v.trim().endsWith("%") ? toNumber(v) : NaN));
    y = input.y.map((v) => (v === true ? 1 : v === false ? 0 : typeof v === "number" || typeof v === "string" ? toOutcome(v) : null));
    if (p.some((v) => !(v >= 0 && v <= 1))) throw new Error("Every forecast in p must be between 0 and 1.");
    const badY = y.findIndex((v) => v === null);
    if (badY >= 0) throw new Error(`Outcome ${badY + 1} in y (${JSON.stringify(input.y[badY])}) is not readable as yes/no or 1/0.`);
    if (p.length < 10) throw new Error(`Need at least 10 forecasts with an outcome; found ${p.length}.`);
    const ev = y.reduce((s, v) => s + v, 0);
    if (ev === 0 || ev === y.length) throw new Error("Every outcome is the same, so calibration cannot be judged: the table needs both events and non-events.");
    meta = { skipped: 0, warnings: [], columns: { forecast: "p", outcome: "y", positive: null } };
  } else {
    const parsed = parseCsv(input.csv);
    const r = readForecasts(parsed, { forecastColumn: input.forecastColumn, outcomeColumn: input.outcomeColumn, positive: input.positive, percent: input.percent });
    p = r.p;
    y = r.y;
    meta = r;
  }
  const bins = Math.round(Number(o.bins));
  if (!(bins >= 2 && bins <= 50)) throw new Error("Bins must be a whole number from 2 to 50.");
  if (!["width", "count"].includes(o.binning)) throw new Error('Binning must be "width" or "count".');
  const resamples = Math.round(Number(o.resamples));
  if (!(resamples >= 0 && resamples <= 5000)) throw new Error("Resamples must be between 0 and 5,000.");
  const alpha = Number(o.alpha);
  const level = Number(o.level);
  if (!(alpha > 0 && alpha < 1) || !(level > 0 && level < 1)) throw new Error("alpha and level must be between 0 and 1.");
  const n = p.length;
  const warnings = [...meta.warnings];
  const events = y.reduce((s, v) => s + v, 0);
  const baseRate = events / n;
  const meanForecast = p.reduce((s, v) => s + v, 0) / n;

  const cb = corp(p, y, "brier");
  const ls = logScore(p, y);
  const cl = Number.isFinite(ls) ? corp(p, y, "log") : null;
  if (!cl) warnings.push("At least one forecast of exactly 0 or 1 was wrong, so the log score is infinite; only the Brier score is decomposed.");
  const bn = binned(p, y, { bins, binning: o.binning });
  const sp = spiegelhalter(p, y);
  const oe = observedExpected(p, y);
  const cs = calibrationSlope(p, y);
  const a = auc(p, y);
  const cons = resamples > 0 ? consistency(p, y, { resamples, level, seed: Number(o.seed) || 1 }) : null;
  if (n < 100) warnings.push(`Only ${n} forecasts: the reliability curve is rough and the tests have little power.`);

  const uniqueForecasts = new Set(p).size;
  const blocks = cb.blocks;
  const iso = isotonicMap(blocks);
  const platt = plattMap(cs);

  // Words.
  const bss = 1 - cb.score / cb.unc;
  const calibrated = cons ? cons.pValue >= alpha : sp.p >= alpha;
  const lean = meanForecast > baseRate ? "high" : "low";
  const slopeWord = cs.slope < 1 ? "too extreme (overconfident): recalibrating pulls them toward the middle" : "too timid (underconfident): recalibrating pushes them toward 0 and 1";
  const parts = [];
  parts.push(`Across ${n.toLocaleString("en-US")} forecasts the event happened ${pct(baseRate)} of the time; the average forecast was ${pct(meanForecast)}, ${Math.abs(meanForecast - baseRate) < 0.0005 ? "a match" : `${(Math.abs(meanForecast - baseRate) * 100).toFixed(1)} percentage points too ${lean}`}.`);
  parts.push(`Brier score ${fmt(cb.score, 4)} against ${fmt(cb.unc, 4)} for always forecasting the base rate (skill ${pct(bss)}).`);
  parts.push(`Miscalibration (CORP MCB) is ${fmt(cb.mcb, 3)}, ${pct(cb.mcb / cb.score)} of the score: the most an order-preserving recalibration could take off it. Discrimination (DSC) is ${fmt(cb.dsc, 3)}, AUC ${fmt(a, 3)}.`);
  if (cons) parts.push(calibrated ? `That miscalibration is within what calibrated forecasts would show by chance (p = ${fmtP(cons.pValue)}, ${resamples} resamples).` : `That is more miscalibration than calibrated forecasts would show by chance (p = ${fmtP(cons.pValue)}, ${resamples} resamples).`);
  if (oe.p < alpha) parts.push(`Counted overall, the ${fmt(oe.expected, 5)} expected events against ${oe.observed.toLocaleString("en-US")} observed are a significant overall ${oe.observed < oe.expected ? "overforecast" : "underforecast"} (z = ${fmt(oe.z, 3)}, p = ${fmtP(oe.p)}).`);
  if (Math.abs(cs.slope - 1) > 2 * cs.se.slope) parts.push(`Calibration slope ${fmt(cs.slope, 3)} (standard error ${fmt(cs.se.slope, 2)}): the forecasts are ${slopeWord}.`);
  else parts.push(`Calibration slope ${fmt(cs.slope, 3)} (standard error ${fmt(cs.se.slope, 2)}) is consistent with 1: the spread of the forecasts is about right.`);
  const summary = parts.join(" ");

  return {
    n,
    events,
    baseRate,
    meanForecast,
    uniqueForecasts,
    skipped: meta.skipped,
    columns: meta.columns,
    alpha,
    calibrated,
    brier: { score: cb.score, mcb: cb.mcb, dsc: cb.dsc, unc: cb.unc, recalibrated: cb.recalibrated, skill: bss },
    log: cl ? { score: cl.score, mcb: cl.mcb, dsc: cl.dsc, unc: cl.unc, recalibrated: cl.recalibrated } : { score: ls, mcb: NaN, dsc: NaN, unc: NaN, recalibrated: NaN },
    blocks,
    binned: bn,
    spiegelhalter: sp,
    inTheLarge: oe,
    cox: cs,
    auc: a,
    consistency: cons,
    summary,
    warnings,
    forecasts: p,
    outcomes: y,
    recalibrate: { isotonic: p.map(iso), platt: p.map(platt) },
    settings: { bins, binning: o.binning, resamples, level, seed: Number(o.seed) || 1 },
  };
}

// Recalibrate new forecasts with a fitted result: "isotonic" or "platt".
export function recalibrator(r, method = "isotonic") {
  if (method === "platt") return plattMap(r.cox);
  return isotonicMap(r.blocks);
}

export function csvCell(c) {
  const s = String(c);
  const t = /^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

// Each forecast with its outcome and both recalibrated values.
export function toCsv(r) {
  const out = ["forecast,outcome,isotonic_recalibrated,platt_recalibrated"];
  for (let i = 0; i < r.n; i++) out.push([r.forecasts[i], r.outcomes[i], r.recalibrate.isotonic[i].toPrecision(8), r.recalibrate.platt[i].toPrecision(8)].join(","));
  return out.join("\n") + "\n";
}

export function report(r) {
  const L = [r.summary, ""];
  L.push(`n = ${r.n}, events = ${r.events}, distinct forecasts = ${r.uniqueForecasts}`);
  L.push("", "CORP decomposition (score = MCB - DSC + UNC):");
  L.push(`  Brier  ${fmt(r.brier.score, 6)} = ${fmt(r.brier.mcb, 6)} - ${fmt(r.brier.dsc, 6)} + ${fmt(r.brier.unc, 6)}`);
  if (Number.isFinite(r.log.mcb)) L.push(`  Log    ${fmt(r.log.score, 6)} = ${fmt(r.log.mcb, 6)} - ${fmt(r.log.dsc, 6)} + ${fmt(r.log.unc, 6)}`);
  else L.push(`  Log    ${fmt(r.log.score, 6)} (not decomposed)`);
  const b = r.binned;
  L.push("", `Binned (${b.bins.length} ${b.binning === "count" ? "equal-count" : "equal-width"} bins): ECE ${fmt(b.ece, 4)}, MCE ${fmt(b.mce, 4)}; Murphy reliability ${fmt(b.reliability, 5)}, resolution ${fmt(b.resolution, 5)}, uncertainty ${fmt(b.uncertainty, 5)}, within-bin ${fmt(b.withinBin, 3)}`);
  for (const x of b.bins) L.push(`  [${x.lo.toFixed(3)}, ${x.hi.toFixed(3)})  n = ${String(x.n).padStart(6)}  forecast ${pct(x.meanForecast).padStart(6)}  observed ${pct(x.observed).padStart(6)}`);
  L.push("", `Observed ${r.inTheLarge.observed} events, expected ${fmt(r.inTheLarge.expected, 6)} (O/E ${fmt(r.inTheLarge.ratio, 4)}), z = ${fmt(r.inTheLarge.z, 4)}, p = ${fmtP(r.inTheLarge.p)}`);
  L.push(`Spiegelhalter z = ${fmt(r.spiegelhalter.z, 4)}, p = ${fmtP(r.spiegelhalter.p)}`);
  L.push(`Cox calibration intercept ${fmt(r.cox.intercept, 4)} (se ${fmt(r.cox.se.intercept, 3)}), slope ${fmt(r.cox.slope, 4)} (se ${fmt(r.cox.se.slope, 3)})`);
  L.push(`AUC ${fmt(r.auc, 4)}`);
  if (r.consistency) L.push(`Resampling test of calibration (MCB statistic): p = ${fmtP(r.consistency.pValue)} from ${r.consistency.resamples} resamples, seed ${r.consistency.seed}`);
  L.push("", "Isotonic recalibration map (forecast range -> recalibrated probability):");
  const step = Math.max(1, Math.ceil(r.blocks.length / 40));
  if (step > 1) L.push(`  (${r.blocks.length} blocks; every ${step}th shown, the CSV download has every forecast)`);
  for (const k of r.blocks.filter((_, i) => i % step === 0 || i === r.blocks.length - 1)) L.push(`  ${k.lo.toFixed(4)} to ${k.hi.toFixed(4)}  ->  ${k.value.toFixed(4)}  (${k.n} forecasts)`);
  if (r.warnings.length) L.push("", ...r.warnings.map((w) => `Note: ${w}`));
  return L.join("\n");
}
