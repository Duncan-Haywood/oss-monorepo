// Daily prep-quantity optimizer. Pure functions, no DOM, no network.
// For each perishable item (a bake, a prepped dish, a cut of fish) it estimates the distribution of one day's demand from
// past daily sales -- treating a "sold out" day as a lower bound on demand, not as demand (Kaplan-Meier product-limit
// estimate) -- and picks the prep quantity with the highest expected profit (the newsvendor rule, evaluated unit by unit).
// If prep minutes or ingredient cash are limited, units are ranked by profit per share of the limit.

export const MAX_ITEMS = 8;
export const SHARED_DEFAULTS = { prepMinutes: 0, budget: 0, daysPerMonth: 26 };
export const ITEM_DEFAULTS = { name: "", price: 0, cost: 0, salvage: 0, minutesPerUnit: 0, history: "", current: 0 };

// Placeholder example figures, not any bakery's prices, costs or sales. A trailing + marks a day the item sold out.
export const EXAMPLE_ITEMS = [
  { name: "Croissant", price: 3.75, cost: 0.95, salvage: 0, minutesPerUnit: 2.5, history: "38 42 45 51+ 40 36 48+ 44 39 47 52+ 41 37 43 46 50+ 35 42 44 55", current: 60 },
  { name: "Sourdough loaf", price: 8, cost: 2.1, salvage: 3, minutesPerUnit: 6, history: "14 16 12 18+ 15 13 17 20+ 14 15 16 12 18 19+ 13 21", current: 22 },
  { name: "Daily quiche", price: 6.5, cost: 2.4, salvage: 0, minutesPerUnit: 8, history: "8 10 6 9 12+ 7 8 11 9 6 10 8 12+ 7", current: 12 },
];

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);

export function cleanShared(s = {}) {
  const d = SHARED_DEFAULTS;
  return {
    prepMinutes: Math.max(0, num(s.prepMinutes, d.prepMinutes)), // 0 = no limit
    budget: Math.max(0, num(s.budget, d.budget)), // 0 = no limit
    daysPerMonth: Math.min(31, Math.max(1, Math.round(num(s.daysPerMonth, d.daysPerMonth)))),
  };
}

// "38 42 51+ 40" or "38, 42, 51+" -> [{ v: 38, censored: false }, { v: 51, censored: true }, ...]. Junk tokens are skipped.
export function parseHistory(text) {
  const out = [];
  String(text ?? "").split(/[\s,;]+/).forEach((tok) => {
    const m = /^(\d+(?:\.\d+)?)(\+?)$/.exec(tok.trim());
    if (m) out.push({ v: Math.max(0, Math.round(Number(m[1]))), censored: m[2] === "+" });
  });
  return out.slice(0, 365);
}

// Product-limit estimate of P(D > q) for q = 0, 1, 2, ... Demand on a sold-out day is only known to be at least that day's
// sales. Mass left over after the last observation is placed at that observation, so the curve ends at zero there.
export function survival(obs) {
  const max = obs.reduce((m, o) => Math.max(m, o.v), 0);
  const events = new Map(); // value -> { d: demands observed exactly, c: censored here }
  obs.forEach((o) => {
    const e = events.get(o.v) || { d: 0, c: 0 };
    if (o.censored) e.c++; else e.d++;
    events.set(o.v, e);
  });
  const vals = [...events.keys()].sort((a, b) => a - b);
  let atRisk = obs.length, s = 1;
  const S = new Array(max + 1).fill(0); // S[q] = P(D > q)
  let vi = 0;
  for (let q = 0; q <= max; q++) {
    while (vi < vals.length && vals[vi] <= q) {
      const e = events.get(vals[vi]);
      if (e.d > 0 && atRisk > 0) s *= 1 - e.d / atRisk;
      atRisk -= e.d + e.c;
      vi++;
    }
    S[q] = q >= max ? 0 : s;
  }
  return S;
}

export function cleanItems(items = []) {
  const out = [];
  items.forEach((it, i) => {
    const price = num(it.price), cost = num(it.cost);
    const obs = parseHistory(it.history);
    if (price <= 0 || cost < 0 || obs.length < 3) return;
    const salvage = Math.min(Math.max(0, num(it.salvage)), cost > 0 ? cost : Infinity);
    out.push({
      index: i,
      name: String(it.name || "").trim() || "Item " + (i + 1),
      price, cost, salvage,
      minutes: Math.max(0, num(it.minutesPerUnit)),
      obs,
      days: obs.length,
      soldOutDays: obs.filter((o) => o.censored).length,
      current: Math.max(0, Math.round(num(it.current))),
      S: survival(obs),
    });
  });
  return out;
}

// Marginal expected profit of prepping unit q+1: (price - salvage) * P(D > q) - (cost - salvage).
const marginal = (k, q) => (k.price - k.salvage) * (q < k.S.length ? k.S[q] : 0) - (k.cost - k.salvage);

