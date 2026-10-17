// Clearance markdown planner. Pure ES module, no imports, no network.
//
// Two parts:
//   1. fitElasticity: log-log regression of weekly units on price (with an
//      optional time-trend control), shrunk toward a typical retail prior so a
//      thin history cannot produce a wild number.
//   2. planMarkdown: a finite-horizon stochastic dynamic program over
//      (week, units left, current price level). Demand each week is
//      negative-binomial with mean base * (price/list)^elasticity * decay^week.
//      The plan maximises expected revenue plus salvage, with markdown-only
//      price moves and an optional per-change relabel cost.

export const PRIOR_MEAN = -2.0;
export const PRIOR_SD = 1.0;
const Z80 = 1.2815515655446004;
const MAX_LOTS = 1000;

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const pct = (v, d = 0) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "n/a");
export const money = (v, d = 0) => (Number.isFinite(v) ? `${v < 0 ? "-" : ""}$${num(Math.abs(v), d)}` : "n/a");
const round2 = (v) => Math.round(v * 100) / 100;

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

// ---------- parsing ----------

const DAY = 86400000;

function parseDate(s) {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]);
  if (/[a-zA-Z]{3}/.test(t)) {
    const v = Date.parse(`${t} UTC`);
    if (Number.isFinite(v)) return v;
    const w = Date.parse(t);
    if (Number.isFinite(w)) { const d = new Date(w); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }
  }
  return null;
}

const weekStart = (ms) => { const dow = (new Date(ms).getUTCDay() + 6) % 7; return ms - dow * DAY; };
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const cleanNumber = (s) => {
  const t = String(s).trim().replace(/[$€£,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return null;
  return Number(t);
};

export function parseSales(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload rows of date, price, units first.", weeks: [], warnings };
  const delim = [",", "\t", ";"].map((d) => [d, lines[0].replace(/"[^"]*"/g, "").split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const split = (l) => {
    const out = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === delim && !q) { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  let cols = { date: 0, price: 1, units: 2 };
  let start = 0;
  const first = split(lines[0]);
  if (first.length >= 3 && cleanNumber(first[1]) === null) {
    start = 1;
    const find = (re) => first.findIndex((h) => re.test(h));
    const d = find(/date|week|day|period/i), p = find(/price|\$|amount|rate/i), u = find(/unit|qty|quant|sold|sales|orders|count/i);
    if (d >= 0 && p >= 0 && u >= 0 && new Set([d, p, u]).size === 3) cols = { date: d, price: p, units: u };
  }
  const byWeek = new Map();
  let bad = 0, rows = 0;
  for (let i = start; i < lines.length; i++) {
    const c = split(lines[i]);
    if (c.length < 3) { bad++; continue; }
    const price = cleanNumber(c[cols.price]), units = cleanNumber(c[cols.units]);
    let key, t;
    const raw = c[cols.date];
    const ms = parseDate(raw);
    if (ms !== null) { const ws = weekStart(ms); key = isoDay(ws); t = ws / (7 * DAY); }
    else if (/^\d{1,4}$/.test(raw)) { key = `week ${Number(raw)}`; t = Number(raw); }
    if (key === undefined || price === null || units === null || price <= 0) { bad++; continue; }
    rows++;
    const w = byWeek.get(key) || { key, t, units: 0, revenue: 0, priceSum: 0, n: 0 };
    w.units += units; w.revenue += price * units; w.priceSum += price; w.n += 1;
    byWeek.set(key, w);
  }
  if (bad) warnings.push(`${bad} row${bad === 1 ? "" : "s"} could not be read (need a date, a positive price and a number of units) and ${bad === 1 ? "was" : "were"} skipped.`);
  if (!rows) return { error: "No readable rows. Expected columns: date, price, units (header optional).", weeks: [], warnings };
  const weeks = [...byWeek.values()].sort((a, b) => a.t - b.t).map((w) => ({
    key: w.key, t: w.t, units: w.units,
    price: w.units > 0 ? w.revenue / w.units : w.priceSum / w.n,
  }));
  return { weeks, warnings };
}

// ---------- elasticity ----------

function invert(m) {
  const n = m.length;
  const a = m.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; if (f) for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map((r) => r.slice(n));
}

function ols(X, y) {
  const n = X.length, k = X[0].length;
  const xtx = Array.from({ length: k }, () => new Array(k).fill(0));
  const xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) xtx[a][b] += X[i][a] * X[i][b]; }
  const inv = invert(xtx);
  if (!inv) return null;
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0));
  let sse = 0, sst = 0;
  const my = y.reduce((s, v) => s + v, 0) / n;
  for (let i = 0; i < n; i++) { const f = X[i].reduce((s, v, j) => s + v * beta[j], 0); sse += (y[i] - f) ** 2; sst += (y[i] - my) ** 2; }
  const dof = n - k;
  const s2 = dof > 0 ? sse / dof : NaN;
  return { beta, se: inv.map((r, i) => Math.sqrt(r[i] * s2)), s2, sd: Math.sqrt(s2), r2: sst > 0 ? 1 - sse / sst : 0, dof, n };
}

