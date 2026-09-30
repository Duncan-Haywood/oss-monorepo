// Seasonal / one-shot buy-quantity optimizer (newsvendor with supplier price
// breaks). Pure functions, no DOM, no network.
//
// Demand is a lognormal fitted either to past seasons (censored at the units
// sold when a season sold out, by EM) or to a low / likely / high guess. With
// few past seasons the spread is itself uncertain, so demand is drawn from the
// Bayesian predictive (scaled-inverse-chi-squared spread, normal mean), tails
// truncated at 3.5 sd. Draws are stratified and seeded, so every answer is
// reproducible and the profit curve is smooth. Expected profit is evaluated for
// every candidate order quantity on the same draws, which is what lets price
// breaks (a non-convex cost) be handled by search instead of a formula.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const DRAWS = 4000;
const Z_CAP = 3.5;
const MIN_SEASONS = 3;

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

// Acklam's inverse normal CDF (relative error < 1.2e-9).
export function invNorm(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  let q, r;
  if (p < lo) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const Phi = (x) => 0.5 * erfc(-x / Math.SQRT2);
const phi = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
// Inverse Mills ratio phi(a) / (1 - Phi(a)), by continued fraction in the tail.
const mills = (a) => (a > 5 ? a + 1 / (a + 2 / (a + 3 / (a + 4 / a))) : phi(a) / Math.max(1 - Phi(a), 1e-300));

const numOf = (s) => {
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,\s]/g, "");
  return t !== "" && /^-?\d*\.?\d+$/.test(t) ? Number(t) : NaN;
};

// One line per past season. Optional label first. "*", "sold out" or "stockout"
// after the units means the season sold out, so demand was at least that.
export function parseSeasons(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Enter the units you sold in each past season or comparable launch, one per line." };
  const seasons = [];
  let skipped = 0;
  lines.forEach((line, i) => {
    const cols = line.split(line.includes("\t") ? "\t" : ",").map((c) => c.trim().replace(/^"|"$/g, ""));
    let u = -1;
    for (let k = 0; k < cols.length; k++) if (Number.isFinite(numOf(cols[k].replace(/\*$/, "")))) { u = k; break; }
    if (u < 0) { if (i > 0) skipped++; return; }
    const units = numOf(cols[u].replace(/\*$/, ""));
    if (!(units > 0)) { skipped++; return; }
    const censored = /\*$/.test(cols[u]) || cols.slice(u + 1).some((c) => /^(\*|sold ?out|stock ?out|sellout|yes|y)$/i.test(c));
    seasons.push({ label: u > 0 ? cols[0] : `Season ${seasons.length + 1}`, units, censored });
  });
  if (skipped) warnings.push(`${skipped} line(s) had no positive number of units and were skipped.`);
  if (!seasons.length) return { error: "No line had a positive number of units." };
  return { seasons, warnings };
}

// Supplier price breaks: "min quantity : unit cost" per line (all-units
// discount: the whole order is priced at the tier reached). A bare number is a
// single unit cost with no minimum.
export function parseBreaks(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Enter your unit cost, or quantity:cost lines for price breaks." };
  const tiers = [];
  for (const line of lines) {
    const parts = line.split(/[:,\t;]|\s+/).filter(Boolean);
    if (parts.length === 1) { const c = numOf(parts[0]); if (!(c >= 0)) return { error: `Could not read "${line}".` }; tiers.push({ min: 1, cost: c }); continue; }
    const min = numOf(parts[0]), cost = numOf(parts[1]);
    if (!(min >= 1) || !(cost >= 0)) return { error: `Could not read "${line}". Use quantity:cost, e.g. 500:3.10.` };
    tiers.push({ min: Math.round(min), cost });
  }
  tiers.sort((a, b) => a.min - b.min);
  for (let i = 1; i < tiers.length; i++) if (tiers[i].min === tiers[i - 1].min) return { error: "Two price breaks start at the same quantity." };
  return { tiers };
}

export const tierCost = (tiers, q) => {
  let c = null;
  for (const t of tiers) if (q >= t.min) c = t.cost;
  return c;
};