// Expected sales, leftovers, stock-out chance and profit of prepping Q units of an item.
export function outcome(k, Q) {
  let sold = 0;
  for (let q = 0; q < Q; q++) sold += q < k.S.length ? k.S[q] : 0;
  const left = Q - sold;
  const pOut = Q >= k.S.length ? 0 : k.S[Q] + 0; // P(D > Q): chance demand exceeds the prep
  const atLeast = Q === 0 ? 1 : (Q - 1 < k.S.length ? k.S[Q - 1] : 0); // P(D >= Q)
  return {
    prep: Q, sold, left, pShort: Math.max(0, pOut), pSellOut: Math.max(0, atLeast),
    revenue: sold * k.price + left * k.salvage, spend: Q * k.cost,
    profit: sold * k.price + left * k.salvage - Q * k.cost,
    leftCost: left * (k.cost - k.salvage),
  };
}

// Best plan. Without a limit each item is solved alone, exactly. With a limit, every unit with positive marginal profit is
// ranked by marginal profit per share of the limit it uses, and taken while the limits allow.
export function plan(items, shared) {
  const mins = shared.prepMinutes, bud = shared.budget;
  const prep = items.map(() => 0);
  const limited = (mins > 0 && items.some((k) => k.minutes > 0)) || bud > 0;
  if (!limited) {
    items.forEach((k, j) => { let Q = 0; while (marginal(k, Q) > 1e-12) Q++; prep[j] = Q; });
    return { prep, limited: false, usedMinutes: 0, usedBudget: 0, shadow: 0 };
  }
  const cand = [];
  items.forEach((k, j) => {
    for (let q = 0; q < k.S.length; q++) {
      const g = marginal(k, q);
      if (g <= 1e-12) break;
      const share = (mins > 0 ? k.minutes / mins : 0) + (bud > 0 ? k.cost / bud : 0);
      cand.push({ j, q, g, share, rank: share > 0 ? g / share : Infinity });
    }
  });
  cand.sort((a, b) => b.rank - a.rank || b.g - a.g || a.j - b.j || a.q - b.q);
  let um = 0, ub = 0, shadow = 0, blocked = false;
  const closed = new Set();
  for (const c of cand) {
    if (closed.has(c.j)) continue;
    const k = items[c.j];
    const nm = um + k.minutes, nb = ub + k.cost;
    if ((mins > 0 && nm > mins + 1e-9) || (bud > 0 && nb > bud + 1e-9)) { closed.add(c.j); if (!blocked) { shadow = c.rank; blocked = true; } continue; }
    prep[c.j]++; um = nm; ub = nb;
  }
  // shadow: profit per whole limit, i.e. what the next bit of the binding limit is worth (per minute or per dollar).
  return { prep, limited: true, usedMinutes: um, usedBudget: ub, blocked, shadow: blocked ? shadow : 0 };
}

export function analyze(rawItems, rawShared) {
  const shared = cleanShared(rawShared);
  const items = cleanItems(rawItems);
  const warnings = [];
  if (!items.length) return { ok: false, warnings: ["Enter at least one item with a price and at least three days of past sales."] };
  items.forEach((k) => {
    if (k.days < 10) warnings.push(k.name + ": only " + k.days + " days of history; the demand estimate is rough.");
    const top = k.obs.reduce((b, o) => (o.v > b.v || (o.v === b.v && o.censored) ? o : b), k.obs[0]);
    if (top.censored) warnings.push(k.name + ": your best day was a sell-out, so true demand may run higher than any quantity this tool will suggest.");
    if (k.price <= k.cost) warnings.push(k.name + ": the price does not exceed the cost, so every unit loses money before waste.");
  });
  const p = plan(items, shared);
  const rows = items.map((k, j) => {
    const best = outcome(k, p.prep[j]);
    const cur = k.current > 0 ? outcome(k, k.current) : null;
    return { name: k.name, price: k.price, cost: k.cost, days: k.days, soldOutDays: k.soldOutDays, best, current: cur };
  });
  const tot = (f) => rows.reduce((s, r) => s + f(r), 0);
  const hasCurrent = rows.some((r) => r.current);
  const bestProfit = tot((r) => r.best.profit);
  const curProfit = tot((r) => (r.current || r.best).profit);
  const dayGain = hasCurrent ? bestProfit - curProfit : 0;
  return {
    ok: true, warnings, shared, rows, limited: p.limited, usedMinutes: p.usedMinutes, usedBudget: p.usedBudget, shadow: p.shadow, blocked: p.blocked,
    hasCurrent, bestProfit, curProfit, dayGain, monthGain: dayGain * shared.daysPerMonth,
    bestWaste: tot((r) => r.best.leftCost), curWaste: tot((r) => (r.current || r.best).leftCost),
  };
}

export function toCsv(a) {
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = [["Item", "Prep", "Expected sold", "Expected leftover", "Chance of selling out", "Expected profit"].map(q).join(",")];
  a.rows.forEach((r) => lines.push([q(r.name), r.best.prep, r.best.sold.toFixed(1), r.best.left.toFixed(1), (r.best.pSellOut * 100).toFixed(0) + "%", r.best.profit.toFixed(2)].join(",")));
  lines.push(["Total", "", "", "", "", a.bestProfit.toFixed(2)].map(q).join(","));
  return lines.join("\n");
}