const corr = (a, b) => {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
};

export function fitElasticity(weeks, opts = {}) {
  const warnings = [];
  const pos = weeks.filter((w) => w.units > 0 && w.price > 0);
  const dropped = weeks.length - pos.length;
  if (dropped) warnings.push(`${dropped} week${dropped === 1 ? "" : "s"} with no net sales ${dropped === 1 ? "was" : "were"} left out of the price fit (a stock-out looks like zero demand, which would be read as a price effect).`);
  const out = { usable: false, n: pos.length, dropped, warnings, prior: { mean: PRIOR_MEAN, sd: PRIOR_SD } };
  if (pos.length < 8) { out.reason = `Only ${pos.length} week${pos.length === 1 ? "" : "s"} with sales; at least 8 are needed to read a price response.`; return out; }
  const prices = pos.map((w) => w.price);
  const pmin = Math.min(...prices), pmax = Math.max(...prices);
  out.priceRange = [pmin, pmax];
  if (pmax / pmin < 1.05) { out.reason = `Price barely moved (${money(pmin, 2)} to ${money(pmax, 2)}), so your history cannot show how demand responds to it.`; return out; }
  const ref = opts.refPrice > 0 ? opts.refPrice : pos[pos.length - 1].price;
  const t0 = pos[0].t, tLast = pos[pos.length - 1].t - t0;
  const x = pos.map((w) => Math.log(w.price / ref));
  const tt = pos.map((w) => w.t - t0);
  const y = pos.map((w) => Math.log(w.units));
  const useTrend = pos.length >= 10 && Math.abs(corr(x, tt)) < 0.85;
  if (pos.length >= 10 && !useTrend) warnings.push("Price and time moved together (you cut prices as the weeks went on), so a price effect cannot be separated from demand simply fading. The price-only fit is used and may overstate how sensitive buyers are.");
  const fit = useTrend ? ols(pos.map((_, i) => [1, x[i], tt[i]]), y) : ols(pos.map((_, i) => [1, x[i]]), y);
  if (!fit || !Number.isFinite(fit.se[1])) { out.reason = "The fit was degenerate (price did not vary enough relative to the noise)."; return out; }
  out.model = useTrend ? "log units on log price and a time trend" : "log units on log price";
  out.raw = fit.beta[1];
  // No price effect is ever known more tightly than this, however clean the
  // fit looks: a perfectly tidy history is usually a promotion calendar.
  out.se = Math.max(fit.se[1], 0.15);
  out.r2 = fit.r2;
  out.residualSd = fit.sd;
  // A positive slope (units up as price rises) is not a price effect, so the
  // data is set aside and the typical-retail prior stands alone.
  const w = out.raw > 0 ? 0 : 1 / out.se ** 2;
  const prec = w + 1 / PRIOR_SD ** 2;
  out.elasticity = ((out.raw > 0 ? 0 : out.raw * w) + PRIOR_MEAN / PRIOR_SD ** 2) / prec;
  out.sd = 1 / Math.sqrt(prec);
  out.dataWeight = w / prec;
  out.lo = out.elasticity - Z80 * out.sd;
  out.hi = out.elasticity + Z80 * out.sd;
  let decay = 1, level;
  if (useTrend) {
    const c = fit.beta[2];
    decay = Math.exp(c);
    level = Math.exp(fit.beta[0] + c * tLast);
  } else level = Math.exp(fit.beta[0]);
  if (decay > 1) { warnings.push("Units were rising over the history after allowing for price; the plan assumes flat demand rather than growth, to stay on the cautious side."); decay = 1; }
  if (decay < 0.7) { warnings.push(`Units were falling about ${pct(1 - Math.exp(fit.beta[2]))} a week after allowing for price; the plan limits the decay to 30% a week.`); decay = 0.7; }
  out.decay = decay;
  out.baseWeekly = level * decay;
  out.refPrice = ref;
  if (out.raw > 0) warnings.push("Your history shows units rising with price, which is not a price effect (promotions, stock, season or a new listing are likely behind it). The raw slope is set aside and the typical-retail prior is used instead.");
  if (out.dataWeight < 0.3) warnings.push(`Your data carries only ${pct(out.dataWeight)} of the weight in the elasticity estimate; the rest is the typical-retail prior (${PRIOR_MEAN}). Vary price more, or enter your own elasticity.`);
  out.usable = true;
  return out;
}