// Fit ln(demand) ~ N(m, s^2), treating sold-out seasons as right-censored (EM).
export function fitSeasons(seasons) {
  const x = seasons.map((s) => Math.log(s.units));
  const unc = seasons.filter((s) => !s.censored).length;
  const cen = seasons.length - unc;
  let m = x.reduce((a, b) => a + b, 0) / x.length;
  let s = Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, x.length - 1)) || 0.1;
  if (cen) {
    for (let it = 0; it < 500; it++) {
      let sumE = 0;
      const E = [], V = [];
      seasons.forEach((q, i) => {
        if (!q.censored) { E.push(x[i]); V.push(0); return; }
        const a = (x[i] - m) / s, l = mills(a);
        E.push(m + s * l);
        V.push(Math.max(1e-12, s * s * (1 + a * l - l * l)));
      });
      E.forEach((e) => { sumE += e; });
      const m2 = sumE / E.length;
      const s2 = Math.sqrt(E.reduce((acc, e, i) => acc + V[i] + (e - m2) ** 2, 0) / E.length);
      const done = Math.abs(m2 - m) < 1e-10 && Math.abs(s2 - s) < 1e-10;
      m = m2; s = Math.max(s2, 1e-6);
      if (done) break;
    }
  }
  return { m, s, n: seasons.length, uncensored: unc, censored: cen, neff: unc + 0.5 * cen };
}

export function fitRange({ low, likely, high, widen = 1.3 }) {
  const sl = (Math.log(likely) - Math.log(low)) / 1.2816, sh = (Math.log(high) - Math.log(likely)) / 1.2816;
  return { m: Math.log(likely), s: Math.max(1e-3, ((sl + sh) / 2) * widen), n: 0, neff: Infinity, uncensored: 0, censored: 0 };
}

function permutation(n, rng) {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}

// Sorted predictive demand draws.
export function drawDemand(fit, { draws = DRAWS, seed = 20260930, scale = 1 } = {}) {
  const rng = mulberry32(seed);
  const zs = Array.from({ length: draws }, (_, i) => Math.max(-Z_CAP, Math.min(Z_CAP, invNorm((i + 0.5) / draws))));
  const p2 = permutation(draws, rng), p3 = permutation(draws, rng);
  const out = new Array(draws);
  const df = Number.isFinite(fit.neff) ? Math.max(2, fit.neff - 1) : null;
  for (let i = 0; i < draws; i++) {
    let mu = fit.m, sigma = fit.s;
    if (df) {
      const w = 2 / (9 * df);
      const chi = Math.max(0.05 * df, df * (1 - w + zs[p2[i]] * Math.sqrt(w)) ** 3);
      sigma = Math.min(2.5 * fit.s, fit.s * Math.sqrt(df / chi));
      mu = fit.m + (sigma / Math.sqrt(fit.neff)) * zs[p3[i]];
    }
    out[i] = scale * Math.exp(mu + sigma * zs[i]);
  }
  return out.sort((a, b) => a - b);
}

const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];

// Profit statistics for ordering q against the demand draws.
export function evalQty(q, D, e) {
  const cost = tierCost(e.tiers, q);
  const outlay = cost * q + e.fixed;
  const n = D.length;
  const profits = new Array(n);
  let sum = 0, sales = 0, left = 0, short = 0, sellouts = 0, losses = 0, dem = 0;
  for (let i = 0; i < n; i++) {
    const d = D[i];
    const s = d < q ? d : q;
    const l = q - s, sh = d - s;
    const pr = e.price * s + (e.salvage - e.holding) * l - e.goodwill * sh - outlay;
    profits[i] = pr;
    sum += pr; sales += s; left += l; short += sh; dem += d;
    if (d >= q) sellouts++;
    if (pr < 0) losses++;
  }
  profits.sort((a, b) => a - b);
  const k = Math.max(1, Math.floor(0.1 * n));
  let tail = 0;
  for (let i = 0; i < k; i++) tail += profits[i];
  return { q, cost, outlay, expProfit: sum / n, pSellOut: sellouts / n, pLoss: losses / n, expLeftover: left / n, expShort: short / n, fillRate: dem ? sales / dem : 1, p10: profits[k], cvar10: tail / k, p50: profits[Math.floor(n / 2)], p90: profits[Math.floor(0.9 * n)] };
}

