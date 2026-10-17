// Sales seasonality forecaster: Holt-Winters exponential smoothing (additive or
// multiplicative seasonality, damped or undamped trend) on monthly sales, with
// prediction intervals, a seasonal index, a rolling-origin back-test against the
// "same month last year" baseline, and a slow-season cash cushion. Pure
// functions, no imports, no network.

export const PERIOD = 12;
export const MIN_MONTHS = 24;
export const Z80 = 1.2815515655446004;
export const Z95 = 1.959963984540054;
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LOOKUP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

// ---------- parsing ----------

function splitLine(line, delim) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function validYmd(y, m, d) {
  return y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function fullYear(y) {
  return y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y;
}

// Returns {y,m,d}, {amb:[a,b,y]} for a/b/yyyy, or null.
export function parseDateCell(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let r;
  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[T ].*)?$/))) {
    const y = +r[1], m = +r[2], d = r[3] ? +r[3] : 1;
    return validYmd(y, m, d) ? { y, m, d, monthOnly: !r[3] } : null;
  }
  if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) return { amb: [+r[1], +r[2], fullYear(+r[3])] };
  if ((r = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))) {
    const m = MONTH_LOOKUP[r[1].toLowerCase()], y = +r[3], d = +r[2];
    return m && validYmd(y, m, d) ? { y, m, d } : null;
  }
  if ((r = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/))) {
    const m = MONTH_LOOKUP[r[2].toLowerCase()], y = +r[3], d = +r[1];
    return m && validYmd(y, m, d) ? { y, m, d } : null;
  }
  if ((r = s.match(/^([A-Za-z]{3,9})\.?[\s-]+(\d{4})$/))) {
    const m = MONTH_LOOKUP[r[1].toLowerCase()], y = +r[2];
    return m && validYmd(y, m, 1) ? { y, m, d: 1, monthOnly: true } : null;
  }
  return null;
}

export function parseAmount(raw, decimalComma = false) {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  s = s.replace(/[\s$€£¥₹]|USD|EUR|GBP|CAD|AUD/gi, "");
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const tail = s.length - lastComma - 1;
    if (decimalComma || (tail !== 3 && s.indexOf(",") === lastComma)) s = s.replace(",", ".");
    else s = s.replace(/,/g, "");
  }
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

// Text -> {rows:[{y,m,d,amount}], skipped, negatives, error?}
export function parseRows(text) {
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { error: "Paste or upload rows of date,amount first." };
  const head = lines[0];
  const delim = head.includes("\t") ? "\t" : (head.split(";").length > head.split(",").length ? ";" : ",");
  const cells = lines.map((l) => splitLine(l, delim));
  let dateCol = 0, amtCol = 1, start = 0;
  const first = cells[0];
  const firstIsData = first.some((c) => parseDateCell(c)) && first.some((c, i) => i !== first.findIndex((x) => parseDateCell(x)) && parseAmount(c) !== null);
  if (!firstIsData) {
    start = 1;
    const dh = first.findIndex((c) => /date|day|month|period|week|time/i.test(c));
    let ah = first.findIndex((c, i) => i !== dh && /amount|sales|revenue|total|net|gross|income|takings|value|sum/i.test(c));
    if (dh >= 0) dateCol = dh;
    if (ah >= 0) amtCol = ah;
    else amtCol = dateCol === 0 ? 1 : 0;
  }
  const decimalComma = delim === ";" && cells.slice(start).some((r) => /^-?\d+,\d{1,2}$/.test(r[amtCol] || ""));
  const raw = [];
  let skipped = 0;
  for (let i = start; i < cells.length; i++) {
    const d = parseDateCell(cells[i][dateCol]);
    const a = parseAmount(cells[i][amtCol], decimalComma);
    if (!d || a === null) { skipped++; continue; }
    raw.push({ d, a });
  }
  // a/b/yyyy: day-first only if some first part exceeds 12 and no second part does.
  const amb = raw.filter((r) => r.d.amb);
  const dayFirst = amb.length > 0 && amb.some((r) => r.d.amb[0] > 12) && !amb.some((r) => r.d.amb[1] > 12);
  const rows = [];
  for (const { d, a } of raw) {
    let y, m, dd, monthOnly = false;
    if (d.amb) {
      const [p, q, yy] = d.amb;
      [m, dd] = dayFirst ? [q, p] : [p, q];
      y = yy;
      if (!validYmd(y, m, dd)) { skipped++; continue; }
    } else ({ y, m, d: dd, monthOnly } = d);
    rows.push({ y, m, d: dd, monthOnly: Boolean(monthOnly), amount: a });
  }
  if (!rows.length) return { error: "No rows had both a readable date and a readable amount. Use one row per day, week or month with the date first, for example 2024-03-31,1250.00." };
  return { rows, skipped, negatives: rows.filter((r) => r.amount < 0).length, dayFirst };
}