// ---------- demand distribution ----------

function lgamma(z) {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

// Negative binomial with mean mu and variance v (Poisson when v ~ mu), on a
// window of +-5 sd, renormalised. Returns {lo, p: [...]} for d = lo..lo+len-1.
export function demandPmf(mu, v) {
  if (!(mu > 1e-9)) return { lo: 0, p: [1] };
  const sd = Math.sqrt(Math.max(v, mu));
  const lo = Math.max(0, Math.floor(mu - 5 * sd));
  const hi = Math.max(lo + 1, Math.ceil(mu + 5 * sd));
  const lp = [];
  const poisson = v - mu < 1e-6 * mu;
  const r = poisson ? 0 : (mu * mu) / (v - mu);
  for (let d = lo; d <= hi; d++) {
    lp.push(poisson
      ? d * Math.log(mu) - mu - lgamma(d + 1)
      : lgamma(d + r) - lgamma(r) - lgamma(d + 1) + r * Math.log(r / (r + mu)) + d * Math.log(mu / (r + mu)));
  }
  const m = Math.max(...lp);
  const e = lp.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return { lo, p: e.map((x) => x / s) };
}

// ---------- the dynamic program ----------

function setup(inp) {
  const T = Math.round(inp.weeks);
  const lot = Math.max(1, Math.ceil(inp.units / MAX_LOTS));
  const I0 = Math.round(inp.units / lot);
  const step = inp.step || 10;
  const levels = [];
  for (let d = 0; d <= inp.maxDiscount + 1e-9; d += step) {
    const price = inp.price * (1 - d / 100);
    if (d > 0 && price < (inp.floorPrice || 0) - 1e-9) break;
    levels.push({ discount: d, price: round2(price) });
  }
  return { T, lot, I0, levels, L: levels.length };
}

function demandTables(inp, S) {
  const k = inp.dispersion ?? 0.25;
  const tab = [];
  for (let t = 0; t < S.T; t++) {
    const row = [];
    for (let j = 0; j < S.L; j++) {
      const mean = inp.baseDemand * (S.levels[j].price / inp.price) ** inp.elasticity * (inp.decay ?? 1) ** t;
      const mu = mean / S.lot;
      row.push({ mean, pmf: demandPmf(mu, mu + (k * mu) ** 2) });
    }
    tab.push(row);
  }
  return tab;
}

// solve: backward induction. With `forced(t, prevLevel, units) -> level`, the
// same recursion evaluates a fixed rule instead of optimising.
function solve(inp, S, tables, forced) {
  const { T, L, lot, I0 } = S;
  const cc = inp.changeCost || 0;
  const salv = (inp.salvage || 0) * lot;
  let V = Array.from({ length: I0 + 1 }, (_, I) => new Float64Array(L).fill(salv * I));
  const act = Array.from({ length: T }, () => new Uint8Array((I0 + 1) * L));
  const prices = S.levels.map((l) => l.price * lot);
  for (let t = T - 1; t >= 0; t--) {
    const Q = Array.from({ length: L }, () => new Float64Array(I0 + 1));
    for (let j = 0; j < L; j++) {
      const { lo, p } = tables[t][j].pmf;
      const len = p.length;
      for (let I = 1; I <= I0; I++) {
        const m = Math.min(len, Math.max(0, I - lo));
        let cont = 0, sold = 0, below = 0;
        for (let i = 0; i < m; i++) { const d = lo + i; cont += p[i] * V[I - d][j]; sold += p[i] * d; below += p[i]; }
        const tail = Math.max(0, 1 - below);
        Q[j][I] = prices[j] * (sold + I * tail) + cont + tail * V[0][j];
      }
    }
    const nextV = Array.from({ length: I0 + 1 }, () => new Float64Array(L));
    for (let I = 0; I <= I0; I++) {
      for (let i = 0; i < L; i++) {
        let best = -Infinity, bj = i;
        if (forced) {
          bj = Math.max(i, Math.min(L - 1, forced(t, i, I)));
          best = Q[bj][I] - (bj > i ? cc : 0);
        } else {
          for (let j = i; j < L; j++) { const q = Q[j][I] - (j > i ? cc : 0); if (q > best + 1e-9) { best = q; bj = j; } }
        }
        if (I === 0) best = 0;
        nextV[I][i] = best;
        act[t][I * L + i] = bj;
      }
    }
    V = nextV;
  }
  return { value: V[I0][0], act };
}

function simulate(S, tables, act, inp, runs, seed) {
  const { T, L, lot, I0 } = S;
  const rnd = mulberry32(seed);
  const cdfs = tables.map((row) => row.map(({ lo, pmf }) => { let c = 0; return { lo: pmf?.lo ?? lo, cum: (pmf ?? { p: [1] }).p.map((x) => (c += x)) }; }));
  const cc = inp.changeCost || 0;
  const profits = [], revs = [];
  let leftoverSum = 0, leftRuns = 0;
  for (let r = 0; r < runs; r++) {
    let I = I0, lvl = 0, rev = 0, changes = 0;
    for (let t = 0; t < T && I > 0; t++) {
      const j = act[t][I * L + lvl];
      if (j > lvl) { changes++; lvl = j; }
      const { lo, cum } = cdfs[t][j];
      const u = rnd();
      let a = 0, b = cum.length - 1;
      while (a < b) { const mid = (a + b) >> 1; if (cum[mid] >= u) b = mid; else a = mid + 1; }
      const d = lo + a, sold = Math.min(d, I);
      rev += S.levels[lvl].price * sold * lot;
      I -= sold;
    }
    const left = I * lot;
    const total = rev + left * (inp.salvage || 0) - changes * cc;
    revs.push(rev); profits.push(total - inp.units * (inp.cost || 0));
    leftoverSum += left; if (left > 0) leftRuns++;
  }
  profits.sort((a, b) => a - b);
  const q = (p) => profits[Math.min(runs - 1, Math.floor(p * runs))];
  return {
    runs, meanRevenue: revs.reduce((a, b) => a + b, 0) / runs,
    meanProfit: profits.reduce((a, b) => a + b, 0) / runs,
    p10: q(0.1), p50: q(0.5), p90: q(0.9),
    meanLeftover: leftoverSum / runs, pLeftover: leftRuns / runs,
  };
}

function expectedSold(tables, t, j, I) {
  const { lo, p } = tables[t][j].pmf;
  let sold = 0, below = 0;
  const m = Math.min(p.length, Math.max(0, I - lo));
  for (let i = 0; i < m; i++) { sold += p[i] * (lo + i); below += p[i]; }
  return sold + I * Math.max(0, 1 - below);
}

export function validate(inp) {
  const errs = [];
  if (!(inp.units >= 1)) errs.push("Enter the units you still have.");
  if (!(inp.price > 0)) errs.push("Enter the current price.");
  if (!(inp.weeks >= 1 && inp.weeks <= 26)) errs.push("Weeks left must be between 1 and 26.");
  if (!(inp.baseDemand > 0)) errs.push("Enter the units you expect to sell per week at the current price.");
  if (!(inp.elasticity < 0)) errs.push("Elasticity must be negative (higher price, fewer units).");
  if ((inp.salvage ?? 0) > inp.price) errs.push("Salvage value per leftover unit is above the current price; nothing would ever be marked down.");
  return errs;
}

export function planMarkdown(raw) {
  const inp = {
    cost: 0, salvage: 0, dispersion: 0.25, decay: 1, maxDiscount: 60, step: 10, floorPrice: 0, changeCost: 0,
    simRuns: 4000, seed: 20260930, ...raw,
  };
  inp.elasticity = Math.min(inp.elasticity, -0.05);
  const errors = validate(inp);
  if (errors.length) return { error: errors[0], errors };
  const warnings = [];
  const S = setup(inp);
  if (S.L < 2) return { error: "The price floor leaves no room to mark down. Lower the floor or raise the maximum discount.", errors: [] };
  if (S.lot > 1) warnings.push(`With ${num(inp.units)} units the plan is computed in lots of ${S.lot} units to keep it fast; results are slightly smoother than a unit-by-unit plan.`);
  const tables = demandTables(inp, S);
  const opt = solve(inp, S, tables, null);
  const sim = simulate(S, tables, opt.act, inp, inp.simRuns, inp.seed);
  const costTotal = inp.units * inp.cost;
  const lvlNear = (d) => { let b = 0; for (let j = 0; j < S.L; j++) if (S.levels[j].discount <= d + 1e-9) b = j; return b; };

  // Forward pass on expected sales for the planned path.
  const path = [];
  let I = S.I0, lvl = 0, totalRev = 0;
  for (let t = 0; t < S.T && I > 0; t++) {
    const j = opt.act[t][I * S.L + lvl];
    const sold = expectedSold(tables, t, j, I);
    const units = sold * S.lot, rev = units * S.levels[j].price;
    path.push({ week: t + 1, discount: S.levels[j].discount, price: S.levels[j].price, startUnits: I * S.lot, expectedUnits: units, expectedRevenue: rev, endUnits: Math.max(0, (I - sold) * S.lot), changed: j > lvl });
    totalRev += rev;
    lvl = j;
    I = Math.max(0, Math.round(I - sold));
  }
  // Decision checkpoints: what the plan would do if you are behind or ahead.
  const checkpoints = [];
  {
    let Ic = S.I0, l = 0;
    for (let t = 0; t < S.T && Ic > 0; t++) {
      const pick = (inv) => { const k = Math.max(1, Math.min(S.I0, Math.round(inv))); return S.levels[opt.act[t][k * S.L + l]].discount; };
      const atPlan = pick(Ic);
      checkpoints.push({ week: t + 1, startUnits: Ic * S.lot, asPlanned: atPlan, behind: pick(Ic * 1.25), behindUnits: Math.min(S.I0, Math.round(Ic * 1.25)) * S.lot, ahead: pick(Ic * 0.75), aheadUnits: Math.max(1, Math.round(Ic * 0.75)) * S.lot });
      const j = opt.act[t][Ic * S.L + l];
      Ic = Math.max(0, Math.round(Ic - expectedSold(tables, t, j, Ic)));
      l = j;
    }
  }
  // Baselines, all evaluated by the same recursion.
  const T = S.T;
  const baselineDefs = [
    { name: "Hold the current price", f: () => 0 },
    { name: `One cut: ${S.levels[lvlNear(30)].discount}% off for the last third`, f: (t) => (t >= Math.floor((T * 2) / 3) ? lvlNear(30) : 0) },
    { name: "Steady ladder: 10% more off every 2 weeks", f: (t) => lvlNear(Math.floor(t / 2) * 10) },
    { name: "Half price at the halfway point", f: (t) => (t >= Math.floor(T / 2) ? lvlNear(50) : 0) },
  ];
  const baselines = baselineDefs.map((b) => {
    const r = solve(inp, S, tables, (t) => b.f(t));
    const sold = forwardSold(S, tables, r.act);
    return { name: b.name, expectedProfit: r.value - costTotal, expectedValue: r.value, sellThrough: sold / inp.units, gapToPlan: opt.value - r.value };
  });
  const planSold = forwardSold(S, tables, opt.act);

  // Sensitivity to the elasticity.
  const sensitivity = [];
  if (Number.isFinite(inp.elasticityLo) && Number.isFinite(inp.elasticityHi)) {
    for (const [label, e] of [["Buyers less price-sensitive than estimated", Math.min(-0.05, inp.elasticityHi)], ["Your estimate", inp.elasticity], ["Buyers more price-sensitive than estimated", inp.elasticityLo]]) {
      const alt = { ...inp, elasticity: e };
      const tab = demandTables(alt, S);
      const best = solve(alt, S, tab, null);
      const mine = solve(alt, S, tab, (t, i, Iu) => opt.act[t][Iu * S.L + i]);
      sensitivity.push({ label, elasticity: e, bestValue: best.value, planValue: mine.value, regret: best.value > 0 ? (best.value - mine.value) / best.value : 0 });
    }
  }
  if (planSold / inp.units < 0.5 - 1e-9) warnings.push(`Even with the plan, only about ${pct(planSold / inp.units)} is expected to sell in ${S.T} weeks at these prices. The constraint is the window, not the price; consider a deeper maximum discount, a bundle, or a liquidation channel for the rest.`);
  const marks = path.filter((p) => p.changed).length;
  return {
    inputs: inp, lot: S.lot, levels: S.levels, warnings,
    expectedValue: opt.value, expectedProfit: opt.value - costTotal, costTotal,
    sellThrough: planSold / inp.units, expectedLeftover: inp.units - planSold,
    simulation: sim, path, checkpoints, baselines, sensitivity, markdowns: marks,
    bestBaselineGap: Math.min(...baselines.map((b) => b.gapToPlan)),
  };
}

function forwardSold(S, tables, act) {
  let sold = 0;
  // Expected units sold summed over the distribution, by the forward recursion
  // on the state distribution.
  let dist = new Float64Array((S.I0 + 1) * S.L);
  dist[S.I0 * S.L] = 1;
  for (let t = 0; t < S.T; t++) {
    const next = new Float64Array((S.I0 + 1) * S.L);
    for (let Iu = 1; Iu <= S.I0; Iu++) for (let i = 0; i < S.L; i++) {
      const w = dist[Iu * S.L + i];
      if (!w) continue;
      const j = act[t][Iu * S.L + i];
      const { lo, p } = tables[t][j].pmf;
      let below = 0;
      const m = Math.min(p.length, Math.max(0, Iu - lo));
      for (let k = 0; k < m; k++) { const d = lo + k; next[(Iu - d) * S.L + j] += w * p[k]; below += p[k]; sold += w * p[k] * d; }
      const tail = Math.max(0, 1 - below);
      next[j] += w * tail; // I=0 at level j
      sold += w * tail * Iu;
    }
    for (let i = 0; i < S.L; i++) next[i] += dist[i];
    dist = next;
  }
  return sold * S.lot;
}

export function sampleText() {
  const rnd = mulberry32(7);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const prices = [48, 48, 44, 48, 40, 48, 44, 36, 48, 40, 44, 36, 40, 32, 44, 36];
  const rows = ["week,price,units"];
  const start = Date.UTC(2026, 5, 1);
  prices.forEach((p, i) => {
    const mean = 58 * (p / 48) ** -2.3 * 0.96 ** i;
    rows.push(`${isoDay(start + i * 7 * DAY)},${p.toFixed(2)},${Math.max(1, Math.round(mean * Math.exp(0.12 * gauss())))}`);
  });
  return rows.join("\n");
}

export function markdownCsv(r) {
  const head = "week,discount_pct,price,units_at_start,expected_units_sold,expected_revenue,expected_units_left";
  const rows = r.path.map((p) => [p.week, p.discount, p.price.toFixed(2), Math.round(p.startUnits), p.expectedUnits.toFixed(1), p.expectedRevenue.toFixed(2), Math.round(p.endUnits)].join(","));
  return [head, ...rows].join("\n") + "\n";
}
