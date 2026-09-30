<<<<<<< HEAD
// Price elasticity estimator: log-log OLS of units on price with optional
// linear time trend, promo flag and month-of-year dummies; t-based confidence
// interval, a check that price varies enough to identify anything, a
// profit-maximising price capped to the tested range, a what-if table and a
// hold-out back-test. Pure functions, no imports, no network.

export const MIN_ROWS = 12;
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LOOKUP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1));
};
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayNumber = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000;
const isoDate = (r) => `${r.y}-${String(r.m).padStart(2, "0")}-${String(r.d).padStart(2, "0")}`;

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
function fullYear(y) { return y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y; }

// {y,m,d}, {amb:[a,b,y]} for a/b/yyyy, or null.
export function parseDateCell(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let r;
  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[T ].*)?$/))) {
    const y = +r[1], m = +r[2], d = r[3] ? +r[3] : 1;
    return validYmd(y, m, d) ? { y, m, d } : null;
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
    return m && validYmd(y, m, 1) ? { y, m, d: 1 } : null;
  }
  return null;
}

export function parseNumber(raw, decimalComma = false) {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
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

export function parseFlag(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["1", "true", "yes", "y", "t", "on", "promo", "sale", "x"].includes(s)) return true;
  if (["0", "false", "no", "n", "f", "off", "none", "-"].includes(s)) return false;
  return null;
}

// Text -> {obs:[{y,m,d,day,price,units,cost,promo}], warnings, columns, skipped, error?}
export function parseData(text) {
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { error: "Paste or upload rows of date,price,units first." };
  const head = lines[0];
  const delim = head.includes("\t") ? "\t" : (head.split(";").length > head.split(",").length ? ";" : ",");
  const cells = lines.map((l) => splitLine(l, delim));
  const first = cells[0];
  let col = { date: 0, price: 1, units: 2, cost: 3, promo: 4 };
  let start = 0;
  const firstIsData = first.some((c) => parseDateCell(c));
  if (!firstIsData) {
    start = 1;
    const claimed = new Set();
    const find = (re) => { const i = first.findIndex((c, k) => !claimed.has(k) && re.test(c)); if (i >= 0) claimed.add(i); return i; };
    col = {
      date: find(/date|day|week|month|period|time/i),
      promo: find(/promo|discount|campaign|event|on.?sale|is.?sale/i),
      cost: find(/cost|cogs|landed/i),
      price: find(/price|asp|rate/i),
      units: find(/units|qty|quantity|sold|volume|orders|pcs|sales|count/i),
    };
    if (col.date < 0 || col.price < 0 || col.units < 0) {
      return { error: `Could not find the date, price and units columns in the header (${first.join(", ")}). Name them date, price and units, or drop the header and use that column order.` };
    }
  }
  const decimalComma = delim === ";" && cells.slice(start).some((r) => /^-?\d+,\d{1,2}$/.test(r[col.price] || ""));
  const raw = [];
  let skipped = 0, nonPositive = 0;
  for (let i = start; i < cells.length; i++) {
    const r = cells[i];
    const d = parseDateCell(r[col.date]);
    const price = parseNumber(r[col.price], decimalComma);
    const units = parseNumber(r[col.units], decimalComma);
    if (!d || price === null || units === null) { skipped++; continue; }
    if (price <= 0 || units <= 0) { nonPositive++; continue; }
    const cost = col.cost >= 0 ? parseNumber(r[col.cost], decimalComma) : null;
    const promo = col.promo >= 0 ? parseFlag(r[col.promo]) : null;
    raw.push({ d, price, units, cost: cost !== null && cost > 0 ? cost : null, promo });
  }
  const amb = raw.filter((r) => r.d.amb);
  const dayFirst = amb.length > 0 && amb.some((r) => r.d.amb[0] > 12) && !amb.some((r) => r.d.amb[1] > 12);
  const obs = [];
  for (const { d, price, units, cost, promo } of raw) {
    let y, m, dd;
    if (d.amb) {
      const [p, q, yy] = d.amb;
      [m, dd] = dayFirst ? [q, p] : [p, q];
      y = yy;
      if (!validYmd(y, m, dd)) { skipped++; continue; }
    } else ({ y, m, d: dd } = d);
    obs.push({ y, m, d: dd, day: dayNumber(y, m, dd), price, units, cost, promo });
  }
  if (!obs.length) return { error: "No rows had a readable date, a price above zero and units above zero. Use one row per day, week or month, for example 2024-03-31,19.99,142." };
  obs.sort((a, b) => a.day - b.day);
  const warnings = [];
  if (skipped) warnings.push(`${skipped} row(s) were skipped because the date, price or units could not be read.`);
  if (nonPositive) warnings.push(`${nonPositive} row(s) with a zero or negative price or zero units were skipped: a logarithm needs positive numbers. If a zero-sales period is a real stock-out, leaving it out is the usual choice, but it does mean the fit ignores those periods.`);
  return { obs, warnings, skipped, nonPositive, columns: { hasCost: col.cost >= 0, hasPromo: col.promo >= 0 }, dayFirst };
}

// ---------- statistics ----------

function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5;
  t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015;
  for (const k of c) s += k / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}

function betacf(a, b, x) {
  const tiny = 1e-30;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return h;
}

function incBeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function tCdf(t, df) {
  const x = df / (df + t * t);
  const tail = 0.5 * incBeta(df / 2, 0.5, x);
  return t > 0 ? 1 - tail : tail;
}

