// Surety bond premium and bonding capacity. Pure functions, no DOM, no network.
// A contractor bidding public or bonded private work needs a performance and payment bond. Two numbers decide whether a bid
// is worth submitting: what the bond costs (a tiered rate per $1,000 of contract price, which is itself part of the price)
// and whether the surety's single-job and aggregate (all uncompleted bonded work) limits leave room for it.
// This module prices a bid so the premium is recovered inside the price (bisection on a monotone function), computes the
// limits from working capital, burns the current backlog down over time, and chooses which bids to submit by exact
// enumeration of every subset, keeping the chance of winning more than the aggregate limit under a tolerance.

export const MAX_BIDS = 6;
export const MAX_JOBS = 5;
export const MAX_MONTHS = 60;

export const SHARED_DEFAULTS = {
  workingCapital: 0, singleMultiple: 10, aggregateMultiple: 20,
  upTo1: 100000, upTo2: 500000, upTo3: 2500000, upTo4: 5000000,
  rate1: 25, rate2: 15, rate3: 12, rate4: 10, rate5: 7.5,
  rateAdjustPct: 0, minPremium: 0, riskTolerancePct: 10,
};
export const JOB_DEFAULTS = { name: "", contract: 0, pctComplete: 0, monthsLeft: 6 };
export const BID_DEFAULTS = { name: "", directCost: 0, marginPct: 8, winPct: 30, bonded: "yes" };

// Placeholder example figures, not any business's financials or any surety's rates.
export const EXAMPLE_SHARED = { ...SHARED_DEFAULTS, workingCapital: 200000 };
export const EXAMPLE_JOBS = [
  { name: "School roof replacement", contract: 1200000, pctComplete: 40, monthsLeft: 8 },
  { name: "Municipal sidewalk repair", contract: 640000, pctComplete: 75, monthsLeft: 3 },
];
export const EXAMPLE_BIDS = [
  { name: "County library HVAC", directCost: 1650000, marginPct: 8, winPct: 25, bonded: "yes" },
  { name: "Fire station addition", directCost: 2300000, marginPct: 9, winPct: 20, bonded: "yes" },
  { name: "Parking structure repairs", directCost: 980000, marginPct: 10, winPct: 35, bonded: "yes" },
  { name: "Water main replacement", directCost: 1150000, marginPct: 9, winPct: 30, bonded: "yes" },
  { name: "Private tenant fit-out", directCost: 310000, marginPct: 12, winPct: 50, bonded: "no" },
];

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

export function cleanShared(s = {}) {
  const d = SHARED_DEFAULTS;
  const ups = [num(s.upTo1, d.upTo1), num(s.upTo2, d.upTo2), num(s.upTo3, d.upTo3), num(s.upTo4, d.upTo4)].map((x) => Math.max(0, x));
  for (let i = 1; i < ups.length; i++) ups[i] = Math.max(ups[i], ups[i - 1]); // breakpoints can only rise
  const rates = [num(s.rate1, d.rate1), num(s.rate2, d.rate2), num(s.rate3, d.rate3), num(s.rate4, d.rate4), num(s.rate5, d.rate5)]
    .map((r) => Math.min(200, Math.max(0, r))); // dollars per $1,000 of contract price
  return {
    workingCapital: Math.max(0, num(s.workingCapital, d.workingCapital)),
    singleMultiple: Math.min(100, Math.max(0, num(s.singleMultiple, d.singleMultiple))),
    aggregateMultiple: Math.min(200, Math.max(0, num(s.aggregateMultiple, d.aggregateMultiple))),
    upTo: ups, rates,
    rateAdjust: Math.min(300, Math.max(-50, num(s.rateAdjustPct, d.rateAdjustPct))) / 100,
    minPremium: Math.max(0, num(s.minPremium, d.minPremium)),
    riskTolerance: Math.min(100, Math.max(0, num(s.riskTolerancePct, d.riskTolerancePct))) / 100,
  };
}

export function cleanJobs(jobs = []) {
  const out = [], warnings = [];
  jobs.slice(0, MAX_JOBS).forEach((raw, i) => {
    const j = raw || {};
    const contract = Math.max(0, num(j.contract));
    if (contract <= 0) return;
    const name = String(j.name ?? "").trim() || `Current job ${i + 1}`;
    const pct = Math.min(100, Math.max(0, num(j.pctComplete)));
    const months = Math.min(MAX_MONTHS, Math.max(0, num(j.monthsLeft, JOB_DEFAULTS.monthsLeft)));
    const backlog = contract * (1 - pct / 100);
    if (backlog > 0 && months <= 0) warnings.push(`${name}: no months left but work remains; it is counted as backlog for the whole forecast.`);
    out.push({ name, contract, pct, months, backlog });
  });
  return { jobs: out, warnings };
}

