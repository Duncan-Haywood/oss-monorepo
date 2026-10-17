// STR nightly rate optimizer. Pure functions, no DOM, no network.
// Model: P(booked) = 1 / (1 + exp(-(a + b*x))), x = ln(listed nightly price). Fitted by
// Newton-Raphson (IRLS) with a tiny ridge so perfectly separated data cannot send the slope
// to infinity. Each listed night either booked or stayed empty. Economics come from the host:
// a booked night earns the price less the platform fee and the cost of turning the unit over
// spread across the stay; an empty night earns nothing. The best price is searched only inside
// the range of prices actually listed, and uncertainty comes from a seeded, outcome-stratified
// bootstrap, so a result is reproducible and never extrapolates silently.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_NIGHTS = 40;
const MIN_CLASS = 8; // booked nights and empty nights, each
const MIN_X_SD = 0.02; // sd of ln(price): about a two-point spread in price
const BOOT = 300;

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

const moneyNum = (s) => {
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,\s]/g, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

const BOOKED = new Set(["1", "booked", "book", "reserved", "occupied", "yes", "y", "true", "sold", "stayed", "reservation"]);
const EMPTY = new Set(["0", "empty", "vacant", "open", "available", "unbooked", "no", "n", "false", "unsold", "not booked"]);
export function parseOutcome(s) {
  const t = String(s).trim().toLowerCase();
  if (BOOKED.has(t)) return 1;
  if (EMPTY.has(t)) return 0;
  return null;
}

// Rows: listed nightly price, booked. A date column is allowed and ignored; a header row may reorder
// the columns by name. Nights the host blocked (owner stay, maintenance) are not readable outcomes
// and are skipped, which is correct: they say nothing about demand at a price.
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload one row per listed night: the nightly price you listed and whether it booked." };
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const split = (l) => {
    const cells = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === delim && !q) { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  let rows = lines.map(split);
  let ci = { price: 0, res: 1 };
  if (rows[0].some((c) => /[a-z]/i.test(c) && !/^[$€£]?\d/.test(c)) && parseOutcome(rows[0][1] ?? "") === null) {
    const head = rows[0].map((h) => h.toLowerCase());
    const res = head.findIndex((h) => /book|occup|status|reserv|sold|result/.test(h));
    const price = head.findIndex((h, i) => i !== res && /price|rate|nightly|night|listed|amount|\$/.test(h) && !/date|day/.test(h));
    let p = price, r = res;
    if (p < 0 && r < 0) { p = 0; r = 1; }
    else if (p < 0) p = head.findIndex((h, i) => i !== r && !/date|day/.test(h));
    else if (r < 0) r = head.findIndex((h, i) => i !== p && !/date|day/.test(h));
    ci = { price: p >= 0 ? p : 0, res: r >= 0 ? r : 1 };
    rows = rows.slice(1);
  }
  if (Math.max(ci.price, ci.res) >= (rows[0]?.length || 0) || (rows[0]?.length || 0) < 2) return { error: "Each row needs at least two values: the nightly price you listed, and booked or empty (1/0, booked/empty, yes/no)." };
  const out = [];
  let bad = 0;
  for (const r of rows) {
    const price = moneyNum(r[ci.price] ?? ""), booked = parseOutcome(r[ci.res] ?? "");
    if (!(price > 0) || booked === null) { bad++; continue; }
    out.push({ price, booked });
  }
  if (bad) warnings.push(`${bad} row(s) were skipped because the price or the booked/empty result could not be read (blocked nights and owner stays belong out of this file).`);
  return { rows: out, warnings };
}