// Two-sided critical value: P(|T| <= q) = level.
export function tQuantile(level, df) {
  const target = 1 - (1 - level) / 2;
  let lo = 0, hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Invert a square matrix by Gauss-Jordan; null when singular.
function invert(M) {
  const n = M.length;
  const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(...M.map((r, i) => Math.abs(r[i])), 1e-300);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-11 * scale) return null;
    [A[c], A[p]] = [A[p], A[c]];
    const pv = A[c][c];
    for (let j = 0; j < 2 * n; j++) A[c][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((r) => r.slice(n));
}

// OLS of y on X (rows of regressors including the intercept column).
export function ols(X, y) {
  const n = X.length, k = X[0].length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = a; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
  const inv = invert(XtX);
  if (!inv) return null;
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
  const fitted = X.map((r) => r.reduce((s, v, j) => s + v * beta[j], 0));
  const resid = y.map((v, i) => v - fitted[i]);
  const rss = resid.reduce((s, v) => s + v * v, 0);
  const ybar = mean(y);
  const tss = y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const df = n - k;
  const sigma2 = df > 0 ? rss / df : NaN;
  return {
    beta, resid, fitted, rss, tss, df, n, k, sigma2,
    se: inv.map((row, i) => Math.sqrt(Math.max(0, sigma2 * row[i]))),
    r2: tss > 0 ? 1 - rss / tss : 0,
    adjR2: tss > 0 && df > 0 ? 1 - (rss / df) / (tss / (n - 1)) : 0,
  };
}

// ---------- model ----------

// Which controls the data can support.
export function buildSpec(obs, opts = {}) {
  const t0 = obs[0].day;
  const spanDays = obs[obs.length - 1].day - t0;
  const notes = [];
  const spec = {
    t0,
    lnpCenter: mean(obs.map((o) => Math.log(o.price))),
    trend: false, trendCenter: 0, promo: false, months: [], baseMonth: null, includePrice: opts.includePrice !== false,
  };
  if (opts.trend !== false) {
    if (spanDays >= 28) {
      spec.trend = true;
      spec.trendCenter = mean(obs.map((o) => (o.day - t0) / 365.25));
    } else notes.push("Fewer than four weeks of history, so no time trend is fitted.");
  }
  const flags = obs.map((o) => o.promo);
  if (opts.promo !== false && flags.every((f) => f !== null)) {
    const yes = flags.filter(Boolean).length;
    if (yes >= 2 && obs.length - yes >= 2) spec.promo = true;
    else notes.push("The promo column has fewer than two promo rows or fewer than two non-promo rows, so it is not used as a control.");
  }
  if (opts.seasonality) {
    if (spanDays < 330) notes.push("Month-of-year dummies need about a year of history; seasonality was not fitted.");
    else {
      const counts = {};
      for (const o of obs) counts[o.m] = (counts[o.m] || 0) + 1;
      const base = +Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a - b)[0];
      spec.baseMonth = base;
      spec.months = Object.keys(counts).map(Number).filter((m) => m !== base && counts[m] >= 2).sort((a, b) => a - b);
      const dropped = Object.keys(counts).map(Number).filter((m) => m !== base && counts[m] < 2);
      if (dropped.length) notes.push(`Months with a single row (${dropped.map((m) => MONTH_NAMES[m - 1]).join(", ")}) get no dummy of their own.`);
      if (!spec.months.length) notes.push("No month has enough rows for a seasonal dummy.");
    }
  }
  return { spec, notes };
}

export function designRow(o, spec) {
  const row = [1];
  if (spec.includePrice) row.push(Math.log(o.price) - spec.lnpCenter);
  if (spec.trend) row.push((o.day - spec.t0) / 365.25 - spec.trendCenter);
  if (spec.promo) row.push(o.promo ? 1 : 0);
  for (const m of spec.months) row.push(o.m === m ? 1 : 0);
  return row;
}

export function columnNames(spec) {
  const names = ["intercept"];
  if (spec.includePrice) names.push("ln(price)");
  if (spec.trend) names.push("time trend (per year)");
  if (spec.promo) names.push("promo flag");
  for (const m of spec.months) names.push(`${MONTH_NAMES[m - 1]} vs ${MONTH_NAMES[spec.baseMonth - 1]}`);
  return names;
}

function fitSpec(obs, spec) {
  const X = obs.map((o) => designRow(o, spec));
  const y = obs.map((o) => Math.log(o.units));
  const fit = ols(X, y);
  return fit && Number.isFinite(fit.sigma2) ? { fit, X, y } : null;
}

// Fit with graceful fallback: drop seasonality, then promo, then trend when
// the design is singular or has no residual degrees of freedom.
function fitWithFallback(obs, opts, warnings) {
  let o = { ...opts };
  for (let attempt = 0; attempt < 4; attempt++) {
    const { spec, notes } = buildSpec(obs, o);
    const r = obs.length - designRow(obs[0], spec).length >= 4 ? fitSpec(obs, spec) : null;
    if (r) { for (const n of notes) warnings.push(n); return { ...r, spec }; }
    if (o.seasonality) { o.seasonality = false; warnings.push("Seasonality dummies were dropped: too few rows for that many controls, or they were collinear with each other."); }
    else if (o.promo !== false && spec.promo) { o.promo = false; warnings.push("The promo flag was dropped: it could not be separated from the other columns (it may move exactly with price)."); }
    else if (o.trend !== false && spec.trend) { o.trend = false; warnings.push("The time trend was dropped: too few rows, or it could not be separated from price."); }
    else break;
  }
  return null;
}