function candidates(D, e) {
  const moq = e.tiers[0].min;
  const hi = Math.max(moq, Math.ceil(quantile(D, 0.995) * 1.05));
  const step = Math.max(1, Math.ceil((hi - moq) / 400));
  const set = new Set();
  for (let q = moq; q <= hi; q += step) set.add(q);
  set.add(hi);
  for (const t of e.tiers) if (t.min >= moq && t.min <= hi) { set.add(t.min); if (t.min > moq) set.add(t.min - 1); }
  return { qs: [...set].sort((a, b) => a - b), hi, step };
}

function optimise(D, e) {
  const { qs, hi, step } = candidates(D, e);
  const curve = qs.map((q) => evalQty(q, D, e));
  let best = curve[0], cautious = curve[0];
  for (const c of curve) { if (c.expProfit > best.expProfit) best = c; if (c.cvar10 > cautious.cvar10) cautious = c; }
  return { curve, best, cautious, hi, step };
}

function validate(o) {
  if (!(o.price > 0)) return "Enter the price you will sell each unit for.";
  if (!(o.salvage >= 0)) return "Leftover value cannot be negative (use 0 if leftovers are worth nothing).";
  if (o.salvage > o.price) return "Leftover value is above the selling price, so nothing would ever be sold at full price. Check the two numbers.";
  if (!o.tiers?.length) return "Enter your unit cost.";
  return null;
}

// Textbook critical-ratio answer, ignoring price breaks and MOQ: a reference.
function textbook(D, e) {
  const c = e.tiers[0].cost;
  const cu = e.price - c + e.goodwill, co = c - e.salvage + e.holding;
  if (!(cu > 0) || !(co + cu > 0)) return null;
  const cr = cu / (cu + co);
  return { criticalRatio: cr, q: Math.round(quantile(D, cr)) };
}

export function analyze(opts) {
  const e = { price: opts.price, salvage: opts.salvage ?? 0, holding: opts.holding ?? 0, goodwill: opts.goodwill ?? 0, fixed: opts.fixed ?? 0, tiers: opts.tiers };
  const bad = validate(e);
  if (bad) return { error: bad };
  const warnings = [];
  let fit;
  if (opts.mode === "range") {
    const { low, likely, high } = opts.range || {};
    if (!(low > 0 && likely > 0 && high > 0) || !(low < likely && likely < high)) return { error: "Enter a low, likely and high demand with low < likely < high, all above zero." };
    fit = fitRange({ low, likely, high, widen: opts.widen ?? 1.3 });
  } else {
    const seasons = opts.seasons || [];
    if (seasons.length < MIN_SEASONS) return { error: `Need at least ${MIN_SEASONS} past seasons or comparable launches to estimate demand; with fewer, use the low / likely / high mode instead.` };
    if (seasons.filter((s) => !s.censored).length < 2) return { error: "At least two seasons must have ended with stock left over; if they all sold out, the true demand is unknown. Use the low / likely / high mode." };
    fit = fitSeasons(seasons);
    if (seasons.length < 5) warnings.push(`Only ${seasons.length} seasons: the spread of demand is itself uncertain, so the tool widens its forecast. Five or more comparable seasons make the answer much sharper.`);
    if (fit.censored) warnings.push(`${fit.censored} season(s) sold out; they are treated as "demand was at least this", not as the true demand.`);
  }
  const growth = opts.growth ?? 1;
  const D = drawDemand(fit, { scale: growth, seed: opts.seed });
  const { curve, best, cautious, hi, step } = optimise(D, e);
  if (best.expProfit <= 0) warnings.push("No order quantity is expected to make money with these numbers. The best quantity shown is the least-bad one; ordering nothing avoids the loss.");
  if (best.q >= hi - step) warnings.push("The best quantity sits at the top of the range searched. Leftovers are worth more than they cost, so there is no natural upper limit: set a cash limit yourself.");
  const med = quantile(D, 0.5);
  const tierTable = e.tiers.map((t, i) => {
    const hiQ = i + 1 < e.tiers.length ? e.tiers[i + 1].min - 1 : Infinity;
    const inTier = curve.filter((c) => c.q >= t.min && c.q <= hiQ);
    if (!inTier.length) return { min: t.min, cost: t.cost, best: null };
    return { min: t.min, cost: t.cost, best: inTier.reduce((a, b) => (b.expProfit > a.expProfit ? b : a)) };
  });
  // Value of knowing demand before ordering (upper bound): what a pre-order or waitlist could be worth.
  let perfect = 0;
  for (const d of D) { const q = Math.max(Math.round(d), 0); const c = tierCost(e.tiers, Math.max(q, e.tiers[0].min)); if (q >= e.tiers[0].min) perfect += Math.max(0, (e.price - c) * q - e.fixed); }
  const evpi = Math.max(0, perfect / D.length - Math.max(0, best.expProfit));
  // Sensitivity of the plan to the demand level being wrong.
  const sens = [0.7, 0.85, 1, 1.15, 1.3].map((k) => {
    const Dk = D.map((d) => d * k);
    const atPlan = evalQty(best.q, Dk, e);
    const bestK = optimise(Dk, e).best;
    return { scale: k, planProfit: atPlan.expProfit, bestQty: bestK.q, bestProfit: bestK.expProfit, regret: bestK.expProfit - atPlan.expProfit };
  });
  const result = { fit, growth, median: med, p10: quantile(D, 0.1), p90: quantile(D, 0.9), mean: D.reduce((a, b) => a + b, 0) / D.length, best, cautious, curve, tierTable, textbook: textbook(D, e), evpi, sens, warnings, inputs: e, searched: { hi, step } };
  if (opts.mode !== "range") result.backtest = backtest(opts.seasons, e, opts);
  return result;
}