export function cleanBids(bids = []) {
  const out = [], warnings = [];
  bids.slice(0, MAX_BIDS).forEach((raw, i) => {
    const b = raw || {};
    const C = Math.max(0, num(b.directCost));
    const name = String(b.name ?? "").trim() || `Bid ${i + 1}`;
    if (C <= 0) { if (String(b.name ?? "").trim()) warnings.push(`${name}: enter your direct cost; the bid was left out.`); return; }
    let m = num(b.marginPct, BID_DEFAULTS.marginPct);
    if (m > 60) { warnings.push(`${name}: margin capped at 60 percent.`); m = 60; }
    if (m < 0) { warnings.push(`${name}: negative margin set to zero.`); m = 0; }
    out.push({
      name, C, m: m / 100,
      p: Math.min(100, Math.max(0, num(b.winPct, BID_DEFAULTS.winPct))) / 100,
      bonded: String(b.bonded ?? "yes").toLowerCase() !== "no",
    });
  });
  return { bids: out, warnings };
}

// Premium for a contract price: each slice of the price is charged its own rate per $1,000, then the credit adjustment.
export function premiumFor(price, sh) {
  if (!(price > 0)) return 0;
  const edges = [0, ...sh.upTo, Infinity];
  let raw = 0;
  for (let i = 0; i < sh.rates.length; i++) {
    const slice = Math.min(price, edges[i + 1]) - edges[i];
    if (slice > 0) raw += (slice / 1000) * sh.rates[i];
  }
  return Math.max(sh.minPremium, raw * (1 + sh.rateAdjust));
}

// The price P with P*(1-m) - premium(P) = C: the premium is a share of the very price it is charged on, so the bond cost is
// recovered and the margin is a true margin on the final price. g rises with P while the marginal premium rate is below 1-m,
// which holds for any realistic schedule; if no price can earn the margin the function returns null and the bid is reported.
export function solvePrice(C, m, bonded, sh) {
  if (!bonded) return C / (1 - m);
  const g = (P) => P * (1 - m) - premiumFor(P, sh) - C;
  let lo = C, hi = Math.max(C * 4, 1);
  let guard = 0;
  while (g(hi) < 0 && guard++ < 60) hi *= 2;
  if (g(hi) < 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) < 0) lo = mid; else hi = mid;
  }
  return hi;
}

export function limits(sh, jobs) {
  const single = sh.workingCapital * sh.singleMultiple;
  const aggregate = sh.workingCapital * sh.aggregateMultiple;
  const backlog = jobs.reduce((s, j) => s + j.backlog, 0);
  const headroom = Math.max(0, aggregate - backlog);
  return { single, aggregate, backlog, headroom, maxJob: Math.min(single, headroom), over: backlog > aggregate };
}

// Backlog still to be built `t` months from now, each job burning down in a straight line.
export function backlogAt(jobs, t) {
  return jobs.reduce((s, j) => s + (j.months > 0 ? j.backlog * Math.max(0, 1 - t / j.months) : j.backlog), 0);
}

// First whole month in which a bid of this price fits under both limits if nothing else is won; null if it never does.
export function earliestFitMonth(price, lim, jobs) {
  if (price > lim.single) return null;
  for (let t = 0; t <= MAX_MONTHS; t++) if (backlogAt(jobs, t) + price <= lim.aggregate + 1e-9) return t;
  return null;
}

function* subsets(n) { for (let mask = 0; mask < (1 << n); mask++) yield mask; }

// Chance that the bids won from `idx` push committed work past the aggregate limit, enumerating every win/lose outcome.
export function overcommitProbability(idx, priced, lim) {
  const use = idx.filter((i) => priced[i].bonded);
  let pr = 0;
  for (const mask of subsets(use.length)) {
    let p = 1, sum = 0;
    use.forEach((i, k) => {
      if (mask & (1 << k)) { p *= priced[i].p; sum += priced[i].price; } else p *= 1 - priced[i].p;
    });
    if (lim.backlog + sum > lim.aggregate + 1e-9) pr += p;
  }
  return pr;
}

export function expectedProfit(idx, priced) { return idx.reduce((s, i) => s + priced[i].p * priced[i].profit, 0); }

// Best set of bids to submit: most expected profit among sets where every bonded bid fits the single limit and the chance of
// winning past the aggregate limit is within the tolerance. Exact enumeration; ties go to fewer bids.
export function bestSet(priced, lim, tolerance) {
  let best = { idx: [], profit: 0, risk: 0 };
  const eligible = priced.map((b, i) => i).filter((i) => !priced[i].bonded || priced[i].price <= lim.single + 1e-9);
  for (const mask of subsets(eligible.length)) {
    const idx = eligible.filter((_, k) => mask & (1 << k));
    const risk = overcommitProbability(idx, priced, lim);
    if (risk > tolerance + 1e-12) continue;
    const profit = expectedProfit(idx, priced);
    if (profit > best.profit + 1e-9 || (Math.abs(profit - best.profit) <= 1e-9 && idx.length < best.idx.length)) best = { idx, profit, risk };
  }
  return best;
}

