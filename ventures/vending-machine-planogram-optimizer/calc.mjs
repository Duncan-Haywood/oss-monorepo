// Vending machine planogram optimizer.
// Pure functions, no DOM. Demand per restock interval is Poisson; the optimiser is an exact
// dynamic program over "how many coils does each product get", and the result is then re-measured
// by Monte Carlo with sell-out substitution on identical simulated intervals.

export const MAX_PRODUCTS = 12;
export const WEEKS_PER_MONTH = 52 / 12;
export const INTERVAL_CHOICES = [2, 3, 4, 5, 7, 10, 14];
export const SIM_INTERVALS = 3000;

export const SHARED_DEFAULTS = { coils: "", visitDays: "", visitCost: "", substitutionPct: "" };
export const PRODUCT_DEFAULTS = { name: "", price: "", cost: "", weekly: "", perCoil: "", perishable: "", minCoils: "", maxCoils: "", now: "" };

export const EXAMPLE_SHARED = { coils: "36", visitDays: "7", visitCost: "30", substitutionPct: "30" };
export const EXAMPLE_PRODUCTS = [
  { name: "Potato chips", price: "1.75", cost: "0.80", weekly: "70", perCoil: "10", perishable: "no", minCoils: "1", maxCoils: "8", now: "4" },
  { name: "Pretzels", price: "1.50", cost: "0.70", weekly: "28", perCoil: "10", perishable: "no", minCoils: "0", maxCoils: "6", now: "4" },
  { name: "Chocolate bar", price: "1.75", cost: "0.85", weekly: "55", perCoil: "12", perishable: "no", minCoils: "1", maxCoils: "8", now: "4" },
  { name: "Gummy candy", price: "1.50", cost: "0.65", weekly: "34", perCoil: "10", perishable: "no", minCoils: "0", maxCoils: "6", now: "4" },
  { name: "Granola bar", price: "1.75", cost: "0.75", weekly: "22", perCoil: "12", perishable: "no", minCoils: "0", maxCoils: "6", now: "4" },
  { name: "Protein bar", price: "3.00", cost: "1.75", weekly: "14", perCoil: "8", perishable: "no", minCoils: "0", maxCoils: "4", now: "4" },
  { name: "Cookies", price: "2.00", cost: "0.95", weekly: "26", perCoil: "8", perishable: "no", minCoils: "0", maxCoils: "6", now: "4" },
  { name: "Fresh sandwich", price: "5.50", cost: "3.10", weekly: "9", perCoil: "4", perishable: "yes", minCoils: "0", maxCoils: "4", now: "4" },
  { name: "Trail mix", price: "2.25", cost: "1.20", weekly: "6", perCoil: "8", perishable: "no", minCoils: "0", maxCoils: "4", now: "4" },
];

export const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const money2 = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
export const one = (x) => (Math.round(x * 10) / 10).toString();

export function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[$,%\s]/g, "");
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}
const yes = (v) => /^(y|yes|true|1|x)$/i.test(String(v ?? "").trim());

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

// Poisson CDF array (until the tail is negligible) and E[min(D,q)] for every q.
export function poissonTable(lambda) {
  const cdf = [];
  if (!(lambda > 0)) return { cdf: [1], em: (q) => 0, lambda: 0 };
  let logp = -lambda, cum = 0;
  const limit = Math.ceil(lambda + 14 * Math.sqrt(lambda) + 40);
  for (let j = 0; j <= limit; j++) {
    if (j > 0) logp += Math.log(lambda) - Math.log(j);
    cum += Math.exp(logp);
    cdf.push(Math.min(cum, 1));
  }
  const prefix = [0]; // prefix[q] = sum_{j<q} P(D>j) = E[min(D,q)]
  for (let j = 0; j < cdf.length; j++) prefix.push(prefix[j] + Math.max(0, 1 - cdf[j]));
  const em = (q) => (q <= 0 ? 0 : q >= prefix.length ? prefix[prefix.length - 1] : prefix[q]);
  return { cdf, em, lambda };
}
const probAtLeast = (table, q) => (q <= 0 ? 1 : q - 1 >= table.cdf.length ? 0 : Math.max(0, 1 - table.cdf[q - 1]));