function inv2(H) {
  const det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) return null;
  return [[H[1][1] / det, -H[0][1] / det], [-H[1][0] / det, H[0][0] / det]];
}
const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const quantile = (sorted, q) => { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
const median = (a) => quantile([...a].sort((p, q) => p - q), 0.5);

// One-variable logistic regression, predictor standardised for stability; a, b returned on the
// original x scale. `ridge` keeps perfectly separated data finite.
export function fitLogit(x, y, ridge = 1e-3) {
  const n = x.length;
  const m = mean(x), s = sd(x) || 1;
  const z = x.map((v) => (v - m) / s);
  let a = Math.log((mean(y) + 0.5 / n) / (1 - mean(y) + 0.5 / n)), b = 0;
  const nll = (a_, b_) => {
    let t = 0;
    for (let i = 0; i < n; i++) { const e = a_ + b_ * z[i]; t += Math.log1p(Math.exp(-Math.abs(e))) + Math.max(e, 0) - y[i] * e; }
    return t + 0.5 * ridge * b_ * b_ * n;
  };
  let converged = false, H = null;
  for (let it = 0; it < 100; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(a + b * z[i]), w = p * (1 - p);
      g0 += p - y[i]; g1 += (p - y[i]) * z[i];
      h00 += w; h01 += w * z[i]; h11 += w * z[i] * z[i];
    }
    g1 += ridge * b * n; h11 += ridge * n;
    H = [[h00, h01], [h01, h11]];
    const Hi = inv2(H);
    if (!Hi) break;
    const d0 = Hi[0][0] * g0 + Hi[0][1] * g1, d1 = Hi[1][0] * g0 + Hi[1][1] * g1;
    const f0 = nll(a, b);
    let step = 1;
    while (step > 1e-6 && !(nll(a - step * d0, b - step * d1) <= f0 + 1e-12)) step /= 2;
    a -= step * d0; b -= step * d1;
    if (Math.abs(step * d0) < 1e-9 && Math.abs(step * d1) < 1e-9) { converged = true; break; }
  }
  const Hi = inv2(H || [[1, 0], [0, 1]]);
  const seZ = Hi ? Math.sqrt(Math.max(0, Hi[1][1])) : NaN;
  return { a: a - (b * m) / s, b: b / s, bz: b, seB: seZ / s, seZ, converged, m, s };
}

const probAt = (f, x) => sigmoid(f.a + f.b * x);

// What one booked night is worth to the host: the price less the platform fee, less the turnover
// bill spread across the stay, less what a guest night costs to host (utilities, supplies).
export function nightMargin(price, eco) {
  return price * (1 - eco.feePct) - eco.turnoverCost / eco.avgStay - eco.nightlyCost;
}
// Expected profit per listed night at x = ln(price): an empty night earns nothing.
export function expectedValue(f, x, eco) {
  return probAt(f, x) * nightMargin(Math.exp(x), eco);
}

function bestX(f, lo, hi, eco) {
  let best = { x: lo, value: -Infinity };
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N;
    const value = expectedValue(f, x, eco);
    if (value > best.value) best = { x, value };
  }
  return best;
}

function logLoss(f, xs, ys) {
  return mean(xs.map((x, i) => { const p = Math.min(1 - 1e-6, Math.max(1e-6, probAt(f, x))); return -(ys[i] ? Math.log(p) : Math.log(1 - p)); }));
}