function smearing(resid) {
  return mean(resid.map((r) => Math.exp(r)));
}

function predictUnits(fit, spec, smear, o) {
  const row = designRow(o, spec);
  return smear * Math.exp(row.reduce((s, v, j) => s + v * fit.beta[j], 0));
}

// ---------- pricing maths ----------

// Profit-maximising price for constant elasticity e and unit cost c.
export function optimalPriceRaw(e, c) {
  return e < -1 ? (c * e) / (1 + e) : Infinity;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function optimum({ e, eLo, eHi, cost, pMin, pMax }) {
  if (!(cost > 0)) return { status: "no-cost" };
  if (e >= 0) return { status: "not-computed", reason: "The estimated elasticity is zero or positive, which says demand rose with price. That is almost always a confounder (a promotion, a trend, a stock-out), not a real effect, so no price is recommended." };
  const cap = (p) => clamp(p, pMin, pMax);
  const pPoint = cap(optimalPriceRaw(e, cost));
  const cands = [optimalPriceRaw(eLo, cost), optimalPriceRaw(eHi, cost)].map(cap);
  const low = Math.min(pPoint, ...cands), high = Math.max(pPoint, ...cands);
  const raw = optimalPriceRaw(e, cost);
  return {
    status: raw === Infinity ? "raise-to-cap" : raw > pMax ? "capped-high" : raw < pMin ? "capped-low" : "interior",
    cost, point: pPoint, rawPoint: raw, low, high,
    ciAllowsInelastic: eHi >= -1,
  };
}

function scenario(p, ref, e, cost) {
  const units = ref.units * Math.pow(p / ref.price, e);
  const revenue = p * units;
  return { price: p, units, revenue, profit: cost > 0 ? (p - cost) * units : null };
}

export function whatIf({ ref, e, eLo, eHi, cost, pMin, pMax, extra = [] }) {
  const steps = [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2];
  const prices = [...new Set([...steps.map((s) => ref.price * (1 + s)), ...extra].map((p) => +p.toFixed(4)))].filter((p) => p > 0).sort((a, b) => a - b);
  const base = scenario(ref.price, ref, e, cost);
  return prices.map((p) => {
    const s = scenario(p, ref, e, cost);
    const u1 = scenario(p, ref, eLo, cost).units, u2 = scenario(p, ref, eHi, cost).units;
    return {
      ...s,
      changePct: p / ref.price - 1,
      unitsLow: Math.min(u1, u2), unitsHigh: Math.max(u1, u2),
      revenueChangePct: s.revenue / base.revenue - 1,
      profitChange: s.profit === null ? null : s.profit - base.profit,
      outside: p < pMin - 1e-9 || p > pMax + 1e-9,
      isReference: Math.abs(p - ref.price) < 1e-9,
    };
  });
}

// ---------- identification ----------

export function priceVariation(obs) {
  const prices = obs.map((o) => o.price);
  const lnp = prices.map(Math.log);
  const min = Math.min(...prices), max = Math.max(...prices);
  const distinct = new Set(prices.map((p) => p.toFixed(2))).size;
  return { min, max, rangePct: max / min - 1, sdLog: sd(lnp), distinct, n: prices.length };
}

function vifOfPrice(X) {
  if (X[0].length < 3) return 1;
  const y = X.map((r) => r[1]);
  const Z = X.map((r) => [r[0], ...r.slice(2)]);
  const f = ols(Z, y);
  if (!f || f.tss === 0) return Infinity;
  return f.r2 >= 1 - 1e-12 ? Infinity : 1 / (1 - f.r2);
}

export function assessIdentification({ variation, vif, ciWidth, eSe }) {
  const reasons = [];
  let level = "ok";
  const bump = (l) => { if (l === "not_identified" || (l === "weak" && level === "ok")) level = l; };
  if (variation.rangePct < 0.05 || variation.sdLog < 0.02) {
    bump("not_identified");
    reasons.push(`Price barely moved: the highest price is only ${(variation.rangePct * 100).toFixed(1)}% above the lowest (spread of ${(variation.sdLog * 100).toFixed(1)}% in log terms). Demand cannot be separated from ordinary noise over a range that small, so any elasticity below is not informative. Test a few clearly different prices (at least 10 to 15% apart) for a few weeks each.`);
  } else if (variation.rangePct < 0.15) {
    bump("weak");
    reasons.push(`Price moved only ${(variation.rangePct * 100).toFixed(0)}% from lowest to highest. That is thin: the interval will be wide and small errors in the controls can swing the answer.`);
  }
  if (variation.distinct < 3) {
    bump("weak");
    reasons.push(`Only ${variation.distinct} distinct price level(s). Two levels amount to a before-and-after comparison, which cannot tell a price effect from anything else that changed at the same time.`);
  }
  if (vif > 10) {
    bump("not_identified");
    reasons.push(`After the controls, price is almost entirely explained by them (variance inflation ${Number.isFinite(vif) ? vif.toFixed(1) : "infinite"}). Price moved with the trend, the promo flag or the season, so its own effect cannot be isolated.`);
  } else if (vif > 5) {
    bump("weak");
    reasons.push(`Price is strongly tied to the controls (variance inflation ${vif.toFixed(1)}): it mostly moved together with the trend, the promo flag or the season, so the estimate is fragile.`);
  }
  if (ciWidth > 2) {
    bump("weak");
    reasons.push(`The 95% interval is ${ciWidth.toFixed(1)} elasticity points wide, which is too wide to act on without more price variation or more rows.`);
  }
  return { level, reasons };
}

// ---------- back-test ----------

export function backtest(obs, opts, holdout) {
  const n = obs.length;
  const N = holdout ?? clamp(Math.round(n / 5), 3, 12);
  const train = obs.slice(0, n - N), test = obs.slice(n - N);
  if (N < 2 || train.length < MIN_ROWS - 2) return { available: false, reason: "Not enough rows to hold any back and still fit the model." };
  const priceVar = priceVariation(train);
  const mk = (includePrice) => {
    const { spec } = buildSpec(train, { ...opts, includePrice });
    const r = fitSpec(train, spec);
    return r ? { spec, r, smear: smearing(r.fit.resid) } : null;
  };
  const withP = mk(true), noP = mk(false);
  if (!withP || !noP) return { available: false, reason: "The model could not be fitted on the training part alone (too few rows for the controls chosen)." };
  const trainMean = mean(train.map((o) => o.units));
  const score = (pred) => {
    const ae = test.map((o, i) => Math.abs(o.units - pred[i]));
    return { mae: mean(ae), mape: mean(test.map((o, i) => ae[i] / o.units)) };
  };
  const pModel = test.map((o) => predictUnits(withP.r.fit, withP.spec, withP.smear, o));
  const pNoPrice = test.map((o) => predictUnits(noP.r.fit, noP.spec, noP.smear, o));
  const pMean = test.map(() => trainMean);
  const m = score(pModel), b = score(pNoPrice), nv = score(pMean);
  const ratio = m.mape / b.mape;
  const verdict = ratio < 0.95 ? "helps" : ratio > 1.05 ? "worse" : "marginal";
  const message = verdict === "helps"
    ? `Holding back the last ${N} rows, the model with price predicted units better (${(m.mape * 100).toFixed(1)}% average miss) than the same model without price (${(b.mape * 100).toFixed(1)}%), so price carries real information.`
    : verdict === "marginal"
      ? `Holding back the last ${N} rows, the model with price was about as accurate (${(m.mape * 100).toFixed(1)}% average miss) as the same model without price (${(b.mape * 100).toFixed(1)}%). Price did not clearly help predict the held-out rows.`
      : `Holding back the last ${N} rows, the model with price did worse (${(m.mape * 100).toFixed(1)}% average miss) than the same model without price (${(b.mape * 100).toFixed(1)}%). Do not trust the elasticity for decisions.`;
  return {
    available: true, holdout: N, trainN: train.length,
    trainElasticity: withP.r.fit.beta[1], trainSe: withP.r.fit.se[1],
    trainPriceRangePct: priceVar.rangePct,
    model: m, noPrice: b, naiveMean: nv,
    verdict, doNotTrust: verdict === "worse", message,
    rows: test.map((o, i) => ({ date: isoDate(o), price: o.price, actual: o.units, predicted: pModel[i], noPrice: pNoPrice[i] })),
  };
}

// ---------- analysis ----------

export function analyze(obs, opts = {}) {
  const warnings = [];
  if (!obs || obs.length < MIN_ROWS) return { error: `Need at least ${MIN_ROWS} rows with a price and units; found ${obs ? obs.length : 0}. Weekly history for a quarter, or monthly for a year, is a realistic minimum.` };
  const variation = priceVariation(obs);
  if (variation.distinct < 2) return { error: "Every row has the same price, so there is no price variation to learn an elasticity from. Change the price (by at least 10%) for a few weeks, record units, and come back." };
  const useOpts = { trend: opts.trend !== false, seasonality: Boolean(opts.seasonality), promo: opts.promo !== false };
  const fitted = fitWithFallback(obs, useOpts, warnings);
  if (!fitted) return { error: "The model could not be fitted: the price column is constant or exactly collinear with itself, or there are too few rows." };
  const { fit, X, spec } = fitted;
  const names = columnNames(spec);
  const e = fit.beta[1], se = fit.se[1];
  const q = tQuantile(0.95, fit.df);
  const eLo = e - q * se, eHi = e + q * se;
  const tStat = se > 0 ? e / se : 0;
  const pValue = 2 * (1 - tCdf(Math.abs(tStat), fit.df));
  const vif = vifOfPrice(X);
  const ident = assessIdentification({ variation, vif, ciWidth: eHi - eLo, eSe: se });
  if (spec.trend && obs.length > 4) {
    const t = obs.map((o) => o.day), lnp = obs.map((o) => Math.log(o.price));
    const mt = mean(t), mp = mean(lnp);
    const cov = mean(t.map((v, i) => (v - mt) * (lnp[i] - mp)));
    const corr = cov / (sd(t) * sd(lnp) * (obs.length - 1) / obs.length || 1);
    if (Math.abs(corr) > 0.8) warnings.push(`Price and time are strongly correlated (r = ${corr.toFixed(2)}): price mostly moved in one direction over the period. The trend control separates them as far as the data allow, but the interval is wider for it and the answer leans on the straight-line trend assumption.`);
  }
  if (e >= 0) warnings.push("The estimated elasticity is not negative. Demand rising with price is almost always a confounder (promotions, advertising, stock-outs, a trend), so read this as \"not identified\" rather than as a real effect.");
  else if (eHi >= 0) warnings.push("The 95% interval includes zero: the data are consistent with price having no effect on units at all.");
  const last = obs.slice(-Math.min(8, obs.length));
  const ref = { price: mean(last.map((o) => o.price)), units: mean(last.map((o) => o.units)), n: last.length };
  const lastCost = [...obs].reverse().find((o) => o.cost !== null)?.cost ?? null;
  const cost = opts.cost > 0 ? opts.cost : lastCost;
  const costSource = opts.cost > 0 ? "entered" : lastCost !== null ? "column" : null;
  const opt = optimum({ e, eLo, eHi, cost, pMin: variation.min, pMax: variation.max });
  if (opt.status === "no-cost") warnings.push("No unit cost was given, so the tool cannot say which price earns the most profit. Enter a unit cost (what each unit costs you to buy or make and ship) to get one.");
  if (cost > 0 && cost >= variation.min) warnings.push(`Your unit cost (${cost.toFixed(2)}) is at or above the lowest price you tested (${variation.min.toFixed(2)}): some of the tested prices lose money on every unit.`);
  let optimumOut = opt;
  if (ident.level === "not_identified" && opt.status !== "no-cost") optimumOut = { status: "withheld", reason: "Withheld: price did not vary enough (or moved only with the controls) for the elasticity to mean anything. Any price shown would be the noise talking." };
  const extra = opt.point ? [opt.point] : [];
  const table = whatIf({ ref, e, eLo, eHi, cost, pMin: variation.min, pMax: variation.max, extra });
  let profitAtOpt = null;
  if (opt.point && cost > 0) {
    const s = scenario(opt.point, ref, e, cost), b = scenario(ref.price, ref, e, cost);
    profitAtOpt = { profit: s.profit, baseProfit: b.profit, change: s.profit - b.profit };
  }
  const bt = backtest(obs, useOpts, opts.holdout || null);
  return {
    n: obs.length,
    first: isoDate(obs[0]), last: isoDate(obs[obs.length - 1]),
    spec, columns: names,
    elasticity: { point: e, se, lo: eLo, hi: eHi, t: tStat, p: pValue, df: fit.df, crit: q },
    r2: fit.r2, adjR2: fit.adjR2, sigma: Math.sqrt(fit.sigma2),
    controls: names.map((name, i) => ({ name, coef: fit.beta[i], se: fit.se[i] })).slice(2),
    variation, vif, identification: ident,
    ref, cost, costSource, optimum: optimumOut, profitAtOptimum: profitAtOpt,
    whatIf: table, backtest: bt, warnings,
    reading: e < -1 ? "elastic" : e < 0 ? "inelastic" : "not-negative",
  };
}

// ---------- output helpers ----------

export function num(n, digits = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function pct(x, digits = 1) {
  return x === null || x === undefined || !Number.isFinite(x) ? "n/a" : `${(x * 100).toFixed(digits)}%`;
}

export function whatIfCsv(r) {
  const head = "price,change_vs_reference,units,units_low,units_high,revenue,profit,profit_change,outside_tested_range";
  const rows = r.whatIf.map((w) => [w.price.toFixed(2), (w.changePct * 100).toFixed(1) + "%", w.units.toFixed(1), w.unitsLow.toFixed(1), w.unitsHigh.toFixed(1), w.revenue.toFixed(2), w.profit === null ? "" : w.profit.toFixed(2), w.profitChange === null ? "" : w.profitChange.toFixed(2), w.outside ? "yes" : "no"].join(","));
  return [head, ...rows].join("\n") + "\n";
}

// ---------- simulation (tests and the example) ----------

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
=======
// Price elasticity estimator. Pure functions, no DOM, no network.
// Model: ln(units) = a + b*ln(price) [+ trend] [+ annual sin/cos] + error,
// fitted by OLS with heteroskedasticity-robust (HC1) standard errors. The
// profit-maximising price is searched only inside the prices actually seen,
// and uncertainty comes from a seeded pairs bootstrap, so a result is
// reproducible and never extrapolates silently.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_ROWS = 12;
const MIN_LEVELS = 3;
const MIN_PRICE_SD = 0.03; // sd of ln(price): about a 3% typical swing

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
>>>>>>> origin/main
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
<<<<<<< HEAD
export function gaussian(u) {
  return Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
}

// Weekly data: units = k * price^elasticity * exp(trend*t) * season * promoLift * noise.
export function simulateDemand({ n = 52, elasticity = -1.8, base = 25, k = 400, noise = 0.06, seed = 1, trend = 0, season = null, promoLift = 1, pricePath = "random", priceSteps = [0.9, 1, 1.1, 1.2], cost = null, startYear = 2024 } = {}) {
  const u = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const day = dayNumber(startYear, 1, 1) + i * 7;
    const dt = new Date(day * 86400000);
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    let mult;
    if (pricePath === "random") mult = priceSteps[Math.floor(u() * priceSteps.length)];
    else if (pricePath === "falling") mult = 1.15 - (0.3 * i) / Math.max(1, n - 1);
    else if (pricePath === "drifting") mult = priceSteps[Math.floor(u() * priceSteps.length)] * (1.15 - (0.3 * i) / Math.max(1, n - 1));
    else if (pricePath === "rising") mult = 0.85 + (0.3 * i) / Math.max(1, n - 1);
    else mult = 1;
    const promo = promoLift !== 1 && u() < 0.2;
    const price = +(base * mult * (promo ? 0.9 : 1)).toFixed(2);
    const s = season ? season[m - 1] : 1;
    const units = k * Math.pow(price / base, elasticity) * Math.exp((trend * i) / 52) * s * (promo ? promoLift : 1) * Math.exp(noise * gaussian(u));
    out.push({ y, m, d, day, price, units: Math.max(1, Math.round(units)), cost, promo: promoLift !== 1 ? promo : null });
  }
=======

const money_num = (s) => {
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,\s]/g, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

export function parseDate(s) {
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return Date.UTC(+m[3], +m[1] - 1, +m[2]);
  const d = Date.parse(t);
  return Number.isFinite(d) ? Math.floor(d / 86400000) * 86400000 : NaN;
}

// Rows: date,price,units (date optional: then two columns price,units in time order).
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload rows of date, price, units sold." };
  const split = (l) => l.split(l.includes("\t") ? "\t" : ",").map((c) => c.trim().replace(/^"|"$/g, ""));
  let rows = lines.map(split);
  if (rows[0].some((c) => /[a-z]/i.test(c) && !/^\d/.test(c))) rows = rows.slice(1);
  const width = rows[0]?.length || 0;
  if (width < 2) return { error: "Each row needs at least price and units (optionally a date first)." };
  const dated = width >= 3;
  const out = [];
  let bad = 0, zero = 0;
  rows.forEach((r, i) => {
    const price = money_num(dated ? r[1] : r[0]);
    const units = money_num(dated ? r[2] : r[1]);
    const t = dated ? parseDate(r[0]) : NaN;
    if (!(price > 0) || !Number.isFinite(units) || units < 0 || (dated && !Number.isFinite(t))) { bad++; return; }
    if (units === 0) { zero++; return; }
    out.push({ t: dated ? t : i, price, units });
  });
  if (bad) warnings.push(`${bad} row(s) were skipped because the date, price or units could not be read, or price was zero or negative.`);
  if (zero) warnings.push(`${zero} row(s) with zero units were dropped (a log cannot be taken). If those were stock-outs rather than no demand, the elasticity is understated.`);
  // same date -> one observation: units added, price is the unit-weighted average
  if (dated) {
    const by = new Map();
    for (const r of out) {
      const g = by.get(r.t) || { t: r.t, units: 0, rev: 0 };
      g.units += r.units; g.rev += r.units * r.price; by.set(r.t, g);
    }
    const merged = [...by.values()].map((g) => ({ t: g.t, units: g.units, price: g.rev / g.units })).sort((a, b) => a.t - b.t);
    if (merged.length < out.length) warnings.push(`${out.length - merged.length} rows shared a date with another row and were combined (units added, price averaged by units).`);
    return { rows: merged, dated: true, warnings };
  }
  return { rows: out, dated: false, warnings };
}

// ---------- linear algebra (tiny) ----------
function solve(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function inverse(A) {
  const n = A.length;
  const cols = [];
  for (let j = 0; j < n; j++) {
    const e = Array(n).fill(0); e[j] = 1;
    const s = solve(A, e);
    if (!s) return null;
    cols.push(s);
  }
  return A.map((_, i) => cols.map((c) => c[i]));
}

export function ols(X, y) {
  const n = X.length, k = X[0].length;
  const XtX = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty = Array(k).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
  const beta = solve(XtX, Xty);
  if (!beta) return null;
  const resid = y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * beta[j], 0));
  return { beta, resid, XtX };
}

