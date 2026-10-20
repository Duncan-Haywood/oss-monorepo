// Demand forecast back-tester. Pure functions, no network, no state, no imports.
//
// Input: sales rows (date, SKU, units). Output: for every SKU, the forecasting
// method that held up best when replayed on the SKU's own past, how much better
// than "repeat last period" it really was on data it was not chosen on, a
// lead-time demand forecast, safety stock and a reorder point.
//
// The point of the tool is the back-test, not the forecast: every method is
// replayed from many past forecast origins, and the winner is picked on the
// older origins and scored on the newest ones. A method that only looks good
// because it was chosen on the same data it is scored on is reported as such.

export const METHODS = [
  { id: "naive", label: "Repeat last period" },
  { id: "ma", label: "Moving average" },
  { id: "ses", label: "Exponential smoothing" },
  { id: "croston", label: "Croston (intermittent demand)" },
  { id: "holt", label: "Damped trend" },
  { id: "snaive", label: "Same period last year" },
  { id: "hw", label: "Seasonal smoothing" },
];
const LABEL = Object.fromEntries(METHODS.map((m) => [m.id, m.label]));
const PERIOD = {
  week: { days: 7, season: 52, ma: 8, name: "week" },
  month: { days: 30.4375, season: 12, ma: 3, name: "month" },
};
const MAX_SKUS = 1000;
const MAX_ORIGINS = 30;

// ---------- numbers ----------

/** Inverse normal CDF (Acklam's rational approximation, error < 1.2e-9). */
export function qnorm(p) {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = (q) => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) return low(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -low(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : 0);
const clip0 = (x) => (x > 0 ? x : 0);

// ---------- dates ----------

const MS_DAY = 86400000;
function dayNumber(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return Math.round(t / MS_DAY);
}
export function dayToIso(day) {
  return new Date(day * MS_DAY).toISOString().slice(0, 10);
}

/** Day number (days since 1970-01-01) or null. Reads YYYY-MM-DD, YYYY/MM/DD, YYYY-MM, M/D/YYYY and D/M/YYYY when a part is over 12. */
export function parseDate(raw) {
  const s = String(raw ?? "").trim().replace(/^"|"$/g, "");
  let m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?(?:$|[T\s])/);
  if (m) return dayNumber(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 1);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:$|[T\s])/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
    return a > 12 ? dayNumber(y, b, a) : dayNumber(y, a, b);
  }
  return null;
}

// ---------- parsing ----------