export function normalize(rows, shared) {
  const warnings = [];
  const s = {
    coils: Math.floor(num(shared.coils) ?? 0),
    visitDays: num(shared.visitDays) ?? 0,
    visitCost: num(shared.visitCost) ?? 0,
    substitution: Math.min(1, Math.max(0, (num(shared.substitutionPct) ?? 0) / 100)),
  };
  if (!(s.coils >= 1) || s.coils > 200) warnings.push("Enter the number of coils (slots) in the machine, 1 to 200.");
  if (!(s.visitDays > 0) || s.visitDays > 60) warnings.push("Enter the days between restocking visits, more than 0 and at most 60.");
  if (s.visitCost < 0) warnings.push("Cost per visit cannot be negative.");
  const products = [];
  (rows || []).slice(0, MAX_PRODUCTS).forEach((r, idx) => {
    const blank = ["name", "price", "cost", "weekly"].every((k) => String(r[k] ?? "").trim() === "");
    if (blank) return;
    const name = String(r.name ?? "").trim() || `Product ${idx + 1}`;
    const price = num(r.price), cost = num(r.cost), weekly = num(r.weekly), perCoil = Math.floor(num(r.perCoil) ?? 0);
    if (price === null || price <= 0 || cost === null || cost < 0 || weekly === null || weekly < 0 || weekly > 50000 || !(perCoil >= 1) || perCoil > 500) {
      warnings.push(`${name}: needs a price above 0, a cost of 0 or more, weekly sales of 0 or more, and units per coil from 1 to 500.`);
      return;
    }
    if (price <= cost) warnings.push(`${name}: price is not above cost, so every sale loses money and it will only get coils if you set a minimum.`);
    const minCoils = Math.max(0, Math.floor(num(r.minCoils) ?? 0));
    const maxRaw = num(r.maxCoils);
    const maxCoils = Math.min(s.coils || 0, Math.max(minCoils, maxRaw === null ? 8 : Math.floor(maxRaw)));
    products.push({ name, price, cost, weekly, perCoil, perishable: yes(r.perishable), minCoils, maxCoils, now: Math.max(0, Math.floor(num(r.now) ?? 0)) });
  });
  if (products.length < 1 && warnings.length === 0) warnings.push("Enter at least one product with a price, cost and weekly sales.");
  const minSum = products.reduce((a, p) => a + p.minCoils, 0);
  if (s.coils >= 1 && minSum > s.coils) warnings.push(`Your minimum coils add up to ${minSum}, more than the ${s.coils} the machine has.`);
  const nowSum = products.reduce((a, p) => a + p.now, 0);
  if (nowSum > s.coils && s.coils >= 1) warnings.push(`"Coils now" adds up to ${nowSum}, more than the ${s.coils} the machine has.`);
  return { shared: s, products, warnings, ok: warnings.every((w) => /not above cost/.test(w)) && products.length > 0 };
}

// Profit per restock visit for product p holding k coils, given its table for this interval.
function visitProfit(p, table, k) {
  if (k <= 0) return 0;
  const Q = k * p.perCoil, sold = table.em(Q);
  let profit = (p.price - p.cost) * sold;
  if (p.perishable) profit -= p.cost * (Q - sold); // leftover is thrown out, and paid for again at the next fill
  return profit;
}