function robustSe(X, fit) {
  const n = X.length, k = X[0].length;
  const inv = inverse(fit.XtX);
  if (!inv) return null;
  const meat = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) meat[a][b] += X[i][a] * X[i][b] * fit.resid[i] ** 2;
  const scale = n / Math.max(1, n - k);
  const V = inv.map((_, a) => inv.map((_, b) => { let s = 0; for (let c = 0; c < k; c++) for (let d = 0; d < k; d++) s += inv[a][c] * meat[c][d] * inv[d][b]; return s * scale; }));
  return V.map((r, i) => Math.sqrt(Math.max(0, V[i][i])));
}

// Student t quantile, Cornish-Fisher expansion around the normal quantile.
export function tQuantile(p, df) {
  const z = normQuantile(p);
  const g1 = (z ** 3 + z) / 4, g2 = (5 * z ** 5 + 16 * z ** 3 + 3 * z) / 96;
  return z + g1 / df + g2 / df ** 2;
}
export function normQuantile(p) {
  // Acklam's rational approximation
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const quantile = (sorted, q) => { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

// Design matrix. Controls: a linear trend, and annual sin/cos terms when dates exist.
function design(rows, dated, opts) {
  const t0 = rows[0].t;
  const span = Math.max(1, rows[rows.length - 1].t - t0);
  const useTrend = opts.trend;
  const useSeason = opts.season && dated && span >= 300 * 86400000;
  const X = rows.map((r) => {
    const x = [1, Math.log(r.price)];
    if (useTrend) x.push((r.t - t0) / span);
    if (useSeason) { const ang = (2 * Math.PI * (r.t / 86400000 % 365.25)) / 365.25; x.push(Math.sin(ang), Math.cos(ang)); }
    return x;
  });
  return { X, y: rows.map((r) => Math.log(r.units)), useTrend, useSeason };
}

function fitModel(rows, dated, opts) {
  const { X, y, useTrend, useSeason } = design(rows, dated, opts);
  if (X.length <= X[0].length + 2) return null;
  const fit = ols(X, y);
  if (!fit) return null;
  const smear = mean(fit.resid.map(Math.exp));
  const xbar = X[0].map((_, j) => mean(X.map((r) => r[j])));
  return { fit, X, y, smear, xbar, useTrend, useSeason };
}

// Units at price p holding controls at their sample mean (Duan smearing for the log).
function unitsAt(m, p) {
  const b = m.fit.beta[1];
  const lnq = mean(m.y) + b * (Math.log(p) - m.xbar[1]);
  return Math.exp(lnq) * m.smear;
}

function bestPrice(m, lo, hi, cost) {
  let best = null;
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const p = lo * Math.pow(hi / lo, i / N);
    const profit = (p - cost) * unitsAt(m, p);
    if (!best || profit > best.profit) best = { price: p, profit };
  }
  return best;
}

export function analyze(rows, o = {}) {
  const opts = { trend: o.trend !== false, season: o.season !== false };
  const dated = Boolean(o.dated);
  const warnings = [];
  if (!rows || rows.length < MIN_ROWS) return { error: `At least ${MIN_ROWS} rows are needed; found ${rows ? rows.length : 0}. With fewer, one odd week cannot be told apart from a price effect.` };
  const prices = rows.map((r) => r.price);
  const lnp = prices.map(Math.log);
  const levels = new Set(prices.map((p) => p.toFixed(2))).size;
  const pMin = Math.min(...prices), pMax = Math.max(...prices);
  const priceSd = sd(lnp);
  if (levels < MIN_LEVELS || priceSd < MIN_PRICE_SD) {
    return { error: `Your price barely moved (${levels} distinct price${levels === 1 ? "" : "s"}, typical swing ${pct(priceSd, 1)}). Elasticity can only be learned from a price that changed; with this history any answer would be made up. Try a planned price test of two or more levels first.` };
  }
  const m = fitModel(rows, dated, opts);
  if (!m) return { error: "The data could not be fitted (the price is collinear with the other controls). Try turning off the trend or seasonal control." };
  const se = robustSe(m.X, m.fit);
  const n = rows.length, k = m.X[0].length;
  const b = m.fit.beta[1];
  const tq = tQuantile(0.975, n - k);
  const ci = [b - tq * se[1], b + tq * se[1]];
  const ssTot = m.y.reduce((s, v) => s + (v - mean(m.y)) ** 2, 0);
  const r2 = 1 - m.fit.resid.reduce((s, v) => s + v * v, 0) / ssTot;

  // correlation of price with time: a steady drift in both looks like an effect
  const tt = rows.map((r) => r.t);
  const corr = (() => { const mp = mean(lnp), mt = mean(tt); let sp = 0, st = 0, sx = 0; for (let i = 0; i < n; i++) { sp += (lnp[i] - mp) ** 2; st += (tt[i] - mt) ** 2; sx += (lnp[i] - mp) * (tt[i] - mt); } return st && sp ? sx / Math.sqrt(sp * st) : 0; })();
  if (Math.abs(corr) > 0.85 && !opts.trend) warnings.push("Price moved almost in a straight line over time while the trend control is off. Any growth or decline in demand is being credited to price.");
  if (Math.abs(corr) > 0.85 && opts.trend) warnings.push("Price moved almost in a straight line over time, so the trend control and price are hard to separate and the interval is wide. A price test that goes up and down would be far more informative.");
  if (b >= 0) warnings.push("The fitted slope is zero or positive: higher prices went with equal or more sales. That is almost never a real demand curve; it usually means you raised prices in busy periods or promoted at the low price. Treat the elasticity as unidentified.");

  // bootstrap
  const B = 400, rng = mulberry32(o.seed ?? 20260930);
  const cost = Number.isFinite(o.cost) && o.cost >= 0 ? o.cost : null;
  const current = Number.isFinite(o.currentPrice) && o.currentPrice > 0 ? o.currentPrice : rows[rows.length - 1].price;
  const bs = [], upl = [], opt = [];
  for (let i = 0; i < B; i++) {
    const sample = Array.from({ length: n }, () => rows[Math.floor(rng() * n)]).sort((x, y) => x.t - y.t);
    const mm = fitModel(sample, dated, opts);
    if (!mm) continue;
    bs.push(mm.fit.beta[1]);
    if (cost !== null) {
      const bp = bestPrice(mm, pMin, pMax, cost);
      opt.push(bp.price);
      upl.push(bp.profit - (current - cost) * unitsAt(mm, current));
    }
  }
  bs.sort((a, c) => a - c);
  const bootCi = [quantile(bs, 0.1), quantile(bs, 0.9)];

  // holdout: does knowing the price predict later units better than ignoring it?
  let holdout = null;
  const cut = Math.floor(n * 0.75);
  if (cut >= MIN_ROWS - 2 && n - cut >= 4) {
    const train = rows.slice(0, cut), test = rows.slice(cut);
    const full = fitModel(train, dated, opts);
    if (full) {
      const Xtr = design(train, dated, opts), Xte = design(test, dated, opts);
      const noPrice = (X) => X.map((r) => r.filter((_, j) => j !== 1));
      const fit0 = ols(noPrice(Xtr.X), Xtr.y);
      if (fit0) {
        const pred = (beta, X) => X.map((r) => r.reduce((s, x, j) => s + x * beta[j], 0));
        const mae = (p, y) => mean(p.map((v, i) => Math.abs(v - y[i])));
        const withP = mae(pred(full.fit.beta, Xte.X), Xte.y);
        const without = mae(pred(fit0.beta, noPrice(Xte.X)), Xte.y);
        holdout = { test: test.length, maeWithPrice: withP, maeWithoutPrice: without, helps: withP < without };
      }
    }
  }

  const elasticity = b;
  const excludesZero = ci[1] < 0;
  let verdict = "weak";
  if (b >= 0 || ci[0] > 0) verdict = "unidentified";
  else if (excludesZero && levels >= 4 && (!holdout || holdout.helps)) verdict = "usable";
  const type = b > -1 ? "inelastic" : "elastic";

  const out = {
    n, dated, levels, priceMin: pMin, priceMax: pMax, priceSd, current, cost,
    elasticity, ci95: ci, ci80: bootCi, r2, se: se[1], holdout, verdict, type,
    controls: { trend: m.useTrend, season: m.useSeason }, warnings,
    revenueSign: b > -1 ? "Revenue rose with price in this history (demand is inelastic)." : "Revenue fell as price rose (demand is elastic).",
  };

  if (verdict !== "unidentified" && cost !== null) {
    const bp = bestPrice(m, pMin, pMax, cost);
    const atCurrent = (current - cost) * unitsAt(m, current);
    const unc = b < -1 ? cost * b / (b + 1) : null;
    const atBoundary = bp.price <= pMin * 1.005 || bp.price >= pMax * 0.995;
    out.optimum = {
      price: bp.price, profitPerPeriod: bp.profit, currentProfitPerPeriod: atCurrent,
      gain: bp.profit - atCurrent, unitsAtOptimum: unitsAt(m, bp.price), unitsAtCurrent: unitsAt(m, current),
      atBoundary, unconstrained: unc,
      pGain: upl.length ? upl.filter((v) => v > 0).length / upl.length : null,
      priceRange80: opt.length ? [quantile([...opt].sort((x, y) => x - y), 0.1), quantile([...opt].sort((x, y) => x - y), 0.9)] : null,
      gainRange80: upl.length ? [quantile([...upl].sort((x, y) => x - y), 0.1), quantile([...upl].sort((x, y) => x - y), 0.9)] : null,
    };
    if (cost >= pMin) warnings.push("Your unit cost is at or above the lowest price in the history. Some of those periods lost money on every unit; check that cost includes only per-unit costs.");
    if (atBoundary) warnings.push("The best price sits at the edge of the prices you have actually charged. The data cannot say what happens beyond that edge, so test a step further (for example 5%) before moving more.");
    if (out.optimum.gain < 0) warnings.push("The model's best price is not better than your current price; stay put.");
  }
  if (cost === null) out.revenueAdvice = b > -1 ? "Sales volume fell less than price rose, so raising price increased revenue in this history. Enter a unit cost to see whether profit agrees." : "Sales volume fell faster than price rose. Enter a unit cost to see the profit-maximising price.";

  // what a price change does, for the table
  const steps = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2];
  out.scenarios = steps.map((s) => {
    const p = current * (1 + s);
    const inside = p >= pMin * 0.999 && p <= pMax * 1.001;
    const units = unitsAt(m, p);
    return { change: s, price: p, units, revenue: units * p, profit: cost === null ? null : units * (p - cost), tested: inside };
  });
>>>>>>> origin/main
  return out;
}