function splitLine(line, delim) {
  const out = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const DATE_HEAD = /^(date|day|order[ _-]?date|created[ _-]?at|created|ordered|time|week|month|period|sale[ _-]?date)/i;
const QTY_HEAD = /^(qty|quantity|units|units[ _-]?sold|sold|lineitem[ _-]?quantity|count|demand|sales[ _-]?units|pieces)/i;
const SKU_HEAD = /^(sku|item|lineitem[ _-]?sku|product|product[ _-]?name|variant|title|lineitem[ _-]?name|name|asin|code)/i;

/** Parse pasted or uploaded text. Returns { rows: [{sku, day, qty}], skipped, skippedLines, returns, ambiguousDates } or { error }. */
export function parseSales(text) {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { error: "No data yet. Paste rows or upload a CSV with a date, a SKU and units sold." };
  const first = lines[0];
  const delim = [",", "\t", ";"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const head = splitLine(first, delim);
  const hasHeader = !head.some((c) => parseDate(c) !== null);
  let iDate = 0, iSku = -1, iQty = head.length - 1;
  if (hasHeader) {
    iDate = head.findIndex((c) => DATE_HEAD.test(c));
    iQty = head.findIndex((c, i) => i !== iDate && QTY_HEAD.test(c));
    iSku = head.findIndex((c, i) => i !== iDate && i !== iQty && SKU_HEAD.test(c));
    if (iDate < 0 || iQty < 0) {
      return { error: `Could not find a date column and a units column in the header (${head.join(", ")}). Name them "date" and "quantity" (or "units"), plus "sku" for the product.` };
    }
  } else if (head.length >= 3) {
    iSku = 1; iQty = 2;
  } else if (head.length < 2) {
    return { error: "Each row needs at least a date and a quantity, separated by commas, tabs or semicolons." };
  }
  const rows = [];
  const skippedLines = [];
  let returns = 0, ambiguousDates = 0;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  dataLines.forEach((line, i) => {
    const lineNo = i + 1 + (hasHeader ? 1 : 0);
    const cells = splitLine(line, delim);
    const rawDate = cells[iDate] ?? "";
    const day = parseDate(rawDate);
    const qty = Number(String(cells[iQty] ?? "").replace(/[, ]/g, ""));
    if (day === null || !Number.isFinite(qty) || cells[iQty] === "" || cells[iQty] === undefined) {
      if (skippedLines.length < 20) skippedLines.push(lineNo);
      rows.skipped = (rows.skipped || 0) + 1;
      return;
    }
    const m = String(rawDate).match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{4}/);
    if (m && Number(m[1]) <= 12 && Number(m[2]) <= 12 && m[1] !== m[2]) ambiguousDates++;
    if (qty < 0) returns++;
    rows.push({ sku: iSku >= 0 && cells[iSku] ? cells[iSku] : "All products", day, qty });
  });
  const skipped = rows.skipped || 0;
  delete rows.skipped;
  if (!rows.length) return { error: "No readable rows. Dates should look like 2025-03-14 and units should be numbers." };
  return { rows, skipped, skippedLines, returns, ambiguousDates };
}

// ---------- bucketing ----------

function periodIndex(day, period) {
  if (period === "week") return Math.floor((day + 3) / 7); // weeks start on Monday
  const d = new Date(day * MS_DAY);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
function periodStartDay(idx, period) {
  if (period === "week") return idx * 7 - 3;
  return Math.round(Date.UTC(Math.floor(idx / 12), idx % 12, 1) / MS_DAY);
}
function periodLabel(idx, period) {
  return period === "week" ? dayToIso(periodStartDay(idx, period)) : dayToIso(periodStartDay(idx, period)).slice(0, 7);
}
/** Is `day` the last day of its period? */
function endsPeriod(day, period) {
  return periodIndex(day + 1, period) !== periodIndex(day, period);
}
function startsPeriod(day, period) {
  return periodIndex(day - 1, period) !== periodIndex(day, period);
}
function positionInPeriod(day, period) {
  return day - periodStartDay(periodIndex(day, period), period);
}

/**
 * Sum rows into per-SKU period series on a shared timeline.
 * `partial`: "auto" drops a first or last period that daily data only partly covers; "keep" keeps everything.
 */
export function bucketSales(rows, period = "week", partial = "auto") {
  const days = rows.map((r) => r.day);
  const firstDay = Math.min(...days), lastDay = Math.max(...days);
  let lo = periodIndex(firstDay, period), hi = periodIndex(lastDay, period);
  const positions = new Set(days.map((d) => positionInPeriod(d, period)));
  const dailyish = positions.size > 1;
  const dropped = [];
  if (partial === "auto" && dailyish) {
    if (!endsPeriod(lastDay, period) && hi > lo) { dropped.push(`last ${period} (${periodLabel(hi, period)}, data ends ${dayToIso(lastDay)})`); hi--; }
    const thirds = PERIOD[period].days / 3;
    if (!startsPeriod(firstDay, period) && positionInPeriod(firstDay, period) > thirds && lo < hi) { dropped.push(`first ${period} (${periodLabel(lo, period)}, data starts ${dayToIso(firstDay)})`); lo++; }
  }
  const length = hi - lo + 1;
  const bySku = new Map();
  for (const r of rows) {
    const idx = periodIndex(r.day, period);
    if (idx < lo || idx > hi) continue;
    if (!bySku.has(r.sku)) bySku.set(r.sku, new Array(length).fill(0));
    bySku.get(r.sku)[idx - lo] += r.qty;
  }
  for (const series of bySku.values()) for (let i = 0; i < series.length; i++) if (series[i] < 0) series[i] = 0;
  return { series: bySku, periods: length, startLabel: periodLabel(lo, period), endLabel: periodLabel(hi, period), dropped, dailyish };
}

// ---------- forecasting methods ----------
// Each takes a history array and a horizon and returns `horizon` non-negative numbers.

function fillArr(v, h) { return new Array(h).fill(clip0(v)); }

function naive(y, h) { return fillArr(y[y.length - 1], h); }

function maFor(k) { return (y, h) => fillArr(mean(y.slice(-k)), h); }

function sesRun(y, alpha) {
  let l = y[0], sse = 0;
  for (let t = 1; t < y.length; t++) { const e = y[t] - l; sse += e * e; l += alpha * e; }
  return { l, sse };
}
function ses(y, h) {
  let best = null;
  for (const alpha of [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) {
    const r = sesRun(y, alpha);
    if (!best || r.sse < best.sse) best = r;
  }
  return fillArr(best.l, h);
}

function croston(y, h) {
  const alpha = 0.1;
  let z = null, p = null, q = 1;
  for (let t = 0; t < y.length; t++) {
    if (y[t] > 0) {
      if (z === null) { z = y[t]; p = t + 1; }
      else { z += alpha * (y[t] - z); p += alpha * (q - p); }
      q = 1;
    } else q++;
  }
  if (z === null) return fillArr(0, h);
  return fillArr(((1 - alpha / 2) * z) / p, h); // Syntetos-Boylan bias correction
}

function holtRun(y, alpha, beta, phi) {
  const k = Math.min(y.length - 1, 4);
  let l = y[0], b = k > 0 ? (y[k] - y[0]) / k : 0, sse = 0;
  for (let t = 1; t < y.length; t++) {
    const hat = l + phi * b;
    const e = y[t] - hat;
    sse += e * e;
    const lNew = hat + alpha * e;
    b = phi * b + alpha * beta * e;
    l = lNew;
  }
  return { l, b, phi, sse };
}
function holt(y, h) {
  let best = null;
  for (const alpha of [0.1, 0.2, 0.3, 0.5, 0.7]) for (const beta of [0.05, 0.1, 0.2, 0.4]) for (const phi of [0.8, 0.9, 0.98]) {
    const r = holtRun(y, alpha, beta, phi);
    if (!best || r.sse < best.sse) best = r;
  }
  const out = [];
  let damp = 0;
  for (let i = 1; i <= h; i++) { damp += best.phi ** i; out.push(clip0(best.l + damp * best.b)); }
  return out;
}

function snaiveFor(m) {
  return (y, h) => {
    const n = y.length;
    return Array.from({ length: h }, (_, i) => clip0(y[n - m + (i % m)]));
  };
}

function hwRun(y, m, alpha, gamma) {
  let l = mean(y.slice(0, m));
  const s = Array.from({ length: m }, (_, i) => y[i] - l);
  let sse = 0;
  for (let t = m; t < y.length; t++) {
    const e = y[t] - (l + s[t % m]);
    sse += e * e;
    const lNew = l + alpha * e;
    s[t % m] += gamma * (1 - alpha) * e;
    l = lNew;
  }
  return { l, s, sse };
}
function hwFor(m) {
  return (y, h) => {
    let best = null;
    for (const alpha of [0.05, 0.1, 0.2, 0.4]) for (const gamma of [0.05, 0.2, 0.5]) {
      const r = hwRun(y, m, alpha, gamma);
      if (!best || r.sse < best.sse) best = r;
    }
    const n = y.length;
    return Array.from({ length: h }, (_, i) => clip0(best.l + best.s[(n + i) % m]));
  };
}

/** Method functions available for a series, given the period and how long a training window every origin has. */
export function methodSet(period, seasonal) {
  const cfg = PERIOD[period];
  const fns = { naive, ma: maFor(cfg.ma), ses, croston, holt };
  if (seasonal) { fns.snaive = snaiveFor(cfg.season); fns.hw = hwFor(cfg.season); }
  return fns;
}

// ---------- back-test ----------

function wape(errs, actuals) {
  const a = sum(actuals);
  return a > 0 ? sum(errs.map(Math.abs)) / a : null;
}

/**
 * Replay every method from many past origins. At each origin a method sees only
 * the history before it and forecasts `horizon` periods; the error that matters
 * for inventory is the error in total demand over that lead time.
 */
export function backtest(y, horizon, period) {
  const n = y.length;
  const cfg = PERIOD[period];
  const seasonal = n - horizon >= 2 * cfg.season + 6;
  const minTrain = seasonal ? 2 * cfg.season : Math.max(8, Math.min(26, Math.floor(n / 3)));
  const lastOrigin = n - horizon;
  let origins = [];
  for (let o = minTrain; o <= lastOrigin; o++) origins.push(o);
  origins = origins.slice(-MAX_ORIGINS);
  if (origins.length < 4) return { ok: false, origins: origins.length, seasonal };
  const fns = methodSet(period, seasonal);
  const actual = origins.map((o) => sum(y.slice(o, o + horizon)));
  const out = {};
  for (const [id, fn] of Object.entries(fns)) {
    const fc = origins.map((o) => sum(fn(y.slice(0, o), horizon)));
    out[id] = { forecast: fc, error: fc.map((f, i) => f - actual[i]) };
  }
  const split = origins.length >= 9 ? Math.ceil((origins.length * 2) / 3) : origins.length;
  return { ok: true, origins, actual, methods: out, split, honest: origins.length >= 9, seasonal };
}

function score(bt, id, from, to) {
  const e = bt.methods[id].error.slice(from, to), a = bt.actual.slice(from, to);
  return { wape: wape(e, a), abs: sum(e.map(Math.abs)), actual: sum(a), bias: sum(a) > 0 ? sum(e) / sum(a) : null, rmse: Math.sqrt(mean(e.map((x) => x * x))) };
}

/** Pick the winner on the older origins; prefer the simpler method unless a challenger is clearly (>3%) better. */
function choose(bt) {
  const order = METHODS.map((m) => m.id).filter((id) => bt.methods[id]);
  let best = null, bestScore = Infinity;
  for (const id of order) {
    const s = score(bt, id, 0, bt.split);
    const v = s.actual > 0 ? s.wape : s.abs;
    if (best === null || v < bestScore * 0.97) { best = id; bestScore = v; }
  }
  return best;
}

// ---------- analysis ----------

function classify(series, total) {
  const m = mean(series);
  const sd = Math.sqrt(mean(series.map((x) => (x - m) ** 2)));
  const cv = m > 0 ? sd / m : 0;
  return { cv, xyz: cv <= 0.5 ? "X" : cv <= 1 ? "Y" : "Z", total };
}

/**
 * options: { period: "week"|"month", leadDays, serviceLevel (0-1), partial }
 */
export function analyze(rows, options = {}) {
  const period = options.period === "month" ? "month" : "week";
  const cfg = PERIOD[period];
  const leadDays = Math.max(1, Number(options.leadDays) || 14);
  const horizon = Math.max(1, Math.min(12, Math.ceil(leadDays / cfg.days)));
  const service = Math.min(0.999, Math.max(0.5, Number(options.serviceLevel) || 0.95));
  const z = qnorm(service);
  const b = bucketSales(rows, period, options.partial || "auto");
  if (b.periods < 12) {
    return { error: `Only ${b.periods} ${period}s of history after cleaning. A back-test needs at least 12; 2 years is better, and seasonal methods need 2 full years.` };
  }
  const findings = [];
  const skus = [];
  const entries = [...b.series.entries()].sort((x, y) => sum(y[1]) - sum(x[1]));
  if (entries.length > MAX_SKUS) findings.push({ severity: "info", title: `Only the ${MAX_SKUS} best-selling SKUs were analysed`, detail: `${entries.length - MAX_SKUS} slower SKUs were left out to keep the page responsive.` });
  for (const [sku, full] of entries.slice(0, MAX_SKUS)) {
    const first = full.findIndex((x) => x > 0);
    if (first < 0) continue;
    const y = full.slice(first);
    const total = sum(y);
    const cls = classify(y, total);
    const zeroShare = y.filter((x) => x === 0).length / y.length;
    const row = { sku, periods: y.length, total, avg: mean(y), cv: cls.cv, xyz: cls.xyz, zeroShare, flags: [] };
    const bt = y.length >= 12 + horizon ? backtest(y, horizon, period) : { ok: false, origins: 0 };
    if (!bt.ok) {
      const fc = maFor(cfg.ma)(y, horizon);
      Object.assign(row, { method: "ma", methodLabel: LABEL.ma, verified: false, leadDemand: sum(fc), perPeriod: fc, sigma: null, safetyStock: null, reorderPoint: null, wape: null, naiveWape: null, gain: null, origins: bt.origins || 0 });
      row.flags.push(`Too little history to back-test (${y.length} ${period}s); moving average shown, no safety stock.`);
      skus.push(row);
      continue;
    }
    const id = choose(bt);
    const evalFrom = bt.honest ? bt.split : 0;
    const win = score(bt, id, evalFrom, bt.origins.length);
    const nv = score(bt, "naive", evalFrom, bt.origins.length);
    const fc = methodSet(period, bt.seasonal)[id](y, horizon);
    const leadDemand = sum(fc);
    const sigma = score(bt, id, 0, bt.origins.length).rmse;
    const ss = z * sigma;
    const gain = nv.wape !== null && win.wape !== null && nv.wape > 0 ? 1 - win.wape / nv.wape : null;
    Object.assign(row, {
      method: id, methodLabel: LABEL[id], verified: bt.honest, leadDemand, perPeriod: fc, sigma, safetyStock: ss, reorderPoint: leadDemand + ss,
      low: Math.max(0, leadDemand - qnorm(0.975) * sigma), high: leadDemand + qnorm(0.975) * sigma,
      wape: win.wape, naiveWape: nv.wape, bias: win.bias, gain, origins: bt.origins.length, evalAbs: win.abs, naiveAbs: nv.abs, evalActual: win.actual, seasonalTested: bt.seasonal,
    });
    if (!bt.honest) row.flags.push(`Only ${bt.origins.length} back-test points: the winner was scored on the same points it was chosen on, so its accuracy is optimistic.`);
    if (gain !== null && gain < 0) row.flags.push(`The chosen method did worse than repeating last ${period} on points it was not chosen on (${pct(win.wape)} against ${pct(nv.wape)}); its edge on the older points was probably luck.`);
    else if (gain !== null && gain < 0.05) row.flags.push(`No method clearly beat repeating last ${period} on unseen points; treat the forecast as a level, not a prediction.`);
    if (zeroShare >= 0.4) row.flags.push(`${Math.round(zeroShare * 100)}% of ${period}s have no sales. If stock ran out, those zeros are lost demand, not zero demand.`);
    skus.push(row);
  }
  if (!skus.length) return { error: "Every SKU has zero sales in the usable window." };

  const grand = sum(skus.map((s) => s.total));
  let run = 0;
  for (const s of [...skus].sort((p, q) => q.total - p.total)) {
    run += s.total;
    s.abc = (run - s.total) / grand < 0.8 ? "A" : (run - s.total) / grand < 0.95 ? "B" : "C";
  }
  skus.sort((p, q) => q.total - p.total);

  const tested = skus.filter((s) => s.evalAbs !== undefined && s.verified);
  const pooledWin = sum(tested.map((s) => s.evalAbs)), pooledNaive = sum(tested.map((s) => s.naiveAbs)), pooledActual = sum(tested.map((s) => s.evalActual));
  const beat = tested.filter((s) => s.gain !== null && s.gain >= 0.05);
  const byMethod = {};
  for (const s of skus) byMethod[s.method] = (byMethod[s.method] || 0) + 1;
  const summary = {
    skus: skus.length, periods: b.periods, period, horizon, leadDays, service, z,
    startLabel: b.startLabel, endLabel: b.endLabel, tested: tested.length,
    pooledWape: pooledActual > 0 ? pooledWin / pooledActual : null,
    pooledNaiveWape: pooledActual > 0 ? pooledNaive / pooledActual : null,
    beatNaive: beat.length, byMethod,
    classes: ["A", "B", "C"].map((k) => ({ abc: k, skus: skus.filter((s) => s.abc === k).length, share: sum(skus.filter((s) => s.abc === k).map((s) => s.total)) / grand })),
    totalSafetyStock: sum(skus.map((s) => s.safetyStock || 0)),
  };
  if (b.dropped.length) findings.push({ severity: "info", title: "Incomplete periods were dropped", detail: `Dropped the ${b.dropped.join(" and the ")} so a part-filled period is not read as a sales slump. Choose "keep every period" if your export is already complete.` });
  if (summary.pooledWape !== null && summary.pooledNaiveWape !== null) {
    const g = 1 - summary.pooledWape / summary.pooledNaiveWape;
    findings.push(g >= 0.05
      ? { severity: "info", title: `Best-method-per-SKU cut lead-time error by ${(g * 100).toFixed(0)}% against repeating last ${period}`, detail: `On back-test points not used to choose the method, pooled error in ${horizon}-${period} demand was ${(summary.pooledWape * 100).toFixed(0)}% against ${(summary.pooledNaiveWape * 100).toFixed(0)}% for repeating last ${period} (${beat.length} of ${tested.length} SKUs clearly better).` }
      : { severity: "medium", title: `Smarter methods did not beat repeating last ${period} on your data`, detail: `Pooled lead-time error was ${(summary.pooledWape * 100).toFixed(0)}% against ${(summary.pooledNaiveWape * 100).toFixed(0)}% for repeating last ${period}. Your demand is noisy or short; spend effort on lead-time reliability and buffer stock, not on forecast models.` });
  }
  if (rows.length && skus.some((s) => s.zeroShare >= 0.4)) findings.push({ severity: "medium", title: "Zero-sales periods may be stock-outs", detail: "Sales are not demand: a period with nothing sold because the shelf was empty teaches every method to forecast too low. Check intermittent SKUs against your stock history before ordering from these numbers." });
  if (!skus.some((s) => s.seasonalTested)) findings.push({ severity: "info", title: "Seasonal methods were not tested", detail: `They need two full years of ${period}s plus a few back-test points; this file has ${b.periods} ${period}s. With less, a seasonal pattern shows up as noise and safety stock is larger than it needs to be.` });
  return { summary, skus, findings, bucket: { dropped: b.dropped, dailyish: b.dailyish } };
}

// ---------- purchase plan ----------

const ONHAND_HEAD = /^(on[ _-]?hand|stock|in[ _-]?stock|qty[ _-]?on[ _-]?hand|inventory|available|current[ _-]?stock|quantity[ _-]?on[ _-]?hand)/i;
const ONORDER_HEAD = /^(on[ _-]?order|incoming|open[ _-]?po|inbound|in[ _-]?transit|po[ _-]?qty|on[ _-]?po)/i;
const MOQ_HEAD = /^(moq|min(imum)?[ _-]?order|min[ _-]?qty)/i;
const PACK_HEAD = /^(pack|pack[ _-]?size|case|case[ _-]?size|multiple|order[ _-]?multiple|carton)/i;

/**
 * Parse a stock file: one row per SKU with on-hand units, and optionally units already on order,
 * a minimum order quantity and a pack size. Returns { stock: Map(lowercased sku -> entry), skipped } or { error }.
 */
export function parseStock(text) {
  const lines = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: "The stock file needs a header row and at least one SKU row: sku, on_hand (optionally on_order, moq, pack_size)." };
  const delim = [",", "\t", ";"].map((d) => [d, lines[0].split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const head = splitLine(lines[0], delim);
  const iSku = head.findIndex((c) => SKU_HEAD.test(c));
  const iHand = head.findIndex((c, i) => i !== iSku && ONHAND_HEAD.test(c));
  if (iSku < 0 || iHand < 0) return { error: `Could not find a SKU column and an on-hand column in the stock header (${head.join(", ")}). Name them "sku" and "on_hand".` };
  const find = (re) => head.findIndex((c, i) => i !== iSku && i !== iHand && re.test(c));
  const iOrd = find(ONORDER_HEAD), iMoq = find(MOQ_HEAD), iPack = find(PACK_HEAD);
  const n = (cells, i) => {
    if (i < 0 || cells[i] === undefined || cells[i] === "") return null;
    const v = Number(String(cells[i]).replace(/[, ]/g, ""));
    return Number.isFinite(v) ? v : NaN;
  };
  const stock = new Map();
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delim);
    const sku = cells[iSku];
    const hand = n(cells, iHand), ord = n(cells, iOrd), moq = n(cells, iMoq), pack = n(cells, iPack);
    if (!sku || hand === null || [hand, ord, moq, pack].some((v) => Number.isNaN(v))) { skipped++; continue; }
    // Duplicate SKU rows (several bins or locations) add up.
    const key = sku.toLowerCase();
    const prev = stock.get(key);
    stock.set(key, {
      sku: prev?.sku ?? sku, onHand: (prev?.onHand || 0) + hand, onOrder: (prev?.onOrder || 0) + (ord || 0),
      moq: Math.max(prev?.moq || 0, moq || 0), pack: Math.max(prev?.pack || 0, pack || 0),
    });
  }
  if (!stock.size) return { error: "No readable rows in the stock file. Each row needs a SKU and a number of units on hand." };
  return { stock, skipped };
}

/**
 * Turn the stock plan into an order list. Adds `order` to every SKU that has a stock row and returns a summary.
 *
 * Inventory position = on hand + on order. When it is at or below the reorder point the order brings it up to the
 * reorder point plus `coverDays` of forecast demand (default: one more lead-time cycle), then respects the supplier's
 * minimum order quantity and rounds up to whole packs. A SKU whose back-test was too short to size safety stock is
 * planned on forecast lead-time demand alone and says so.
 */
export function orderPlan(result, stock, options = {}) {
  const period = result.summary.period;
  const cycleDays = result.summary.horizon * PERIOD[period].days;
  const coverDays = Number.isFinite(options.coverDays) && options.coverDays > 0 ? options.coverDays : result.summary.leadDays;
  const seen = new Set();
  const plan = { ordered: 0, units: 0, late: 0, excess: 0, unmatchedSales: [], unmatchedStock: [] };
  for (const s of result.skus) {
    const e = stock.get(s.sku.toLowerCase());
    if (!e) { plan.unmatchedSales.push(s.sku); continue; }
    seen.add(s.sku.toLowerCase());
    const daily = s.leadDemand / cycleDays;
    const position = e.onHand + e.onOrder;
    const ss = s.safetyStock ?? 0;
    const rop = s.leadDemand + ss;
    const target = rop + daily * coverDays;
    let qty = 0, status = "ok";
    const notes = [];
    if (s.safetyStock === null) notes.push("No safety stock: too little history to back-test, so this uses forecast demand alone.");
    if (position <= rop) {
      qty = Math.max(0, target - position);
      if (qty > 0 && e.moq && qty < e.moq) { qty = e.moq; notes.push(`Raised to the minimum order of ${e.moq}.`); }
      if (qty > 0 && e.pack > 1) qty = Math.ceil(qty / e.pack - 1e-9) * e.pack;
      else qty = Math.ceil(qty - 1e-9);
      status = "order";
      plan.ordered++;
      plan.units += qty;
    } else if (position > target + s.leadDemand) {
      status = "excess";
      plan.excess++;
    }
    // Stock on the shelf now runs out before an order placed today could arrive.
    const lateBy = e.onHand < s.leadDemand;
    if (status === "order" && lateBy && daily > 0) { plan.late++; notes.push(`On hand covers about ${Math.floor(e.onHand / daily)} days; an order placed today lands after about ${result.summary.leadDays}. Expect a gap, or expedite.`); }
    if (status === "excess" && daily > 0) notes.push(`About ${Math.round(position / daily)} days of cover on hand and on order: pause buying.`);
    s.order = { onHand: e.onHand, onOrder: e.onOrder, position, daysCover: daily > 0 ? e.onHand / daily : null, reorderPoint: rop, orderUpTo: target, qty, status, notes };
  }
  for (const e of stock.values()) if (!seen.has(e.sku.toLowerCase())) plan.unmatchedStock.push(e.sku);
  return plan;
}

// ---------- output ----------

export function reportCsv(result) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = ["sku", "abc", "xyz", "units_total", "method", "lead_time_demand", "safety_stock", "reorder_point", "interval_low", "interval_high", "backtest_error_pct", "repeat_last_error_pct", "better_than_repeat_pct", "backtest_points", "tested_on_unseen", "notes"];
  const withOrders = result.skus.some((s) => s.order);
  if (withOrders) head.splice(8, 0, "on_hand", "on_order", "days_of_cover", "status", "order_qty");
  const f = (v, d = 1) => (v === null || v === undefined ? "" : Number(v).toFixed(d));
  const lines = [head.join(",")];
  for (const s of result.skus) {
    const o = s.order;
    const ord = withOrders ? [o ? f(o.onHand, 0) : "", o ? f(o.onOrder, 0) : "", o ? f(o.daysCover, 0) : "", o ? o.status : "no stock row", o ? f(o.qty, 0) : ""] : [];
    lines.push([s.sku, s.abc, s.xyz, f(s.total, 0), s.methodLabel, f(s.leadDemand), f(s.safetyStock), f(s.reorderPoint), ...ord, f(s.low), f(s.high), f(s.wape === null ? null : s.wape * 100), f(s.naiveWape === null ? null : s.naiveWape * 100), f(s.gain === null ? null : s.gain * 100, 0), s.origins, s.verified ? "yes" : "no", s.flags.concat(o ? o.notes : []).join(" ")].map(q).join(","));
  }
  return lines.join("\n") + "\n";
}

export const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
export const pct = (x, d = 0) => (x === null || x === undefined ? "–" : (x * 100).toFixed(d) + "%");
export const num = (x, d = 0) => (x === null || x === undefined ? "–" : Number(x).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));

