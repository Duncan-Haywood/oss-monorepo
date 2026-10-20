// Win-rate curve: which margin earns the most once you count the bids you lose.
// A margin chosen on the cost side alone ignores that a higher price wins less
// often. Given a log of past bids (the margin each carried, won or lost), this
// fits a logistic curve of win chance against margin and finds the margin that
// maximizes expected profit per bid. Pure arithmetic, no network: the page keeps
// the log on the visitor's own device.

import { round2 } from "./calc.mjs";

const MIN_BIDS = 8, MIN_EACH = 2;

const sigmoid = (t) => 1 / (1 + Math.exp(-t));

/** Margin of a bid as a percent of its price. */
export function bidMarginPct(price, fullCost) {
  const p = Number(price), c = Number(fullCost);
  if (!(p > 0) || !(c >= 0) || c >= p) return null;
  return ((p - c) / p) * 100;
}

// Ridge-penalised logistic fit of won ~ a + b*z, z = (x-mean)/sd, by Newton's method.
// The penalty on the slope keeps the fit finite when wins and losses separate cleanly.
function fit(xs, ys, mean, sd) {
  let a = 0, b = 0;
  const lambda = 0.5;
  for (let it = 0; it < 50; it++) {
    let ga = 0, gb = -lambda * b, haa = 0, hab = 0, hbb = lambda;
    for (let i = 0; i < xs.length; i++) {
      const z = (xs[i] - mean) / sd, p = sigmoid(a + b * z), w = p * (1 - p);
      ga += ys[i] - p; gb += (ys[i] - p) * z;
      haa += w; hab += w * z; hbb += w * z * z;
    }
    const det = haa * hbb - hab * hab;
    if (!(det > 1e-12)) break;
    const da = (hbb * ga - hab * gb) / det, db = (haa * gb - hab * ga) / det;
    a += da; b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-9) break;
  }
  return { a, b };
}

function stats(xs) {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  return { mean, sd };
}

// Expected profit per dollar of cost at margin m: P(win) * markup.
const markupOf = (m) => m / (100 - m);

function optimum(model, lo, hi) {
  let best = null;
  for (let m = lo; m <= hi + 1e-9; m += 0.25) {
    const pw = sigmoid(model.a + model.b * ((m - model.mean) / model.sd));
    const ev = pw * markupOf(m);
    if (!best || ev > best.ev) best = { margin: m, winChance: pw, ev };
  }
  return best;
}

// Small seeded generator so a bootstrap interval is the same on every load.
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * @param {{marginPct:number, won:boolean}[]} bids
 * @param {{bootstrap?:number}} [opts]
 */
export function winRateCurve(bids, { bootstrap = 200 } = {}) {
  const list = (bids || []).filter((b) => b && Number.isFinite(b.marginPct) && b.marginPct > 0 && b.marginPct < 90);
  const n = list.length, wins = list.filter((b) => b.won).length, losses = n - wins;
  const base = { bids: n, wins, losses };
  if (n < MIN_BIDS || wins < MIN_EACH || losses < MIN_EACH) {
    return { ...base, ready: false, need: Math.max(MIN_BIDS - n, 0), reason: n < MIN_BIDS ? "too-few" : "one-sided" };
  }
  const xs = list.map((b) => b.marginPct), ys = list.map((b) => (b.won ? 1 : 0));
  const { mean, sd } = stats(xs);
  if (sd < 1) return { ...base, ready: false, need: 0, reason: "no-spread" };
  const { a, b } = fit(xs, ys, mean, sd);
  const model = { a, b, mean, sd };
  if (!(b < 0)) return { ...base, ready: true, found: false, reason: "no-price-signal", winRate: round2((wins / n) * 100) };

  const lo = Math.max(1, Math.min(...xs) - 3), hi = Math.min(60, Math.max(...xs) + 3);
  const best = optimum(model, lo, hi);
  const avgMargin = mean;
  const atAvg = sigmoid(a + b * 0) * markupOf(avgMargin);

  const rand = mulberry32(2026);
  const opts = [];
  for (let r = 0; r < bootstrap; r++) {
    const bx = [], by = [];
    for (let i = 0; i < n; i++) { const k = Math.floor(rand() * n); bx.push(xs[k]); by.push(ys[k]); }
    const s1 = by.reduce((s, y) => s + y, 0);
    if (s1 < 1 || s1 > n - 1) continue;
    const st = stats(bx);
    if (st.sd < 0.5) continue;
    const f = fit(bx, by, st.mean, st.sd);
    if (!(f.b < 0)) continue;
    opts.push(optimum({ ...f, ...st }, lo, hi).margin);
  }
  opts.sort((p, q) => p - q);
  const pick = (q) => opts[Math.min(opts.length - 1, Math.floor(q * opts.length))];
  const interval = opts.length >= 20 ? { low: round2(pick(0.1)), high: round2(pick(0.9)) } : null;

  return {
    ...base, ready: true, found: true, winRate: round2((wins / n) * 100),
    slopePerPoint: round2(b / sd),
    bestMarginPct: round2(best.margin), winChanceAtBestPct: round2(best.winChance * 100),
    avgMarginPct: round2(avgMargin), winChanceAtAvgPct: round2(sigmoid(a) * 100),
    // Expected profit per $100 of cost, per bid you quote.
    evPer100AtBest: round2(best.ev * 100), evPer100AtAvg: round2(atAvg * 100),
    liftPct: atAvg > 0 ? round2((best.ev / atAvg - 1) * 100) : null,
    interval, confident: !!interval && interval.high - interval.low <= 8,
    winChanceAt: (m) => round2(sigmoid(a + b * ((m - mean) / sd)) * 100),
  };
}