export function analyze(rows, o = {}) {
  const warnings = [];
  const n = rows.length;
  const booked = rows.filter((r) => r.booked === 1).length, empty = n - booked;
  if (n < MIN_NIGHTS) return { error: `Need at least ${MIN_NIGHTS} listed nights with a result; you have ${n}. A booking curve fitted to fewer is mostly noise. Export a full season or more, and pool every listing you price the same way.` };
  if (booked < MIN_CLASS || empty < MIN_CLASS) return { error: `Need at least ${MIN_CLASS} booked nights and ${MIN_CLASS} empty nights; you have ${booked} and ${empty}. With so few of one outcome the tool cannot tell what moves it.` };
  const xs = rows.map((r) => Math.log(r.price)), ys = rows.map((r) => r.booked);
  const xsd = sd(xs);
  if (xsd < MIN_X_SD) return { error: `Your listed prices barely varied (typical spread ${(xsd * 100).toFixed(1)} points). If you always list the same price, nothing in the history can say what a different one would do, so the tool will not guess. Try a few deliberately different prices on comparable nights first.` };
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const levels = new Set(xs.map((x) => x.toFixed(2))).size;
  if (levels < 4) return { error: `Only ${levels} distinct price levels; at least 4 are needed to see a curve.` };

  const eco = {
    feePct: Number.isFinite(o.feePct) && o.feePct >= 0 && o.feePct < 0.6 ? o.feePct : 0.03,
    turnoverCost: Number.isFinite(o.turnoverCost) && o.turnoverCost >= 0 ? o.turnoverCost : 100,
    avgStay: o.avgStay > 0 ? o.avgStay : 3,
    nightlyCost: Number.isFinite(o.nightlyCost) && o.nightlyCost >= 0 ? o.nightlyCost : 10,
  };
  const usualPrice = o.usualPrice > 0 ? o.usualPrice : median(rows.map((r) => r.price));
  const usualX = Math.log(usualPrice);
  const f = fitLogit(xs, ys);
  if (!f.converged || !Number.isFinite(f.b)) warnings.push("The fit did not settle cleanly; read the result with extra caution.");
  const bookedX = xs.filter((_, i) => ys[i] === 1), emptyX = xs.filter((_, i) => ys[i] === 0);
  const separated = Math.max(...bookedX) < Math.min(...emptyX) || Math.max(...emptyX) < Math.min(...bookedX);
  if (separated || Math.abs(f.bz) > 6) warnings.push("Your booked and empty nights are almost perfectly split by price. The slope is held in check, so the real curve is probably steeper than shown and the exact best price is not reliable.");
  const ci95 = [f.b - 1.96 * f.seB, f.b + 1.96 * f.seB];
  if (usualX < lo - 1e-9 || usualX > hi + 1e-9) warnings.push("Your usual price is outside the range of prices in the file, so its result is a guess, not a measurement.");
  if (nightMargin(Math.exp(lo), eco) <= 0 && nightMargin(Math.exp(hi), eco) <= 0) warnings.push("Every price in your file earns nothing or less after the platform fee and turnover cost you entered. Check those costs; the best price shown is the least bad one.");

  const valueAt = (ff, x) => expectedValue(ff, x, eco);
  const b0 = bestX(f, lo, hi, eco);
  const rng = mulberry32(20260930);
  const bookIdx = [], emptyIdx = [];
  ys.forEach((yv, i) => (yv ? bookIdx : emptyIdx).push(i));
  const bx = [], gains = [];
  let better = 0;
  for (let k = 0; k < BOOT; k++) {
    const idx = [];
    for (let i = 0; i < bookIdx.length; i++) idx.push(bookIdx[Math.floor(rng() * bookIdx.length)]);
    for (let i = 0; i < emptyIdx.length; i++) idx.push(emptyIdx[Math.floor(rng() * emptyIdx.length)]);
    const bf = fitLogit(idx.map((i) => xs[i]), idx.map((i) => ys[i]));
    if (!Number.isFinite(bf.b)) continue;
    const bb = bestX(bf, lo, hi, eco);
    bx.push(bb.x);
    const g = bb.value - valueAt(bf, usualX);
    gains.push(g);
    if (g > 0) better++;
  }
  bx.sort((p, q) => p - q); gains.sort((p, q) => p - q);
  const usualValue = valueAt(f, usualX);
  const optimum = {
    price: Math.exp(b0.x), bookChance: probAt(f, b0.x),
    expectedValue: b0.value, usualValue, gain: b0.value - usualValue,
    priceRange80: bx.length ? [Math.exp(quantile(bx, 0.1)), Math.exp(quantile(bx, 0.9))] : [NaN, NaN],
    gainRange80: gains.length ? [quantile(gains, 0.1), quantile(gains, 0.9)] : [NaN, NaN],
    pGain: gains.length ? better / gains.length : NaN,
    boundary: b0.x <= lo + 0.01 * (hi - lo) ? "low" : b0.x >= hi - 0.01 * (hi - lo) ? "high" : null,
  };
  if (optimum.boundary) warnings.push(`The best price sits at the ${optimum.boundary} edge of what you have listed. The data says to keep going ${optimum.boundary === "high" ? "higher" : "lower"}, but it cannot say how far; try a few nights beyond the edge before trusting it.`);

  const scenarios = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2].map((d) => {
    const price = usualPrice * (1 + d), x = Math.log(price);
    return { change: d, price, bookChance: probAt(f, x), expectedValue: valueAt(f, x), perBookedNight: nightMargin(price, eco), tested: x >= lo - 1e-9 && x <= hi + 1e-9 };
  });

  const order = xs.map((_, i) => i).sort((p, q) => xs[p] - xs[q]);
  const bands = [0, 1, 2, 3].map((k) => {
    const idx = order.slice(Math.floor((n * k) / 4), Math.floor((n * (k + 1)) / 4));
    const bxs = idx.map((i) => Math.exp(xs[i]));
    return { n: idx.length, from: Math.min(...bxs), to: Math.max(...bxs), observed: mean(idx.map((i) => ys[i])), fitted: mean(idx.map((i) => probAt(f, xs[i]))) };
  });

  // Hold-out back-test: fit on the first 75% in the order given (oldest first), score the last 25%
  let holdout = null;
  const cut = Math.floor(n * 0.75);
  const trX = xs.slice(0, cut), trY = ys.slice(0, cut), teX = xs.slice(cut), teY = ys.slice(cut);
  if (teX.length >= 10 && trY.some((v) => v === 1) && trY.some((v) => v === 0) && sd(trX) > 1e-6) {
    const ft = fitLogit(trX, trY);
    const base = Math.min(1 - 1e-6, Math.max(1e-6, mean(trY)));
    const flat = { a: Math.log(base / (1 - base)), b: 0 };
    const withModel = logLoss(ft, teX, teY), without = logLoss(flat, teX, teY);
    holdout = { test: teX.length, logLossModel: withModel, logLossBase: without, helps: withModel < without - 0.005 };
  }

  const slopeOk = f.b < 0;
  const ciExcludesZero = ci95[1] < 0;
  let verdict;
  if (!slopeOk) verdict = "unidentified";
  else if (!ciExcludesZero && holdout && !holdout.helps) verdict = "unidentified";
  else if (ciExcludesZero && (!holdout || holdout.helps) && !separated) verdict = "usable";
  else verdict = "weak";
  if (!slopeOk) warnings.push("Nights listed at higher prices booked as often or more often than cheaper ones. That usually means you raised prices on nights that were already in demand (weekends, holidays, events, peak season), not that price does not matter. Do not set prices from this curve; compare similar nights instead.");

  return {
    n, booked, empty, occupancy: booked / n, levels, eco, usualPrice,
    slope: f.b, intercept: f.a, ci95,
    sens: { base: probAt(f, usualX), plus5: probAt(f, Math.log(usualPrice * 1.05)), drop5: probAt(f, usualX) - probAt(f, Math.log(usualPrice * 1.05)) },
    range: { lo: Math.exp(lo), hi: Math.exp(hi) },
    optimum, scenarios, bands, holdout, verdict, warnings,
    curve: (price) => probAt(f, Math.log(price)),
  };
}

export function sampleText() {
  const rng = mulberry32(17);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const lines = ["date,price,booked"];
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 240; i++) {
    const d = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const price = Math.max(70, Math.round(165 + 40 * gauss()));
    const pBook = sigmoid(4.6 - 0.045 * (price - 120));
    lines.push(`${d},${price},${rng() < pBook ? 1 : 0}`);
  }
  return lines.join("\n");
}

export function reportCsv(r) {
  const head = "price_change,nightly_price,book_chance,expected_profit_per_listed_night,profit_per_booked_night,inside_tested_range";
  return [head, ...r.scenarios.map((s) => [s.change.toFixed(3), s.price.toFixed(2), s.bookChance.toFixed(4), s.expectedValue.toFixed(2), s.perBookedNight.toFixed(2), s.tested].join(","))].join("\n");
}