export function sampleText() {
<<<<<<< HEAD
  const rows = simulateDemand({ n: 52, elasticity: -1.7, base: 24, k: 300, noise: 0.07, seed: 7, trend: 0.1, priceSteps: [0.88, 0.94, 1, 1.06, 1.12, 1.2] });
  return ["date,price,units,unit_cost", ...rows.map((r) => `${isoDate(r)},${r.price.toFixed(2)},${r.units},11.50`)].join("\n");
=======
  const rng = mulberry32(7);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const levels = [24, 24, 26, 26, 28, 28, 25, 25, 27, 29, 29, 26, 24, 27, 28, 25];
  const lines = ["date,price,units"];
  const start = Date.UTC(2025, 0, 6);
  for (let w = 0; w < 64; w++) {
    const price = levels[Math.floor(w / 4) % levels.length] + (w % 7 === 0 ? 1 : 0);
    const day = new Date(start + w * 7 * 86400000);
    const season = 1 + 0.12 * Math.sin((2 * Math.PI * w) / 52);
    const units = Math.max(1, Math.round(420 * season * Math.pow(price / 26, -1.8) * Math.exp(0.07 * gauss())));
    lines.push(`${day.toISOString().slice(0, 10)},${price.toFixed(2)},${units}`);
  }
  return lines.join("\n");
}

export function reportCsv(r) {
  const head = "price_change,price,units_per_period,revenue_per_period,profit_per_period,inside_tested_range";
  return [head, ...r.scenarios.map((s) => [s.change, s.price.toFixed(2), s.units.toFixed(1), s.revenue.toFixed(2), s.profit === null ? "" : s.profit.toFixed(2), s.tested].join(","))].join("\n");
>>>>>>> origin/main
}