// rows -> {months:[{y,m,key,value}], warnings, gapsFilled, droppedPartial}
export function toMonthly(rows) {
  const warnings = [];
  const byMonth = new Map();
  for (const r of rows) {
    const k = r.y * 12 + (r.m - 1);
    const e = byMonth.get(k) || { y: r.y, m: r.m, value: 0, days: new Set(), maxDay: 0, minDay: 99, monthOnly: true };
    e.value += r.amount;
    e.days.add(r.d);
    e.maxDay = Math.max(e.maxDay, r.d);
    e.minDay = Math.min(e.minDay, r.d);
    if (!r.monthOnly) e.monthOnly = false;
    byMonth.set(k, e);
  }
  let keys = [...byMonth.keys()].sort((a, b) => a - b);
  const dropped = [];
  // A month that is only partly covered by daily or weekly rows would read as a false slump.
  const last = byMonth.get(keys[keys.length - 1]);
  if (keys.length > 1 && last.days.size >= 2 && last.maxDay < daysInMonth(last.y, last.m) - 6) {
    dropped.push(monthKey(last.y, last.m));
    keys.pop();
  }
  const firstE = byMonth.get(keys[0]);
  if (keys.length > 1 && firstE.days.size >= 2 && firstE.minDay > 7) {
    dropped.push(monthKey(firstE.y, firstE.m));
    keys.shift();
  }
  if (dropped.length) warnings.push(`Dropped the partly covered month${dropped.length > 1 ? "s" : ""} ${dropped.join(" and ")} so a half month is not read as a slump.`);
  const months = [];
  const gaps = [];
  for (let k = keys[0]; k <= keys[keys.length - 1]; k++) {
    const y = Math.floor(k / 12), m = (k % 12) + 1;
    const e = byMonth.get(k);
    if (!e) gaps.push(monthKey(y, m));
    months.push({ y, m, key: monthKey(y, m), value: e ? e.value : 0 });
  }
  if (gaps.length) warnings.push(`${gaps.length} month${gaps.length > 1 ? "s" : ""} with no rows (${gaps.slice(0, 6).join(", ")}${gaps.length > 6 ? ", ..." : ""}) were filled with zero. That is right if you were closed; if the export is simply missing them, the forecast will be wrong.`);
  return { months, warnings, gapsFilled: gaps.length, droppedPartial: dropped };
}

export function parseSeries(text) {
  const p = parseRows(text);
  if (p.error) return { error: p.error };
  const t = toMonthly(p.rows);
  const warnings = [...t.warnings];
  if (p.skipped) warnings.push(`${p.skipped} row${p.skipped > 1 ? "s" : ""} had no readable date or amount and ${p.skipped > 1 ? "were" : "was"} skipped.`);
  if (p.negatives) warnings.push(`${p.negatives} negative amount${p.negatives > 1 ? "s" : ""} (refunds) ${p.negatives > 1 ? "were" : "was"} netted against sales in ${p.negatives > 1 ? "their" : "its"} month.`);
  if (p.dayFirst) warnings.push("Dates like 03/04/2024 were read day first because some dates in the file only make sense that way.");
  if (t.months.length < MIN_MONTHS) {
    return { error: `Only ${t.months.length} month${t.months.length === 1 ? "" : "s"} of history found. At least ${MIN_MONTHS} months (two full years) are needed: with less, a seasonal pattern cannot be told apart from one unusual year.`, warnings };
  }
  return { months: t.months, warnings, meta: { skipped: p.skipped, negatives: p.negatives, gapsFilled: t.gapsFilled } };
}

// ---------- optimiser ----------