// Leave-one-season-out: for each season that ended with stock left (true demand
// known), fit the others, order what the tool says, and compare realised profit
// with two rules of thumb.
export function backtest(seasons, e, opts = {}) {
  if (seasons.length < 4) return null;
  const rows = [];
  seasons.forEach((s, i) => {
    if (s.censored) return;
    const rest = seasons.filter((_, j) => j !== i);
    if (rest.filter((r) => !r.censored).length < 2 || rest.length < MIN_SEASONS) return;
    const D = drawDemand(fitSeasons(rest), { draws: 1500, seed: opts.seed, scale: opts.growth ?? 1 });
    const q = optimise(D, e).best.q;
    const avg = Math.max(e.tiers[0].min, Math.round(rest.reduce((a, r) => a + r.units, 0) / rest.length));
    const mx = Math.max(e.tiers[0].min, Math.max(...rest.map((r) => r.units)));
    const realised = (qq) => evalQty(qq, [s.units], e).expProfit;
    rows.push({ label: s.label, actual: s.units, tool: q, toolProfit: realised(q), avg, avgProfit: realised(avg), max: mx, maxProfit: realised(mx) });
  });
  if (rows.length < 3) return null;
  const tot = (k) => rows.reduce((a, r) => a + r[k], 0);
  return { rows, tool: tot("toolProfit"), avg: tot("avgProfit"), max: tot("maxProfit") };
}

export function reportCsv(r) {
  const out = ["quantity,unit_cost,expected_profit,p10_profit,median_profit,p90_profit,prob_sell_out,prob_loss,expected_leftover"];
  for (const c of r.curve) out.push([c.q, c.cost, c.expProfit.toFixed(2), c.p10.toFixed(2), c.p50.toFixed(2), c.p90.toFixed(2), c.pSellOut.toFixed(4), c.pLoss.toFixed(4), c.expLeftover.toFixed(1)].join(","));
  return out.join("\n") + "\n";
}

export function sampleText() {
  return "Spring 2022, 520\nSpring 2023, 455\nSpring 2024, 610, sold out\nHoliday 2024, 380\nSpring 2025, 560\nHoliday 2025, 430\nSpring 2026, 500";
}
export function sampleBreaks() { return "100:6.80\n300:5.90\n600:5.25\n1000:4.95"; }
