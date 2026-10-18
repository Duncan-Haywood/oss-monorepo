// Customer lifetime value from an order list: BG/NBD (Fader, Hardie & Lee 2005)
// for how often each customer will buy and whether they are still active, and
// Gamma-Gamma (Fader & Hardie 2013) for what they will spend. Pure functions,
// no imports, no network. Time is measured in weeks.

const WEEK_MONTH = 365.25 / 12 / 7;
const DAY_MS = 86400000;

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

// Gauss hypergeometric series, for 0 <= z < 1.
export function hyp2f1(a, b, c, z) {
  let term = 1, sum = 1;
  for (let n = 0; n < 50000; n++) {
    term *= ((a + n) * (b + n)) / ((c + n) * (n + 1)) * z;
    sum += term;
    if (Math.abs(term) < 1e-15 * Math.abs(sum)) break;
  }
  return sum;
}

function logAddExp(a, b) {
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(u) {
  const a = Math.sqrt(-2 * Math.log(u() || 1e-12));
  return a * Math.cos(2 * Math.PI * u());
}

// Marsaglia-Tsang gamma(shape, 1)
function gammaDraw(shape, u) {
  if (shape < 1) return gammaDraw(shape + 1, u) * Math.pow(u() || 1e-12, 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(u); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const w = u();
    if (Math.log(w || 1e-12) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

function betaDraw(a, b, u) {
  const x = gammaDraw(a, u), y = gammaDraw(b, u);
  return x / (x + y);
}

// ---------- optimiser ----------

export function nelderMead(f, x0, { iter = 800, step = 0.4, tol = 1e-10 } = {}) {
  const n = x0.length;
  let pts = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step; pts.push(p); }
  let vals = pts.map(f);
  for (let k = 0; k < iter; k++) {
    const order = vals.map((v, i) => i).sort((i, j) => vals[i] - vals[j]);
    pts = order.map((i) => pts[i]); vals = order.map((i) => vals[i]);
    if (Math.abs(vals[n] - vals[0]) < tol * (1 + Math.abs(vals[0]))) break;
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const at = (t) => c.map((cj, j) => cj + t * (pts[n][j] - cj));
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

// ---------- reading orders ----------

function splitLine(line, d) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseDay(s) {
  s = String(s ?? "").trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
    let a = +m[1], b = +m[2]; y = +m[3]; if (y < 100) y += 2000;
    if (a > 12) { d = a; mo = b; } else { mo = a; d = b; }
  } else return NaN;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  return Math.floor(Date.UTC(y, mo - 1, d) / DAY_MS);
}

export function dayToIso(day) { return new Date(day * DAY_MS).toISOString().slice(0, 10); }

function pickColumn(headers, rules) {
  for (const re of rules) { const i = headers.findIndex((h) => re.test(h)); if (i >= 0) return i; }
  return -1;
}

export function parseOrders(text) {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: "Paste or upload an order list with one row per order: customer, date, amount." };
  const first = lines[0];
  const d = [",", "\t", ";"].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  let head = splitLine(first, d).map((h) => h.toLowerCase());
  let body = lines.slice(1);
  let ci, di, ai;
  const looksData = head.some((h) => !Number.isNaN(parseDay(h)));
  if (looksData && head.length >= 3) { ci = 0; di = 1; ai = 2; body = lines; head = null; }
  else {
    ci = pickColumn(head, [/^customer[ _-]?(id|email|name)?$/, /^(email|e-mail|user[ _-]?id|client|buyer|contact)/, /customer|email|user/, /^id$/]);
    di = pickColumn(head, [/order[ _-]?date/, /^(created|purchase|date|paid)[ _-]?(at|date)?$/, /date|created|time/]);
    ai = pickColumn(head, [/^(total|order[ _-]?total|amount|revenue)$/, /^(subtotal|sales|net[ _-]?sales|gross)/, /total|amount|revenue|sales|price|value/]);
    if (ci < 0 || di < 0 || ai < 0) {
      return { error: `Could not find the columns. Need a customer id or email, an order date and an order amount. Found: ${head.join(", ")}.` };
    }
  }
  const orders = []; let skipped = 0, refunds = 0;
  for (const line of body) {
    const c = splitLine(line, d);
    const id = (c[ci] ?? "").trim();
    const day = parseDay(c[di]);
    const amt = Number(String(c[ai] ?? "").replace(/[^0-9.\-()]/g, "").replace(/^\((.*)\)$/, "-$1"));
    if (!id || Number.isNaN(day) || !Number.isFinite(amt) || c[ai] === "" || c[ai] === undefined) { skipped++; continue; }
    if (amt <= 0) { refunds++; continue; }
    orders.push({ id, day, amount: amt });
  }
  if (orders.length < 2) return { error: "Fewer than two usable orders were found. Check the date and amount columns." };
  return { orders, skipped, refunds, columns: head ? { customer: head[ci], date: head[di], amount: head[ai] } : { customer: "column 1", date: "column 2", amount: "column 3" } };
}

// ---------- summarising ----------

// One row per customer: x repeat purchase days, tx weeks from first to last,
// T weeks from first to `end`, m mean value of the repeat orders.
export function summarize(orders, end = null) {
  const last = end ?? Math.max(...orders.map((o) => o.day));
  const by = new Map();
  for (const o of orders) {
    if (o.day > last) continue;
    let c = by.get(o.id);
    if (!c) by.set(o.id, (c = new Map()));
    c.set(o.day, (c.get(o.day) || 0) + o.amount);
  }
  const rows = [];
  for (const [id, days] of by) {
    const ds = [...days.keys()].sort((a, b) => a - b);
    const first = ds[0], lastBuy = ds[ds.length - 1];
    const repeat = ds.slice(1).map((d) => days.get(d));
    const total = ds.reduce((s, d) => s + days.get(d), 0);
    rows.push({
      id, x: ds.length - 1, tx: (lastBuy - first) / 7, T: (last - first) / 7,
      m: repeat.length ? repeat.reduce((s, v) => s + v, 0) / repeat.length : 0,
      firstOrder: days.get(first), total, first, lastBuy,
    });
  }
  return rows;
}

// ---------- BG/NBD ----------

function group(rows, keyFn) {
  const g = new Map();
  for (const r of rows) { const k = keyFn(r); const e = g.get(k); if (e) e.n++; else g.set(k, { ...r, n: 1 }); }
  return [...g.values()];
}

export function bgnbdLogLik(p, rows) {
  const { r, alpha, a, b } = p;
  let ll = 0;
  const base = -lgamma(r) + r * Math.log(alpha) + lgamma(a + b) - lgamma(b);
  for (const c of rows) {
    const { x, tx, T } = c;
    const w = c.n ?? 1;
    const a1a2 = lgamma(r + x) + base + lgamma(b + x) - lgamma(a + b + x);
    const l3 = -(r + x) * Math.log(alpha + T);
    const l = x > 0 ? logAddExp(l3, Math.log(a) - Math.log(b + x - 1) - (r + x) * Math.log(alpha + tx)) : l3;
    ll += w * (a1a2 + l);
  }
  return ll;
}

export function fitBgnbd(rows) {
  const g = group(rows, (c) => `${c.x}|${c.tx.toFixed(4)}|${c.T.toFixed(4)}`);
  const toP = (t) => ({ r: Math.exp(t[0]), alpha: Math.exp(t[1]), a: Math.exp(t[2]), b: Math.exp(t[3]) });
  const f = (t) => {
    if (t.some((v) => Math.abs(v) > 12)) return 1e18;
    const p = toP(t);
    if (p.a + p.b <= 1.0001) return 1e15 + (1.0001 - p.a - p.b) * 1e6;
    const v = -bgnbdLogLik(p, g);
    return Number.isFinite(v) ? v : 1e18;
  };
  let best = nelderMead(f, [0, Math.log(8), 0, Math.log(2)]);
  for (let i = 0; i < 3; i++) {
    const next = nelderMead(f, best.x, { step: 0.15 });
    if (best.value - next.value < 1e-7) { best = next.value < best.value ? next : best; break; }
    best = next;
  }
  const p = toP(best.x);
  return { ...p, logLik: -best.value, n: rows.length };
}

const nudge = (a) => (Math.abs(a - 1) < 1e-6 ? a + 1e-6 : a);

export function probAlive(p, x, tx, T) {
  if (x === 0) return 1;
  const { r, alpha, a, b } = p;
  return 1 / (1 + (a / (b + x - 1)) * Math.pow((alpha + T) / (alpha + tx), r + x));
}

// Expected purchases in the next t weeks given a customer's history.
export function expectedPurchases(p, x, tx, T, t) {
  const { r, alpha, b } = p; const a = nudge(p.a);
  const z = t / (alpha + T + t);
  const h = hyp2f1(r + x, b + x, a + b + x - 1, z);
  const top = ((a + b + x - 1) / (a - 1)) * (1 - Math.pow((alpha + T) / (alpha + T + t), r + x) * h);
  const bottom = 1 + (x > 0 ? (a / (b + x - 1)) * Math.pow((alpha + T) / (alpha + tx), r + x) : 0);
  return Math.max(0, top / bottom);
}

// A customer you have not seen yet: expected repeat purchases in t weeks.
export function expectedNewCustomer(p, t) {
  const { r, alpha, b } = p; const a = nudge(p.a);
  return Math.max(0, ((a + b - 1) / (a - 1)) * (1 - Math.pow(alpha / (alpha + t), r) * hyp2f1(r, b, a + b - 1, t / (alpha + t))));
}

// ---------- Gamma-Gamma ----------

export function fitGammaGamma(rows) {
  const g = group(rows.filter((c) => c.x > 0 && c.m > 0), (c) => `${c.x}|${c.m.toFixed(2)}`);
  if (g.length < 5) return null;
  const toP = (t) => ({ p: Math.exp(t[0]), q: Math.exp(t[1]), gamma: Math.exp(t[2]) });
  const f = (t) => {
    if (t.some((v) => Math.abs(v) > 12)) return 1e18;
    const { p, q, gamma } = toP(t);
    let ll = 0;
    for (const c of g) {
      const px = p * c.x;
      ll += c.n * (lgamma(px + q) - lgamma(px) - lgamma(q) + q * Math.log(gamma) + (px - 1) * Math.log(c.m) + px * Math.log(c.x) - (px + q) * Math.log(gamma + c.m * c.x));
    }
    return Number.isFinite(ll) ? -ll : 1e18;
  };
  const meanM = g.reduce((s, c) => s + c.m * c.n, 0) / g.reduce((s, c) => s + c.n, 0);
  let best = nelderMead(f, [0, Math.log(3), Math.log(meanM * 2)]);
  for (let i = 0; i < 3; i++) {
    const next = nelderMead(f, best.x, { step: 0.15 });
    if (best.value - next.value < 1e-7) { best = next.value < best.value ? next : best; break; }
    best = next;
  }
  return { ...toP(best.x), logLik: -best.value };
}

// Expected value of one repeat order. Customers with no repeat orders get the
// population mean, which needs q > 1; otherwise the observed mean is used.
export function expectedOrderValue(gg, x, m, fallback) {
  if (!gg) return x > 0 ? m : fallback;
  if (x === 0) return gg.q > 1 ? (gg.p * gg.gamma) / (gg.q - 1) : fallback;
  const den = gg.p * x + gg.q - 1;
  return den > 0 ? (gg.p * (gg.gamma + x * m)) / den : m;
}

// ---------- backtest ----------

export function backtest(orders, holdoutWeeks) {
  const end = Math.max(...orders.map((o) => o.day));
  const calEnd = end - Math.round(holdoutWeeks * 7);
  const cal = summarize(orders, calEnd);
  if (cal.length < 50) return null;
  const params = fitBgnbd(cal);
  const actual = new Map();
  for (const o of orders) {
    if (o.day <= calEnd) continue;
    let s = actual.get(o.id); if (!s) actual.set(o.id, (s = new Set()));
    s.add(o.day);
  }
  const buckets = [["0 repeats", (x) => x === 0], ["1", (x) => x === 1], ["2", (x) => x === 2], ["3-4", (x) => x >= 3 && x <= 4], ["5+", (x) => x >= 5]];
  const rows = buckets.map(([label, fn]) => ({ label, customers: 0, predicted: 0, actual: 0, fn }));
  let predicted = 0, real = 0;
  for (const c of cal) {
    const pr = expectedPurchases(params, c.x, c.tx, c.T, holdoutWeeks);
    const ac = actual.get(c.id)?.size ?? 0;
    predicted += pr; real += ac;
    const bk = rows.find((r) => r.fn(c.x));
    bk.customers++; bk.predicted += pr; bk.actual += ac;
  }
  return {
    holdoutWeeks, customers: cal.length, predicted, actual: real,
    errorPct: real > 0 ? (predicted - real) / real : null,
    buckets: rows.map(({ fn, ...r }) => r),
  };
}

// ---------- the whole analysis ----------

export function analyze(orders, opts = {}) {
  const horizonMonths = opts.horizonMonths ?? 12;
  const margin = opts.margin ?? 1;
  const annualDiscount = opts.annualDiscount ?? 0.1;
  if (!(horizonMonths >= 1 && horizonMonths <= 60)) return { error: "Choose a horizon between 1 and 60 months." };
  if (!(margin > 0 && margin <= 1)) return { error: "Margin must be between 1% and 100%." };
  if (!(annualDiscount >= 0 && annualDiscount < 1)) return { error: "Discount rate must be between 0% and 99%." };
  const rows = summarize(orders);
  const spanWeeks = (Math.max(...orders.map((o) => o.day)) - Math.min(...orders.map((o) => o.day))) / 7;
  if (rows.length < 30) return { error: `Only ${rows.length} customers found. The model needs at least 30, and works well from a few hundred.` };
  const repeaters = rows.filter((c) => c.x > 0);
  if (repeaters.length < 10) return { error: `Only ${repeaters.length} customers bought more than once. The model learns repeat behaviour from repeat buyers; this shop or period has too few.` };
  const params = fitBgnbd(rows);
  const gg = fitGammaGamma(rows);
  const allRepeatMean = repeaters.reduce((s, c) => s + c.m, 0) / repeaters.length;
  const monthly = Math.pow(1 + annualDiscount, 1 / 12) - 1;
  const cum = [0];
  const customers = rows.map((c) => {
    const pAlive = probAlive(params, c.x, c.tx, c.T);
    let value = 0, prev = 0, exp = 0;
    const aov = expectedOrderValue(gg, c.x, c.m, allRepeatMean);
    for (let mth = 1; mth <= horizonMonths; mth++) {
      const e = expectedPurchases(params, c.x, c.tx, c.T, mth * WEEK_MONTH);
      value += (e - prev) * aov * margin / Math.pow(1 + monthly, mth);
      prev = e;
    }
    exp = prev;
    return { id: c.id, x: c.x, tx: c.tx, T: c.T, m: c.m, aov, total: c.total, pAlive, expected: exp, clv: value, lastBuy: c.lastBuy };
  });
  const totalClv = customers.reduce((s, c) => s + c.clv, 0);
  const sorted = [...customers].sort((a, b) => b.clv - a.clv);
  const top = sorted.slice(0, Math.max(1, Math.ceil(customers.length * 0.2)));
  const topShare = totalClv > 0 ? top.reduce((s, c) => s + c.clv, 0) / totalClv : 0;
  const spendCut = [...customers].map((c) => c.total).sort((a, b) => b - a)[Math.max(0, Math.ceil(customers.length * 0.2) - 1)];
  for (const c of customers) {
    c.segment = c.pAlive < 0.2 && c.x >= 1 ? "Likely lost"
      : c.pAlive < 0.5 && c.total >= spendCut ? "At risk, high spend"
      : c.clv >= sorted[Math.max(0, Math.ceil(customers.length * 0.2) - 1)].clv && c.pAlive >= 0.5 ? "Top 20% value"
      : "Active";
  }
  const seg = {};
  for (const c of customers) { const s = (seg[c.segment] ??= { customers: 0, clv: 0 }); s.customers++; s.clv += c.clv; }
  const firstAov = rows.reduce((s, c) => s + c.firstOrder, 0) / rows.length;
  let newRepeat = 0, newValue = 0, prev = 0;
  const popAov = expectedOrderValue(gg, 0, 0, allRepeatMean);
  for (let mth = 1; mth <= horizonMonths; mth++) {
    const e = expectedNewCustomer(params, mth * WEEK_MONTH);
    newValue += (e - prev) * popAov * margin / Math.pow(1 + monthly, mth);
    prev = e;
  }
  newRepeat = prev;
  const newCustomer = { expectedRepeat: newRepeat, firstOrder: firstAov, value: firstAov * margin + newValue };
  const holdout = Math.min(26, Math.max(8, Math.floor(spanWeeks / 4)));
  const bt = spanWeeks >= 30 ? backtest(orders, holdout) : null;
  const corr = correlation(repeaters.map((c) => c.x), repeaters.map((c) => c.m));
  const summary = {
    customers: customers.length, repeaters: repeaters.length, repeatShare: repeaters.length / customers.length,
    orders: orders.length, spanWeeks, firstDay: Math.min(...orders.map((o) => o.day)), lastDay: Math.max(...orders.map((o) => o.day)),
    historicRevenue: orders.reduce((s, o) => s + o.amount, 0),
    totalClv, avgClv: totalClv / customers.length, topShare,
    expectedActive: customers.reduce((s, c) => s + c.pAlive, 0),
    horizonMonths, margin, annualDiscount, repeatAov: allRepeatMean,
  };
  const findings = buildFindings({ summary, params, gg, bt, corr, newCustomer, seg, customers });
  return { summary, params, gg, customers, sorted, segments: seg, newCustomer, backtest: bt, findings, correlation: corr };
}

// Acquisition payback: what one new customer returns, month by month, against
// what you paid to win them. `res` is an analyze() result. The first order
// lands at month 0; later months add the model's expected repeat orders at the
// population's average repeat order, at your margin and discount rate. Payback
// is the first month the running total reaches `cac`, or null inside `maxMonths`.
export function paybackCurve(res, cac, { maxMonths = 36, target = 3 } = {}) {
  if (!(cac > 0)) return { error: "Enter what you pay to acquire a customer, above zero." };
  const { params, gg, summary, newCustomer } = res;
  const monthly = Math.pow(1 + summary.annualDiscount, 1 / 12) - 1;
  const aov = expectedOrderValue(gg, 0, 0, summary.repeatAov);
  let cum = newCustomer.firstOrder * summary.margin, prev = 0, payback = cum >= cac ? 0 : null;
  const months = [{ month: 0, cumulative: cum }];
  for (let m = 1; m <= maxMonths; m++) {
    const e = expectedNewCustomer(params, m * WEEK_MONTH);
    cum += (e - prev) * aov * summary.margin / Math.pow(1 + monthly, m);
    prev = e;
    months.push({ month: m, cumulative: cum });
    if (payback === null && cum >= cac) payback = m;
  }
  const at = (m) => months[Math.min(m, maxMonths)].cumulative;
  const h = Math.min(summary.horizonMonths, maxMonths);
  return {
    cac, months, paybackMonth: payback, horizonMonths: h,
    ltv: at(h), ltvToCac: at(h) / cac,
    maxCacForTarget: at(h) / target, target,
    verdict: payback === null ? "never within the window" : payback === 0 ? "on the first order" : `month ${payback}`,
  };
}

function correlation(xs, ys) {
  const n = xs.length; if (n < 3) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

function buildFindings({ summary, params, gg, bt, corr, newCustomer, seg }) {
  const f = [];
  if (summary.customers < 200) f.push({ severity: "medium", title: "Small sample", detail: `${summary.customers} customers is enough to fit but individual predictions will be loose. Treat totals as more reliable than any single customer.` });
  if (summary.spanWeeks < 26) f.push({ severity: "medium", title: "Short history", detail: `The order list spans ${Math.round(summary.spanWeeks)} weeks. Repeat behaviour, and especially who has stopped buying, is hard to learn from under six months.` });
  if (summary.repeatShare < 0.08) f.push({ severity: "medium", title: "Few repeat buyers", detail: `Only ${(summary.repeatShare * 100).toFixed(1)}% of customers bought again. Predictions rest on a small group; the lifetime value here is mostly the first order.` });
  if (bt) {
    const e = bt.errorPct;
    const good = e !== null && Math.abs(e) <= 0.15;
    f.push({
      severity: good ? "info" : "medium",
      title: good ? "Back-test: the model predicted the last weeks well" : "Back-test: the model missed the last weeks by a wide margin",
      detail: `Fitted on everything up to ${bt.holdoutWeeks} weeks before your last order, it predicted ${bt.predicted.toFixed(0)} purchases in those weeks and there were ${bt.actual}${e === null ? "" : ` (${e >= 0 ? "+" : ""}${(e * 100).toFixed(1)}%)`}.${good ? "" : " Promotions, seasonality, a price change or a new channel in that window are the usual reasons; treat the forecast with more caution."}`,
    });
  }
  if (Math.abs(corr) > 0.3) f.push({ severity: "medium", title: "Spend rises or falls with purchase count", detail: `Among repeat buyers, order value and number of repeats have correlation ${corr.toFixed(2)}. The spend model assumes they are unrelated, so predicted value for frequent buyers may be off.` });
  const lost = seg["Likely lost"], risk = seg["At risk, high spend"];
  if (risk) f.push({ severity: "info", title: `${risk.customers} high-spend customers look at risk`, detail: `They spent a lot but the pattern says they are probably gone (under 50% likely still active). A win-back message is cheap and they are your best candidates.` });
  if (lost) f.push({ severity: "info", title: `${lost.customers} customers look lost`, detail: "Under 20% likely still active. Remove them from paid retargeting audiences and expensive campaigns." });
  f.push({ severity: "info", title: "What a new customer is worth", detail: `A typical new customer places ${newCustomer.expectedRepeat.toFixed(2)} more orders in ${summary.horizonMonths} months. With a first order of about ${money(newCustomer.firstOrder)} the ${summary.horizonMonths}-month value is ${money(newCustomer.value)}${summary.margin < 1 ? " at your margin" : " of revenue"}. Keep acquisition cost well under that.` });
  return f;
}

// ---------- output helpers ----------

export function money(v) {
  if (!Number.isFinite(v)) return "n/a";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0, minimumFractionDigits: v < 100 ? 2 : 0 });
}
export function pct(v, d = 1) { return `${(v * 100).toFixed(d)}%`; }

function csvCell(v) {
  let s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportCsv(res) {
  const h = `customer,repeat_orders,weeks_first_to_last,weeks_since_first,avg_repeat_order,prob_still_active,expected_orders_${res.summary.horizonMonths}m,predicted_value_${res.summary.horizonMonths}m,segment`;
  const rows = res.sorted.map((c) => [c.id, c.x, c.tx, c.T, c.m, c.pAlive, c.expected, c.clv, c.segment].map(csvCell).join(","));
  return [h, ...rows].join("\n") + "\n";
}

// ---------- simulation (sample data, and the tests' ground truth) ----------

export function simulateOrders({ n = 1200, weeks = 104, params = { r: 0.25, alpha: 4.4, a: 0.8, b: 2.4 }, spend = { p: 6, q: 4, gamma: 15 }, seed = 7 } = {}) {
  const u = rng(seed);
  const orders = [];
  const start = Date.UTC(2024, 0, 1) / DAY_MS;
  for (let i = 0; i < n; i++) {
    const lambda = gammaDraw(params.r, u) / params.alpha;
    const pDie = betaDraw(params.a, params.b, u);
    const nu = gammaDraw(spend.p, u) / (gammaDraw(spend.q, u) / spend.gamma || 1);
    const born = Math.floor(u() * weeks * 7 * 0.85);
    let t = born; let alive = true;
    const push = (d) => orders.push({ id: `C${String(i + 1).padStart(4, "0")}`, day: start + Math.floor(d), amount: Math.max(1, Math.round(nu * (0.7 + 0.6 * u()) * 100) / 100) });
    push(t);
    while (alive) {
      t += -Math.log(u() || 1e-12) / lambda * 7;
      if (t > weeks * 7) break;
      push(t);
      if (u() < pDie) alive = false;
    }
  }
  return orders;
}

export function sampleText() {
  // Seed picked so the sample shows a typical back-test; other seeds land between -13% and +5%.
  const o = simulateOrders({ seed: 8 });
  return "customer_id,order_date,order_total\n" + o.map((r) => `${r.id},${dayToIso(r.day)},${r.amount.toFixed(2)}`).join("\n");
}