export function nelderMead(f, x0, { maxIter = 500, step = 0.6 } = {}) {
  const n = x0.length;
  let pts = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step; pts.push(p); }
  let vals = pts.map(f);
  for (let it = 0; it < maxIter; it++) {
    const idx = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
    pts = idx.map((i) => pts[i]);
    vals = idx.map((i) => vals[i]);
    if (Math.abs(vals[n] - vals[0]) <= 1e-12 * (Math.abs(vals[0]) + 1e-12)) break;
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const at = (k) => c.map((v, j) => v + k * (pts[n][j] - v));
    const xr = at(-1), fr = f(xr);
    if (fr < vals[0]) {
      const xe = at(-2), fe = f(xe);
      if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; }
    } else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
    else {
      const xc = fr < vals[n] ? at(-0.5) : at(0.5), fc = f(xc);
      if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; }
      else for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])); vals[i] = f(pts[i]); }
    }
  }
  let b = 0;
  for (let i = 1; i <= n; i++) if (vals[i] < vals[b]) b = i;
  return { x: pts[b], value: vals[b] };
}

// ---------- Holt-Winters ----------

function initStates(y, mult) {
  const m = PERIOD, seasons = Math.floor(y.length / m);
  const yearMean = (k) => mean(y.slice(k * m, (k + 1) * m));
  const m1 = yearMean(0);
  const b0 = seasons >= 2 ? (yearMean(1) - m1) / m : 0;
  let l0 = m1 - 6.5 * b0;
  if (mult && l0 <= 0.05 * m1) l0 = 0.5 * m1;
  const use = Math.min(seasons, 2);
  let s = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < use; k++) s[i] += mult ? y[k * m + i] / yearMean(k) : y[k * m + i] - yearMean(k);
    s[i] /= use;
  }
  if (mult) { const sm = mean(s); s = s.map((v) => v / sm); }
  else { const sm = mean(s); s = s.map((v) => v - sm); }
  return { l: l0, b: b0, s };
}

function runFilter(y, p, init, mult) {
  const m = PERIOD;
  const { alpha, beta, gamma, phi } = p;
  let l = init.l, b = init.b;
  const s = init.s.slice();
  const fitted = new Array(y.length);
  let sse = 0;
  for (let t = 0; t < y.length; t++) {
    const si = s[t % m], base = l + phi * b;
    const f = mult ? base * si : base + si;
    if (!Number.isFinite(f) || (mult && (base <= 1e-9 || si <= 1e-9))) return { sse: Infinity };
    fitted[t] = f;
    const e = y[t] - f;
    sse += e * e;
    const lNew = mult ? alpha * (y[t] / si) + (1 - alpha) * base : alpha * (y[t] - si) + (1 - alpha) * base;
    b = beta * (lNew - l) + (1 - beta) * phi * b;
    s[t % m] = mult ? gamma * (y[t] / base) + (1 - gamma) * si : gamma * (y[t] - base) + (1 - gamma) * si;
    l = lNew;
  }
  return { sse, fitted, l, b, s };
}

const LO = [0.001, 0.001, 0.001, 0.8];
const HI = [0.999, 0.5, 0.999, 0.98];
const logit = (v, i) => { const q = Math.min(0.999, Math.max(0.001, (v - LO[i]) / (HI[i] - LO[i]))); return Math.log(q / (1 - q)); };

export function fitHW(y, { mult = false, damped = false } = {}) {
  if (y.length < 18) throw new Error("Holt-Winters needs at least 18 observations");
  if (mult && y.some((v) => v <= 0)) return null;
  const init = initStates(y, mult);
  const dim = damped ? 4 : 3;
  const toP = (x) => {
    const q = x.map((v, i) => LO[i] + (HI[i] - LO[i]) / (1 + Math.exp(-v)));
    return { alpha: q[0], beta: q[1], gamma: q[2], phi: damped ? q[3] : 1 };
  };
  const obj = (x) => { const r = runFilter(y, toP(x), init, mult); return Number.isFinite(r.sse) ? r.sse : 1e300; };
  const starts = [[0.2, 0.05, 0.2, 0.9], [0.5, 0.1, 0.5, 0.9], [0.1, 0.01, 0.05, 0.95], [0.8, 0.2, 0.1, 0.85]];
  let best = null;
  for (const st of starts) {
    const r = nelderMead(obj, st.slice(0, dim).map((v, i) => logit(v, i)));
    if (!best || r.value < best.value) best = r;
  }
  const params = toP(best.x);
  const run = runFilter(y, params, init, mult);
  if (!Number.isFinite(run.sse)) return null;
  // Scale the errors so the interval width follows the level: relative for multiplicative.
  const scaled = y.map((v, t) => (mult ? (v - run.fitted[t]) / run.fitted[t] : v - run.fitted[t])).slice(PERIOD);
  const nParams = 3 + (damped ? 1 : 0);
  // Small-sample allowance: the seasonal and level states are estimated from this same short history, so
  // raw in-sample residuals understate the error on months not yet seen. The 16/(n-12) factor was
  // calibrated on simulated series so that 80% bands cover about 80% (see the coverage tests).
  const allowance = 1 + 16 / (y.length - PERIOD);
  const sigma = Math.sqrt((scaled.reduce((s, e) => s + e * e, 0) / Math.max(1, scaled.length - nParams)) * allowance);
  return { mult, damped, params, n: y.length, l: run.l, b: run.b, s: run.s, sse: run.sse, sigma, nParams, fitted: run.fitted };
}