// Exact optimum of sum_i visitProfit(i, k_i) with sum k_i <= coils, minCoils <= k_i <= maxCoils.
export function optimize(products, tables, coils) {
  const n = products.length;
  let f = new Array(coils + 1).fill(0); // best using <= c coils with the products so far
  const choice = [];
  for (let i = 0; i < n; i++) {
    const g = new Array(coils + 1).fill(-Infinity);
    const pick = new Array(coils + 1).fill(0);
    const p = products[i];
    for (let c = 0; c <= coils; c++) {
      for (let k = p.minCoils; k <= Math.min(p.maxCoils, c); k++) {
        const v = f[c - k] + visitProfit(p, tables[i], k);
        if (v > g[c] + 1e-12) { g[c] = v; pick[c] = k; }
      }
    }
    f = g; choice.push(pick);
  }
  const alloc = new Array(n).fill(0);
  let c = coils;
  for (let i = n - 1; i >= 0; i--) { alloc[i] = choice[i][c]; c -= alloc[i]; }
  return { alloc, best: f[coils], bestByCoils: f };
}

export function evenSplit(products, coils) {
  const alloc = products.map((p) => Math.min(p.minCoils, p.maxCoils));
  let left = coils - alloc.reduce((a, b) => a + b, 0);
  let progress = true;
  while (left > 0 && progress) {
    progress = false;
    for (let i = 0; i < products.length && left > 0; i++) {
      if (products[i].weekly > 0 && alloc[i] < products[i].maxCoils) { alloc[i]++; left--; progress = true; }
    }
  }
  return alloc;
}

export function planVisit(products, tables, alloc) {
  return alloc.reduce((a, k, i) => a + visitProfit(products[i], tables[i], k), 0);
}

function drawDemand(tables, nSim, seed) {
  const rng = mulberry32(seed);
  const out = [];
  for (let s = 0; s < nSim; s++) {
    out.push(tables.map((t) => {
      if (!(t.lambda > 0)) return 0;
      const u = rng();
      let lo = 0, hi = t.cdf.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (t.cdf[mid] >= u) hi = mid; else lo = mid + 1; }
      return lo;
    }));
  }
  return out;
}

// One restock interval: demand D_i against capacity, then a fraction of unmet demand moves to products still in stock.
export function simulateInterval(products, alloc, demand, substitution) {
  const n = products.length;
  const cap = alloc.map((k, i) => k * products[i].perCoil);
  const sold = demand.map((d, i) => Math.min(d, cap[i]));
  if (substitution > 0) {
    let pool = 0;
    for (let i = 0; i < n; i++) pool += demand[i] - sold[i];
    pool *= substitution;
    if (pool > 0) {
      for (let round = 0; round < 3 && pool > 1e-9; round++) {
        let weight = 0;
        for (let i = 0; i < n; i++) if (cap[i] - sold[i] > 1e-9) weight += products[i].weekly + 1e-6;
        if (weight <= 0) break;
        const share = pool;
        pool = 0;
        for (let i = 0; i < n; i++) {
          const room = cap[i] - sold[i];
          if (room <= 1e-9) continue;
          const want = (share * (products[i].weekly + 1e-6)) / weight;
          const take = Math.min(room, want);
          sold[i] += take;
          pool += want - take;
        }
      }
    }
  }
  let profit = 0, missed = 0;
  for (let i = 0; i < n; i++) {
    const p = products[i];
    profit += (p.price - p.cost) * sold[i];
    if (p.perishable) profit -= p.cost * (cap[i] - sold[i]);
    missed += Math.max(0, demand[i] - sold[i]);
  }
  return { profit, missed };
}

function paired(a, b) {
  const n = a.length;
  const d = a.map((x, i) => x - b[i]);
  const m = d.reduce((s, x) => s + x, 0) / n;
  const v = d.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, n - 1);
  return { mean: m, se: Math.sqrt(v / n) };
}

