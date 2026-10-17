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
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  return out;
}

export function sampleText() {
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
}