export function forecastHW(fit, h) {
  const { alpha, beta, gamma, phi } = fit.params;
  const out = [];
  let damp = 0, phiPow = 1;
  for (let i = 1; i <= h; i++) {
    phiPow *= phi;
    damp += phiPow;
    const base = fit.l + damp * fit.b;
    const si = fit.s[(fit.n - 1 + i) % PERIOD];
    out.push({ h: i, point: fit.mult ? base * si : base + si });
  }
  // Variance factor 1 + sum_{j<h} c_j^2 (Hyndman et al. 2008, additive class), used for both
  // forms; for multiplicative seasonality sigma is a relative error and scales with the point.
  let sumSq = 0, dj = 0, pj = 1;
  for (let i = 1; i <= h; i++) {
    out[i - 1].sd = fit.sigma * Math.sqrt(1 + sumSq) * (fit.mult ? Math.abs(out[i - 1].point) : 1);
    pj *= phi;
    dj += pj;
    const c = alpha * (1 + beta * dj) + (i % PERIOD === 0 ? gamma * (1 - alpha) : 0);
    sumSq += c * c;
  }
  return out;
}

function seasonalNaiveScale(train) {
  const lag = train.length > PERIOD ? PERIOD : 1;
  let s = 0, c = 0;
  for (let t = lag; t < train.length; t++) { s += Math.abs(train[t] - train[t - lag]); c++; }
  return c && s > 0 ? s / c : 1e-9;
}

function holdoutLength(n) { return n >= 36 ? 12 : 6; }

export const CANDIDATES = [
  { mult: false, damped: false, name: "Additive seasonality, trend" },
  { mult: false, damped: true, name: "Additive seasonality, damped trend" },
  { mult: true, damped: false, name: "Multiplicative seasonality, trend" },
  { mult: true, damped: true, name: "Multiplicative seasonality, damped trend" },
];

export function selectModel(y) {
  const h = holdoutLength(y.length);
  const train = y.slice(0, y.length - h), test = y.slice(y.length - h);
  const scale = seasonalNaiveScale(train);
  const table = [];
  for (const c of CANDIDATES) {
    let fit = null;
    try { fit = fitHW(train, c); } catch { fit = null; }
    if (!fit) { table.push({ ...c, mase: null, note: c.mult ? "needs every month above zero" : "did not converge" }); continue; }
    const fc = forecastHW(fit, h);
    const mae = mean(fc.map((f, i) => Math.abs(f.point - test[i])));
    table.push({ ...c, mase: mae / scale });
  }
  const ok = table.filter((t) => t.mase !== null && Number.isFinite(t.mase));
  ok.sort((a, b) => a.mase - b.mase);
  return { best: ok[0], table, holdout: h };
}