export function analyze(rows, sharedIn, opts = {}) {
  const n = normalize(rows, sharedIn);
  if (!n.ok) return { ok: false, warnings: n.warnings };
  const { shared, products } = n;
  const interval = shared.visitDays;
  const perWeek = 7 / interval;
  const tables = products.map((p) => poissonTable((p.weekly * interval) / 7));
  const opt = optimize(products, tables, shared.coils);
  if (!Number.isFinite(opt.best)) return { ok: false, warnings: [...n.warnings, "No allocation satisfies the minimum and maximum coils you set."] };

  const nowSum = products.reduce((a, p) => a + p.now, 0);
  const haveNow = nowSum > 0;
  const curAlloc = haveNow ? products.map((p) => p.now) : evenSplit(products, shared.coils);
  const recAlloc = opt.alloc;

  // Monte Carlo on identical simulated intervals, with substitution.
  const nSim = opts.nSim || SIM_INTERVALS;
  const demand = drawDemand(tables, nSim, 20261009);
  const run = (alloc) => demand.map((d) => simulateInterval(products, alloc, d, shared.substitution));
  const curRuns = run(curAlloc), recRuns = run(recAlloc);
  const mean = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / arr.length;
  const diff = paired(recRuns.map((r) => r.profit), curRuns.map((r) => r.profit));

  const visitCost = shared.visitCost;
  const weeklyGross = (alloc, runs) => mean(runs, (r) => r.profit) * perWeek;
  const cur = { alloc: curAlloc, weeklyGross: weeklyGross(curAlloc, curRuns), missedPerWeek: mean(curRuns, (r) => r.missed) * perWeek, analyticGross: planVisit(products, tables, curAlloc) * perWeek };
  const rec = { alloc: recAlloc, weeklyGross: weeklyGross(recAlloc, recRuns), missedPerWeek: mean(recRuns, (r) => r.missed) * perWeek, analyticGross: opt.best * perWeek };
  cur.weeklyNet = cur.weeklyGross - visitCost * perWeek;
  rec.weeklyNet = rec.weeklyGross - visitCost * perWeek;

  const rowsOut = products.map((p, i) => {
    const k = recAlloc[i], Q = k * p.perCoil;
    const sold = tables[i].em(Q);
    return {
      name: p.name, now: curAlloc[i], coils: k, unitsPerVisit: Q,
      soldPerWeek: sold * perWeek, demandPerWeek: p.weekly,
      sellOutPct: k > 0 ? 100 * probAtLeast(tables[i], Q) : null,
      weeklyProfit: visitProfit(p, tables[i], k) * perWeek,
      perishable: p.perishable,
    };
  });

  // Value of one more or one fewer coil, and the best restocking interval.
  const extraCoil = (() => {
    const o = optimize(products, tables, shared.coils + 1);
    return (o.best - opt.best) * perWeek;
  })();
  const fewerCoil = shared.coils >= 1 ? (opt.best - (optimize(products, tables, shared.coils - 1).best)) * perWeek : null;
  const intervals = INTERVAL_CHOICES.concat(INTERVAL_CHOICES.includes(interval) ? [] : [interval]).sort((a, c) => a - c).map((d) => {
    const t = products.map((p) => poissonTable((p.weekly * d) / 7));
    const o = optimize(products, t, shared.coils);
    const w = 7 / d;
    return { days: d, gross: o.best * w, visits: w, net: o.best * w - visitCost * w, current: d === interval };
  });
  const bestInterval = intervals.reduce((a, x) => (x.net > a.net ? x : a), intervals[0]);

  return {
    ok: true, warnings: n.warnings, shared, products, haveNow, cur, rec, rows: rowsOut,
    deltaWeekly: diff.mean * perWeek, deltaSe: diff.se * perWeek,
    significant: Math.abs(diff.mean) > 2 * diff.se,
    monthly: diff.mean * perWeek * WEEKS_PER_MONTH,
    extraCoil, fewerCoil, intervals, bestInterval, nSim,
    recFull: rowsOut.filter((r) => r.coils > 0).length,
  };
}

const csvCell = (v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(a) {
  const head = ["product", "coils_now", "coils_recommended", "units_per_visit", "sold_per_week", "sell_out_pct", "weekly_profit"];
  const lines = [head.join(",")];
  for (const r of a.rows) lines.push([r.name, r.now, r.coils, r.unitsPerVisit, r.soldPerWeek.toFixed(1), r.sellOutPct === null ? "" : r.sellOutPct.toFixed(0), r.weeklyProfit.toFixed(2)].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