// Working capital this bid needs for both limits, with and without the current backlog.
export function workingCapitalNeeded(price, backlog, sh) {
  const forSingle = sh.singleMultiple > 0 ? price / sh.singleMultiple : Infinity;
  const forAggregate = sh.aggregateMultiple > 0 ? (backlog + price) / sh.aggregateMultiple : Infinity;
  return Math.max(forSingle, forAggregate);
}

export function analyze(sharedIn, jobsIn, bidsIn) {
  const sh = cleanShared(sharedIn);
  const { jobs, warnings: jw } = cleanJobs(jobsIn);
  const { bids, warnings: bw } = cleanBids(bidsIn);
  const warnings = [...jw, ...bw];
  if (sh.workingCapital <= 0) warnings.push("Enter your working capital (current assets minus current liabilities); the limits depend on it.");
  if (!bids.length) warnings.push("Enter at least one bid with a direct cost.");
  if (sh.workingCapital <= 0 || !bids.length) return { ok: false, warnings };

  const lim = limits(sh, jobs);
  if (lim.over) warnings.push(`Your uncompleted bonded work (${money(lim.backlog)}) is already above the aggregate limit these multiples give (${money(lim.aggregate)}); no new bonded bid fits until work burns down.`);

  const priced = [];
  for (const b of bids) {
    const price = solvePrice(b.C, b.m, b.bonded, sh);
    if (price === null) { warnings.push(`${b.name}: the bond rates leave no price that earns the margin; lower the margin or the rates. The bid was left out.`); continue; }
    const premium = b.bonded ? premiumFor(price, sh) : 0;
    priced.push({
      ...b, price, premium, premiumPct: premium / price, profit: price - b.C - premium,
      fitsSingle: !b.bonded || price <= lim.single + 1e-9,
      fitsNow: !b.bonded || (price <= lim.single + 1e-9 && lim.backlog + price <= lim.aggregate + 1e-9),
      month: b.bonded ? earliestFitMonth(price, lim, jobs) : 0,
      wcNeeded: b.bonded ? workingCapitalNeeded(price, lim.backlog, sh) : 0,
    });
  }
  if (!priced.length) return { ok: false, warnings };

  const all = priced.map((_, i) => i).filter((i) => !priced[i].bonded || priced[i].price <= lim.single + 1e-9);
  const sets = {
    all: { idx: all, profit: expectedProfit(all, priced), risk: overcommitProbability(all, priced, lim) },
    safe: bestSet(priced, lim, 0),
    tolerant: bestSet(priced, lim, sh.riskTolerance),
  };
  const bondedAll = priced.filter((b) => b.bonded);
  const wcAll = bondedAll.length ? workingCapitalNeeded(bondedAll.reduce((s, b) => s + b.price, 0), lim.backlog, sh) : 0;
  const wcLargest = bondedAll.length ? Math.max(...bondedAll.map((b) => b.wcNeeded)) : 0;

  const sens = [0, 10, 25, 50, 100].map((pct) => {
    const wc = sh.workingCapital * (1 + pct / 100);
    const s2 = { ...sh, workingCapital: wc };
    const l2 = limits(s2, jobs);
    return { pct, wc, single: l2.single, aggregate: l2.aggregate, maxJob: l2.maxJob, fits: priced.filter((b) => !b.bonded || (b.price <= l2.single + 1e-9 && l2.backlog + b.price <= l2.aggregate + 1e-9)).length };
  });

  const horizon = [0, 3, 6, 9, 12].map((t) => ({ t, backlog: backlogAt(jobs, t), headroom: Math.max(0, lim.aggregate - backlogAt(jobs, t)) }));
  return { ok: true, warnings, shared: sh, jobs, lim, priced, sets, wcAll, wcLargest, sens, horizon };
}

export function toCsv(a) {
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const rows = [["Bid", "Direct cost", "Price including bond", "Bond premium", "Premium % of price", "Profit if won", "Win chance %", "Fits now", "First month it fits", "Working capital needed"]];
  for (const b of a.priced) rows.push([q(b.name), b.C.toFixed(2), b.price.toFixed(2), b.premium.toFixed(2), (b.premiumPct * 100).toFixed(2), b.profit.toFixed(2), (b.p * 100).toFixed(1), b.fitsNow ? "yes" : "no", b.month === null ? "never" : b.month, b.wcNeeded.toFixed(2)]);
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}