// Rolling-origin back-test of one specification against "same month last year".
export function backtest(y, spec, horizon = 6, maxOrigins = 12) {
  const n = y.length;
  const minTrain = n >= 30 ? 24 : 18;
  const last = n - horizon;
  const first = Math.max(minTrain, last - (maxOrigins - 1));
  if (last < first || last < PERIOD + 1) return null;
  let mAbs = 0, bAbs = 0, mScaled = 0, bScaled = 0, mApe = 0, bApe = 0, count = 0, apeCount = 0, origins = 0;
  const rows = [];
  for (let T = first; T <= last; T++) {
    const train = y.slice(0, T);
    const fit = fitHW(train, spec);
    if (!fit) continue;
    const fc = forecastHW(fit, horizon);
    const scale = seasonalNaiveScale(train);
    let om = 0, ob = 0;
    for (let i = 0; i < horizon; i++) {
      const actual = y[T + i], base = y[T + i - PERIOD];
      const em = Math.abs(fc[i].point - actual), eb = Math.abs(base - actual);
      om += em; ob += eb;
      mAbs += em; bAbs += eb; count++;
      if (actual !== 0) { mApe += em / Math.abs(actual); bApe += eb / Math.abs(actual); apeCount++; }
    }
    mScaled += om / horizon / scale;
    bScaled += ob / horizon / scale;
    origins++;
    rows.push({ origin: T, modelMae: om / horizon, baselineMae: ob / horizon });
  }
  if (!origins) return null;
  const modelMase = mScaled / origins, baselineMase = bScaled / origins;
  const ratio = modelMase / baselineMase;
  let verdict = "beats", message = "The model made smaller errors than repeating the same month from last year.";
  if (!(ratio < 1)) {
    verdict = "worse";
    message = "Do not trust this forecast: on your own history it was no better than simply repeating the same month from last year. Use last year's figures instead, or add more history.";
  } else if (ratio >= 0.95) {
    verdict = "marginal";
    message = "The model beat last year's figures by less than 5%. That is within noise; treat the forecast as no better than 'same month last year'.";
  }
  return {
    horizon, origins, count,
    modelMase, baselineMase, ratio,
    modelMape: apeCount ? mApe / apeCount : null,
    baselineMape: apeCount ? bApe / apeCount : null,
    modelMae: mAbs / count, baselineMae: bAbs / count,
    doNotTrust: verdict === "worse", verdict, message, rows,
  };
}

// ---------- analysis ----------

function addMonths(y, m, k) {
  const t = y * 12 + (m - 1) + k;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}

export function seasonalIndex(fit, y, startMonth) {
  const idx = new Array(PERIOD);
  const ref = mean(y.slice(-PERIOD));
  const sm = mean(fit.s);
  for (let p = 0; p < PERIOD; p++) {
    const cal = ((startMonth - 1 + p) % PERIOD);
    idx[cal] = fit.mult ? fit.s[p] / sm : (ref > 0 ? 1 + fit.s[p] / ref : null);
  }
  const rows = idx.map((v, i) => ({ month: i + 1, name: MONTH_NAMES[i], index: v }));
  const valid = rows.filter((r) => r.index !== null).sort((a, b) => b.index - a.index);
  for (const r of rows) {
    r.label = r.index === null ? "n/a" : r.index >= 1.1 ? "peak" : r.index <= 0.9 ? "slow" : "normal";
    r.rank = r.index === null ? null : valid.indexOf(r) + 1;
  }
  return rows;
}