// ---------- example data ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Invented monthly sales for 20 SKUs over 48 months: stable, trending, seasonal, lumpy and one new product. */
export function sampleText() {
  const rnd = mulberry32(20261018);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const lines = ["date,sku,quantity"];
  for (let k = 0; k < 20; k++) {
    const sku = `SKU-${String(k + 1).padStart(3, "0")}`;
    const base = 30 + Math.floor(rnd() * 170);
    const peak = Math.floor(rnd() * 12);
    for (let t = 0; t < 48; t++) {
      if (k === 19 && t < 30) continue;
      const month = t % 12;
      let mu = base;
      if (k >= 5 && k <= 7) mu = base * (1 + 0.015 * t);
      else if (k >= 8 && k <= 9) mu = base * (1.6 - 0.01 * t);
      else if (k >= 10 && k <= 15) mu = base * (1 + (0.35 + 0.05 * (k - 10)) * Math.cos((2 * Math.PI * (month - peak)) / 12));
      let q;
      if (k >= 16 && k <= 18) q = rnd() < 0.3 ? Math.round(5 + rnd() * 20) : 0;
      else q = Math.max(0, Math.round(mu * (1 + 0.1 * gauss())));
      const date = `${2022 + Math.floor(t / 12)}-${String(month + 1).padStart(2, "0")}-01`;
      lines.push(`${date},${sku},${q}`);
    }
  }
  return lines.join("\n");
}