export function analyze(months, opts = {}) {
  const horizon = Math.min(12, Math.max(1, Math.round(Number(opts.horizon) || 12)));
  const fixedCost = Number(opts.fixedCost) > 0 ? Number(opts.fixedCost) : 0;
  const band = opts.band === 95 || opts.band === "95" ? 95 : 80;
  if (!Array.isArray(months) || months.length < MIN_MONTHS) return { error: `At least ${MIN_MONTHS} months of history are needed.` };
  const y = months.map((mo) => mo.value);
  if (y.every((v) => v === y[0])) return { error: "Every month has the same value, so there is nothing to forecast." };
  const warnings = [];
  const sel = selectModel(y);
  if (!sel.best) return { error: "No model could be fitted to this series. Check for a run of zero months or a single huge outlier." };
  const spec = { mult: sel.best.mult, damped: sel.best.damped };
  const fit = fitHW(y, spec);
  const raw = forecastHW(fit, horizon);
  const lastMo = months[months.length - 1];
  const forecast = raw.map((f) => {
    const { y: fy, m: fm } = addMonths(lastMo.y, lastMo.m, f.h);
    const lo = (z) => Math.max(0, f.point - z * f.sd);
    return {
      h: f.h, key: monthKey(fy, fm), label: `${MONTH_NAMES[fm - 1]} ${fy}`,
      point: Math.max(0, f.point), lo80: lo(Z80), hi80: f.point + Z80 * f.sd, lo95: lo(Z95), hi95: f.point + Z95 * f.sd,
    };
  });
  const bt = backtest(y, spec, Math.min(6, horizon > 6 ? 6 : horizon) || 6);
  if (!bt) warnings.push("Not enough history to run a back-test, so there is no evidence the model beats last year's figures. Treat the forecast with caution.");
  else if (bt.origins < 4) warnings.push(`The back-test only had ${bt.origins} starting point${bt.origins > 1 ? "s" : ""}; its verdict is weak evidence.`);
  if (months.length < 36) warnings.push("Under three years of history: the seasonal pattern is estimated from two years and can be thrown off by one unusual year.");
  const nonPositive = y.filter((v) => v <= 0).length;
  if (nonPositive) warnings.push(`${nonPositive} month${nonPositive > 1 ? "s" : ""} at or below zero, so multiplicative seasonality was not considered.`);
  const seasonal = seasonalIndex(fit, y, months[0].m);
  let cushion = null;
  if (fixedCost > 0) {
    const key = band === 95 ? "lo95" : "lo80";
    const rows = forecast.map((f) => ({ key: f.key, label: f.label, low: f[key], point: f.point, shortfall: Math.max(0, fixedCost - f[key]), expectedShortfall: Math.max(0, fixedCost - f.point) }));
    const total = rows.reduce((s, r) => s + r.shortfall, 0);
    // Worst running deficit: the cushion needed so cash never goes below zero.
    let run = 0, peak = 0;
    for (const r of rows) { run += fixedCost - r.low; peak = Math.max(peak, run); }
    cushion = {
      fixedCost, band, total, expectedTotal: rows.reduce((s, r) => s + r.expectedShortfall, 0),
      peakRunningDeficit: peak, months: rows.filter((r) => r.shortfall > 0).length, rows,
    };
  }
  return {
    n: months.length, first: months[0].key, last: lastMo.key, horizon, history: months,
    model: { name: sel.best.name, mult: spec.mult, damped: spec.damped, params: fit.params, sigma: fit.sigma, holdoutMase: sel.best.mase },
    candidates: sel.table, holdout: sel.holdout, forecast, seasonal, backtest: bt, cushion, warnings,
  };
}

// ---------- output ----------

export function num(n, digits = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function pct(x, digits = 1) {
  return x === null || x === undefined || !Number.isFinite(x) ? "n/a" : `${(x * 100).toFixed(digits)}%`;
}

export function forecastCsv(r) {
  const head = "month,forecast,low_80,high_80,low_95,high_95" + (r.cushion ? ",shortfall_vs_fixed_cost" : "");
  const rows = r.forecast.map((f, i) => [f.key, ...[f.point, f.lo80, f.hi80, f.lo95, f.hi95].map((v) => v.toFixed(2)), ...(r.cushion ? [r.cushion.rows[i].shortfall.toFixed(2)] : [])].join(","));
  return [head, ...rows].join("\n") + "\n";
}

// ---------- simulation (tests and the example) ----------

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gaussian(u) {
  return Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
}

const SAMPLE_SEASON = [0.55, 0.6, 0.75, 0.95, 1.15, 1.45, 1.6, 1.5, 1.05, 0.8, 0.7, 0.9];

// Deterministic seasonal series. mult: level*(1+trend*t)*season*(1+noise); else additive.
export function simulateMonthly({ n = 48, level = 10000, trend = 0, season = SAMPLE_SEASON, noise = 0.05, seed = 1, mult = true, startYear = 2022, startMonth = 1 } = {}) {
  const u = rng(seed);
  const out = [];
  for (let t = 0; t < n; t++) {
    const { y, m } = addMonths(startYear, startMonth, t);
    const s = season[(m - 1) % 12];
    const base = level + trend * t;
    const value = mult ? base * s * (1 + noise * gaussian(u)) : base + level * (s - 1) + noise * level * gaussian(u);
    out.push({ y, m, key: monthKey(y, m), value });
  }
  return out;
}

export function sampleText() {
  const rows = simulateMonthly({ n: 36, level: 14000, trend: 60, noise: 0.06, seed: 42, startYear: 2023 });
  return ["month,sales", ...rows.map((r) => `${r.key}-01,${r.value.toFixed(2)}`)].join("\n");
}
